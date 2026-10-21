import { redirect } from "next/navigation";

// 旧独立路由：重定向到「MasterGo」的「上传网站」tab（保留模板 id 参数）
export default async function DeliverPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  redirect(id ? `/templates?tab=deliver&id=${encodeURIComponent(id)}` : "/templates?tab=deliver");
}
