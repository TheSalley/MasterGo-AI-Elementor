import { NextResponse } from "next/server";
import { store } from "@/server/store";
import { requireApiUser } from "@/lib/server/guard";

export const runtime = "nodejs";

// GET /api/template/:id  下载缓存的 Elementor 模板 .json
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t: any = store.get(id);
  if (!t) return NextResponse.json({ error: "模板不存在或已过期" }, { status: 404 });
  const filename = `${encodeURIComponent(t.title || "page").replace(/%20/g, "_")}.json`;
  const buf = Buffer.from(JSON.stringify(t, null, 2), "utf8");
  return new Response(buf, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// DELETE /api/template/:id  删除历史模板
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  if (!store.remove(id)) return NextResponse.json({ error: "模板不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
