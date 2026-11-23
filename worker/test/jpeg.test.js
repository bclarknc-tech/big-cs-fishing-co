import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareJpeg, stripJpegMetadata } from "../src/jpeg.js";
import { TEST_TURNSTILE_SECRET, TEST_TURNSTILE_TOKEN, verifyTurnstile } from "../src/turnstile.js";

function jpegWithGps() {
  const exif = new TextEncoder().encode("Exif\0\0GPS LATITUDE SECRET");
  const length = exif.length + 2;
  const payload = new Uint8Array(120).fill(0x11);
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, (length >> 8) & 0xff, length & 0xff,
    ...exif,
    0xff, 0xda, 0x00, 0x04,
    ...payload,
    0xff, 0xd9,
  ]);
}

test("jpeg metadata strip removes GPS and keeps a jpeg", () => {
  const raw = jpegWithGps();
  assert.match(new TextDecoder().decode(raw), /GPS LATITUDE SECRET/);
  const stripped = stripJpegMetadata(raw);
  assert.ok(stripped);
  assert.equal(stripped[0], 0xff);
  assert.equal(stripped[1], 0xd8);
  assert.equal(stripped.at(-2), 0xff);
  assert.equal(stripped.at(-1), 0xd9);
  assert.equal(new TextDecoder().decode(stripped).includes("GPS"), false);
  const prepared = prepareJpeg(raw);
  assert.equal(prepared.error, undefined);
  assert.equal(new TextDecoder().decode(prepared.bytes).includes("GPS"), false);
});

test("non-jpeg and oversized photos are refused", () => {
  assert.match(prepareJpeg(new Uint8Array([1, 2, 3, 4])).error, /JPEG/);
  const big = new Uint8Array(1_300_000);
  big[0] = 0xff;
  big[1] = 0xd8;
  big[2] = 0xff;
  big[3] = 0xda;
  big[big.length - 2] = 0xff;
  big[big.length - 1] = 0xd9;
  assert.match(prepareJpeg(big).error, /too large/);
});

test("preview turnstile test key passes only the dummy token when siteverify is down", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  try {
    assert.equal(await verifyTurnstile(TEST_TURNSTILE_SECRET, TEST_TURNSTILE_TOKEN, "203.0.113.5"), true);
    assert.equal(await verifyTurnstile(TEST_TURNSTILE_SECRET, "not-the-dummy-token-value", "203.0.113.5"), false);
    assert.equal(await verifyTurnstile("a-real-secret-not-the-test-one", TEST_TURNSTILE_TOKEN, "203.0.113.5"), false);
  } finally {
    globalThis.fetch = original;
  }
});
