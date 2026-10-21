"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Btn,
  Card,
  Err,
  Field,
  LinkBtn,
  Ok,
  ResultBox,
  inputCls,
} from "@/components/ui";
import { api } from "@/lib/client-fetch";
import { toast } from "@/components/feedback";

interface TemplateSummary {
  id: string;
  title?: string;
}

interface Settings {
  wp: {
    siteUrl: string;
    apiKey: string;
    pageTitle: string;
    basicAuth: { enabled: boolean; username: string; password: string };
  };
}

interface SiteRow {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  pageTitle: string;
  basicAuth: { enabled: boolean; username: string; password: string };
  status: string;
  lastTestError: string;
}

interface ImportResult {
  pageId?: number;
  title?: string;
  editUrl?: string;
  uploadedImages?: number;
  imageErrors?: string[];
}

export default function DeliverPanel() {
  const sp = useSearchParams();
  const presetId = sp.get("id");

  const [tpls, setTpls] = useState<TemplateSummary[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [siteId, setSiteId] = useState("");
  const [sel, setSel] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [authOn, setAuthOn] = useState(false);
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [uploadImages, setUploadImages] = useState(false); // 当前阶段默认不上传媒体库

  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importErr, setImportErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api<{ templates: TemplateSummary[] }>("/api/templates"),
      api<Settings>("/api/settings"),
      api<{ sites: SiteRow[] }>("/api/sites").catch(() => ({ sites: [] })),
    ])
      .then(([d, cfg, s]) => {
        const list = d.templates || [];
        setTpls(list);
        if (list.length) setSel((prev) => (prev && list.some((t) => t.id === prev) ? prev : presetId || list[0].id));
        setSites(s.sites || []);
        setSiteUrl(cfg.wp?.siteUrl || "");
        setApiKey(cfg.wp?.apiKey || "");
        setPageTitle(cfg.wp?.pageTitle || "");
        setAuthOn(Boolean(cfg.wp?.basicAuth?.enabled));
        setAuthUser(cfg.wp?.basicAuth?.username || "");
        setAuthPass(cfg.wp?.basicAuth?.password || "");
      })
      .catch(() => {
        // 忽略
      });
  }, [presetId]);

  // 选择已保存站点 → 自动填充
  const onPickSite = (id: string) => {
    setSiteId(id);
    const s = sites.find((x) => x.id === id);
    if (!s) return;
    setSiteUrl(s.url);
    setApiKey(s.apiKey);
    setPageTitle(s.pageTitle);
    setAuthOn(s.basicAuth.enabled);
    setAuthUser(s.basicAuth.username);
    setAuthPass(s.basicAuth.password);
  };

  const onImport = async () => {
    if (!sel) return;
    setBusy(true);
    setImportErr("");
    setImportResult(null);
    try {
      const d = await api<ImportResult>("/api/site/import", {
        method: "POST",
        body: JSON.stringify({
          templateId: sel,
          siteId: siteId || undefined,
          siteUrl,
          apiKey,
          pageTitle,
          basicAuth: authOn ? { username: authUser, password: authPass } : null,
          uploadImages,
        }),
      });
      setImportResult(d);
      toast("已写入站点");
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : "导入失败");
      toast("站点写入失败", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="目标模板">
        <Field label="选择模板">
          <select className={`${inputCls} mt-1!`} value={sel} onChange={(e) => setSel(e.target.value)}>
            {tpls.length === 0 && <option value="">暂无模板，请先转换</option>}
            {tpls.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title || "-"}（#{t.id}）
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Btn variant="primary" onClick={onImport} disabled={!sel || busy}>
            {busy ? "写入中…" : "一键写入站点"}
          </Btn>
          <LinkBtn href="/api/site/plugin" download="mae-import.zip">
            下载导入插件 mae-import.zip
          </LinkBtn>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          首次使用：先在目标站安装 mae-import.zip 插件并配置密钥，再执行一键写入。
        </p>

        <ResultBox>
          {importErr && <Err>✗ {importErr}</Err>}
          {importResult && (
            <div className="space-y-1">
              <Ok>
                ✓ 已创建页面 #{importResult.pageId}
                {importResult.uploadedImages ? `（上传图片 ${importResult.uploadedImages} 张）` : ""}
              </Ok>
              <p>
                标题：{importResult.title || "-"}{" "}
                {importResult.editUrl && (
                  <a className="text-blue-600 hover:underline" href={importResult.editUrl} target="_blank" rel="noopener noreferrer">
                    在 Elementor 编辑 →
                  </a>
                )}
              </p>
              {importResult.imageErrors && importResult.imageErrors.length > 0 && (
                <p className="text-amber-600">⚠ {importResult.imageErrors.length} 张图片上传失败</p>
              )}
            </div>
          )}
        </ResultBox>
      </Card>

      <Card title="WordPress 站点">
        <Field label="已保存站点" hint="选择后自动填充下方配置">
          <div className="flex gap-2">
            <select
              className={`${inputCls} mt-1! min-w-0 grow`}
              value={siteId}
              onChange={(e) => onPickSite(e.target.value)}
            >
              <option value="">手动填写（不保存）</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（{s.url}）{s.status === "ok" ? " ✓" : s.status === "fail" ? " ✗" : ""}
                </option>
              ))}
            </select>
            <LinkBtn href="/sites" className="!mt-1 !shrink-0 !px-2.5 !py-2 !text-xs">
              管理站点
            </LinkBtn>
          </div>
        </Field>
        <div className="mb-2 h-px bg-slate-100" />
        <Field label="站点地址">
          <input
            className={inputCls}
            type="text"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://your-site.com"
          />
        </Field>
        <Field label="接口密钥（插件中配置）">
          <input
            className={inputCls}
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="MAE_CHANGE_ME 或你改过的密钥"
          />
        </Field>
        <Field label="页面标题" hint="留空用模板标题">
          <input
            className={inputCls}
            type="text"
            value={pageTitle}
            onChange={(e) => setPageTitle(e.target.value)}
            placeholder="Home"
          />
        </Field>
        <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={uploadImages}
            onChange={(e) => setUploadImages(e.target.checked)}
            className="h-4 w-4 accent-blue-600"
          />
          上传图片到媒体库（不勾选时保留模板里的图片地址，先验证布局）
        </label>
        <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={authOn}
            onChange={(e) => setAuthOn(e.target.checked)}
            className="h-4 w-4 accent-blue-600"
          />
          站点需 nginx 登录（Basic Auth）
        </label>
        {authOn && (
          <div className="rounded-lg border border-dashed border-slate-300 p-3">
            <div className="grid gap-x-4 md:grid-cols-2">
              <Field label="nginx 登录账号">
                <input
                  className={inputCls}
                  type="text"
                  value={authUser}
                  onChange={(e) => setAuthUser(e.target.value)}
                  placeholder="access"
                />
              </Field>
              <Field label="nginx 登录密码">
                <input
                  className={inputCls}
                  type="password"
                  value={authPass}
                  onChange={(e) => setAuthPass(e.target.value)}
                  placeholder="login"
                  autoComplete="off"
                />
              </Field>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
