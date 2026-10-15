// M-AI-E Web 服务入口
import express from "express";
import cors from "cors";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { router as mastergoRouter } from "./routes/mastergo.js";
import { router as convertRouter } from "./routes/convert.js";
import { router as siteRouter } from "./routes/site.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "../public");
const PORT = process.env.PORT || 4300;

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.use("/api/mastergo", mastergoRouter);
app.use("/api", convertRouter); // /api/convert /api/template/:id /api/preview/:id
app.use("/api/site", siteRouter);

app.use(express.static(PUBLIC));

app.listen(PORT, () => {
  console.log(`M-AI-E 已启动: http://localhost:${PORT}`);
});
