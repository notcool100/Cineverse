// Validation and expansion of embed provider URL templates. Provider-agnostic: hosts come from config.

export const PLACEHOLDERS = ["tmdbId", "season", "episode"] as const;
const DEFAULT_ALLOWED_HOSTS = ["www.youtube-nocookie.com", "archive.org"];

let dbHosts: string[] = [];
/** Hosts stored via the admin panel (see embed-hosts.ts); replaced wholesale on every change. */
export function setDbHosts(hosts: string[]) {
  dbHosts = hosts.map((h) => h.toLowerCase());
}

/** Plain DNS hostnames only: no IP literals, ports, wildcards, paths or single-label names like "localhost". */
export const isValidHost = (h: string) => /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h);

export function envEmbedHosts(env = process.env.EMBED_ALLOWED_HOSTS): string[] {
  return env?.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean) ?? [];
}

/** Hosts a template may point at: EMBED_ALLOWED_HOSTS plus admin-added hosts, else the dev defaults. */
export function allowedEmbedHosts(env = process.env.EMBED_ALLOWED_HOSTS): string[] {
  const list = [...new Set([...envEmbedHosts(env), ...dbHosts])];
  return list.length ? list : DEFAULT_ALLOWED_HOSTS;
}

/** Returns an error message, or null when the template is acceptable. */
export function validateTemplate(tpl: string, hosts = allowedEmbedHosts()): string | null {
  const unknown = [...tpl.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]).filter((n) => !(PLACEHOLDERS as readonly string[]).includes(n));
  if (unknown.length) return `Unknown placeholder {${unknown[0]}}; allowed: ${PLACEHOLDERS.join(", ")}`;

  // Placeholders may only appear in the path or query, never in scheme/host/userinfo.
  let url: URL;
  try {
    url = new URL(tpl.replace(/\{[^}]*\}/g, "0"));
  } catch {
    return "Not a valid URL";
  }
  if (url.protocol !== "https:") return "Only https:// templates are allowed";
  if (url.username || url.password) return "Credentials in the URL are not allowed";
  if (url.port) return "Custom ports are not allowed";
  if (!hosts.includes(url.hostname.toLowerCase())) return `Host ${url.hostname} is not an allowed embed host (add it under Allowed hosts)`;
  const authority = tpl.slice(0, tpl.indexOf("/", 8) === -1 ? undefined : tpl.indexOf("/", 8));
  if (authority.includes("{")) return "Placeholders are not allowed in the host";
  return null;
}

/** Expands a validated template. Values are integers, so they cannot add path or query syntax. */
export function buildEmbedUrl(tpl: string, v: { tmdbId?: number | null; season?: number; episode?: number }): string | null {
  if (validateTemplate(tpl)) return null;
  const need = (n: string, val: number | null | undefined) => !tpl.includes(`{${n}}`) || Number.isInteger(val);
  if (!need("tmdbId", v.tmdbId) || !need("season", v.season) || !need("episode", v.episode)) return null;
  return tpl
    .replaceAll("{tmdbId}", String(v.tmdbId))
    .replaceAll("{season}", String(v.season))
    .replaceAll("{episode}", String(v.episode));
}
