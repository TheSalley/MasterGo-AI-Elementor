"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2, UserRoundPlus } from "lucide-react";
import { Badge, Btn, Card, Err, Field, PageHeader, inputCls, tableCls, tableWrapCls, tdCls, thCls } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { api } from "@/lib/client-fetch";
import { fmtTime } from "@/lib/format";

interface UserRow {
  id: string;
  username: string;
  displayName?: string;
  role: string;
  createdAt: number;
}

interface Me {
  id: string;
  username: string;
  role: string;
}

interface FormState {
  id?: string;
  username: string;
  displayName: string;
  password: string;
  role: string;
}

const EMPTY: FormState = { id: undefined, username: "", displayName: "", password: "", role: "user" };

export default function UsersClient({ me }: { me: Me }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loadErr, setLoadErr] = useState("");

  const load = useCallback(() => {
    api<{ users: UserRow[] }>("/api/users")
      .then((d) => setRows(d.users || []))
      .catch((e) => setLoadErr(e instanceof Error ? e.message : "加载失败"));
  }, []);

  useEffect(load, [load]);

  const reset = () => {
    setForm(EMPTY);
    setEditing(false);
    setErr("");
  };

  const openEdit = (u: UserRow) => {
    setForm({
      id: u.id,
      username: u.username,
      displayName: u.displayName || "",
      password: "",
      role: u.role,
    });
    setEditing(true);
    setErr("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSave = async () => {
    setBusy(true);
    setErr("");
    try {
      if (form.id) {
        await api(`/api/users/${form.id}`, {
          method: "PUT",
          body: JSON.stringify({
            username: form.username,
            password: form.password || undefined,
            displayName: form.displayName,
            role: form.role,
          }),
        });
        toast("用户已更新");
      } else {
        await api("/api/users", {
          method: "POST",
          body: JSON.stringify({
            username: form.username,
            password: form.password,
            displayName: form.displayName,
            role: form.role,
          }),
        });
        toast("用户已创建");
      }
      reset();
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (u: UserRow) => {
    const ok = await confirmDialog({
      title: "删除用户",
      message: `确定删除用户「${u.displayName || u.username}」吗？此操作不可恢复。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      toast("用户已删除");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "删除失败", "err");
    }
  };

  const isSelf = (u: UserRow) => u.id === me.id;

  return (
    <div>
      <PageHeader title="用户管理" desc="账号、角色与权限（仅管理员可见）" />

      <div className="p-6">
        {editing ? (
          <Card
            title={form.id ? `编辑用户 · ${form.username}` : "新建用户"}
            className="mb-5"
            action={
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600">
                取消
              </button>
            }
          >
            <UserForm form={form} setForm={setForm} editing={!!form.id} />
            <p className="mb-3 text-xs text-slate-400">
              {form.id
                ? isSelf(rows.find((r) => r.id === form.id) as UserRow) && form.role === "admin"
                  ? "你是系统当前登录账号，角色不可修改。"
                  : "系统会校验始终至少保留一名管理员。"
                : "系统首个用户自动为管理员；其余默认普通用户。"}
            </p>
            {err && <Err className="mb-3">{err}</Err>}
            <Btn variant="primary" onClick={onSave} disabled={busy || !form.username || (!form.id && !form.password)}>
              {busy ? "保存中…" : form.id ? "保存修改" : "创建用户"}
            </Btn>
          </Card>
        ) : (
          <div className="mb-5 flex justify-end">
            <Btn variant="primary" onClick={() => { setForm(EMPTY); setEditing(true); }}>
              <UserRoundPlus size={15} /> 新建用户
            </Btn>
          </div>
        )}

        <Card title={`用户列表（${rows.length}）`}>
          {loadErr ? (
            <Err>{loadErr}</Err>
          ) : (
            <div className={tableWrapCls}>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>用户名</th>
                    <th className={thCls}>昵称</th>
                    <th className={thCls}>角色</th>
                    <th className={thCls}>创建时间</th>
                    <th className={thCls}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className={tdCls}>
                        <span className="font-medium text-slate-800">@{u.username}</span>
                        {isSelf(u) && <span className="ml-2 text-[11px] text-slate-400">(我)</span>}
                      </td>
                      <td className={tdCls}>{u.displayName || "-"}</td>
                      <td className={tdCls}>
                        <Badge tone={u.role === "admin" ? "blue" : "gray"}>
                          {u.role === "admin" ? "管理员" : "普通用户"}
                        </Badge>
                      </td>
                      <td className={`${tdCls} whitespace-nowrap text-slate-500`}>{fmtTime(u.createdAt)}</td>
                      <td className={tdCls}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(u)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                          >
                            <Pencil size={13} /> 编辑
                          </button>
                          <button
                            onClick={() => onDelete(u)}
                            disabled={isSelf(u)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 size={13} /> 删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td className={tdCls} colSpan={5}>
                        <div className="py-6 text-center text-sm text-slate-400">暂无用户</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <p className="mt-4 text-xs text-slate-400">
          保护规则：不能删除当前登录账号；系统至少保留一名管理员；不能修改自己的角色。
        </p>
      </div>
    </div>
  );
}

function UserForm({
  form,
  setForm,
  editing = false,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  editing?: boolean;
}) {
  return (
    <div className="grid gap-x-4 md:grid-cols-2 lg:grid-cols-4">
      <Field label="用户名">
        <input
          className={inputCls}
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          placeholder="3-32 位字母、数字、下划线"
          autoComplete="off"
        />
      </Field>
      <Field label="昵称">
        <input
          className={inputCls}
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          placeholder="可选"
        />
      </Field>
      <Field label="密码" hint={editing ? "留空则不修改" : "至少 6 位"}>
        <input
          className={inputCls}
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder={editing ? "留空保持不变" : "至少 6 位"}
          autoComplete="new-password"
        />
      </Field>
      <Field label="角色">
        <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="user">普通用户</option>
          <option value="admin">管理员</option>
        </select>
      </Field>
    </div>
  );
}
