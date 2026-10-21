import { NextResponse } from "next/server";
import { authUsers } from "@/server/auth";
import { requireApiUser, isAdmin } from "@/lib/server/guard";

export const runtime = "nodejs";

// PUT /api/users/:id  更新用户（仅管理员；防改自己角色、防移除最后一名管理员）
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isAdmin(me)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const target = authUsers.findById(id);
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
    displayName?: string;
    role?: string;
  };

  // 不能修改自己的角色（避免误操作把自己降权）
  if (body.role !== undefined && body.role !== target.role && target.id === me.id) {
    return NextResponse.json({ error: "不能修改自己的角色" }, { status: 400 });
  }
  // 最后一名管理员不能被降权
  if (
    body.role !== undefined &&
    body.role !== "admin" &&
    target.role === "admin" &&
    authUsers.countAdmins() <= 1
  ) {
    return NextResponse.json({ error: "系统至少保留一名管理员" }, { status: 400 });
  }

  try {
    authUsers.update(id, {
      username: body.username,
      password: body.password,
      displayName: body.displayName,
      role: body.role,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新失败" },
      { status: 400 }
    );
  }
}

// DELETE /api/users/:id  删除用户（仅管理员；防删自己、防删最后一名管理员）
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isAdmin(me)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const target = authUsers.findById(id);
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  if (target.id === me.id) {
    return NextResponse.json({ error: "不能删除当前登录账号" }, { status: 400 });
  }
  if (target.role === "admin" && authUsers.countAdmins() <= 1) {
    return NextResponse.json({ error: "系统至少保留一名管理员" }, { status: 400 });
  }

  authUsers.remove(id);
  return NextResponse.json({ ok: true });
}
