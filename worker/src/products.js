/** Keep in sync with /data/products.json. The site test checks both lists. */
export const PRODUCTS = [
  { id: "braided-line", name: "Braided Line" },
  { id: "mono-line", name: "Monofilament Line" },
  { id: "crankbait-keychains", name: "Crankbait Keychains" },
  { id: "bottle-opener", name: "Fish Bottle Opener Keychain" },
  { id: "rod-strap", name: "Neoprene Rod Straps (2-Pack)" },
  { id: "spoon-set", name: "Spoon Spinner Set" },
  { id: "pencil-lure", name: "Pencil Lure (53mm)" },
  { id: "knot-card", name: "Fishing Knot Guide" },
];

export function productById(id) {
  return PRODUCTS.find((product) => product.id === id) || null;
}
