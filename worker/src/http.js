const SITE_ORIGINS = new Set([
  "https://www.bigcsfishing.com",
  "https://bigcsfishing.com",
]);

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  return new Response(JSON.stringify(data), { status, headers });
}

export function isAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  if (SITE_ORIGINS.has(origin)) return true;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function isSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

export function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return "";
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const da = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(a))));
  const db = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(b))));
  let diff = 0;
  for (let i = 0; i < da.length; i += 1) diff |= da[i] ^ db[i];
  return diff === 0;
}

export function cookieHeader(value, request, { maxAge }) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `bigc_admin=${value}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export async function readBody(request, maxBytes) {
  const claimed = Number(request.headers.get("Content-Length") || 0);
  if (claimed && claimed > maxBytes) return { error: "too-large" };
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) return { error: "too-large" };
  return { buffer: buf };
}

export function field(form, name) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export function turnstileToken(source) {
  if (source && typeof source.get === "function") {
    return field(source, "cf-turnstile-response") || field(source, "turnstileToken");
  }
  if (source && typeof source === "object") {
    return String(source["cf-turnstile-response"] || source.turnstileToken || "");
  }
  return "";
}
