import { NextResponse } from "next/server";
import { store } from "@/server/store";
import { requireApiUser } from "@/lib/server/guard";
import { convertHtml } from "@/server/services/html-converter.js";

export const runtime = "nodejs";

interface ConvertBody {
  html?: string;
  css?: string;
  title?: string;
  baseUrl?: string;
}

export async function POST(req: Request) {
  try {
    const me = await requireApiUser();
    if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as ConvertBody;
    const html = String(body.html || "").trim();
    if (!html) return NextResponse.json({ error: "请粘贴或上传 HTML" }, { status: 400 });
    if (html.length > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "HTML 超过 2MB，请先拆分页面" }, { status: 413 });
    }

    const { template, stats } = convertHtml(html, {
      title: body.title,
      css: body.css,
      baseUrl: body.baseUrl,
    });
    const id = store.save(template, { title: template.title, stats, enhanced: false });
    return NextResponse.json({ id, title: template.title, stats, enhanced: false });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "HTML 转换失败" },
      { status: 500 }
    );
  }
}
