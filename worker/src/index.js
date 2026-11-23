import { adminHtml, adminPhotoResponse, isAdmin, login, logout, moderate, queue } from "./admin.js";
import { listPublicCatches, publicPhoto, submitCatch } from "./catches.js";
import { isAllowedOrigin, isSameOrigin, json, UUID_RE } from "./http.js";
import { listPublicReviews, submitReview } from "./reviews.js";
import { ensureSchema } from "./schema.js";

const ACTIONS = new Set(["approve", "reject", "unpublish", "delete"]);

function pathOf(request) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  return path || "/";
}

function workerHandles(pathname) {
  return pathname.startsWith("/api/") || pathname === "/admin" || pathname.startsWith("/admin/");
}

export async function handle(request, env) {
  const response = await route(request, env);
  return finalize(request, response);
}

async function route(request, env) {
  const path = pathOf(request);

  if (request.method === "OPTIONS" && path.startsWith("/api/")) {
    if (!isAllowedOrigin(request)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204 });
  }

  const adminRoute = path === "/admin" || path.startsWith("/api/admin");
  if (adminRoute && request.headers.get("Origin") && !isSameOrigin(request)) {
    return json({ error: "Open the admin page on this site." }, 403);
  }
  if (!adminRoute && path.startsWith("/api/") && !isAllowedOrigin(request)) {
    return json({ error: "This form only works on the Big C's site." }, 403);
  }

  if (path === "/api/health" && request.method === "GET") {
    return json({ ok: true });
  }

  try {
    await ensureSchema(env);
  } catch (err) {
    console.error("schema failed", err && err.message);
    if (path === "/admin") {
      return new Response("The review desk is not set up yet.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
      });
    }
    return json({ error: "The form is not set up yet. Please try again later." }, 503);
  }

  try {
    return await dispatch(request, env, path);
  } catch (err) {
    console.error("request failed", err && err.message);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

async function dispatch(request, env, path) {
  if (path === "/admin" && request.method === "GET") return adminHtml();
  if (path === "/api/catches" && request.method === "GET") return listPublicCatches(request, env);
  if (path === "/api/catches" && request.method === "POST") return submitCatch(request, env);
  if (path === "/api/reviews" && request.method === "GET") return listPublicReviews(env);
  if (path === "/api/reviews" && request.method === "POST") return submitReview(request, env);

  const photo = path.match(/^\/api\/photos\/([0-9a-f-]{36})$/i);
  if (photo && request.method === "GET") {
    if (!UUID_RE.test(photo[1])) return json({ error: "Photo not found." }, 404);
    return publicPhoto(env, photo[1]);
  }

  if (path === "/api/admin/login" && request.method === "POST") return login(request, env);
  if (path === "/api/admin/logout" && request.method === "POST") return logout(request);
  if (path.startsWith("/api/admin") && !(await isAdmin(request, env))) {
    return json({ error: "Sign in required." }, 401);
  }
  if (path === "/api/admin/queue" && request.method === "GET") return queue(env);

  const adminPhoto = path.match(/^\/api\/admin\/photos\/([0-9a-f-]{36})$/i);
  if (adminPhoto && request.method === "GET") {
    if (!UUID_RE.test(adminPhoto[1])) return json({ error: "Photo not found." }, 404);
    return adminPhotoResponse(env, adminPhoto[1]);
  }

  const action = path.match(/^\/api\/admin\/(catches|reviews)\/([0-9a-f-]{36})\/(approve|reject|unpublish|delete)$/i);
  if (action && request.method === "POST") {
    const [, table, id, name] = action;
    if (!UUID_RE.test(id) || !ACTIONS.has(name)) return json({ error: "That action is not available." }, 400);
    return moderate(env, table, id, name);
  }

  if (path.startsWith("/api/")) return json({ error: "Not found." }, 404);
  return new Response("Not found", { status: 404 });
}

function finalize(request, response) {
  const headers = new Headers(response.headers);
  const path = pathOf(request);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (path === "/admin" || path.startsWith("/api/admin")) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("Cache-Control", "no-store");
  }
  const origin = request.headers.get("Origin");
  if (origin && isAllowedOrigin(request) && !path.startsWith("/api/admin") && path !== "/admin") {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (workerHandles(path)) return handle(request, env);
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
