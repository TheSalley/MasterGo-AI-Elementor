import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-slate-800">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatCard({ num, label, sub }: { num: ReactNode; label: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-2xl font-bold text-blue-600">{num}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

export function Btn({ variant = "ghost", className = "", ...props }: BtnProps) {
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300",
    ghost: "border border-slate-200 bg-white text-blue-600 hover:bg-slate-50",
    danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
  }[variant];
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
      {...props}
    />
  );
}

export function LinkBtn({
  href,
  variant = "ghost",
  className = "",
  children,
  download,
  target,
}: {
  href: string;
  variant?: "primary" | "ghost";
  className?: string;
  children: ReactNode;
  download?: string;
  target?: string;
}) {
  const styles =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "border border-slate-200 bg-white text-blue-600 hover:bg-slate-50";
  return (
    <Link
      href={href}
      download={download}
      target={target}
      className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition ${styles} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Badge({
  tone = "blue",
  children,
}: {
  tone?: "blue" | "green" | "gray" | "amber";
  children: ReactNode;
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    gray: "bg-slate-100 text-slate-500",
    amber: "bg-amber-50 text-amber-700",
  }[tone];
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${tones}`}>
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`mb-3 block text-[13px] text-slate-600 ${className}`}>
      {label}
      {hint && <em className="mt-0.5 block text-[11px] font-normal text-slate-400">{hint}</em>}
      {children}
    </label>
  );
}

export const inputCls =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function ResultBox({ children }: { children: ReactNode }) {
  return <div className="mt-3 text-sm">{children}</div>;
}

export function Ok({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-semibold text-emerald-600 ${className}`}>{children}</p>;
}

export function Err({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-red-600 ${className}`}>{children}</p>;
}

export function Steps({
  items,
  current,
}: {
  items: { label: string; desc?: string }[];
  current: number;
}) {
  return (
    <ol className="flex items-stretch gap-1">
      {items.map((it, i) => {
        const done = i < current;
        const active = i === current;
        const circle = done
          ? "bg-blue-600 text-white border-blue-600"
          : active
            ? "border-blue-600 text-blue-600 bg-white"
            : "border-slate-300 text-slate-400 bg-white";
        const label = active ? "text-blue-700" : done ? "text-slate-700" : "text-slate-400";
        return (
          <li key={i} className="flex flex-1 items-center gap-1 last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${circle}`}
              >
                {done ? "✓" : i + 1}
              </span>
              <div className="leading-tight">
                <div className={`whitespace-nowrap text-[13px] font-medium ${label}`}>{it.label}</div>
                {it.desc && <div className="whitespace-nowrap text-[11px] text-slate-400">{it.desc}</div>}
              </div>
            </div>
            {i < items.length - 1 && (
              <span className={`mx-2 h-px min-w-6 flex-1 ${done ? "bg-blue-600" : "bg-slate-200"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-sm text-slate-400">
      <span>{text}</span>
      {action}
    </div>
  );
}

export const tableWrapCls = "overflow-x-auto rounded-lg border border-slate-200";
export const tableCls = "w-full min-w-[720px] text-sm";
export const thCls =
  "whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-medium text-slate-500";
export const tdCls = "border-b border-slate-100 px-4 py-2.5 align-middle last:border-0";

export function AlertBanner({
  tone = "amber",
  children,
  action,
}: {
  tone?: "amber" | "blue";
  children: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
  }[tone];
  return (
    <div className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm ${tones}`}>
      <span className="flex items-center gap-2">{children}</span>
      {action}
    </div>
  );
}
