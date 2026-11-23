const NOTIFY_TO = "bigcs.fishingco@gmail.com";

/**
 * Best-effort alert. A failure here must not undo a saved submission.
 * The binding is locked to the verified destination address.
 */
export async function notifySubmission(env, request, kind, lines) {
  if (!env.EMAIL || typeof env.EMAIL.send !== "function") {
    console.error("email notify skipped: EMAIL binding missing");
    return false;
  }
  const from = env.NOTIFY_FROM || "notify@bigcsfishing.com";
  let adminUrl = "/admin";
  try {
    adminUrl = new URL("/admin", request.url).href;
  } catch {
    adminUrl = "/admin";
  }
  const intro = kind === "catch"
    ? "A new catch photo is waiting for a look."
    : "A new product review is waiting for a look.";
  const text = [
    intro,
    "",
    ...lines,
    "",
    "Nothing is public until you approve it.",
    `Admin page: ${adminUrl}`,
  ].join("\n");
  const subject = kind === "catch" ? "New catch photo to review" : "New product review to review";
  try {
    await env.EMAIL.send({
      to: NOTIFY_TO,
      from: { email: from, name: "Big C's Fishing Co." },
      subject,
      text,
    });
    return true;
  } catch (err) {
    console.error("email notify failed", err && (err.code || err.message));
    return false;
  }
}
