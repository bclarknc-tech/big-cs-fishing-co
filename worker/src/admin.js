import { adminPage } from "./admin-page.js";
import { adminPhoto } from "./catches.js";
import { productById } from "./products.js";
import { allow, LOGIN_LIMIT } from "./rate-limit.js";
import { cookieHeader, json, readBody, readCookie, sha256Hex, timingSafeEqual } from "./http.js";

const CATCH_FIELDS = `id, created_at, status, species, lure_id, lure_label, location, note, angler_name`;
const REVIEW_FIELDS = `id, created_at, status, product_id, stars, review_text, reviewer_name`;

export async function adminHtml() {
  return new Response(adminPage(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function sessionToken(password) {
  return sha256Hex(`bigcs-admin-v1|${password}`);
}

export async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const expected = await sessionToken(env.ADMIN_PASSWORD);
  const got = readCookie(request, "bigc_admin");
  if (!got) return false;
  return timingSafeEqual(expected, got);
}

export async function login(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: "The admin password is not set on the server yet." }, 503);
  }
  if (!(await allow(env, request, "login", LOGIN_LIMIT))) {
    return json({ error: "Too many sign-in tries. Please wait an hour and try again." }, 429);
  }
  const body = await readBody(request, 2_000);
  if (body.error) return json({ error: "That sign-in could not be read." }, 413);
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(body.buffer));
  } catch {
    return json({ error: "That sign-in could not be read." }, 400);
  }
  const password = data && typeof data.password === "string" ? data.password : "";
  const match = await timingSafeEqual(password, env.ADMIN_PASSWORD);
  if (!match) return json({ error: "That password did not match." }, 401);
  const token = await sessionToken(env.ADMIN_PASSWORD);
  return json({ ok: true }, 200, { "Set-Cookie": cookieHeader(token, request, { maxAge: 60 * 60 * 12 }) });
}

export function logout(request) {
  return json({ ok: true }, 200, { "Set-Cookie": cookieHeader("", request, { maxAge: 0 }) });
}

function mapCatch(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    species: row.species,
    lureId: row.lure_id,
    lure: row.lure_label,
    location: row.location || "",
    note: row.note || "",
    anglerName: row.angler_name,
  };
}

function mapReview(row) {
  const product = productById(row.product_id);
  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    productId: row.product_id,
    productName: product ? product.name : row.product_id,
    stars: row.stars,
    text: row.review_text,
    reviewerName: row.reviewer_name,
  };
}

async function grouped(env, table, fields, map) {
  const name = table === "catches" || table === "reviews" ? table : "";
  if (!name) return { pending: [], approved: [], hidden: [] };
  const { results } = await env.DB.prepare(
    `SELECT ${fields} FROM ${name} ORDER BY created_at DESC LIMIT 300`
  ).all();
  const groups = { pending: [], approved: [], hidden: [] };
  for (const row of results || []) {
    const item = map(row);
    if (row.status === "pending") groups.pending.push(item);
    else if (row.status === "approved") groups.approved.push(item);
    else groups.hidden.push(item);
  }
  return groups;
}

export async function queue(env) {
  const catches = await grouped(env, "catches", CATCH_FIELDS, mapCatch);
  const reviews = await grouped(env, "reviews", REVIEW_FIELDS, mapReview);
  return json({ catches, reviews });
}

function tableName(table) {
  if (table === "catches" || table === "reviews") return table;
  return null;
}

export async function moderate(env, table, id, action) {
  const name = tableName(table);
  if (!name) return json({ error: "That action is not available." }, 400);
  const columns = name === "catches" ? "id, status, photo_key" : "id, status";
  const row = await env.DB.prepare(`SELECT ${columns} FROM ${name} WHERE id = ?`).bind(id).first();
  if (!row) return json({ error: "That item was not found." }, 404);
  const now = new Date().toISOString();

  if (action === "delete") {
    if (name === "catches" && row.photo_key && env.PHOTOS) {
      await env.PHOTOS.delete(row.photo_key);
    }
    await env.DB.prepare(`DELETE FROM ${name} WHERE id = ?`).bind(id).run();
    return json({ ok: true });
  }

  const next = { approve: "approved", reject: "rejected", unpublish: "unpublished" }[action];
  if (!next) return json({ error: "That action is not available." }, 400);
  if (action === "reject" && row.status !== "pending") {
    return json({ error: "Only a waiting item can be rejected." }, 400);
  }
  if (action === "unpublish" && row.status !== "approved") {
    return json({ error: "Only an item on the site can be unpublished." }, 400);
  }
  await env.DB.prepare(`UPDATE ${name} SET status = ?, updated_at = ? WHERE id = ?`).bind(next, now, id).run();
  return json({ ok: true, status: next });
}

export async function adminPhotoResponse(env, id) {
  return adminPhoto(env, id);
}
