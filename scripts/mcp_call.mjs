// MCP 客户端：连接 @mastergo/magic-mcp 远程服务并调用工具
// 用法: node scripts/mcp_call.mjs --tool <工具名> --args '<JSON字符串>' [--out <输出文件>]
// 令牌通过环境变量 MG_TOKEN 传入，避免明文落盘
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const argv = process.argv.slice(2);
function arg(name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

const tool = arg("tool");
const argsRaw = arg("args");
const argsEnv = arg("args-env");
const outFile = arg("out");

if (!process.env.MG_TOKEN) {
  console.error("缺少环境变量 MG_TOKEN");
  process.exit(2);
}
if (!tool) {
  console.error("缺少 --tool 参数");
  process.exit(2);
}
let toolArgs = {};
if (argsRaw) toolArgs = JSON.parse(argsRaw);
else if (argsEnv && process.env[argsEnv]) toolArgs = JSON.parse(process.env[argsEnv]);

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@mastergo/magic-mcp", `--token=${process.env.MG_TOKEN}`, "--url=https://mastergo.com"],
});

const client = new Client({ name: "mae-mcp-client", version: "1.0.0" });
try {
  await client.connect(transport);

  if (tool === "__list") {
    const tools = await client.listTools();
    console.log(JSON.stringify(tools, null, 2));
    process.exit(0);
  }

  const res = await client.callTool({ name: tool, arguments: toolArgs });
  const out = typeof res.content?.[0]?.text === "string"
    ? res.content[0].text
    : JSON.stringify(res, null, 2);

  if (outFile) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dest = fileURLToPath(new URL(`../samples/${outFile}`, import.meta.url));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, out, "utf8");
    console.log(`[saved] ${dest}  (${out.length} chars)`);
  } else {
    console.log(out);
  }
} catch (e) {
  console.error("调用失败:", e.message || e);
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
