// 会话与设置存储：SQLite（Node 内置 node:sqlite，零依赖）
// 库文件：server/data/mae.db；首次启动会自动迁移旧的 sessions.json / settings.json（备份为 .migrated）
// 注意：数据库连接惰性初始化 —— next build 收集路由时只 import 模块，不会打开/锁住数据库文件
import { DatabaseSync } from "node:sqlite";
import { readFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "data");
const DB_FILE = join(DATA_DIR, "mae.db");

let _db = null;

function getDb() {
  if (_db) return _db;
  mkdirSync(DATA_DIR, { recursive: true });
  _db = new DatabaseSync(DB_FILE);
  _db.exec("PRAGMA busy_timeout = 5000;");
  try {
    _db.exec("PRAGMA journal_mode = WAL;");
  } catch {
    // WAL 切换失败不影响使用（默认 rollback journal）
  }
  _db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS templates (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT '',
      stats      TEXT NOT NULL DEFAULT '{}',
      enhanced   INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      content    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user',
      display_name  TEXT NOT NULL DEFAULT '',
      created_at    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sites (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      url             TEXT NOT NULL,
      api_key         TEXT NOT NULL DEFAULT '',
      page_title      TEXT NOT NULL DEFAULT '',
      basic_auth      INTEGER NOT NULL DEFAULT 0,
      basic_username  TEXT NOT NULL DEFAULT '',
      basic_password  TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'untested',
      last_test_at    INTEGER,
      last_test_error TEXT NOT NULL DEFAULT '',
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      id              TEXT PRIMARY KEY,
      template_id     TEXT NOT NULL DEFAULT '',
      template_title  TEXT NOT NULL DEFAULT '',
      site_id         TEXT NOT NULL DEFAULT '',
      site_name       TEXT NOT NULL DEFAULT '',
      site_url        TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'ok',
      page_id         INTEGER,
      page_title      TEXT NOT NULL DEFAULT '',
      edit_url        TEXT NOT NULL DEFAULT '',
      uploaded_images INTEGER NOT NULL DEFAULT 0,
      image_errors    TEXT NOT NULL DEFAULT '[]',
      error           TEXT NOT NULL DEFAULT '',
      created_at      INTEGER NOT NULL
    );
  `);
  ensureSiteColumns();
  migrateLegacy();
  return _db;
}

// 老库补列（CREATE TABLE IF NOT EXISTS 不会给已存在的表加列）
function ensureSiteColumns() {
  const cols = getDb().prepare("PRAGMA table_info(sites)").all().map((c) => c.name);
  const adds = [];
  if (!cols.includes("status")) adds.push("status TEXT NOT NULL DEFAULT 'untested'");
  if (!cols.includes("last_test_at")) adds.push("last_test_at INTEGER");
  if (!cols.includes("last_test_error")) adds.push("last_test_error TEXT NOT NULL DEFAULT ''");
  for (const def of adds) {
    getDb().exec(`ALTER TABLE sites ADD COLUMN ${def}`);
  }
}

// ---------- 模板历史 ----------

function getSeq() {
  const r = getDb().prepare("SELECT value FROM meta WHERE key = 'last_seq'").get();
  return r ? parseInt(r.value, 10) || 0 : 0;
}

function setSeq(n) {
  getDb()
    .prepare(
      "INSERT INTO meta (key, value) VALUES ('last_seq', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(String(n));
}

function rowToRecord(r) {
  return {
    id: r.id,
    createdAt: r.created_at,
    title: r.title,
    stats: JSON.parse(r.stats || "{}"),
    enhanced: !!r.enhanced,
    template: JSON.parse(r.content),
  };
}

function insertRecord(rec) {
  getDb()
    .prepare(
      "INSERT INTO templates (id, title, stats, enhanced, created_at, content) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      rec.id,
      String(rec.title || ""),
      JSON.stringify(rec.stats || {}),
      rec.enhanced ? 1 : 0,
      rec.createdAt || Date.now(),
      JSON.stringify(rec.template)
    );
}

export const store = {
  save(template, meta = {}) {
    const seq = getSeq() + 1;
    setSeq(seq);
    const id = seq.toString(16).padStart(6, "0");
    insertRecord({
      id,
      template,
      title: meta.title || template.title || "",
      stats: meta.stats,
      enhanced: !!meta.enhanced,
      createdAt: meta.createdAt || Date.now(),
    });
    return id;
  },
  get(id) {
    const r = getDb().prepare("SELECT content FROM templates WHERE id = ?").get(id);
    return r ? JSON.parse(r.content) : undefined;
  },
  getRecord(id) {
    const r = getDb()
      .prepare("SELECT id, title, stats, enhanced, created_at, content FROM templates WHERE id = ?")
      .get(id);
    return r ? rowToRecord(r) : undefined;
  },
  list() {
    return getDb()
      .prepare("SELECT id, title, stats, enhanced, created_at FROM templates ORDER BY created_at DESC, rowid DESC")
      .all()
      .map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        title: r.title,
        stats: JSON.parse(r.stats || "{}"),
        enhanced: !!r.enhanced,
      }));
  },
  remove(id) {
    const r = getDb().prepare("DELETE FROM templates WHERE id = ?").run(id);
    return r.changes > 0;
  },
  has(id) {
    return !!getDb().prepare("SELECT 1 FROM templates WHERE id = ?").get(id);
  },
};

// ---------- 设置 ----------

const DEFAULT_SETTINGS = {
  mastergo: { token: "" },
  llm: { enabled: false, baseUrl: "", apiKey: "", model: "" },
  wp: { siteUrl: "", apiKey: "", pageTitle: "", basicAuth: { enabled: false, username: "", password: "" } },
};

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object"
        ? deepMerge(base[k], v)
        : v;
  }
  return out;
}

function readSettingsRoot() {
  try {
    const r = getDb().prepare("SELECT value FROM settings WHERE key = 'root'").get();
    return r ? JSON.parse(r.value) : {};
  } catch {
    return {};
  }
}

export const settings = {
  get() {
    return deepMerge(structuredClone(DEFAULT_SETTINGS), readSettingsRoot());
  },
  set(patch) {
    const next = deepMerge(structuredClone(DEFAULT_SETTINGS), deepMerge(readSettingsRoot(), patch));
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES ('root', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify(next));
    return next;
  },
};

// ---------- 旧 JSON 数据迁移（首次打开数据库时执行一次） ----------

function migrateLegacy() {
  const sessionsFile = join(DATA_DIR, "sessions.json");
  if (existsSync(sessionsFile)) {
    try {
      const arr = JSON.parse(readFileSync(sessionsFile, "utf8"));
      let maxSeq = 0;
      for (const rec of arr || []) {
        if (!rec?.id || !rec?.template) continue;
        insertRecord(rec);
        const n = parseInt(rec.id, 16);
        if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
      }
      if (maxSeq > getSeq()) setSeq(maxSeq);
      renameSync(sessionsFile, `${sessionsFile}.migrated`);
      console.log(`[store] 已迁移 sessions.json（${(arr || []).length} 条模板）到 SQLite`);
    } catch (e) {
      console.error("[store] sessions.json 迁移失败：", e.message);
    }
  }

  const settingsFile = join(DATA_DIR, "settings.json");
  if (existsSync(settingsFile)) {
    try {
      const val = JSON.parse(readFileSync(settingsFile, "utf8"));
      getDb()
        .prepare("INSERT INTO settings (key, value) VALUES ('root', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(JSON.stringify(val));
      renameSync(settingsFile, `${settingsFile}.migrated`);
      console.log("[store] 已迁移 settings.json 到 SQLite");
    } catch (e) {
      console.error("[store] settings.json 迁移失败：", e.message);
    }
  }
}

// ---------- 用户 / 会话 / 站点（后台账号体系，密码哈希在 server/auth.js 中完成） ----------

function rowToUser(r) {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    createdAt: r.created_at,
  };
}

function rowToSite(r) {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    apiKey: r.api_key,
    pageTitle: r.page_title,
    basicAuth: {
      enabled: !!r.basic_auth,
      username: r.basic_username,
      password: r.basic_password,
    },
    status: r.status || "untested",
    lastTestAt: r.last_test_at || null,
    lastTestError: r.last_test_error || "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const users = {
  create({ id, username, passwordHash, role, displayName = "" }) {
    getDb()
      .prepare(
        "INSERT INTO users (id, username, password_hash, role, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(id, username, passwordHash, role, displayName, Date.now());
  },
  findByUsername(username) {
    const r = getDb()
      .prepare("SELECT id, username, password_hash, role, display_name, created_at FROM users WHERE username = ?")
      .get(username);
    return r
      ? { ...rowToUser(r), passwordHash: r.password_hash }
      : undefined;
  },
  findById(id) {
    const r = getDb()
      .prepare("SELECT id, username, password_hash, role, display_name, created_at FROM users WHERE id = ?")
      .get(id);
    return r
      ? { ...rowToUser(r), passwordHash: r.password_hash }
      : undefined;
  },
  list() {
    return getDb()
      .prepare("SELECT id, username, role, display_name, created_at FROM users ORDER BY role = 'admin' DESC, created_at ASC, rowid ASC")
      .all()
      .map(rowToUser);
  },
  count() {
    const r = getDb().prepare("SELECT COUNT(*) AS n FROM users").get();
    return r.n;
  },
  countAdmins() {
    const r = getDb().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get();
    return r.n;
  },
  update(id, { username, passwordHash, role, displayName }) {
    const sets = [];
    const vals = [];
    if (username !== undefined) { sets.push("username = ?"); vals.push(username); }
    if (passwordHash !== undefined) { sets.push("password_hash = ?"); vals.push(passwordHash); }
    if (role !== undefined) { sets.push("role = ?"); vals.push(role); }
    if (displayName !== undefined) { sets.push("display_name = ?"); vals.push(displayName); }
    if (!sets.length) return false;
    vals.push(id);
    const r = getDb().prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    return r.changes > 0;
  },
  remove(id) {
    const r = getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
    return r.changes > 0;
  },
};

export const sessions = {
  create({ token, userId, expiresAt }) {
    getDb()
      .prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(token, userId, Date.now(), expiresAt);
  },
  find(token) {
    return getDb()
      .prepare("SELECT token, user_id, created_at, expires_at FROM sessions WHERE token = ?")
      .get(token);
  },
  remove(token) {
    getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  },
  removeExpired() {
    getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  },
  removeByUser(userId) {
    getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  },
};

export const sites = {
  list() {
    return getDb()
      .prepare("SELECT * FROM sites ORDER BY created_at DESC, rowid DESC")
      .all()
      .map(rowToSite);
  },
  get(id) {
    const r = getDb().prepare("SELECT * FROM sites WHERE id = ?").get(id);
    return r ? rowToSite(r) : undefined;
  },
  create(site) {
    const now = Date.now();
    getDb()
      .prepare(
        `INSERT INTO sites (id, name, url, api_key, page_title, basic_auth, basic_username, basic_password, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        site.id,
        site.name,
        site.url,
        site.apiKey || "",
        site.pageTitle || "",
        site.basicAuth?.enabled ? 1 : 0,
        site.basicAuth?.username || "",
        site.basicAuth?.password || "",
        now,
        now
      );
  },
  update(id, site) {
    getDb()
      .prepare(
        `UPDATE sites SET name = ?, url = ?, api_key = ?, page_title = ?, basic_auth = ?, basic_username = ?, basic_password = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        site.name,
        site.url,
        site.apiKey || "",
        site.pageTitle || "",
        site.basicAuth?.enabled ? 1 : 0,
        site.basicAuth?.username || "",
        site.basicAuth?.password || "",
        Date.now(),
        id
      );
  },
  updateTestResult(id, { status, error = "" }) {
    const r = getDb()
      .prepare(
        "UPDATE sites SET status = ?, last_test_at = ?, last_test_error = ?, updated_at = ? WHERE id = ?"
      )
      .run(status, Date.now(), String(error || ""), Date.now(), id);
    return r.changes > 0;
  },
  remove(id) {
    const r = getDb().prepare("DELETE FROM sites WHERE id = ?").run(id);
    return r.changes > 0;
  },
};

// ---------- 上传交付记录 ----------

function rowToDelivery(r) {
  return {
    id: r.id,
    templateId: r.template_id,
    templateTitle: r.template_title,
    siteId: r.site_id,
    siteName: r.site_name,
    siteUrl: r.site_url,
    status: r.status,
    pageId: r.page_id,
    pageTitle: r.page_title,
    editUrl: r.edit_url,
    uploadedImages: r.uploaded_images,
    imageErrors: JSON.parse(r.image_errors || "[]"),
    error: r.error,
    createdAt: r.created_at,
  };
}

export const deliveries = {
  create(rec) {
    getDb()
      .prepare(
        `INSERT INTO deliveries
         (id, template_id, template_title, site_id, site_name, site_url, status,
          page_id, page_title, edit_url, uploaded_images, image_errors, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        rec.id,
        rec.templateId || "",
        rec.templateTitle || "",
        rec.siteId || "",
        rec.siteName || "",
        rec.siteUrl || "",
        rec.status || "ok",
        rec.pageId ?? null,
        rec.pageTitle || "",
        rec.editUrl || "",
        rec.uploadedImages || 0,
        JSON.stringify(rec.imageErrors || []),
        rec.error || "",
        rec.createdAt || Date.now()
      );
  },
  list(limit = 100) {
    return getDb()
      .prepare("SELECT * FROM deliveries ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(limit)
      .map(rowToDelivery);
  },
  count() {
    const r = getDb().prepare("SELECT COUNT(*) AS n FROM deliveries").get();
    return r.n;
  },
  remove(id) {
    const r = getDb().prepare("DELETE FROM deliveries WHERE id = ?").run(id);
    return r.changes > 0;
  },
};
