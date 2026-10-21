import { redirect } from "next/navigation";

// 未知路径统一回到工作台（/api/* 不受影响）
export default function CatchAll() {
  redirect("/dashboard");
}
