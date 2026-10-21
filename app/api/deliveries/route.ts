import { NextResponse } from "next/server";
import { deliveries } from "@/server/store";
import { requireApiUser } from "@/lib/server/guard";

export const runtime = "nodejs";

// GET /api/deliveries  上传交付记录（倒序，最多 100 条）
export async function GET() {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json({ deliveries: deliveries.list(100) });
}
