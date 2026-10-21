"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-fetch";

interface FlatNode {
  type: string;
  widgetType: string;
  title?: string;
  depth: number;
}

interface EnhancedSection {
  idx: number;
  type?: string;
  displayName?: string;
  layout?: string;
  description?: string;
}

interface PreviewData {
  title: string;
  tree: FlatNode[];
  enhanced: EnhancedSection[] | null;
}

export default function TemplatePreview({ id }: { id: string }) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setData(null);
    setErr("");
    api<PreviewData>(`/api/preview/${id}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <p className="text-red-600">✗ {err}</p>;
  if (!data) return <p className="text-slate-400">加载预览…</p>;

  return (
    <div className="space-y-3">
      <div className="max-h-80 overflow-auto rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
        {data.tree.length ? (
          data.tree.map((n, i) => {
            const pad = n.depth * 14;
            const label = n.widgetType || "container";
            const title = n.title ? ` · ${String(n.title).slice(0, 40)}` : "";
            return (
              <div key={i} style={{ paddingLeft: `${pad}px` }}>
                <span className={n.type === "container" ? "font-semibold text-violet-600" : "text-blue-600"}>
                  {label}
                </span>
                <span className="text-slate-500">{title}</span>
              </div>
            );
          })
        ) : (
          <span className="text-slate-400">（空结构）</span>
        )}
      </div>

      {data.enhanced && data.enhanced.length > 0 && (
        <>
          <div className="text-[13px] font-medium text-blue-700">LLM 语义增强</div>
          <div className="overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-2.5 py-1.5">#</th>
                  <th className="px-2.5 py-1.5">语义名</th>
                  <th className="px-2.5 py-1.5">类型</th>
                  <th className="px-2.5 py-1.5">布局建议</th>
                  <th className="px-2.5 py-1.5">说明</th>
                </tr>
              </thead>
              <tbody>
                {data.enhanced.map((s) => (
                  <tr key={s.idx} className="border-t border-slate-100 align-top">
                    <td className="px-2.5 py-1.5 text-slate-500">#{s.idx}</td>
                    <td className="px-2.5 py-1.5">{s.displayName || "-"}</td>
                    <td className="px-2.5 py-1.5">{s.type || "-"}</td>
                    <td className="px-2.5 py-1.5">{s.layout || "-"}</td>
                    <td className="px-2.5 py-1.5">{s.description || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
