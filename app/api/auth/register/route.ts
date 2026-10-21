import { NextResponse } from "next/server";
import { auth } from "@/server/auth";

export const runtime = "nodejs";

// GET /api/auth/register  探测当前是否开放注册（仅首个用户可注册）
export async function GET() {
  return NextResponse.json({ canRegister: auth.canRegister() });
}

// POST /api/auth/register  注册（仅系统首个用户可用，自动成为管理员；其余账号由管理员在「用户管理」创建）
export async function POST(req: Request) {
  if (!auth.canRegister()) {
    return NextResponse.json({ error: "注册已关闭，请联系管理员开通账号" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
    displayName?: string;
  };
  try {
    auth.createUser({ username: body.username, password: body.password, displayName: body.displayName });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "注册失败" },
      { status: 400 }
    );
  }
}
