import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLES_DIR } from "@/lib/server/paths";
import { requireApiUser } from "@/lib/server/guard";

export const runtime = "nodejs";

// GET /api/mastergo/status  服务端是否已有缓存的取数结果（可在「新建转换」跳过取数直接转译）
export async function GET() {
  const me = await requireApiUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let cached = false;
  let rootName = "";
  let totalSections = 0;
  try {
    const metaFile = join(SAMPLES_DIR, "mode1_sections.json");
    if (existsSync(metaFile)) {
      const m = JSON.parse(readFileSync(metaFile, "utf8"));
      cached = true;
      rootName = m.rootMetadata?.name || "";
      totalSections = m.totalSections || 0;
    }
  } catch {
    // 缓存损坏按未缓存处理
  }
  return NextResponse.json({ cached, rootName, totalSections });
}
