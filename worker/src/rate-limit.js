import { clientIp, sha256Hex } from "./http.js";

const WINDOW_SECONDS = 60 * 60;
export const SUBMIT_LIMIT = 5;
export const LOGIN_LIMIT = 10;

/** Returns true when the request is still under the limit. */
export async function allow(env, request, kind, limit) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % WINDOW_SECONDS);
  const ipHash = await sha256Hex(clientIp(request));
  const bucket = `${kind}:${windowStart}:${ipHash}`;
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, hits, window_start) VALUES (?, 1, ?)
     ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1
     RETURNING hits`
  ).bind(bucket, windowStart).first();

  if (Math.random() < 0.02) {
    await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?")
      .bind(now - WINDOW_SECONDS * 2)
      .run();
  }

  return !!row && Number(row.hits) <= limit;
}
