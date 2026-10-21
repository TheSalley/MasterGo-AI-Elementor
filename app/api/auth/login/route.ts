import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/server/auth";

export const runtime = "nodejs";

// POST /api/auth/login  登录并写入会话 Cookie
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  const user = auth.verify(body.username, body.password);
  if (!user) return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });

  const token = await auth.createSession(user.id);
  const jar = await cookies();
  jar.set(auth.SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return NextResponse.json({ user });
}
