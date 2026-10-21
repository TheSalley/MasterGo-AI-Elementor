import { NextResponse } from "next/server";
import { auth } from "@/server/auth";

export const runtime = "nodejs";

// GET /api/auth/me  当前登录用户
export async function GET() {
  const user = await auth.currentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json({ user });
}
