// DSL → Elementor 完整页面模板转译器（CLI 入口，复用 server 转换器 v3）
// 用法: node scripts/translate.mjs <samplesDir> <output.json>
import { writeFileSync } from "node:fs";
import { convertSamples } from "../server/services/converter.js";

const [samplesDir, outPath] = process.argv.slice(2);
if (!samplesDir || !outPath) { console.error("用法: node scripts/translate.mjs <samplesDir> <output.json>"); process.exit(2); }

const { template, stats } = convertSamples(samplesDir);
writeFileSync(outPath, JSON.stringify(template, null, 2), "utf8");
console.log(`[ok] ${outPath}  页面=${template.title}  section=${stats.sections} 容器=${stats.containers}  abs定位=${stats.abs}  背景图=${stats.bgImgs}  widgets=${JSON.stringify(stats.widgets)}`);
