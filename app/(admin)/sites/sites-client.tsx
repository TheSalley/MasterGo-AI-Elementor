"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Pencil, Plus, Trash2, Wifi, WifiOff } from "lucide-react";
import { Badge, Btn, Card, Err, Field, PageHeader, inputCls } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { api } from "@/lib/client-fetch";
import { fmtTime } from "@/lib/format";

interface SiteRow {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  pageTitle: string;
  basicAuth: { enabled: boolean; username: string; password: string };
  status: string;
  lastTestAt: number | null;
  lastTestError: string;
  createdAt: number;
  updatedAt: number;
}

interface DeliveryRow {
  id: string;
  templateId: string;
  templateTitle: string;
  siteId: string;
  siteName: string;
  siteUrl: string;
  status: string;
  pageId: number | null;
  pageTitle: string;
  editUrl: string;
  uploadedImages: number;
  imageErrors: { url: string; error: string }[];
  error: string;
  createdAt: number;
}

type FormState = Omit<SiteRow, "id"> & { id?: string };

const EMPTY: FormState = {
  id: undefined,
  name: "",
  url: "",
  apiKey: "",
  pageTitle: "",
  basicAuth: { enabled: false, username: "", password: "" },
  status: "untested",
  lastTestAt: null,
  lastTestError: "",
  createdAt: 0,
  updatedAt: 0,
};

