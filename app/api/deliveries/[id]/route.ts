import { NextResponse } from "next/server";
import { deliveries } from "@/server/store";
import { requireApiUser, isAdmin } from "@/lib/server/guard";

export const runtime = "nodejs";

// DELETE /api/deliveries/:id  删除交付记录（仅管理员）
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isAdmin(me)) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const { id } = await ctx.params;
  if (!deliveries.remove(id)) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
