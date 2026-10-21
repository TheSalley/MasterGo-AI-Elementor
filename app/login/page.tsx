"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { KeyRound, LogIn, UserRound } from "lucide-react";
import { api } from "@/lib/client-fetch";
import { Err } from "@/components/ui";

function LoginForm() {
  const sp = useSearchParams();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [canRegister, setCanRegister] = useState(false);

  useEffect(() => {
    api<{ user: { username: string } }>("/api/auth/me")
      .then(() => {
        router.replace("/dashboard");
      })
      .catch(() => {
        // 未登录，正常显示登录表单
      });
    api<{ canRegister: boolean }>("/api/auth/register")
      .then((d) => setCanRegister(d.canRegister))
      .catch(() => {
        // 接口异常时按不可注册处理，不显示入口
      });
  }, [router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setBusy(true);
    setErr("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      const next = sp.get("next") || "/dashboard";
      router.replace(next);
      router.refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "登录失败");
    } finally {
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
          <h1 className="mt-4 text-xl font-semibold text-white">M-AI-E 管理后台</h1>
          <p className="mt-1 text-sm text-slate-400">MasterGo 设计稿 → Elementor → 上传网站</p>
        </div>

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
                placeholder="请输入用户名"
                autoComplete="username"
                autoFocus
              />
            </div>
          </div>

          <div className="mb-5">
            <label className="mb-1.5 block text-[13px] text-slate-300">密码</label>
            <div className="relative">
              <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </div>
          </div>

          <div className="mb-4 min-h-5 text-sm">
            {err && <Err className="!text-red-400">{err}</Err>}
            {canRegister && (
              <Err className="!font-normal !text-amber-400">
                首次使用？请先
                <Link href="/register" className="ml-1 font-medium text-blue-400 underline">
                  注册管理员账号
                </Link>
              </Err>
            )}
          </div>

          <button
            type="submit"
            disabled={busy || !username || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "登录中…" : <><LogIn size={15} /> 登录</>}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          需要登录才能访问后台 · 会话有效期 30 天
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
