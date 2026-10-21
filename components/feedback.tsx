"use client";

import { createRoot } from "react-dom/client";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

// 全局轻提示（动态挂载到 body，客户端任意位置可用）
export function toast(msg: string, type: "ok" | "err" = "ok") {
  const el = document.createElement("div");
  el.className = `fixed bottom-8 left-1/2 z-50 -translate-x-1/2 translate-y-4 rounded-lg px-5 py-2.5 text-sm text-white opacity-0 shadow-lg transition-all duration-300 ${
    type === "ok" ? "bg-emerald-600" : "bg-red-600"
  }`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.classList.remove("translate-y-4", "opacity-0");
  });
  setTimeout(() => {
    el.classList.add("translate-y-4", "opacity-0");
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

function ConfirmModal({
  title,
  message,
  confirmText,
  cancelText,
  danger,
  onOk,
  onCancel,
}: {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  onOk: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              danger ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
            }`}
          >
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 break-words text-[13px] text-slate-500">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              setBusy(true);
              onOk();
            }}
            disabled={busy}
            className={`rounded-md px-3.5 py-2 text-sm font-medium text-white transition disabled:opacity-60 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {busy ? "处理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// 确认弹窗（替代 confirm）
export function confirmDialog(opts: {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (v: boolean) => {
      root.unmount();
      host.remove();
      resolve(v);
    };
    root.render(
      <ConfirmModal
        title={opts.title || "确认操作"}
        message={opts.message}
        confirmText={opts.confirmText || "确认"}
        cancelText={opts.cancelText || "取消"}
        danger={opts.danger ?? false}
        onOk={() => close(true)}
        onCancel={() => close(false)}
      />
    );
  });
}
