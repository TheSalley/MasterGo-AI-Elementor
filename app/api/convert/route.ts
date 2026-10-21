import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { convertSamples } from "@/server/services/converter.js";
import { enhanceTemplate } from "@/server/services/llm.js";
import { store } from "@/server/store";
import { SAMPLES_DIR } from "@/lib/server/paths";
import { requireApiUser } from "@/lib/server/guard";

export const runtime = "nodejs";

interface LlmCfg {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

// POST /api/convert  把 samples 转换为 Elementor 模板（可选 LLM 增强）
export async function POST(req: Request) {
  try {
    const me = await requireApiUser();
    if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { llm?: LlmCfg; placeholderImages?: boolean };
    const llmCfg = body.llm;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { template, stats }: any = convertSamples(SAMPLES_DIR, { placeholderImages: !!body.placeholderImages });

    let enhanced = false;
    if (llmCfg?.enabled) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let meta: any = { rootName: template.title, width: 0, height: 0 };
      try {
        const m = JSON.parse(readFileSync(join(SAMPLES_DIR, "mode1_sections.json"), "utf8"));
        meta = m.rootMetadata || meta;
      } catch {
        // 无 meta 用默认
      }
      try {
        const enh = await enhanceTemplate({ template, meta, cfg: llmCfg });
        template._mae_meta = enh;
        enhanced = true;
      } catch (e) {
        return NextResponse.json(
          { error: `LLM 增强失败：${e instanceof Error ? e.message : e}` },
          { status: 502 }
        );
      }
    }

    const id = store.save(template, { title: template.title, stats, enhanced });
    return NextResponse.json({ id, title: template.title, stats, enhanced });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "转换失败" },
      { status: 500 }
    );
  }
}
