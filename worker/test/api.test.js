import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import worker, { handle } from "../src/index.js";
import { LOGIN_LIMIT, SUBMIT_LIMIT } from "../src/rate-limit.js";
import { TEST_TURNSTILE_TOKEN } from "../src/turnstile.js";

const ORIGIN = "https://bigcs-fishing.test.workers.dev";
const SITE = "https://www.bigcsfishing.com";

function createDb() {
  const db = new DatabaseSync(":memory:");
  return {
    prepare(sql) {
      const build = (params) => ({
        async run() {
          const info = db.prepare(sql).run(...params);
          return { success: true, meta: { changes: info.changes ?? 0 } };
        },
        async first() {
          return db.prepare(sql).get(...params) ?? null;
        },
        async all() {
          return { results: db.prepare(sql).all(...params) };
        },
      });
      const statement = build([]);
      statement.bind = (...params) => build(params);
      return statement;
    },
  };
}

class MemoryKV {
  constructor() {
    this.store = new Map();
  }
  async put(key, value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    this.store.set(key, copy);
  }
  async get(key, type) {
    const bytes = this.store.get(key);
    if (!bytes) return null;
    if (type === "arrayBuffer") {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return copy.buffer;
    }
    return bytes;
  }
  async delete(key) {
    this.store.delete(key);
  }
}

function makeEnv(extra = {}) {
  const sent = [];
  return {
    DB: createDb(),
    PHOTOS: new MemoryKV(),
    EMAIL: {
      sent,
      send: async (message) => {
        sent.push(message);
        return { messageId: "local-test" };
      },
    },
    ADMIN_PASSWORD: "test-password-123",
    TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
    NOTIFY_FROM: "notify@bigcsfishing.com",
    ...extra,
  };
}

function req(pathname, { method = "GET", origin, body, headers = {}, ip = "203.0.113.10" } = {}) {
  const h = new Headers(headers);
  if (origin) h.set("Origin", origin);
  h.set("CF-Connecting-IP", ip);
  return new Request(ORIGIN + pathname, { method, headers: h, body });
}

function jpegWithGps() {
  const exif = new TextEncoder().encode("Exif\0\0GPS LATITUDE SECRET");
  const length = exif.length + 2;
  const payload = new Uint8Array(120).fill(0x11);
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, (length >> 8) & 0xff, length & 0xff,
    ...exif,
    0xff, 0xda, 0x00, 0x04,
    ...payload,
    0xff, 0xd9,
  ]);
}

function catchForm(bytes = jpegWithGps(), fields = {}) {
  const form = new FormData();
  form.set("photo", new File([bytes], "catch.jpg", { type: "image/jpeg" }));
  form.set("species", fields.species ?? "Largemouth bass");
  form.set("lure", fields.lure ?? "pencil-lure");
  form.set("lureOther", fields.lureOther ?? "");
  form.set("location", fields.location ?? "Lake Norman");
  form.set("note", fields.note ?? "A calm morning.");
  form.set("anglerName", fields.anglerName ?? "Sam");
  form.set("photoConsent", fields.photoConsent ?? "yes");
  form.set("ageConsent", fields.ageConsent ?? "yes");
  form.set("cf-turnstile-response", fields.token ?? TEST_TURNSTILE_TOKEN);
  return form;
}

function reviewBody(fields = {}) {
  return JSON.stringify({
    productId: fields.productId ?? "spoon-set",
    stars: fields.stars ?? 5,
    reviewText: fields.reviewText ?? "Casts well and the fish liked it.",
    reviewerName: fields.reviewerName ?? "Sam",
    consent: fields.consent ?? true,
    turnstileToken: fields.token ?? TEST_TURNSTILE_TOKEN,
  });
}

function cookiePair(res) {
  const raw = res.headers.get("set-cookie") || "";
  const match = raw.match(/bigc_admin=([^;]*)/);
  return match && match[1] ? `bigc_admin=${match[1]}` : "";
}

