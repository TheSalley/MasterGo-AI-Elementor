import { NextResponse } from "next/server";
import { auth, authUsers } from "@/server/auth";
import { requireApiUser, isAdmin } from "@/lib/server/guard";

export const runtime = "nodejs";

// GET /api/users  用户列表（仅管理员）
export async function GET() {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isAdmin(me)) return NextResponse.json({ error: "无权限" }, { status: 403 });
  return NextResponse.json({ users: authUsers.list() });
}

// POST /api/users  新建用户（仅管理员；不写密码时生成随机初始密码？——必须传密码）
export async function POST(req: Request) {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isAdmin(me)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
    displayName?: string;
    role?: string;
  };
  try {
    auth.createUser({
      username: body.username,
      password: body.password,
      displayName: body.displayName,
      role: body.role,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "创建用户失败" },
      { status: 400 }
    );
  }
}
