// 内存会话存储：保存最近转换出的 Elementor 模板
const sessions = new Map();
let seq = 0;

export const store = {
  save(template) {
    const id = (++seq).toString(16).padStart(6, "0");
    sessions.set(id, template);
    return id;
  },
  get(id) { return sessions.get(id); },
  has(id) { return sessions.has(id); },
};
