// 图片管线：下载 MasterGo 图 → 转 webp（sharp）
import sharp from "sharp";

export async function downloadImage(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`图片下载失败 ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// 转 webp（默认 quality 85，保持尺寸）
export async function toWebp(buf, quality = 85) {
  return await sharp(buf).webp({ quality }).toBuffer();
}

// 一步：下载 + 转 webp，返回 webp Buffer
export async function downloadWebp(url, quality = 85) {
  return await toWebp(await downloadImage(url), quality);
}

// 从 template 收集所有图片 url（image widget + background_image，去重）
export function collectImageUrls(content) {
  const urls = new Set();
  (function walk(n) {
    const s = n.settings || {};
    if (n.elType === "widget" && n.widgetType === "image" && s.image?.url) urls.add(s.image.url);
    if (n.elType === "container" && s.background_image?.url) urls.add(s.background_image.url);
    (n.elements || []).forEach(walk);
  })({ elements: content });
  return [...urls];
}

// 把模板里的图片 url 全部替换为 webp 后的媒体库地址（old→new 映射）
export function replaceImageUrls(content, urlMap) {
  (function walk(n) {
    const s = n.settings || {};
    if (n.elType === "widget" && n.widgetType === "image" && s.image?.url && urlMap[s.image.url]) s.image.url = urlMap[s.image.url];
    if (n.elType === "container" && s.background_image?.url && urlMap[s.background_image.url]) s.background_image.url = urlMap[s.background_image.url];
    (n.elements || []).forEach(walk);
  })({ elements: content });
}
