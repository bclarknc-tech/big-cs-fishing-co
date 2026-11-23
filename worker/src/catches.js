import { prepareJpeg } from "./jpeg.js";
import { notifySubmission } from "./email.js";
import { allow, SUBMIT_LIMIT } from "./rate-limit.js";
import { verifyTurnstile } from "./turnstile.js";
import { LIMITS, cleanLine, cleanMultiline, parseLure, requireConsent } from "./validate.js";
import { clientIp, field, json, readBody, turnstileToken } from "./http.js";

const PHOTO_CONSENT = "Please confirm Big C's Fishing Company may show this photo on the website and on social media.";
const AGE_CONSENT = "Please confirm you are 18 or older, or have a parent's permission.";

export async function listPublicCatches(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, species, lure_label, location, note, angler_name
     FROM catches WHERE status = 'approved'
     ORDER BY created_at DESC LIMIT 100`
  ).all();
  const origin = new URL(request.url).origin;
  return json({
    catches: (results || []).map((row) => ({
      id: row.id,
      species: row.species,
      lure: row.lure_label,
      location: row.location || "",
      note: row.note || "",
      anglerName: row.angler_name,
      createdAt: row.created_at,
      photoUrl: `${origin}/api/photos/${row.id}`,
    })),
  });
}

export async function publicPhoto(env, id) {
  const row = await env.DB.prepare(
    "SELECT status, photo_key FROM catches WHERE id = ?"
  ).bind(id).first();
  if (!row || row.status !== "approved") return json({ error: "Photo not found." }, 404);
  return photoResponse(env, row.photo_key, "public, max-age=60");
}

export async function adminPhoto(env, id) {
  const row = await env.DB.prepare(
    "SELECT photo_key FROM catches WHERE id = ?"
  ).bind(id).first();
  if (!row) return json({ error: "Photo not found." }, 404);
  return photoResponse(env, row.photo_key, "private, no-store");
}

async function photoResponse(env, key, cacheControl) {
  if (!env.PHOTOS) return json({ error: "Photo storage is not set up yet." }, 503);
  const bytes = await env.PHOTOS.get(key, "arrayBuffer");
  if (!bytes) return json({ error: "Photo not found." }, 404);
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline; filename=\"catch.jpg\"",
    },
  });
}

export async function submitCatch(request, env) {
  if (!(await allow(env, request, "submit", SUBMIT_LIMIT))) {
    return json({ error: "Too many submissions from this connection. Please wait an hour and try again." }, 429);
  }
  const body = await readBody(request, LIMITS.bodyCatch);
  if (body.error) return json({ error: "That photo is too large. Use one about 1 MB or smaller." }, 413);

  let form;
  try {
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    headers.delete("transfer-encoding");
    form = await new Request(request.url, {
      method: "POST",
      headers,
      body: body.buffer,
    }).formData();
  } catch {
    return json({ error: "That form could not be read." }, 400);
  }

  const species = cleanLine(field(form, "species"), LIMITS.species, { required: true, label: "Species" });
  if (species.error) return json({ error: species.error }, 400);
  const lure = parseLure(field(form, "lure"), field(form, "lureOther"));
  if (lure.error) return json({ error: lure.error }, 400);
  const location = cleanLine(field(form, "location"), LIMITS.location, { label: "Location" });
  if (location.error) return json({ error: location.error }, 400);
  const note = cleanMultiline(field(form, "note"), LIMITS.note, { label: "the note" });
  if (note.error) return json({ error: note.error }, 400);
  const name = cleanLine(field(form, "anglerName"), LIMITS.name, { required: true, label: "Name" });
  if (name.error) return json({ error: name.error }, 400);
  const photoConsent = requireConsent(field(form, "photoConsent"), PHOTO_CONSENT);
  if (photoConsent.error) return json({ error: photoConsent.error }, 400);
  const ageConsent = requireConsent(field(form, "ageConsent"), AGE_CONSENT);
  if (ageConsent.error) return json({ error: ageConsent.error }, 400);

  const photo = form.get("photo");
  if (!photo || typeof photo.arrayBuffer !== "function" || photo.size <= 0) {
    return json({ error: "Add a photo of the catch." }, 400);
  }
  if (photo.size > LIMITS.bodyCatch) {
    return json({ error: "That photo is too large. Use one about 1 MB or smaller." }, 413);
  }
  const prepared = prepareJpeg(new Uint8Array(await photo.arrayBuffer()));
  if (prepared.error) return json({ error: prepared.error }, 400);

  const token = turnstileToken(form);
  const ok = await verifyTurnstile(env.TURNSTILE_SECRET, token, clientIp(request));
  if (!ok) return json({ error: "The check did not pass. Please try again." }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const photoKey = `catch/${id}`;
  if (!env.PHOTOS) return json({ error: "Photo storage is not set up yet." }, 503);
  await env.PHOTOS.put(photoKey, prepared.bytes);
  try {
    await env.DB.prepare(
      `INSERT INTO catches (
        id, created_at, updated_at, status, species, lure_id, lure_label,
        location, note, angler_name, photo_key, photo_bytes, photo_consent, age_consent
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`
    ).bind(
      id,
      now,
      now,
      species.value,
      lure.id,
      lure.label,
      location.value,
      note.value,
      name.value,
      photoKey,
      prepared.bytes.byteLength
    ).run();
  } catch (err) {
    await env.PHOTOS.delete(photoKey).catch(() => {});
    throw err;
  }

  await notifySubmission(env, request, "catch", [
    `Angler: ${name.value}`,
    `Species: ${species.value}`,
    `Lure: ${lure.label}`,
    location.value ? `Place: ${location.value}` : "Place: (not given)",
    note.value ? `Note: ${note.value}` : "Note: (none)",
  ]);

  return json({ ok: true, status: "pending" }, 201);
}