test("reviews stay private until approved, then can be unpublished", async () => {
  const env = makeEnv();
  const denied = await handle(req("/api/reviews", {
    method: "POST",
    origin: "https://evil.example",
    headers: { "Content-Type": "application/json" },
    body: reviewBody(),
  }), env);
  assert.equal(denied.status, 403);

  const missing = await handle(req("/api/reviews", {
    method: "POST",
    origin: SITE,
    headers: { "Content-Type": "application/json" },
    body: reviewBody({ consent: false }),
  }), env);
  assert.equal(missing.status, 400);

  const created = await handle(req("/api/reviews", {
    method: "POST",
    origin: SITE,
    headers: { "Content-Type": "application/json" },
    body: reviewBody(),
    ip: "203.0.113.20",
  }), env);
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("access-control-allow-origin"), SITE);
  assert.equal(env.EMAIL.sent.length, 1);
  assert.equal(env.EMAIL.sent[0].to, "bigcs.fishingco@gmail.com");
  assert.match(env.EMAIL.sent[0].subject, /review/i);
  assert.match(env.EMAIL.sent[0].text, /\/admin/);

  const hidden = await handle(req("/api/reviews", { origin: SITE }), env);
  assert.deepEqual((await hidden.json()).reviews, []);

  const noSession = await handle(req("/api/admin/queue", { origin: ORIGIN }), env);
  assert.equal(noSession.status, 401);

  const badLogin = await handle(req("/api/admin/login", {
    method: "POST",
    origin: ORIGIN,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "nope" }),
    ip: "203.0.113.21",
  }), env);
  assert.equal(badLogin.status, 401);

  const cross = await handle(req("/api/admin/login", {
    method: "POST",
    origin: SITE,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "test-password-123" }),
    ip: "203.0.113.22",
  }), env);
  assert.equal(cross.status, 403);

  const login = await handle(req("/api/admin/login", {
    method: "POST",
    origin: ORIGIN,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "test-password-123" }),
    ip: "203.0.113.23",
  }), env);
  assert.equal(login.status, 200);
  const cookie = cookiePair(login);
  assert.match(cookie, /^bigc_admin=[a-f0-9]{64}$/);

  const queue = await handle(req("/api/admin/queue", {
    origin: ORIGIN,
    headers: { Cookie: cookie },
  }), env);
  const pending = (await queue.json()).reviews.pending;
  assert.equal(pending.length, 1);
  const id = pending[0].id;

  const approved = await handle(req(`/api/admin/reviews/${id}/approve`, {
    method: "POST",
    origin: ORIGIN,
    headers: { Cookie: cookie },
  }), env);
  assert.equal(approved.status, 200);

  const pub = await (await handle(req("/api/reviews", { origin: "https://bigcsfishing.com" }), env)).json();
  assert.equal(pub.reviews.length, 1);
  assert.equal(pub.reviews[0].productId, "spoon-set");
  assert.equal(pub.reviews[0].stars, 5);
  assert.equal(pub.reviews[0].name, "Sam");
  assert.equal(pub.reviews[0].text.includes("password"), false);

  await handle(req(`/api/admin/reviews/${id}/unpublish`, {
    method: "POST",
    origin: ORIGIN,
    headers: { Cookie: cookie },
  }), env);
  const after = await (await handle(req("/api/reviews"), env)).json();
  assert.equal(after.reviews.length, 0);

  const bad = await handle(req("/api/reviews", {
    method: "POST",
    origin: SITE,
    headers: { "Content-Type": "application/json" },
    body: reviewBody({ stars: 9, reviewText: "Nope." }),
    ip: "203.0.113.24",
  }), env);
  assert.equal(bad.status, 400);
});

test("catch photos are stripped, private until approved, and removable", async () => {
  const env = makeEnv();
  const created = await handle(req("/api/catches", {
    method: "POST",
    origin: SITE,
    body: catchForm(),
    ip: "203.0.113.30",
  }), env);
  assert.equal(created.status, 201);
  assert.match(env.EMAIL.sent[0].text, /Largemouth bass/);
  assert.match(env.EMAIL.sent[0].text, /Pencil Lure/);

  const login = await handle(req("/api/admin/login", {
    method: "POST",
    origin: ORIGIN,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "test-password-123" }),
    ip: "203.0.113.31",
  }), env);
  const cookie = cookiePair(login);
  const queue = await (await handle(req("/api/admin/queue", {
    origin: ORIGIN,
    headers: { Cookie: cookie },
  }), env)).json();
  const id = queue.catches.pending[0].id;

  const secret = await handle(req(`/api/photos/${id}`), env);
  assert.equal(secret.status, 404);

  const preview = await handle(req(`/api/admin/photos/${id}`, {
    origin: ORIGIN,
    headers: { Cookie: cookie },
  }), env);
  assert.equal(preview.headers.get("content-type"), "image/jpeg");
  assert.equal(preview.headers.get("x-robots-tag"), "noindex, nofollow");
  const previewBytes = new TextDecoder().decode(await preview.arrayBuffer());
  assert.equal(previewBytes.includes("GPS"), false);

  await handle(req(`/api/admin/catches/${id}/approve`, {
    method: "POST",
    origin: ORIGIN,
    headers: { Cookie: cookie },
  }), env);
  const photo = await handle(req(`/api/photos/${id}`, { origin: SITE }), env);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("content-type"), "image/jpeg");
  assert.equal(photo.headers.get("access-control-allow-origin"), SITE);
  const wall = await (await handle(req("/api/catches", { origin: SITE }), env)).json();
  assert.equal(wall.catches.length, 1);
  assert.equal(wall.catches[0].anglerName, "Sam");
  assert.equal(wall.catches[0].lure, "Pencil Lure (53mm)");
  assert.match(wall.catches[0].photoUrl, new RegExp(`/api/photos/${id}$`));

  await handle(req(`/api/admin/catches/${id}/delete`, {
    method: "POST",
    origin: ORIGIN,
    headers: { Cookie: cookie },
  }), env);
  assert.equal((await handle(req(`/api/photos/${id}`), env)).status, 404);
  assert.equal(env.PHOTOS.store.size, 0);
  const empty = await (await handle(req("/api/catches"), env)).json();
  assert.equal(empty.catches.length, 0);
});

