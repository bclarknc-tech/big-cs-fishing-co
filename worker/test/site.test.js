import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PRODUCTS } from "../src/products.js";
import { SCHEMA_SQL } from "../src/schema.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("product list matches the site catalog", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "data/products.json"), "utf8"));
  assert.deepEqual(PRODUCTS, catalog);
});

test("migration matches the schema the worker applies", () => {
  const file = fs.readFileSync(path.join(root, "worker/migrations/0001_init.sql"), "utf8");
  assert.equal(SCHEMA_SQL.trim(), file.trim());
});

test("public pages link the catch wall and do not link the admin desk", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const catches = fs.readFileSync(path.join(root, "catches.html"), "utf8");
  const review = fs.readFileSync(path.join(root, "review.html"), "utf8");
  assert.match(index, /href="catches\.html"/);
  assert.match(catches, /Share a catch/);
  assert.match(review, /separate from Amazon/i);
  for (const product of PRODUCTS) {
    assert.match(index, new RegExp(`data-product-id="${product.id}"`));
  }
  for (const html of [index, catches, review]) {
    assert.doesNotMatch(html, /href="[^"]*\/admin/);
    assert.doesNotMatch(html, /\b(chatbot|guaranteed income|%\s*off|discount code)\b/i);
  }
  const config = fs.readFileSync(path.join(root, "js/site-config.js"), "utf8");
  assert.match(config, /apiBase: ""/);
  assert.match(config, /1x00000000000000000000AA/);
});
