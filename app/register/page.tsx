"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, UserRound, UserRoundPen } from "lucide-react";
import { api } from "@/lib/client-fetch";
import { Err } from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(true);

  useEffect(() => {
    api<{ canRegister: boolean }>("/api/auth/register")
      .then((d) => setOpen(d.canRegister))
      .catch(() => setOpen(false));
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setErr("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password, displayName }),
      });
      router.replace("/login");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "注册失败");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-2xl font-bold text-white shadow-lg shadow-blue-900/40">
            M
          </div>
          <h1 className="mt-4 text-xl font-semibold text-white">创建管理员账号</h1>
          <p className="mt-1 text-sm text-slate-400">系统首个注册用户自动成为管理员</p>
        </div>

        {!open ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-300">
            <p className="mb-4">注册已关闭，账号由管理员开通。</p>
            <Link href="/login" className="font-medium text-blue-400 hover:underline">
              返回登录 →
            </Link>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
          >
            <div className="mb-4">
              <label className="mb-1.5 block text-[13px] text-slate-300">用户名</label>
              <div className="relative">
                <UserRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="3-32 位字母、数字、下划线"
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-[13px] text-slate-300">昵称（可选）</label>
              <div className="relative">
                <UserRoundPen size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="默认显示用户名"
                  autoComplete="nickname"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-[13px] text-slate-300">密码</label>
              <div className="relative">
                <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="mb-5">
              <label className="mb-1.5 block text-[13px] text-slate-300">确认密码</label>
              <div className="relative">
                <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="mb-4 min-h-5 text-sm">
              {err && <Err className="!text-red-400">{err}</Err>}
            </div>

            <button
              type="submit"
              disabled={busy || !username || !password || !confirm}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "注册中…" : "注册并登录管理后台"}
            </button>

            <p className="mt-4 text-center text-xs text-slate-500">
              已有账号？
              <Link href="/login" className="font-medium text-blue-400 hover:underline">
                去登录
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
