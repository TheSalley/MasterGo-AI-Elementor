import { auth } from "@/server/auth";

// API 路由守卫：返回当前用户 or null（调用方对 null 返回 401）
export async function requireApiUser() {
  return auth.currentUser();
}

export function isAdmin(user: { role?: string } | null) {
  return user?.role === "admin";
}
