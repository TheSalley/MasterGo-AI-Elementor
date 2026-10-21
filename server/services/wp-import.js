// WordPress 一键导入服务：生成导入插件 + 调用站点端点写入 _elementor_data
import yazl from "yazl";
import { downloadWebp, collectImageUrls, replaceImageUrls } from "./images.js";

// 生成 mae-import.php 插件代码（装到目标 WP 站，开放 /wp-json/mae/v1/import）
export function pluginPhp() {
  return `<?php
/**
 * Plugin Name: MAE Import
 * Description: 供 M-AI-E Web 工具一键导入 Elementor 页面模板
 * Version: 0.2
 */
if (!defined('ABSPATH')) exit;

// 在"设置"里配置接口密钥，或在下方直接填写
if (!function_exists('mae_get_key')) {
  function mae_get_key() {
    $key = get_option('mae_api_key', '');
    return $key !== '' ? $key : 'MAE_CHANGE_ME'; // 首次使用请修改
  }
}

add_action('rest_api_init', function () {
  register_rest_route('mae/v1', '/import', array(
    'methods' => 'POST',
    'callback' => 'mae_import_page',
    'permission_callback' => function ($req) {
      $incoming = $req->get_header('X-MAE-Key');
      return $incoming !== null && hash_equals(mae_get_key(), $incoming);
    },
  ));
  // 媒体上传端点：接收 base64 图片 → 写入媒体库，返回媒体 url
  register_rest_route('mae/v1', '/upload', array(
    'methods' => 'POST',
    'callback' => 'mae_upload_image',
    'permission_callback' => function ($req) {
      $incoming = $req->get_header('X-MAE-Key');
      return $incoming !== null && hash_equals(mae_get_key(), $incoming);
    },
  ));
  // 连通性测试端点：站点管理页「测试连接」用
  register_rest_route('mae/v1', '/test', array(
    'methods' => 'GET',
    'callback' => 'mae_test_connection',
    'permission_callback' => function ($req) {
      $incoming = $req->get_header('X-MAE-Key');
      return $incoming !== null && hash_equals(mae_get_key(), $incoming);
    },
  ));
});

function mae_test_connection($req) {
  return new WP_REST_Response(array(
    'success' => true,
    'plugin' => 'MAE Import',
    'version' => '0.2',
    'site' => get_site_url(),
    'wp' => get_bloginfo('version'),
    'php' => PHP_VERSION,
  ), 200);
}

function mae_upload_image($req) {
  $body = json_decode($req->get_body(), true);
  $data = isset($body['data']) ? base64_decode($body['data']) : '';
  $filename = isset($body['filename']) ? sanitize_file_name($body['filename']) : 'img.webp';
  if ($data === '' || $data === false) {
    return new WP_REST_Response(array('success' => false, 'error' => '图片数据为空'), 400);
  }
  if (!function_exists('wp_handle_sideload')) {
    require_once ABSPATH . 'wp-admin/includes/file.php';
  }
  $upload = wp_upload_bits($filename, null, $data);
  if (!empty($upload['error'])) {
    return new WP_REST_Response(array('success' => false, 'error' => $upload['error']), 500);
  }
  $filetype = wp_check_filetype($filename);
  $attach_id = wp_insert_attachment(array(
    'post_mime_type' => $filetype['type'],
    'post_title' => preg_replace('/\.[^.]+$/', '', $filename),
    'post_content' => '',
    'post_status' => 'inherit',
    'guid' => $upload['url'],
  ), $upload['file']);
  if (is_wp_error($attach_id)) {
    return new WP_REST_Response(array('success' => false, 'error' => $attach_id->get_error_message()), 500);
  }
  if (function_exists('wp_generate_attachment_metadata')) {
    $meta = wp_generate_attachment_metadata($attach_id, $upload['file']);
    wp_update_attachment_metadata($attach_id, $meta);
  }
  return new WP_REST_Response(array('success' => true, 'id' => $attach_id, 'url' => $upload['url']), 200);
}

function mae_import_page($req) {
  $body = json_decode($req->get_body(), true);
  $template = isset($body['template']) ? $body['template'] : null;
  $title = isset($body['pageTitle']) && $body['pageTitle'] !== '' ? sanitize_text_field($body['pageTitle']) : 'Imported Page';
  $slug = isset($body['slug']) && $body['slug'] !== '' ? sanitize_title($body['slug']) : '';

  if (!$template || empty($template['content'])) {
    return new WP_REST_Response(array('success' => false, 'error' => '模板为空'), 400);
  }

  $post_id = wp_insert_post(array(
    'post_type' => 'page',
    'post_status' => 'draft',
    'post_title' => $title,
    'post_name' => $slug,
  ));
  if (is_wp_error($post_id)) {
    return new WP_REST_Response(array('success' => false, 'error' => $post_id->get_error_message()), 500);
  }

  update_post_meta($post_id, '_elementor_edit_mode', 'builder');
  update_post_meta($post_id, '_elementor_template_type', 'page');
  update_post_meta($post_id, '_elementor_version', isset($template['version']) ? $template['version'] : '3.0.0');
  update_post_meta($post_id, '_elementor_data', wp_slash(wp_json_encode($template['content'])));

  return new WP_REST_Response(array(
    'success' => true,
    'pageId' => $post_id,
    'title' => $title,
    'editUrl' => get_edit_post_link($post_id, 'raw'),
  ), 200);
}
`;
}