test("other lure, missing consent, and a bad file are refused", async () => {
  const env = makeEnv();
  const other = await handle(req("/api/catches", {
    method: "POST",
    origin: SITE,
    body: catchForm(jpegWithGps(), { lure: "other", lureOther: "White spinner" }),
    ip: "203.0.113.40",
  }), env);
  assert.equal(other.status, 201);

  const nameless = await handle(req("/api/catches", {
    method: "POST",
    origin: SITE,
    body: catchForm(jpegWithGps(), { lure: "other", lureOther: "  " }),
    ip: "203.0.113.41",
  }), env);
  assert.equal(nameless.status, 400);

  const age = await handle(req("/api/catches", {
    method: "POST",
    origin: SITE,
    body: catchForm(jpegWithGps(), { ageConsent: "" }),
    ip: "203.0.113.42",
  }), env);
  assert.equal(age.status, 400);

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  const badType = await handle(req("/api/catches", {
    method: "POST",
    origin: SITE,
    body: catchForm(png),
    ip: "203.0.113.43",
  }), env);
  assert.equal(badType.status, 400);

  const longNote = await handle(req("/api/catches", {
    method: "POST",
    origin: SITE,
    body: catchForm(jpegWithGps(), { note: "a".repeat(501) }),
    ip: "203.0.113.44",
  }), env);
  assert.equal(longNote.status, 400);
});

test("email failure still saves the submission", async () => {
  const env = makeEnv();
  env.EMAIL.send = async () => {
    throw new Error("destination not verified");
  };
  const created = await handle(req("/api/reviews", {
    method: "POST",
    origin: SITE,
    headers: { "Content-Type": "application/json" },
    body: reviewBody({ reviewText: "Still saved when mail fails." }),
    ip: "203.0.113.50",
  }), env);
  assert.equal(created.status, 201);
  const login = await handle(req("/api/admin/login", {
    method: "POST",
    origin: ORIGIN,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "test-password-123" }),
    ip: "203.0.113.51",
  }), env);
  const queue = await (await handle(req("/api/admin/queue", {
    origin: ORIGIN,
    headers: { Cookie: cookiePair(login) },
  }), env)).json();
  assert.equal(queue.reviews.pending[0].text, "Still saved when mail fails.");
});

test("submission and sign-in rate limits", async () => {
  const env = makeEnv();
  for (let i = 0; i < SUBMIT_LIMIT; i += 1) {
    const res = await handle(req("/api/reviews", {
      method: "POST",
      origin: SITE,
      headers: { "Content-Type": "application/json" },
      body: reviewBody({ reviewText: `Review number ${i} is long enough.` }),
      ip: "203.0.113.60",
    }), env);
    assert.equal(res.status, 201);
  }
  const blocked = await handle(req("/api/reviews", {
    method: "POST",
    origin: SITE,
    headers: { "Content-Type": "application/json" },
    body: reviewBody({ reviewText: "One more should wait." }),
    ip: "203.0.113.60",
  }), env);
  assert.equal(blocked.status, 429);

  for (let i = 0; i < LOGIN_LIMIT; i += 1) {
    const res = await handle(req("/api/admin/login", {
      method: "POST",
      origin: ORIGIN,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong-password" }),
      ip: "203.0.113.61",
    }), env);
    assert.equal(res.status, 401);
  }
  const locked = await handle(req("/api/admin/login", {
    method: "POST",
    origin: ORIGIN,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "test-password-123" }),
    ip: "203.0.113.61",
  }), env);
  assert.equal(locked.status, 429);
});

test("admin page is private and health stays up", async () => {
  const env = makeEnv();
  const page = await handle(req("/admin", { origin: ORIGIN }), env);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("x-robots-tag"), /noindex/);
  const html = await page.text();
  assert.match(html, /noindex/);
  assert.doesNotMatch(html, /test-password-123/);
  assert.match(html, /Review desk/);

  const health = await handle(req("/api/health"), env);
  assert.equal((await health.json()).ok, true);

  const preflight = await handle(req("/api/reviews", { method: "OPTIONS", origin: SITE }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), SITE);

  const missed = await handle(req("/index.html"), env);
  assert.equal(missed.status, 404);
});

test("the worker serves site files and keeps API routes for itself", async () => {
  const env = makeEnv();
  env.ASSETS = {
    async fetch() {
      return new Response("<p>Big C's</p>", { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  };
  const home = await worker.fetch(req("/index.html"), env);
  assert.equal(await home.text(), "<p>Big C's</p>");
  const health = await worker.fetch(req("/api/health"), env);
  assert.equal((await health.json()).ok, true);
  const desk = await worker.fetch(req("/admin"), env);
  assert.match(await desk.text(), /Review desk/);
});
