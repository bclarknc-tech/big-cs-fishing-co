import { PRODUCTS } from "./products.js";

export function adminPage() {
  const products = JSON.stringify(PRODUCTS).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Review desk — Big C's Fishing Co.</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root { --navy:#00121d; --gold:#ffc400; --line:rgba(255,255,255,.14); --dim:#d5d5d5; }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; font-family: "Source Sans 3", "Segoe UI", sans-serif; background: #02060a; color: #fff; }
  header, main { max-width: 920px; margin: 0 auto; padding: 20px 16px; }
  header { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
  h1 { font-family: Oswald, sans-serif; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; font-size: 28px; margin: 0; }
  p.quiet { color: var(--dim); margin: 6px 0 0; }
  button, .linkish { font: inherit; cursor: pointer; }
  button { border: 0; border-radius: 4px; padding: 10px 14px; }
  .gold { background: var(--gold); color: #000; font-weight: 600; }
  .ghost { background: transparent; color: var(--gold); border: 1px solid var(--gold); }
  .danger { background: transparent; color: #ffb4b4; }
  form.login { max-width: 420px; display: grid; gap: 12px; }
  input[type="password"] { font-size: 16px; padding: 12px; border-radius: 4px; border: 1px solid var(--line); background: var(--navy); color: #fff; }
  .msg { color: #ffb4b4; min-height: 1.2em; }
  section { margin-top: 28px; }
  h2 { font-family: Oswald, sans-serif; font-weight: 500; text-transform: uppercase; letter-spacing: .06em; font-size: 18px; color: var(--gold); }
  article { border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin: 12px 0; background: var(--navy); }
  article img { width: 100%; max-height: 360px; object-fit: contain; background: #000; border-radius: 4px; }
  .meta { color: var(--dim); margin: 8px 0; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .stars { color: var(--gold); letter-spacing: 2px; }
  .empty { color: var(--dim); }
  @media (max-width: 640px) {
    .actions button { flex: 1 1 100%; }
  }
</style>
</head>
<body>
<header>
  <div>
    <h1>Review desk</h1>
    <p class="quiet">Private page. Nothing here is on the public site until you approve it.</p>
  </div>
  <button type="button" class="ghost" id="logout" hidden>Log out</button>
</header>
<main>
  <form class="login" id="login">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button class="gold" type="submit">Open the desk</button>
    <p class="msg" id="login-msg" role="alert"></p>
  </form>
  <div id="desk" hidden>
    <p><button type="button" class="ghost" id="refresh">Refresh</button></p>
    <p class="msg" id="desk-msg" role="alert"></p>
    <div id="lists"></div>
  </div>
</main>
<script>
const PRODUCTS = ${products};
const productName = (id) => (PRODUCTS.find((p) => p.id === id) || {}).name || id;
const loginForm = document.getElementById("login");
const desk = document.getElementById("desk");
const loginMsg = document.getElementById("login-msg");
const deskMsg = document.getElementById("desk-msg");
const lists = document.getElementById("lists");

function stars(n) {
  return "★★★★★☆☆☆☆☆".slice(5 - n, 10 - n);
}

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

function card(kind, item) {
  const article = document.createElement("article");
  if (kind === "catches") {
    const img = document.createElement("img");
    img.alt = item.species ? ("Catch photo: " + item.species) : "Catch photo";
    img.src = "/api/admin/photos/" + item.id;
    article.appendChild(img);
  } else {
    const rating = document.createElement("div");
    rating.className = "stars";
    rating.textContent = stars(item.stars) + "  " + productName(item.productId);
    article.appendChild(rating);
  }
  const meta = document.createElement("p");
  meta.className = "meta";
  const bits = [];
  if (kind === "catches") {
    bits.push(item.species, item.lure, item.anglerName);
    if (item.location) bits.push(item.location);
  } else {
    bits.push(item.reviewerName);
  }
  bits.push(item.status);
  meta.textContent = bits.filter(Boolean).join(" · ");
  article.appendChild(meta);
  const body = document.createElement("p");
  body.textContent = kind === "catches" ? (item.note || "") : (item.text || "");
  article.appendChild(body);
  const actions = document.createElement("div");
  actions.className = "actions";
  const buttons = [];
  if (item.status !== "approved") buttons.push(["approve", "Approve", "gold"]);
  if (item.status === "pending") buttons.push(["reject", "Reject", "ghost"]);
  if (item.status === "approved") buttons.push(["unpublish", "Unpublish", "ghost"]);
  buttons.push(["delete", "Delete", "danger"]);
  for (const [action, label, cls] of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = cls;
    button.textContent = label;
    button.addEventListener("click", () => run(kind, item.id, action, button));
    actions.appendChild(button);
  }
  article.appendChild(actions);
  return article;
}

function section(title, kind, items) {
  const wrap = document.createElement("section");
  const heading = document.createElement("h2");
  heading.textContent = title;
  wrap.appendChild(heading);
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "None right now.";
    wrap.appendChild(empty);
    return wrap;
  }
  for (const item of items) wrap.appendChild(card(kind, item));
  return wrap;
}

async function load() {
  deskMsg.textContent = "";
  const data = await api("/api/admin/queue");
  lists.replaceChildren(
    section("Catches waiting", "catches", data.catches.pending),
    section("Catches on the site", "catches", data.catches.approved),
    section("Catches set aside", "catches", data.catches.hidden),
    section("Reviews waiting", "reviews", data.reviews.pending),
    section("Reviews on the site", "reviews", data.reviews.approved),
    section("Reviews set aside", "reviews", data.reviews.hidden)
  );
}

async function run(kind, id, action, button) {
  if (action === "delete" && !confirm("Delete this for good?")) return;
  button.disabled = true;
  deskMsg.textContent = "";
  try {
    await api("/api/admin/" + kind + "/" + id + "/" + action, { method: "POST" });
    await load();
  } catch (err) {
    deskMsg.textContent = err.message;
    button.disabled = false;
  }
}

async function showDesk() {
  loginForm.hidden = true;
  desk.hidden = false;
  document.getElementById("logout").hidden = false;
  await load();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMsg.textContent = "";
  const password = document.getElementById("password").value;
  try {
    await api("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    document.getElementById("password").value = "";
    await showDesk();
  } catch (err) {
    loginMsg.textContent = err.message;
  }
});

document.getElementById("logout").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  desk.hidden = true;
  loginForm.hidden = false;
  document.getElementById("logout").hidden = true;
  lists.replaceChildren();
});

document.getElementById("refresh").addEventListener("click", () => {
  load().catch((err) => { deskMsg.textContent = err.message; });
});

api("/api/admin/queue").then(showDesk).catch(() => {});
</script>
</body>
</html>`;
}
