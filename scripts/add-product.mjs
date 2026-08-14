import fs from "node:fs";
import crypto from "node:crypto";

const catalogPath = "products.json";
const resultPath = process.env.PRODUCT_RESULT_PATH || "product-result.json";
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));

const normalizeUrl = (value) => {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return String(value || "");
  }
};

const incomingUrl = normalizeUrl(result.url);
const existing = catalog.products.find((product) => normalizeUrl(product.url) === incomingUrl);
const numericPrice = Math.round(Number(result.price));
if (!Number.isFinite(numericPrice) || numericPrice <= 0) throw new Error("有効な価格を取得できませんでした。");

const detailValues = Array.isArray(result.details) ? result.details.filter((item) => item?.label && item?.value) : [];
if (result.description) detailValues.push({ label: "概要", value: result.description });
if (!detailValues.some((item) => item.label === "販売元")) {
  detailValues.push({ label: "販売元", value: result.brand || result.sourceHost || new URL(result.url).hostname });
}

const idBase = String(result.name || "product")
  .normalize("NFKD")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 42) || "product";
const suffix = crypto.createHash("sha1").update(incomingUrl).digest("hex").slice(0, 7);

const product = {
  id: existing?.id || `${idBase}-${suffix}`,
  name: result.name,
  configuration: result.brand || result.category || result.sourceHost || "リンクから自動追加",
  listCategory: ["apple", "camera", "other"].includes(result.listCategory)
    ? result.listCategory
    : (existing?.listCategory || "other"),
  image: result.image || existing?.image || "",
  imageAlt: result.name,
  imageClass: existing?.imageClass || "",
  selected: existing?.selected ?? true,
  defaultVariant: 0,
  optionOrder: [],
  optionLabels: {},
  variants: [{ options: {}, price: numericPrice, ...(result.image ? { image: result.image } : {}) }],
  details: detailValues.slice(0, 14),
  url: result.url,
};

if (existing) {
  const index = catalog.products.indexOf(existing);
  catalog.products[index] = { ...existing, ...product, id: existing.id };
  process.stdout.write(`updated:${existing.id}\n`);
} else {
  catalog.products.push(product);
  process.stdout.write(`added:${product.id}\n`);
}

catalog.lastChecked = new Date().toISOString().slice(0, 10);
fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
