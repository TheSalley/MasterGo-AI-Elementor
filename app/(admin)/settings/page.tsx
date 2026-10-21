"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Btn,
  Card,
  Field,
  PageHeader,
  inputCls,
} from "@/components/ui";
import { api } from "@/lib/client-fetch";
import { toast } from "@/components/feedback";

interface Settings {
  mastergo: { token: string };
  llm: { enabled: boolean; baseUrl: string; apiKey: string; model: string };
  wp: {
    siteUrl: string;
    apiKey: string;
    pageTitle: string;
    basicAuth: { enabled: boolean; username: string; password: string };
  };
}

export default function SettingsPage() {
  const [mgToken, setMgToken] = useState("");
  const [llmOn, setLlmOn] = useState(false);
  const [llmBase, setLlmBase] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [wpSite, setWpSite] = useState("");
  const [wpKey, setWpKey] = useState("");
  const [wpTitle, setWpTitle] = useState("");
  const [authOn, setAuthOn] = useState(false);
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<Settings>("/api/settings")
      .then((cfg) => {
        setMgToken(cfg.mastergo?.token || "");
        setLlmOn(Boolean(cfg.llm?.enabled));
        setLlmBase(cfg.llm?.baseUrl || "");
        setLlmKey(cfg.llm?.apiKey || "");
        setLlmModel(cfg.llm?.model || "");
        setWpSite(cfg.wp?.siteUrl || "");
        setWpKey(cfg.wp?.apiKey || "");
        setWpTitle(cfg.wp?.pageTitle || "");
        setAuthOn(Boolean(cfg.wp?.basicAuth?.enabled));
        setAuthUser(cfg.wp?.basicAuth?.username || "");
        setAuthPass(cfg.wp?.basicAuth?.password || "");
      })
      .catch(() => {
        // 忽略
      });
  }, []);

  const onSave = async () => {
    setBusy(true);
    setSaved(false);
    try {
      await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          mastergo: { token: mgToken },
          llm: { enabled: llmOn, baseUrl: llmBase, apiKey: llmKey, model: llmModel },
          wp: {
            siteUrl: wpSite,
            apiKey: wpKey,
            pageTitle: wpTitle,
            basicAuth: { enabled: authOn, username: authUser, password: authPass },
          },
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast("设置已保存");
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存失败", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="设置" desc="MasterGo 令牌、LLM 与目标站点默认配置">
        {saved && <span className="text-sm font-medium text-emerald-600">✓ 已保存</span>}
      </PageHeader>

      <div className="p-6">
        <p className="mb-4 text-xs text-slate-400">
          配置保存到本机 SQLite（server/data/mae.db），已加入 .gitignore，不会提交密钥。
        </p>
        <div className="grid gap-5 xl:grid-cols-2">
          <Card
            title={
              <>
                MasterGo <Badge tone="gray">默认值</Badge>
              </>
            }
          >
            <Field label="令牌（Token）" hint="解析时优先级：页面输入 &gt; 此处保存值 &gt; 环境变量 MG_TOKEN">
              <input
                className={inputCls}
                type="password"
                value={mgToken}
                onChange={(e) => setMgToken(e.target.value)}
                placeholder="mg_xxx"
                autoComplete="off"
              />
            </Field>
          </Card>

          <Card
            title={
              <>
                LLM 语义化增强 <Badge tone="gray">默认值</Badge>
              </>
            }
          >
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={llmOn}
                onChange={(e) => setLlmOn(e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              默认启用增强
            </label>
            <Field label="Base URL" hint="OpenAI 兼容，留空用环境变量">
              <input
                className={inputCls}
                type="text"
                value={llmBase}
                onChange={(e) => setLlmBase(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </Field>
            <Field label="API Key" hint="留空用环境变量 OPENAI_API_KEY">
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
          </Card>

          <Card
            title={
              <>
                WordPress 站点 <Badge tone="gray">默认值</Badge>
              </>
            }
            className="xl:col-span-2"
          >
            <div className="grid gap-x-4 md:grid-cols-3">
              <Field label="站点地址">
                <input
                  className={inputCls}
                  type="text"
                  value={wpSite}
                  onChange={(e) => setWpSite(e.target.value)}
                  placeholder="https://your-site.com"
                />
              </Field>
              <Field label="接口密钥（插件中配置）">
                <input
                  className={inputCls}
                  type="text"
                  value={wpKey}
                  onChange={(e) => setWpKey(e.target.value)}
                  placeholder="MAE_CHANGE_ME"
                />
              </Field>
              <Field label="页面标题" hint="留空用模板标题">
                <input
                  className={inputCls}
                  type="text"
                  value={wpTitle}
                  onChange={(e) => setWpTitle(e.target.value)}
                  placeholder="Home"
                />
              </Field>
            </div>
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={authOn}
                onChange={(e) => setAuthOn(e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              站点需 nginx Basic Auth
            </label>
            {authOn && (
              <div className="grid gap-x-4 md:grid-cols-2">
                <Field label="登录账号">
                  <input
                    className={inputCls}
                    type="text"
                    value={authUser}
                    onChange={(e) => setAuthUser(e.target.value)}
                  />
                </Field>
                <Field label="登录密码">
                  <input
                    className={inputCls}
                    type="password"
                    value={authPass}
                    onChange={(e) => setAuthPass(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
              </div>
            )}
          </Card>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Btn variant="primary" onClick={onSave} disabled={busy}>
            {busy ? "保存中…" : "保存设置"}
          </Btn>
          <span className="text-xs text-slate-400">
            保存后，「新建转换 / 上传网站」页面会以这些值为默认值。
          </span>
        </div>
      </div>
    </div>
  );
}