// 打包插件为 zip（WP 上传安装用，规范目录 mae-import/mae-import.php）
export function pluginZip() {
  return new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();
    zipfile.addBuffer(Buffer.from(pluginPhp(), "utf8"), "mae-import/mae-import.php");
    zipfile.end();
    const chunks = [];
    zipfile.outputStream.on("data", (c) => chunks.push(c));
    zipfile.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zipfile.outputStream.on("error", reject);
  });
}

// 测试某站点的连通性（走插件 /test 端点），返回 { ok, data?, error?, latencyMs? }
/**
 * @param {object} opts
 * @param {string} opts.siteUrl
 * @param {string} opts.apiKey
 * @param {{username?: string, password?: string}|null} [opts.basicAuth] nginx Basic Auth（可选）
 */
export async function testSite({ siteUrl, apiKey, basicAuth = null }) {
  const base = String(siteUrl || "").replace(/\/+$/, "");
  if (!base) throw new Error("缺少站点地址");
  if (!apiKey) throw new Error("缺少接口密钥");

  const url = `${base}/wp-json/mae/v1/test`;
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { "X-MAE-Key": apiKey, ...authHeaders(basicAuth) },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    return {
      ok: false,
      error: e.name === "TimeoutError" ? "连接超时（8 秒）" : `无法连接站点：${e.message}`,
      latencyMs: Date.now() - started,
    };
  }

  const latencyMs = Date.now() - started;
  if (res.status === 404) {
    return { ok: false, error: "站点未提供插件端点（404），请先安装 mae-import.zip 插件", latencyMs };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "接口密钥不正确，请在插件「设置」中核对 mae_api_key", latencyMs };
  }
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.success) {
    return { ok: false, error: d.error || `站点返回 ${res.status}`, latencyMs };
  }
  return { ok: true, data: d, latencyMs };
}

// nginx Basic Auth 头（可选；填入则在请求中携带）
function authHeaders(basicAuth) {
  if (basicAuth && basicAuth.username != null && basicAuth.password != null) {
    const cred = Buffer.from(`${basicAuth.username}:${basicAuth.password}`).toString("base64");
    return { Authorization: "Basic " + cred };
  }
  return {};
}

// 上传单张 webp 到站点媒体库（插件 /upload 端点）
async function uploadImageToSite(base, apiKey, dataB64, filename, basicAuth) {
  const r = await fetch(`${base}/wp-json/mae/v1/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MAE-Key": apiKey, ...authHeaders(basicAuth) },
    body: JSON.stringify({ data: dataB64, filename }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.success) throw new Error(d.error || `媒体上传失败 ${r.status}`);
  return d;
}

// 调用目标站插件端点，写入 Elementor 模板
// 流程：下载 MasterGo 图 → 转 webp → 上传站点媒体库 → 替换模板 url → 导入
/**
 * @param {object} opts
 * @param {string} opts.siteUrl
 * @param {string} opts.apiKey
 * @param {object} opts.template
 * @param {string} [opts.pageTitle]
 * @param {string} [opts.slug]
 * @param {boolean} [opts.images]
 * @param {{username?: string, password?: string}|null} [opts.basicAuth] nginx Basic Auth（可选）
 */
export async function importToSite({ siteUrl, apiKey, template, pageTitle, slug, images = true, basicAuth = null }) {
  const base = String(siteUrl || "").replace(/\/+$/, "");
  if (!base) throw new Error("缺少站点地址");
  if (!apiKey) throw new Error("缺少接口密钥");

  let uploadedImages = 0, imageErrors = [];
  if (images) {
    const urls = collectImageUrls(template.content);
    const urlMap = {};
    for (const u of urls) {
      try {
        const webp = await downloadWebp(u);
        const fn = (u.split("/").pop() || "img").replace(/\.[^.]+$/, "") + ".webp";
        const media = await uploadImageToSite(base, apiKey, webp.toString("base64"), fn, basicAuth);
        urlMap[u] = media.url;
        uploadedImages++;
      } catch (e) {
        imageErrors.push({ url: u, error: e.message });
      }
    }
    replaceImageUrls(template.content, urlMap);
  }

  const url = `${base}/wp-json/mae/v1/import`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MAE-Key": apiKey, ...authHeaders(basicAuth) },
    body: JSON.stringify({ template, pageTitle, slug }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || `站点返回 ${res.status}`);
  return { ...data, uploadedImages, imageErrors };
}
