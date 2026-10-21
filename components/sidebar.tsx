"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FolderOpen,
  Globe,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/client-fetch";

export interface SidebarUser {
  id: string;
  username: string;
  displayName?: string;
  role: string;
}

const NAV: { href: string; label: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { href: "/dashboard", label: "工作台", icon: LayoutDashboard },
  { href: "/templates", label: "MasterGo", icon: FolderOpen },
  { href: "/sites", label: "站点管理", icon: Globe, adminOnly: true },
  { href: "/users", label: "用户管理", icon: ShieldCheck, adminOnly: true },
  { href: "/settings", label: "设置", icon: Settings },
];

export default function Sidebar({ count, user }: { count: number; user: SidebarUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ok" | "err">("loading");

  useEffect(() => {
    let on = true;
    fetch("/api/templates")
      .then((r) => on && setStatus(r.ok ? "ok" : "err"))
      .catch(() => on && setStatus("err"));
    return () => {
      on = false;
    };
  }, []);

  const statusText =
    status === "loading" ? "服务连接中…" : status === "ok" ? "服务正常" : "服务不可用";

  const isAdmin = user?.role === "admin";
  const displayName = user?.displayName || user?.username;

  const onLogout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // 忽略
    }
    router.replace("/login");
    router.refresh();
  };

  return (
    <aside className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2.5 text-slate-300 md:h-full md:w-60 md:flex-col md:items-stretch md:gap-0 md:border-b-0 md:border-r md:py-0">
      {/* 品牌区 */}
      <div className="flex items-center gap-2.5 py-1.5 md:border-b md:border-slate-800 md:px-3 md:py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-lg font-bold text-white">
          M
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold text-white">M-AI-E</div>
          <div className="text-[11px] text-slate-400">MasterGo → Elementor</div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex grow items-center gap-1 overflow-x-auto md:flex-col md:items-stretch md:p-2">
        {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-blue-600 font-medium text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon size={16} />
              <span>{item.label}</span>
              {item.href === "/templates" && count > 0 && (
                <span className="ml-auto rounded-full bg-slate-700 px-1.5 py-px text-[11px] text-slate-200">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 服务状态（小屏隐藏） */}
      <div className="hidden items-center gap-2 border-t border-slate-800 px-4 py-3 text-xs text-slate-400 md:flex">
        <span
          className={`h-2 w-2 rounded-full ${
            status === "ok" ? "bg-emerald-400" : status === "err" ? "bg-red-400" : "bg-slate-600"
          }`}
        />
        {statusText}
      </div>

      {/* 用户区 */}
      <div className="flex items-center gap-2.5 border-t border-slate-800 px-4 py-3 md:w-60 md:shrink-0 md:px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-200">
          <UserRound size={15} />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-medium text-white">{displayName}</div>
          <div className="text-[11px] text-slate-400">
            {isAdmin ? "管理员" : "普通用户"} · @{user?.username}
          </div>
        </div>
        <button
          onClick={onLogout}
          title="退出登录"
          className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-red-400"
        >
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}
