import Link from "next/link";
import {
  ArrowLeftRight,
  Download,
  FolderOpen,
  Send,
} from "lucide-react";
import {
  AlertBanner,
  Badge,
  Card,
  Empty,
  LinkBtn,
  PageHeader,
  StatCard,
} from "@/components/ui";
import RefreshButton from "@/components/refresh-button";
import { store, settings as settingsStore, deliveries } from "@/server/store";
import { fmtTime, sumWidgets } from "@/lib/format";

export const dynamic = "force-dynamic";

const QUICK = [
  { href: "/templates?tab=convert", icon: ArrowLeftRight, label: "开始取数转换", desc: "拉取 MasterGo 设计稿并生成模板" },
  { href: "/templates", icon: FolderOpen, label: "模板库", desc: "预览、下载、管理已生成模板" },
  { href: "/templates?tab=deliver", icon: Send, label: "一键上传", desc: "写入 WordPress 站点" },
  { href: "/api/site/plugin", icon: Download, label: "下载导入插件", desc: "目标站安装 mae-import.zip", download: true },
];

interface TemplateSummary {
  id: string;
  createdAt: number;
  title?: string;
  enhanced?: boolean;
  stats?: { sections?: number; widgets?: Record<string, number> };
}

export default async function DashboardPage() {
  let tpls: TemplateSummary[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cfg: any = null;
  try {
    tpls = (store.list() as unknown as TemplateSummary[]) || [];
  } catch {
    // 忽略
  }
  try {
    cfg = settingsStore.get();
  } catch {
    // 忽略
  }
  let deliverCount = 0;
  try {
    deliverCount = deliveries.count();
  } catch {
    // 忽略
  }

  const secSum = tpls.reduce((s, t) => s + (t.stats?.sections || 0), 0);
  const wSum = tpls.reduce((s, t) => s + sumWidgets(t.stats?.widgets), 0);
  const enhCount = tpls.filter((t) => t.enhanced).length;
  const tokenOk = Boolean(cfg?.mastergo?.token);
  const recent = tpls.slice(0, 3);

  return (
    <div>
      <PageHeader title="工作台" desc="总览转换任务与最近生成的模板">
        <RefreshButton />
      </PageHeader>

      <div className="p-6">
        {!tokenOk && (
          <AlertBanner action={<LinkBtn href="/settings" className="!px-2.5 !py-1 text-xs">去设置</LinkBtn>}>
            尚未配置 MasterGo 令牌，取数前请先到「设置」填写，或使用环境变量 MG_TOKEN。
          </AlertBanner>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard num={tpls.length} label="累计模板" />
          <StatCard num={deliverCount} label="累计交付" sub="含成功与失败" />
          <StatCard num={secSum} label="Section 总数" />
          <StatCard num={wSum} label="Widget 总数" />
          <StatCard num={enhCount} label="LLM 增强模板" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK.map((q) => {
            const Icon = q.icon;
            const inner = (
              <>
                <Icon size={20} className="text-blue-600" />
                <div className="mt-2 text-sm font-semibold">{q.label}</div>
                <div className="mt-0.5 text-xs text-slate-400">{q.desc}</div>
              </>
            );
            const cls = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-400";
            return q.download ? (
              <a key={q.href} href={q.href} download="mae-import.zip" className={cls}>
                {inner}
              </a>
            ) : (
              <Link key={q.href} href={q.href} className={cls}>
                {inner}
              </Link>
            );
          })}
        </div>

        <Card
          title="最近模板"
          className="mt-5"
          action={
            tpls.length > 0 && (
              <Link className="text-xs text-blue-600 hover:underline" href="/templates">
                查看全部 →
              </Link>
            )
          }
        >
          {recent.length ? (
            <div className="-mx-5 -mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                    <th className="px-5 py-2.5 font-medium">标题</th>
                    <th className="px-5 py-2.5 font-medium">生成时间</th>
                    <th className="px-5 py-2.5 font-medium">Section</th>
                    <th className="px-5 py-2.5 font-medium">Widget</th>
                    <th className="px-5 py-2.5 font-medium">增强</th>
                    <th className="px-5 py-2.5 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="max-w-60 truncate px-5 py-2.5">
                        {t.title || "-"}
                        <span className="text-xs text-slate-400">（#{t.id}）</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{fmtTime(t.createdAt)}</td>
                      <td className="px-5 py-2.5">{t.stats?.sections ?? 0}</td>
                      <td className="px-5 py-2.5">{sumWidgets(t.stats?.widgets)}</td>
                      <td className="px-5 py-2.5">
                        {t.enhanced ? <Badge tone="green">LLM</Badge> : <Badge tone="gray">规则</Badge>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-xs">
                        <Link className="mr-2 text-blue-600 hover:underline" href={`/templates?view=${t.id}`}>
                          预览
                        </Link>
                        <a className="mr-2 text-blue-600 hover:underline" href={`/api/template/${t.id}`} download>
                          下载
                        </a>
                        <Link className="text-blue-600 hover:underline" href={`/templates?tab=deliver&id=${t.id}`}>
                          上传
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              text="还没有生成过模板"
              action={
                <LinkBtn variant="primary" href="/templates?tab=convert">
                  去取数转换
                </LinkBtn>
              }
            />
          )}
        </Card>
      </div>
    </div>
  );
}
