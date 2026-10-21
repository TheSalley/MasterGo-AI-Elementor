import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/server/auth";

export const runtime = "nodejs";

// POST /api/auth/logout  退出登录
export async function POST() {
  const jar = await cookies();
  auth.destroySession(jar.get(auth.SESSION_COOKIE)?.value);
  jar.delete(auth.SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
