// apiBase: the Worker origin used by the GitHub Pages site.
// Leave this as "" only when the Worker serves these pages (same origin).
//
// turnstileSiteKey: public site key for the Big C's Fishing Turnstile widget.
// The matching secret is the Worker secret TURNSTILE_SECRET (see DEPLOY.md).
window.BIGC_CONFIG = {
  apiBase: "https://bigcs-fishing.bigcs.workers.dev",
  turnstileSiteKey: "0x4AAAAAAGPaloJJM7GAB3AZ"
};
