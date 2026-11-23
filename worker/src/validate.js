import { productById } from "./products.js";

export const LIMITS = {
  species: 60,
  location: 80,
  note: 500,
  name: 40,
  lureOther: 80,
  review: 1000,
  bodyReview: 20_000,
  bodyCatch: 1_500_000,
};

export function cleanLine(value, max, { required = false, label = "This field" } = {}) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return required ? { error: `${label} is required.` } : { value: "" };
  }
  if (text.length > max) return { error: `${label} is too long.` };
  return { value: text };
}

export function cleanMultiline(value, max, { required = false, label = "This field" } = {}) {
  const text = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (!text) {
    return required ? { error: `${label} is required.` } : { value: "" };
  }
  if (text.length > max) return { error: `Please keep ${label.toLowerCase()} to ${max} characters.` };
  return { value: text };
}

export function cleanStars(value) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    return { error: "Pick a star rating from 1 to 5." };
  }
  return { value: n };
}

export function isConsent(value) {
  if (value === true) return true;
  const v = String(value ?? "").trim().toLowerCase();
  return v === "true" || v === "on" || v === "yes" || v === "1";
}

export function requireConsent(value, message) {
  if (!isConsent(value)) return { error: message };
  return { ok: true };
}

export function parseLure(lureId, lureOther) {
  const id = String(lureId ?? "").trim();
  if (id === "other") {
    const other = cleanLine(lureOther, LIMITS.lureOther, { required: true, label: "The lure name" });
    if (other.error) return other;
    return { id: "other", label: other.value };
  }
  const product = productById(id);
  if (!product) return { error: "Pick a Big C's product, or choose Other." };
  return { id: product.id, label: product.name };
}

export function parseProduct(productId) {
  const product = productById(String(productId ?? "").trim());
  if (!product) return { error: "Pick one of our products." };
  return { value: product };
}
