import { NextResponse } from "next/server";
import { store } from "@/server/store";
import { requireApiUser } from "@/lib/server/guard";

export const runtime = "nodejs";

interface FlatNode {
  type: string;
  widgetType: string;
  title?: string;
  depth: number;
}

// GET /api/preview/:id  前端预览概览
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t: any = store.get(id);
  if (!t) return NextResponse.json({ error: "模板不存在或已过期" }, { status: 404 });
  const flat: FlatNode[] = [];
  (function walk(n: { elType?: string; widgetType?: string; settings?: { title?: string }; elements?: Array<unknown> }, depth: number) {
    flat.push({ type: n.elType || "container", widgetType: n.widgetType || "", title: n.settings?.title, depth });
    (n.elements || []).forEach((c) => walk(c as never, depth + 1));
  })({ elements: t.content }, 0);
  return NextResponse.json({
    title: t.title,
    tree: flat,
    enhanced: t._mae_meta?.sections || null,
  });
}
