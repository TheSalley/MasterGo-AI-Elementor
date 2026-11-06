"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui";
import TemplatesList from "./templates-list";
import ConvertWizard from "./convert-panel";
import DeliverPanel from "./deliver-panel";
import HtmlConvertPanel from "./html-convert-panel";

const TABS = [
  { key: "list", label: "模板列表" },
  { key: "convert", label: "新建转换" },
  { key: "html", label: "HTML 转换" },
  { key: "deliver", label: "上传网站" },
];

export default function TemplatesPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const raw = sp.get("tab");
  const tab = raw === "convert" || raw === "html" || raw === "deliver" ? raw : "list";

  const setTab = (t: string) => {
    router.push(t === "list" ? "/templates" : `/templates?tab=${t}`);
  };

  return (
    <div>
      <PageHeader title="建站转换" desc="MasterGo / HTML → Elementor → 上传网站" />
      <div className="px-6 pt-5">
        <div className="inline-flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                tab === t.key ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-6 pt-4">
        {tab === "list" && <TemplatesList />}
        {tab === "convert" && <ConvertWizard />}
        {tab === "html" && <HtmlConvertPanel />}
        {tab === "deliver" && <DeliverPanel />}
      </div>
    </div>
  );
}
