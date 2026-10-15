// MasterGo 取数服务：封装 Magic MCP 拉取 DSL + SVG，返回概览并落盘缓存
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 解析 mastergo 文件链接 → { fileId, layerId }
export function parseMastergoUrl(url) {
  if (!url) return null;
  const m = String(url).match(/\/file\/([^?#\s]+)/);
  if (!m) return null;
  const fileId = m[1];
  let layerId = "";
  try {
    const u = new URL(url);
    layerId = u.searchParams.get("layer_id") || u.searchParams.get("page_id") || "";
  } catch { /* 忽略非法 URL */ }
  return { fileId, layerId };
}

// 拉取全部 section DSL + SVG 到 outDir，返回概览
export async function fetchMastergoDesign({ token, fileId, layerId, outDir }) {
  if (!token) throw new Error("缺少 MasterGo 令牌");
  if (!fileId) throw new Error("缺少 fileId");
  mkdirSync(outDir, { recursive: true });

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@mastergo/magic-mcp", `--token=${token}`, "--url=https://mastergo.com"],
  });
  const client = new Client({ name: "mae-web-mg", version: "1.0.0" });

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

    const sections = [];
    for (let i = 0; i < total; i++) {
      const dsl = await call("mcp__getDesignSections", { fileId, layerId, sectionIndex: i });
      writeFileSync(join(outDir, `section_${i}.json`), JSON.stringify(dsl, null, 2), "utf8");
      const d = dsl.dsl || {};
      sections.push({
        idx: i,
        name: dsl.section?.name ?? "",
        type: dsl.section?.type ?? "",
        nodes: d.nodeCount ?? 0,
        y: mode1.sections?.[i]?.y ?? i,
        preview: mode1.sections?.[i]?.textPreview ?? "",
      });
      await sleep(200);
    }

    let svgCount = 0;
    try {
      const svgs = await call("mcp__extractSvg", { fileId, layerId });
      writeFileSync(join(outDir, "svgs.json"), JSON.stringify(svgs, null, 2), "utf8");
      svgCount = svgs.totalCount ?? svgs.count ?? 0;
    } catch { svgCount = 0; }

    const root = mode1.rootMetadata || {};
    return {
      meta: {
        rootName: root.name ?? "",
        totalSections: total,
        totalNodes: mode1.totalNodes ?? 0,
        width: root.width ?? 0,
        height: root.height ?? 0,
        svgCount,
      },
      sections: sections.sort((a, b) => a.y - b.y),
      outDir,
    };
  } finally {
    await client.close().catch(() => {});
  }
}
