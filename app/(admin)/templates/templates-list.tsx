"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  Badge,
  Btn,
  Card,
  Empty,
  Err,
  Toolbar,
  inputCls,
  tableCls,
  tableWrapCls,
  tdCls,
  thCls,
} from "@/components/ui";
import TemplatePreview from "@/components/template-preview";
import VisualPreview from "@/components/visual-preview";
import { api } from "@/lib/client-fetch";
import { confirmDialog, toast } from "@/components/feedback";
import { fmtTime, sumWidgets } from "@/lib/format";

interface TemplateSummary {
  id: string;
  createdAt: number;
  title?: string;
  enhanced?: boolean;
  stats?: { sections?: number; containers?: number; widgets?: Record<string, number> };
}

export default function TemplatesList() {
  const sp = useSearchParams();
  const router = useRouter();
  const viewId = sp.get("view");
  const q = (sp.get("q") || "").toLowerCase();

  const [tpls, setTpls] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState(q);
  const [ptab, setPtab] = useState<"visual" | "tree">("visual");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const d = await api<{ templates: TemplateSummary[] }>("/api/templates");
      setTpls(d.templates || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const doSearch = () => {
    const v = search.trim().toLowerCase();
    router.push(v ? `/templates?q=${encodeURIComponent(v)}` : `/templates`);
  };

  const onDelete = async (id: string, title?: string) => {
    const ok = await confirmDialog({
      title: "删除模板",
      message: `确定删除模板 #${id}（${title || ""}）吗？该操作不可恢复。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/template/${id}`, { method: "DELETE" });
      setTpls((prev) => prev.filter((t) => t.id !== id));
      router.refresh();
      toast("已删除 #" + id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "删除失败", "err");
    }
  };

  const filtered = q ? tpls.filter((t) => t.id.includes(q) || (t.title || "").toLowerCase().includes(q)) : tpls;

  return (
    <div>
      <Toolbar>
        <input
          className={`${inputCls} !mt-0 w-56`}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          placeholder="搜索标题 / ID…"
        />
        <Btn onClick={doSearch}>
          <Search size={14} />
          搜索
        </Btn>
        <Btn
          onClick={async () => {
            await load();
            router.refresh();
          }}
        >
          <RefreshCw size={14} />
          刷新
        </Btn>
        <span className="text-xs text-slate-400">共 {tpls.length} 条</span>
        <span className="grow" />
        <Link
          className="inline-flex items-center rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          href="/templates?tab=convert"
        >
          <Plus size={15} />
          新建模板
        </Link>
      </Toolbar>

      <div className={tableWrapCls}>
        <table className={tableCls}>
          <thead>
            <tr>
              <th className={thCls}>ID</th>
              <th className={thCls}>标题</th>
              <th className={thCls}>生成时间</th>
              <th className={thCls}>Section</th>
              <th className={thCls}>容器</th>
              <th className={thCls}>Widgets</th>
              <th className={thCls}>增强</th>
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                  加载中…
                </td>
              </tr>
            )}
            {err && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <Err>✗ {err}</Err>
                </td>
              </tr>
            )}
            {!loading && !err && filtered.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <Empty
                    text={q ? "没有匹配的模板" : "还没有模板"}
                    action={
                      !q && (
                        <Link
                          className="inline-flex items-center rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                          href="/templates?tab=convert"
                        >
                          去新建模板
                        </Link>
                      )
                    }
                  />
                </td>
              </tr>
            )}
            {filtered.map((t) => {
              const w = t.stats?.widgets || {};
              const entries = Object.entries(w);
              const wDesc =
                entries.slice(0, 3).map(([k, v]) => `${k} ${v}`).join(" · ") +
                (entries.length > 3 ? ` 等 ${entries.length} 种` : "");
              return (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className={`${tdCls} font-mono text-xs text-slate-500`}>#{t.id}</td>
                  <td className={`${tdCls} max-w-64 truncate`}>{t.title || "-"}</td>
                  <td className={`${tdCls} whitespace-nowrap text-slate-500`}>{fmtTime(t.createdAt)}</td>
                  <td className={tdCls}>{t.stats?.sections ?? 0}</td>
                  <td className={tdCls}>{t.stats?.containers ?? 0}</td>
                  <td
                    className={`${tdCls} max-w-56 truncate text-slate-600`}
                    title={entries.map(([k, v]) => `${k} ${v}`).join(" · ")}
                  >
                    {wDesc || "-"}
                  </td>
                  <td className={tdCls}>
                    {t.enhanced ? <Badge tone="green">LLM</Badge> : <Badge tone="gray">规则</Badge>}
                  </td>
                  <td className={`${tdCls} whitespace-nowrap text-xs`}>
                    <Link className="mr-2.5 text-blue-600 hover:underline" href={`/templates?view=${t.id}`}>
                      预览
                    </Link>
                    <a className="mr-2.5 text-blue-600 hover:underline" href={`/api/template/${t.id}`} download>
                      下载
                    </a>
                    <Link className="mr-2.5 text-blue-600 hover:underline" href={`/templates?tab=deliver&id=${t.id}`}>
                      上传
                    </Link>
                    <button
                      className="inline-flex items-center gap-1 text-red-600 hover:underline"
                      onClick={() => onDelete(t.id, t.title)}
                    >
                      <Trash2 size={12} />
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {viewId && (
        <Card
          title={
            <>
              模板预览 <Badge>#{viewId}</Badge>
            </>
          }
          className="mt-5"
          action={
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-md border border-slate-200">
                {(["visual", "tree"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPtab(t)}
                    className={`px-2.5 py-1 text-xs font-medium transition ${
                      ptab === t ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {t === "visual" ? "可视化" : "结构树"}
                  </button>
                ))}
              </div>
              <Btn className="!py-1 text-xs" onClick={() => router.push("/templates")}>
                关闭
              </Btn>
            </div>
          }
        >
          {ptab === "visual" ? <VisualPreview id={viewId} /> : <TemplatePreview id={viewId} />}
        </Card>
      )}
    </div>
  );
}
