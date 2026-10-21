"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Btn,
  Card,
  Err,
  Field,
  Ok,
  ResultBox,
  Steps,
  inputCls,
} from "@/components/ui";
import TemplatePreview from "@/components/template-preview";
import VisualPreview from "@/components/visual-preview";
import { api } from "@/lib/client-fetch";
import { confirmDialog, toast } from "@/components/feedback";

interface SectionInfo {
  idx: number;
  name?: string;
  type?: string;
  nodes?: number;
}

interface ParseResult {
  meta?: {
    rootName?: string;
    totalSections?: number;
    totalNodes?: number;
    width?: number;
    height?: number;
    svgCount?: number;
  };
  sections?: SectionInfo[];
}

interface ConvertStats {
  sections?: number;
  containers?: number;
  widgets?: Record<string, number>;
}

interface ConvertResult {
  id: string;
  title: string;
  stats: ConvertStats;
  enhanced: boolean;
}

interface Settings {
  mastergo: { token: string; lastUrl?: string; lastToken?: string };
  llm: { enabled: boolean; baseUrl: string; apiKey: string; model: string };
}

interface CacheStatus {
  cached: boolean;
  rootName?: string;
  totalSections?: number;
}

const STEPS = [
  { label: "取数", desc: "拉取 MasterGo 设计稿" },
  { label: "转译", desc: "生成 Elementor 模板" },
  { label: "预览 / 上传", desc: "确认效果并下载或上传" },
];

