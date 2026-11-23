export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS catches (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  species TEXT NOT NULL,
  lure_id TEXT NOT NULL,
  lure_label TEXT NOT NULL,
  location TEXT,
  note TEXT,
  angler_name TEXT NOT NULL,
  photo_key TEXT NOT NULL,
  photo_bytes INTEGER NOT NULL,
  photo_consent INTEGER NOT NULL,
  age_consent INTEGER NOT NULL,
  CHECK (status IN ('pending', 'approved', 'rejected', 'unpublished')),
  CHECK (photo_consent = 1),
  CHECK (age_consent = 1)
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  product_id TEXT NOT NULL,
  stars INTEGER NOT NULL,
  review_text TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  consent INTEGER NOT NULL,
  CHECK (status IN ('pending', 'approved', 'rejected', 'unpublished')),
  CHECK (stars BETWEEN 1 AND 5),
  CHECK (consent = 1)
);

CREATE INDEX IF NOT EXISTS idx_catches_status_created ON catches (status, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_status_product ON reviews (status, product_id, created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
`;

const ready = new WeakMap();

export function ensureSchema(env) {
  let pending = ready.get(env);
  if (!pending) {
    pending = applySchema(env).catch((err) => {
      ready.delete(env);
      throw err;
    });
    ready.set(env, pending);
  }
  return pending;
}

async function applySchema(env) {
  if (!env.DB) throw new Error("D1 binding DB is missing");
  const statements = SCHEMA_SQL.split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const sql of statements) {
    await env.DB.prepare(sql).run();
  }
}
