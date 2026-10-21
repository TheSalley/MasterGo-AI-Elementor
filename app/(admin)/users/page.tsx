import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import UsersClient from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await auth.currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  return <UsersClient me={user} />;
}
