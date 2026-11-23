import { notifySubmission } from "./email.js";
import { allow, SUBMIT_LIMIT } from "./rate-limit.js";
import { verifyTurnstile } from "./turnstile.js";
import { LIMITS, cleanLine, cleanMultiline, cleanStars, parseProduct, requireConsent } from "./validate.js";
import { clientIp, json, readBody, turnstileToken } from "./http.js";

const REVIEW_CONSENT = "Please confirm Big C's Fishing Company may show this review on the website.";

export async function listPublicReviews(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, product_id, stars, review_text, reviewer_name
     FROM reviews WHERE status = 'approved'
     ORDER BY created_at DESC LIMIT 500`
  ).all();
  return json({
    reviews: (results || []).map((row) => ({
      id: row.id,
      productId: row.product_id,
      stars: row.stars,
      text: row.review_text,
      name: row.reviewer_name,
      createdAt: row.created_at,
    })),
  });
}

export async function submitReview(request, env) {
  if (!(await allow(env, request, "submit", SUBMIT_LIMIT))) {
    return json({ error: "Too many submissions from this connection. Please wait an hour and try again." }, 429);
  }
  const body = await readBody(request, LIMITS.bodyReview);
  if (body.error) return json({ error: "That review is too large." }, 413);

  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(body.buffer));
  } catch {
    return json({ error: "That form could not be read." }, 400);
  }
  if (!data || typeof data !== "object") return json({ error: "That form could not be read." }, 400);

  const product = parseProduct(data.productId);
  if (product.error) return json({ error: product.error }, 400);
  const stars = cleanStars(data.stars);
  if (stars.error) return json({ error: stars.error }, 400);
  const text = cleanMultiline(data.reviewText, LIMITS.review, { required: true, label: "The review" });
  if (text.error) return json({ error: text.error }, 400);
  const name = cleanLine(data.reviewerName, LIMITS.name, { required: true, label: "Name" });
  if (name.error) return json({ error: name.error }, 400);
  const consent = requireConsent(data.consent, REVIEW_CONSENT);
  if (consent.error) return json({ error: consent.error }, 400);

  const ok = await verifyTurnstile(env.TURNSTILE_SECRET, turnstileToken(data), clientIp(request));
  if (!ok) return json({ error: "The check did not pass. Please try again." }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO reviews (
      id, created_at, updated_at, status, product_id, stars, review_text, reviewer_name, consent
    ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, 1)`
  ).bind(id, now, now, product.value.id, stars.value, text.value, name.value).run();

  await notifySubmission(env, request, "review", [
    `Name: ${name.value}`,
    `Product: ${product.value.name}`,
    `Stars: ${stars.value}`,
    `Review: ${text.value}`,
  ]);

  return json({ ok: true, status: "pending" }, 201);
}
