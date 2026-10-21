import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import SitesClient from "./sites-client";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const user = await auth.currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  return <SitesClient />;
}
