import { Suspense } from "react";
import TemplatesPage from "./templates-page";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">加载中…</div>}>
      <TemplatesPage />
    </Suspense>
  );
}
