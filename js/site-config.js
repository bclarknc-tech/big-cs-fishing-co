// apiBase: leave "" when the Worker serves these pages (same origin, including the
// workers.dev preview). On GitHub Pages, set the Worker origin with no trailing slash:
//   apiBase: "https://bigcs-fishing.<your-subdomain>.workers.dev"
//
// turnstileSiteKey: the preview key below always passes. Replace it with the real
// Turnstile site key before anglers use the form on www.bigcsfishing.com.
// The matching secret is the Worker secret TURNSTILE_SECRET (see DEPLOY.md).
window.BIGC_CONFIG = {
  apiBase: "",
  turnstileSiteKey: "1x00000000000000000000AA"
};
