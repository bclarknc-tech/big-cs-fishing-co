# Deploy the catch wall and website reviews

This pull request does not deploy anything and does not change the live site. `www.bigcsfishing.com` stays on GitHub Pages until you merge. The Worker, when you deploy it, is only on its `workers.dev` address. Do not add a route for `bigcsfishing.com` or `www.bigcsfishing.com`.

Run every command below from the `worker` folder.

```bash
cd worker
npm install
npx wrangler login
```

You need a free Cloudflare account. Nothing here uses R2 (that asks for a card). Photos go in Workers KV. Posts and reviews go in D1.

## 1. Database

```bash
npx wrangler d1 create bigcs-fishing
```

Copy the `database_id` it prints into `worker/wrangler.toml`, replacing `00000000-0000-0000-0000-000000000001`.

```bash
npx wrangler d1 migrations apply bigcs-fishing --remote
```

The Worker also creates these tables if they are missing. Still run the migration so the database is ready before the first visitor.

## 2. Photo storage

```bash
npx wrangler kv namespace create PHOTOS
```

Copy the `id` into `worker/wrangler.toml`, replacing `00000000-0000-0000-0000-000000000002`.

KV on the free plan allows about 1,000 writes a day and 1 GB stored. Each catch photo is capped around 1 MB. That is enough for normal use. A day with more than 1,000 new photos would have to wait until the next day.

## 3. Secrets

The preview config uses Turnstile's always-pass test secret so you can try the site before real anglers do. It is the public test value in `wrangler.toml` under `[vars]`. A secret with the same name replaces it.

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put TURNSTILE_SECRET
```

`ADMIN_PASSWORD` is the review-desk password. Pick a long one. It is not stored in the repo.

For a first look you can skip `TURNSTILE_SECRET` and leave the test value in place. Before the public site points at this Worker, create a real Turnstile widget (step 6) and set `TURNSTILE_SECRET` to that widget's secret. The real secret rejects the test token.

Local only:

```bash
cp .dev.vars.example .dev.vars
```

Edit `ADMIN_PASSWORD` in `.dev.vars`. That file stays on your machine.

## 4. Deploy the preview

```bash
npx wrangler deploy
```

Wrangler prints a URL like `https://bigcs-fishing.<your-subdomain>.workers.dev`.

That URL serves the whole fishing site plus the new pages. Open it and try:

- Home, gear, and the Catch Wall link
- Share a catch (the check always passes while the test keys are in place)
- Write a review
- `https://bigcs-fishing.<your-subdomain>.workers.dev/admin` (not linked from the nav)

Nothing you submit is public until you approve it on that desk. Approve, reject, delete, and unpublish are on the desk. Pending photos are not available at the public photo address.

To try it on your machine first:

```bash
npx wrangler d1 migrations apply bigcs-fishing --local
npx wrangler dev
```

Open the local address Wrangler prints (usually `http://localhost:8787`).

## 5. Email alerts

Each new catch and review sends a note to **bigcs.fishingco@gmail.com** with a link to the admin page. The send is locked to that address. If email fails, the submission is still saved. Check the desk, or Workers logs for `email notify failed`.

One-time setup in the Cloudflare dashboard:

1. The domain that sends the mail has to be on Cloudflare DNS, with Email Routing turned on. For this site that is `bigcsfishing.com`, and the From address is `notify@bigcsfishing.com` (`NOTIFY_FROM` in `wrangler.toml`). Change `NOTIFY_FROM` if you send from a different domain on the same account, then run `npx wrangler deploy` again.
2. Keep the existing website DNS records that point the site at GitHub Pages. Email Routing adds MX records. Those do not move the website. They do replace any MX records you already use for `@bigcsfishing.com` mail. If `hello@bigcsfishing.com` or another address already lands somewhere else, add a forwarding rule to that inbox before you finish onboarding, or that mail will stop arriving.
3. Go to **Compute → Email Service → Email Routing → Destination addresses**. Add `bigcs.fishingco@gmail.com`. Cloudflare sends a confirmation message. Open it and click **Verify email address**. Until that is done, alerts will not send. Submissions still save.
4. Sending only to a verified destination address is free on the Workers free plan. This Worker does not send to anyone else, and it does not need the paid email plan.

You can skip email and use the admin page alone. Submissions still save.

## 6. Real Turnstile keys, then point the live site at the Worker

The files shipped here use Turnstile's always-pass test keys:

| Place | Preview value |
| --- | --- |
| `js/site-config.js` → `turnstileSiteKey` | `1x00000000000000000000AA` |
| `worker/wrangler.toml` → `TURNSTILE_SECRET` | `1x0000000000000000000000000000000AA` |

Create a widget in the Cloudflare dashboard under **Turnstile → Add widget**. Hostnames:

- `www.bigcsfishing.com`
- `bigcsfishing.com`
- your `workers.dev` hostname
- `localhost` if you want to test the real widget on your machine

Put the **site key** in `js/site-config.js` (`turnstileSiteKey`). Put the **secret key** in the Worker:

```bash
npx wrangler secret put TURNSTILE_SECRET
```

`js/site-config.js` is the only place the static site reads the API address.

- Leave `apiBase` as `""` for the workers.dev preview (same origin).
- On GitHub Pages, set it to the Worker origin with no trailing slash, for example `apiBase: "https://bigcs-fishing.<your-subdomain>.workers.dev"`.

Do that in this branch, then merge, so the live pages and the real keys land together. If you merge while `apiBase` is still empty, the shop keeps working. The Catch Wall and review form will not reach the Worker until `apiBase` is set.

Allowed browser origins are `https://www.bigcsfishing.com`, `https://bigcsfishing.com`, and the Worker's own origin (the preview). Other sites cannot submit the forms.

## 7. What you should not do

- Do not merge until you have looked at the workers.dev preview, unless you are fine with the pages going live before the API is wired up.
- Do not add the Worker as a route on `bigcsfishing.com`. That would take the site off GitHub Pages.
- Do not put `ADMIN_PASSWORD` or the real Turnstile secret in the repo or in `js/site-config.js`.
- Do not offer a coupon, discount, or anything else in exchange for a review. The copy on the site does not.

## Checks already in the repo

From `worker`:

```bash
npm test
```

That covers photo metadata stripping, pending vs approved, the review desk, rate limits, and a failed email that still saves the post.
