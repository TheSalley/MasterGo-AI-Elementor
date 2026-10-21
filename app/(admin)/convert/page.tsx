import { redirect } from "next/navigation";

// 旧独立路由：重定向到「MasterGo」的「新建转换」tab
export default function ConvertPage() {
  redirect("/templates?tab=convert");
}
