import { redirect } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { store } from "@/server/store";
import { auth } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await auth.currentUser();
  if (!user) redirect("/login");

  let count = 0;
  try {
    count = store.list().length;
  } catch {
    // 数据目录损坏等情况忽略
  }
  return (
    <div className="flex h-full flex-col md:flex-row">
      <Sidebar count={count} user={user} />
      <main className="min-w-0 grow overflow-y-auto">{children}</main>
    </div>
  );
}
