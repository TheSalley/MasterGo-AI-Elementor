"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui";

export default function RefreshButton() {
  const router = useRouter();
  return (
    <Btn onClick={() => router.refresh()}>
      <RefreshCw size={14} />
      刷新
    </Btn>
  );
}