export default function ConvertWizard() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [file, setFile] = useState("");
  const [llmOn, setLlmOn] = useState(false);
  const [llmBase, setLlmBase] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [imgPh, setImgPh] = useState(true); // 图片用占位图（默认开，先看布局）

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [parse, setParse] = useState<ParseResult | null>(null);
  const [parseErr, setParseErr] = useState("");
  const [parseBusy, setParseBusy] = useState(false);

  const [conv, setConv] = useState<ConvertResult | null>(null);
  const [convErr, setConvErr] = useState("");
  const [convBusy, setConvBusy] = useState(false);
  const [tab, setTab] = useState<"visual" | "tree">("visual");
  const [cache, setCache] = useState<CacheStatus | null>(null);

  useEffect(() => {
    Promise.allSettled([api<Settings>("/api/settings"), api<CacheStatus>("/api/mastergo/status")]).then(
      ([s, c]) => {
        if (s.status === "fulfilled") {
          const cfg = s.value;
          setToken(cfg.mastergo?.token || cfg.mastergo?.lastToken || "");
          setFile(cfg.mastergo?.lastUrl || "");
          setLlmOn(Boolean(cfg.llm?.enabled));
          setLlmBase(cfg.llm?.baseUrl || "");
          setLlmKey(cfg.llm?.apiKey || "");
          setLlmModel(cfg.llm?.model || "");
        }
        if (c.status === "fulfilled") setCache(c.value);
        // 任一读取失败不阻塞页面
      }
    );
  }, []);

  const hasCache = Boolean(cache?.cached);

  const onResetFile = () => {
    setFile("");
    setToken("");
  };

  const onParse = async () => {
    setParseBusy(true);
    setParseErr("");
    setParse(null);
    try {
      const d = await api<ParseResult>("/api/mastergo/parse", {
        method: "POST",
        body: JSON.stringify({ token, url: file }),
      });
      setParse(d);
      setStep(1);
      toast("取数成功");
    } catch (e) {
      setParseErr(e instanceof Error ? e.message : "取数失败");
      toast("取数失败", "err");
    } finally {
      setParseBusy(false);
    }
  };

  const onConvert = async () => {
    setConvBusy(true);
    setConvErr("");
    setConv(null);
    try {
      const d = await api<ConvertResult>("/api/convert", {
        method: "POST",
        body: JSON.stringify({
          llm: { enabled: llmOn, baseUrl: llmBase, apiKey: llmKey, model: llmModel },
          placeholderImages: imgPh,
        }),
      });
      setConv(d);
      setStep(2);
      setTab("visual");
      router.refresh(); // 刷新侧边栏模板角标
      toast("模板已生成");
    } catch (e) {
      setConvErr(e instanceof Error ? e.message : "转换失败");
      toast("转换失败", "err");
    } finally {
      setConvBusy(false);
    }
  };

  const onReset = async () => {
    if (conv && !(await confirmDialog({ title: "重新开始", message: "当前转换结果将保留在模板库中，重新开始新一轮取数与转译？" }))) {
      return;
    }
    setStep(0);
    setParse(null);
    setConv(null);
    setTab("visual");
  };

  const m = parse?.meta;
  const widgetDesc = Object.entries(conv?.stats?.widgets || {})
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");

  const cardCls = (active: boolean) =>
    `rounded-xl border bg-white p-5 shadow-sm transition ${active ? "border-blue-400 ring-1 ring-blue-100" : "border-slate-200"}`;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <Steps items={STEPS} current={step} />
          {step > 0 && (
            <Btn onClick={onReset} className="!py-1.5 text-xs">
              重新开始
            </Btn>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* ① 取数 */}
        <section className={cardCls(step === 0)}>
          <h3 className="mb-4 text-[15px] font-semibold text-slate-800">
            ① MasterGo 取数
            {step > 0 && <span className="ml-2 text-xs font-normal text-emerald-600">✓ 已完成</span>}
          </h3>
          {hasCache && cache && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-700">
              服务端已有缓存设计稿：
              <b>{cache.rootName || "未命名"}</b>
              {cache.totalSections ? `（${cache.totalSections} 个 section）` : ""}，可直接②转译，无需重新填写；
              如需换新设计稿，再填写新链接重新取数。
            </div>
          )}
          <div className="grid gap-x-4 md:grid-cols-2">
            <Field label="MasterGo 令牌（Token）" hint="留空使用环境变量 MG_TOKEN，或到「设置」保存">
              <input
                className={inputCls}
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="mg_xxx"
                autoComplete="off"
              />
            </Field>
            <Field label="设计稿链接或 fileId">
              <input
                className={inputCls}
                type="text"
                value={file}
                onChange={(e) => setFile(e.target.value)}
                placeholder="https://mastergo.com/file/... 或纯 fileId"
              />
            </Field>
          </div>
          <Btn variant="primary" onClick={onParse} disabled={parseBusy} className="mt-1">
            {parseBusy ? "拉取中…" : "拉取设计数据"}
          </Btn>
          {file && (
            <span className="mt-3 block text-xs text-slate-500">
              已记住上次链接：<span className="break-all font-mono">{file}</span>
              <button onClick={onResetFile} className="ml-2 text-blue-600 hover:underline">
                清空
              </button>
            </span>
          )}

          <ResultBox>
            {parseErr && <Err>✗ {parseErr}</Err>}
            {parse && (
              <div className="mt-2 grid gap-4 md:grid-cols-2">
                <table className="text-[13px]">
                  <tbody>
                    <tr>
                      <td className="py-0.5 pr-6 text-slate-500">根节点</td>
                      <td>{m?.rootName || "-"}</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 pr-6 text-slate-500">画板尺寸</td>
                      <td>
                        {m?.width || 0} × {m?.height || 0}px
                      </td>
                    </tr>
                    <tr>
                      <td className="py-0.5 pr-6 text-slate-500">Section 数</td>
                      <td>{m?.totalSections ?? 0}</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 pr-6 text-slate-500">节点总数</td>
                      <td>{m?.totalNodes ?? 0}</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 pr-6 text-slate-500">SVG 图标</td>
                      <td>{m?.svgCount ?? 0}</td>
                    </tr>
                  </tbody>
                </table>
                {parse.sections && parse.sections.length > 0 && (
                  <details open>
                    <summary className="cursor-pointer text-[13px] text-slate-600">
                      Section 列表（{parse.sections.length}）
                    </summary>
                    <div className="mt-1 max-h-44 overflow-auto rounded-lg border border-slate-200">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-left text-slate-500">
                          <tr>
                            <th className="px-2.5 py-1.5">#</th>
                            <th className="px-2.5 py-1.5">名称</th>
                            <th className="px-2.5 py-1.5">类型</th>
                            <th className="px-2.5 py-1.5">节点</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parse.sections.map((s) => (
                            <tr key={s.idx} className="border-t border-slate-100">
                              <td className="px-2.5 py-1.5">#{s.idx}</td>
                              <td className="px-2.5 py-1.5">{s.name || "-"}</td>
                              <td className="px-2.5 py-1.5">{s.type || "-"}</td>
                              <td className="px-2.5 py-1.5">{s.nodes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            )}
          </ResultBox>
        </section>

        {/* ② 转译 */}
        <section className={cardCls(step === 1)}>
          <h3 className="mb-4 text-[15px] font-semibold text-slate-800">
            ② 转译 Elementor 模板
            {step > 1 && <span className="ml-2 text-xs font-normal text-emerald-600">✓ 已完成</span>}
          </h3>
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={llmOn}
              onChange={(e) => setLlmOn(e.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            启用 LLM 语义化增强
          </label>
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={imgPh}
              onChange={(e) => setImgPh(e.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            图片使用占位图（灰色占位保持布局；要真实图片就取消勾选）
          </label>
          {llmOn && (
            <div className="mb-3 rounded-lg border border-dashed border-slate-300 p-3">
              <div className="grid gap-x-4 md:grid-cols-3">
                <Field label="Base URL" hint="OpenAI 兼容，留空用环境变量">
                  <input
                    className={inputCls}
                    type="text"
                    value={llmBase}
                    onChange={(e) => setLlmBase(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                </Field>
                <Field label="API Key" hint="留空用环境变量">
                  <input
                    className={inputCls}
                    type="password"
                    value={llmKey}
                    onChange={(e) => setLlmKey(e.target.value)}
                    placeholder="sk-…"
                    autoComplete="off"
                  />
                </Field>
                <Field label="模型">
                  <input
                    className={inputCls}
                    type="text"
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    placeholder="gpt-4o-mini"
                  />
                </Field>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Btn variant="primary" onClick={onConvert} disabled={convBusy || (!hasCache && step === 0)}>
              {convBusy ? "转译中…" : "生成模板"}
            </Btn>
            {step === 0 && hasCache && (
              <span className="text-xs text-slate-400">服务端已有缓存设计稿可直接转译；换新设计稿请先①取数</span>
            )}
            {step === 0 && !hasCache && <span className="text-xs text-slate-400">请先完成①取数，再生成模板</span>}
          </div>

          <ResultBox>
            {convErr && <Err>✗ {convErr}</Err>}
            {conv && (
              <div className="space-y-3">
                <Ok>
                  ✓ 模板已生成（{conv.title}）#<span className="font-mono">{conv.id}</span>
                  {conv.enhanced ? " · 已启用 LLM 增强" : ""}
                </Ok>
                <p className="text-[13px] text-slate-600">
                  顶层 section <b>{conv.stats?.sections ?? 0}</b> 个 · 容器 <b>{conv.stats?.containers ?? 0}</b> 个
                  {widgetDesc ? ` · ${widgetDesc}` : ""}
                </p>
              </div>
            )}
          </ResultBox>
        </section>

        {/* ③ 预览 / 上传 */}
        {conv && (
          <section className={cardCls(step === 2)}>
            <h3 className="mb-4 flex items-center justify-between text-[15px] font-semibold text-slate-800">
              <span>③ 预览 / 上传</span>
              <span className="flex items-center gap-1 overflow-hidden rounded-md border border-slate-200">
                {(["visual", "tree"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1.5 text-xs font-medium transition ${
                      tab === t ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {t === "visual" ? "可视化预览" : "结构树"}
                  </button>
                ))}
              </span>
            </h3>
            {tab === "visual" ? <VisualPreview id={conv.id} /> : <TemplatePreview id={conv.id} />}
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-blue-600 transition hover:bg-slate-50"
                href={`/api/template/${conv.id}`}
                download
              >
                下载 .json
              </a>
              <Link
                className="inline-flex items-center rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                href={`/templates?tab=deliver&id=${conv.id}`}
              >
                去上传网站 →
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
