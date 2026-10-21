export async function api<T = unknown>(url: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error((data as { error?: string }).error || `请求失败 ${r.status}`);
  }
  return data as T;
}
