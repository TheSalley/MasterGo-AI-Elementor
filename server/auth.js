// 认证与会话：密码哈希（node:crypto scrypt，零依赖）+ SQLite sessions
// 仅服务端使用（Server Component / Route Handler），不要 import 到客户端组件
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { users, sessions } from "@/server/store";

export const SESSION_COOKIE = "mae_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

function hashPassword(password, salt) {
  return scryptSync(String(password), salt, 64).toString("hex");
}

function safeEqual(a, b) {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// 去掉密码哈希，返回可安全下发到前端的用户对象
function publicUser(u) {
  if (!u) return null;
  const { id, username, displayName, role, createdAt } = u;
  return { id, username, displayName, role, createdAt };
}

// 用户名规范：3-32 位字母、数字、下划线、点、连字符（统一转小写）
export function normalizeUsername(s) {
  return String(s || "").trim().toLowerCase();
}

export const auth = {
  SESSION_COOKIE,

  canRegister() {
    return users.count() === 0;
  },

  // 创建用户；系统首个用户自动为 admin，其余默认 user
  createUser({ username, password, displayName = "", role = "" }) {
    const name = normalizeUsername(username);
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(name)) {
      throw new Error("用户名需为 3-32 位字母、数字、下划线、点或连字符");
    }
    if (users.findByUsername(name)) throw new Error("用户名已存在");
    const pwd = String(password || "");
    if (pwd.length < 6) throw new Error("密码至少 6 位");
    const salt = randomBytes(16).toString("hex");
    users.create({
      id: randomBytes(8).toString("hex"),
      username: name,
      passwordHash: `${salt}:${hashPassword(pwd, salt)}`,
      role: role || (users.count() === 0 ? "admin" : "user"),
      displayName: String(displayName || "").trim(),
    });
  },

  // 校验用户名密码，成功返回 publicUser，失败返回 null
  verify(username, password) {
    const u = users.findByUsername(normalizeUsername(username));
    if (!u) return null;
    const [salt, hash] = String(u.passwordHash || "").split(":");
    if (!salt || !hash) return null;
    if (!safeEqual(hash, hashPassword(password, salt))) return null;
    return publicUser(u);
  },

  async createSession(userId) {
    const token = randomBytes(32).toString("hex");
    sessions.create({ token, userId, expiresAt: Date.now() + SESSION_TTL_MS });
    return token;
  },

  // 由 token 取当前登录用户（自动清理过期会话）
  getSessionUser(token) {
    if (!token) return null;
    sessions.removeExpired();
    const s = sessions.find(token);
    if (!s) return null;
    return publicUser(users.findById(s.user_id));
  },

  destroySession(token) {
    if (token) sessions.remove(token);
  },

  // Server Component / Route Handler 内读取当前登录用户（依赖请求上下文）
  async currentUser() {
    const jar = await cookies();
    return this.getSessionUser(jar.get(SESSION_COOKIE)?.value);
  },
};

export const authUsers = {
  list() {
    return users.list().map(publicUser);
  },
  findById(id) {
    const u = users.findById(id);
    return u ? publicUser(u) : undefined;
  },
  update(id, patch) {
    const next = {};
    if (patch.username !== undefined) next.username = normalizeUsername(patch.username);
    if (patch.displayName !== undefined) next.displayName = String(patch.displayName || "").trim();
    if (patch.role !== undefined) next.role = patch.role === "admin" ? "admin" : "user";
    if (patch.password) {
      const pwd = String(patch.password);
      if (pwd.length < 6) throw new Error("密码至少 6 位");
      const salt = randomBytes(16).toString("hex");
      next.passwordHash = `${salt}:${hashPassword(pwd, salt)}`;
    }
    if (patch.username !== undefined && users.findByUsername(next.username)?.id !== id) {
      throw new Error("用户名已存在");
    }
    if (Object.keys(next).length === 0) return false;
    return users.update(id, next);
  },
  remove(id) {
    return users.remove(id);
  },
  countAdmins() {
    return users.countAdmins();
  },
};
