import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { importToSite } from "@/server/services/wp-import.js";
import { store, sites as sitesStore, deliveries } from "@/server/store";
import { requireApiUser } from "@/lib/server/guard";

export const runtime = "nodejs";

// POST /api/site/import  一键写入目标 WP 站点（可选带 nginx Basic Auth）
export async function POST(req: Request) {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    templateId?: string;
    siteUrl?: string;
    apiKey?: string;
    pageTitle?: string;
    slug?: string;
    basicAuth?: { username?: string; password?: string } | null;
    siteId?: string;
    uploadImages?: boolean;
  };
  const { templateId, siteUrl, apiKey, pageTitle, slug, basicAuth, siteId, uploadImages } = body;
  const template = store.get(templateId || "");
  if (!template) return NextResponse.json({ error: "模板不存在，请先转换" }, { status: 404 });
  if (!siteUrl) return NextResponse.json({ error: "缺少站点地址" }, { status: 400 });
  if (!apiKey) return NextResponse.json({ error: "缺少接口密钥（插件中配置的密钥）" }, { status: 400 });

  const savedSite = siteId ? sitesStore.get(siteId) : undefined;
  const siteName = savedSite?.name || String(siteUrl).replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const record = (patch: Record<string, unknown>) => {
    deliveries.create({
      id: randomBytes(8).toString("hex"),
      templateId: templateId || "",
      templateTitle: template.title || "",
      siteId: savedSite?.id || "",
      siteName,
      siteUrl,
      ...patch,
    });
  };

  try {
    const result = await importToSite({ siteUrl, apiKey, template, pageTitle, slug, basicAuth, images: uploadImages !== false });
    record({
      status: "ok",
      pageId: result.pageId,
      pageTitle: result.title,
      editUrl: result.editUrl,
      uploadedImages: result.uploadedImages,
      imageErrors: result.imageErrors,
    });
    return NextResponse.json(result);
  } catch (e) {
    record({ status: "fail", error: e instanceof Error ? e.message : "导入失败" });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "导入失败" },
      { status: 500 }
    );
  }
}
