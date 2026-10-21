import { NextResponse } from "next/server";
import { store } from "@/server/store";
import { requireApiUser } from "@/lib/server/guard";

export const runtime = "nodejs";

// GET /api/templates  模板历史列表（倒序）
export async function GET() {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json({ templates: store.list() });
}
