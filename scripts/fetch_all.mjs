// 全量拉取：mode1 列表 + 全部 section DSL + extractSvg
// 用法: node scripts/fetch_all.mjs <fileId> <layerId> <outDir>   (需环境变量 MG_TOKEN)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [fileId, layerId, outDir] = process.argv.slice(2);
if (!fileId || !layerId || !outDir || !process.env.MG_TOKEN) {
  console.error("用法: node scripts/fetch_all.mjs <fileId> <layerId> <outDir>  (需 MG_TOKEN)");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@mastergo/magic-mcp", `--token=${process.env.MG_TOKEN}`, "--url=https://mastergo.com"],
});
const client = new Client({ name: "mae-fetch-all", version: "1.0.0" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(name, args) {
  const res = await client.callTool({ name, arguments: args });
  const txt = typeof res.content?.[0]?.text === "string" ? res.content[0].text : JSON.stringify(res);
  return JSON.parse(txt);
}

try {
  await client.connect(transport);
  const mode1 = await call("mcp__getDesignSections", { fileId, layerId });
  writeFileSync(join(outDir, "mode1_sections.json"), JSON.stringify(mode1, null, 2), "utf8");
  const total = mode1.totalSections ?? 0;
  console.log(`[mode1] totalSections=${total} totalNodes=${mode1.totalNodes}`);

  for (let i = 0; i < total; i++) {
    const dsl = await call("mcp__getDesignSections", { fileId, layerId, sectionIndex: i });
    writeFileSync(join(outDir, `section_${i}.json`), JSON.stringify(dsl, null, 2), "utf8");
    const name = dsl.section?.name ?? "";
    const n = dsl.nodeCount ?? dsl.dsl?.nodeCount ?? "?";
    console.log(`[section ${i}/${total}] ${name}  nodes=${n}`);
    await sleep(250);
  }

  const svgs = await call("mcp__extractSvg", { fileId, layerId });
  writeFileSync(join(outDir, "svgs.json"), JSON.stringify(svgs, null, 2), "utf8");
  console.log(`[svgs] total=${svgs.totalCount ?? svgs.count}`);
  console.log("全量拉取完成 →", outDir);
} catch (e) {
  console.error("失败:", e.message || e);
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
