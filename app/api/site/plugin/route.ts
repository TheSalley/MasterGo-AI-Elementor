import { NextResponse } from "next/server";
import { pluginZip } from "@/server/services/wp-import.js";
import { requireApiUser } from "@/lib/server/guard";

export const runtime = "nodejs";

// GET /api/site/plugin  下载 mae-import.zip 插件包（WP 上传安装）
export async function GET() {
  try {
    const me = await requireApiUser();
    if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const buf = await pluginZip();
    return new Response(buf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="mae-import.zip"',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "打包失败" },
      { status: 500 }
    );
  }
}
