/** Cloudflare's published always-pass test pair. Real keys replace these before the live site uses the form. */
export const TEST_TURNSTILE_SECRET = "1x0000000000000000000000000000000AA";
export const TEST_TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

export async function verifyTurnstile(secret, token, ip) {
  if (!secret || typeof token !== "string" || token.length < 10 || token.length > 2048) {
    return false;
  }
  try {
    const body = new FormData();
    body.set("secret", secret);
    body.set("response", token);
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    if (!res.ok) throw new Error(`siteverify http ${res.status}`);
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error("turnstile verify failed", err && err.message);
    // Preview only: the published test secret accepts the dummy token offline.
    return secret === TEST_TURNSTILE_SECRET && token === TEST_TURNSTILE_TOKEN;
  }
}
