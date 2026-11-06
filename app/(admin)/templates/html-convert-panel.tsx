"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn, Card, Err, Field, Ok, ResultBox, inputCls } from "@/components/ui";
import VisualPreview from "@/components/visual-preview";
import { api } from "@/lib/client-fetch";
import { toast } from "@/components/feedback";

interface ConvertStats {
  sections?: number;
  containers?: number;
  widgets?: Record<string, number>;
  images?: number;
  abs?: number;
}

interface ConvertResult {
  id: string;
  title: string;
  stats: ConvertStats;
}

const SAMPLE = `<section class="hero">
  <div class="copy">
    <h1>Build faster with Elementor</h1>
    <p>Turn any HTML page into native Elementor containers and widgets.</p>
    <a class="btn" href="/contact">Get started</a>
  </div>
  <img src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200" alt="Office" />
</section>

<style>
  .hero {
    display: flex;
    align-items: center;
    gap: 48px;
    max-width: 1200px;
    margin: 0 auto;
    padding: 96px 24px;
  }
  .copy { flex: 1; }
  h1 { margin: 0 0 16px; font-size: 52px; line-height: 1.1; color: #0f172a; }
  p { margin: 0 0 28px; font-size: 18px; line-height: 1.7; color: #475569; }
  .btn {
    display: inline-block;
    padding: 14px 28px;
    border-radius: 8px;
    background: #2563eb;
    color: #fff;
    text-decoration: none;
  }
  .hero img { width: 48%; border-radius: 16px; }
  @media (max-width: 768px) {
    .hero { flex-direction: column; padding: 56px 20px; }
    h1 { font-size: 34px; }
    .hero img { width: 100%; }
  }
</style>`;

export default function HtmlConvertPanel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [html, setHtml] = useState("");
  const [css, setCss] = useState("");
  const [title, setTitle] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConvertResult | null>(null);

  const onFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("HTML 文件超过 2MB，请先拆分页面");
      return;
    }
    setHtml(await file.text());
    setFileName(file.name);
    if (!title) setTitle(file.name.replace(/\.html?$/i, ""));
    setError("");
  };

  const convert = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await api<ConvertResult>("/api/html/convert", {
        method: "POST",
        body: JSON.stringify({ html, css, title, baseUrl }),
      });
      setResult(data);
      toast("HTML 已转换为 Elementor 模板");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "转换失败");
      toast("转换失败", "err");
    } finally {
      setBusy(false);
    }
  };

  const widgetDesc = Object.entries(result?.stats.widgets || {})
    .map(([key, count]) => `${key} ${count}`)
    .join(" · ");

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
      <Card title="HTML 转 Elementor">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Btn onClick={() => fileRef.current?.click()}>上传 .html</Btn>
          <Btn
            onClick={() => {
              setHtml(SAMPLE);
              setTitle("HTML 示例页");
              setFileName("");
              setResult(null);
              setError("");
            }}
          >
            填入示例
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          {fileName && <span className="text-xs text-slate-500">已读取 {fileName}</span>}
        </div>

        <div className="grid gap-x-4 md:grid-cols-2">
          <Field label="页面标题">
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：产品首页"
            />
          </Field>
          <Field label="Base URL" hint="用于把相对图片地址补成绝对地址">
            <input
              className={inputCls}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://example.com/page/"
            />
          </Field>
        </div>

        <Field label="HTML" hint="支持 <style>、CSS 变量、Flex、Grid、媒体查询">
          <textarea
            className={`${inputCls} min-h-[340px] resize-y font-mono text-[12px] leading-5`}
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder="在这里粘贴完整 HTML，或上传 .html 文件"
            spellCheck={false}
          />
        </Field>
        <Field label="补充 CSS（可选）" hint="当 HTML 中的样式被拆到独立 CSS 文件时使用">
          <textarea
            className={`${inputCls} min-h-[120px] resize-y font-mono text-[12px] leading-5`}
            value={css}
            onChange={(e) => setCss(e.target.value)}
            placeholder=".hero { display: flex; ... }"
            spellCheck={false}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Btn variant="primary" onClick={convert} disabled={busy || !html.trim()}>
            {busy ? "转换中…" : "转换为 Elementor"}
          </Btn>
          <span className="text-xs text-slate-400">脚本不执行；复杂表格、表单和列表会保留为 HTML 组件</span>
        </div>

        <ResultBox>
          {error && <Err>✗ {error}</Err>}
          {result && (
            <div className="space-y-2">
              <Ok>
                ✓ 已生成（{result.title}）#<span className="font-mono">{result.id}</span>
              </Ok>
              <p className="text-[13px] text-slate-600">
                顶层容器 <b>{result.stats.sections ?? 0}</b> 个 · 内部容器 <b>{result.stats.containers ?? 0}</b> 个 · 图片{" "}
                <b>{result.stats.images ?? 0}</b> 张
                {widgetDesc ? ` · ${widgetDesc}` : ""}
              </p>
            </div>
          )}
        </ResultBox>
      </Card>

      <Card title="转换结果">
        {!result ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-400">
            转换后在这里预览 Elementor 结构效果
          </div>
        ) : (
          <div className="space-y-4">
            <VisualPreview
              id={result.id}
              src={`/api/preview/${result.id}/html`}
              designWidth={1280}
              responsive
            />
            <div className="flex flex-wrap gap-2">
              <a
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-blue-600 transition hover:bg-slate-50"
                href={`/api/template/${result.id}`}
                download
              >
                下载 .json
              </a>
              <Link
                className="inline-flex items-center rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                href={`/templates?tab=deliver&id=${result.id}`}
              >
                去上传网站 →
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