export default function SitesClient() {
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [loadErr, setLoadErr] = useState("");

  const load = useCallback(() => {
    Promise.all([
      api<{ sites: SiteRow[] }>("/api/sites"),
      api<{ deliveries: DeliveryRow[] }>("/api/deliveries").catch(() => ({ deliveries: [] })),
    ])
      .then(([d, dl]) => {
        setRows(d.sites || []);
        setDeliveries(dl.deliveries || []);
      })
      .catch((e) => setLoadErr(e instanceof Error ? e.message : "加载失败"));
  }, []);

  useEffect(load, [load]);

  const reset = () => {
    setForm(EMPTY);
    setEditing(false);
    setErr("");
  };

  const openEdit = (s: SiteRow) => {
    setForm({ ...s, basicAuth: { ...s.basicAuth } });
    setEditing(true);
    setErr("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSave = async () => {
    if (!form.name || !form.url) {
      setErr("请填写站点名称与站点地址");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const body = JSON.stringify({
        name: form.name,
        url: form.url,
        apiKey: form.apiKey,
        pageTitle: form.pageTitle,
        basicAuth: {
          enabled: form.basicAuth.enabled,
          username: form.basicAuth.username,
          password: form.basicAuth.password,
        },
      });
      if (form.id) {
        await api(`/api/sites/${form.id}`, { method: "PUT", body });
        toast("站点已更新");
      } else {
        await api("/api/sites", { method: "POST", body });
        toast("站点已保存");
      }
      reset();
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (s: SiteRow) => {
    const ok = await confirmDialog({
      title: "删除站点",
      message: `确定删除站点「${s.name}」吗？已保存的密钥也会一并删除。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/sites/${s.id}`, { method: "DELETE" });
      toast("站点已删除");
      if (form.id === s.id) reset();
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "删除失败", "err");
    }
  };

  const onTest = async (s: SiteRow) => {
    setTestingId(s.id);
    try {
      const d = await api<{ ok: boolean; error?: string; latencyMs?: number; data?: { version?: string; wp?: string } }>(
        `/api/sites/${s.id}/test`,
        { method: "POST" }
      );
      if (d.ok) {
        toast(
          `${d.data?.version ? `插件 v${d.data.version} · ` : ""}连接正常${d.latencyMs != null ? `（${d.latencyMs}ms）` : ""}`
        );
      } else {
        toast(d.error || "连接失败", "err");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "连接失败", "err");
    } finally {
      setTestingId(null);
      load();
    }
  };

  const onDeleteDelivery = async (d: DeliveryRow) => {
    const ok = await confirmDialog({
      title: "删除交付记录",
      message: `确定删除「${fmtTime(d.createdAt)} 上传到 ${d.siteName}」这条记录吗？仅删除记录，不影响站点页面。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/deliveries/${d.id}`, { method: "DELETE" });
      toast("记录已删除");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "删除失败", "err");
    }
  };

  const StatusBadge = ({ s }: { s: SiteRow }) => {
    if (s.status === "ok") {
      return (
        <Badge tone="green">
          <Wifi size={11} className="mr-1 inline" /> 已连接
        </Badge>
      );
    }
    if (s.status === "fail") {
      return (
        <Badge tone="amber">
          <WifiOff size={11} className="mr-1 inline" /> 连接失败
        </Badge>
      );
    }
    return <Badge tone="gray">未测试</Badge>;
  };

  return (
    <div>
      <PageHeader title="站点管理" desc="保存 WordPress 站点信息，「上传网站」一键选择复用" />

      <div className="p-6">
        {editing ? (
          <Card
            title={form.id ? `编辑站点 · ${form.name}` : "新建站点"}
            className="mb-5"
            action={
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600">
                取消
              </button>
            }
          >
            <SiteForm form={form} setForm={setForm} />
            {err && <Err className="mb-3">{err}</Err>}
            <Btn variant="primary" onClick={onSave} disabled={busy}>
              {busy ? "保存中…" : form.id ? "保存修改" : "保存站点"}
            </Btn>
          </Card>
        ) : (
          <div className="mb-5 flex justify-end">
            <Btn variant="primary" onClick={() => { setForm(EMPTY); setEditing(true); }}>
              <Plus size={15} /> 新建站点
            </Btn>
          </div>
        )}

        {loadErr && <Err className="mb-4">{loadErr}</Err>}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Globe size={15} />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{s.name}</div>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {s.url}
                    </a>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openEdit(s)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                    title="编辑"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => onDelete(s)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-slate-400">状态</span>
                  <span className="inline-flex items-center gap-2">
                    <StatusBadge s={s} />
                    {s.status !== "untested" && s.lastTestAt && (
                      <span className="text-[11px] text-slate-400">{fmtTime(s.lastTestAt)}</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-slate-400">密钥</span>
                  <span className="truncate font-mono">{s.apiKey ? "••••" + s.apiKey.slice(-4) : "未配置"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-slate-400">页面标题</span>
                  <span className="truncate">{s.pageTitle || "默认（用模板标题）"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-slate-400">Basic Auth</span>
                  {s.basicAuth.enabled ? (
                    <Badge tone="amber">已启用</Badge>
                  ) : (
                    <Badge tone="gray">未启用</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-slate-400">更新时间</span>
                  <span>{fmtTime(s.updatedAt)}</span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => onTest(s)}
                  disabled={testingId !== null}
                  className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Wifi size={13} />
                  {testingId === s.id ? "测试中…" : "测试连接"}
                </button>
                {s.status === "fail" && s.lastTestError && (
                  <span className="min-w-0 truncate text-[11px] text-red-500" title={s.lastTestError}>
                    {s.lastTestError}
                  </span>
                )}
              </div>
            </div>
          ))}
          {rows.length === 0 && !loadErr && (
            <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white py-14 text-center text-sm text-slate-400">
              还没有保存站点，点击右上角「新建站点」添加。
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          保存后，在「MasterGo → 上传网站」中可直接选择站点自动填充地址、密钥与 Basic Auth。
        </p>

        <Card title={`交付记录（${deliveries.length}）`} className="mt-5 !p-0">
          {deliveries.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              还没有上传记录，完成一次「一键上传」后会显示在这里。
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium">时间</th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium">状态</th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium">站点</th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium">模板</th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium">页面</th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium">图片</th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{fmtTime(d.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        {d.status === "ok" ? (
                          <Badge tone="green">成功</Badge>
                        ) : (
                          <Badge tone="amber">失败</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span title={d.siteUrl}>{d.siteName}</span>
                      </td>
                      <td className="max-w-44 truncate px-4 py-2.5">
                        {d.templateTitle || "（模板已删除）"}
                        {d.templateId && (
                          <span className="ml-1 text-[11px] text-slate-400">#{d.templateId}</span>
                        )}
                      </td>
                      <td className="max-w-52 truncate px-4 py-2.5">
                        {d.error ? (
                          <span className="text-red-500" title={d.error}>
                            {d.error.slice(0, 30)}
                          </span>
                        ) : d.editUrl ? (
                          <a href={d.editUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {d.pageTitle || `页面 #${d.pageId}`} ↗
                          </a>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {d.status === "ok" ? (
                          <span className={d.imageErrors.length ? "text-amber-600" : "text-slate-600"}>
                            {d.uploadedImages}
                            {d.imageErrors.length ? `（${d.imageErrors.length} 张失败）` : ""}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => onDeleteDelivery(d)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={13} /> 删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SiteForm({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  return (
    <div className="grid gap-x-4 md:grid-cols-2">
      <Field label="站点名称" hint="便于识别，如：官网 / 客户演示站">
        <input
          className={inputCls}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="官网"
        />
      </Field>
      <Field label="站点地址">
        <input
          className={inputCls}
          type="url"
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          placeholder="https://your-site.com"
        />
      </Field>
      <Field label="接口密钥（插件中配置）">
        <input
          className={inputCls}
          type="text"
          value={form.apiKey}
          onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          placeholder="MAE_CHANGE_ME 或你改过的密钥"
        />
      </Field>
      <Field label="页面标题" hint="留空用模板标题">
        <input
          className={inputCls}
          value={form.pageTitle}
          onChange={(e) => setForm({ ...form, pageTitle: e.target.value })}
          placeholder="Home"
        />
      </Field>
      <div className="md:col-span-2">
        <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.basicAuth.enabled}
            onChange={(e) => setForm({ ...form, basicAuth: { ...form.basicAuth, enabled: e.target.checked } })}
            className="h-4 w-4 accent-blue-600"
          />
          站点需 nginx 登录（Basic Auth）
        </label>
        {form.basicAuth.enabled && (
          <div className="grid gap-x-4 md:grid-cols-2">
            <Field label="nginx 登录账号">
              <input
                className={inputCls}
                value={form.basicAuth.username}
                onChange={(e) => setForm({ ...form, basicAuth: { ...form.basicAuth, username: e.target.value } })}
                placeholder="access"
              />
            </Field>
            <Field label="nginx 登录密码">
              <input
                className={inputCls}
                type="password"
                value={form.basicAuth.password}
                onChange={(e) => setForm({ ...form, basicAuth: { ...form.basicAuth, password: e.target.value } })}
                placeholder="login"
                autoComplete="off"
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}
