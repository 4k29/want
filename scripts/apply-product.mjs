import fs from "node:fs";

const productsPath = "products.json";
const resultPath = "product-result.json";

const data = JSON.parse(fs.readFileSync(productsPath, "utf8"));
const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));

const toPrice = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const normalized = String(value ?? "").replace(/[^0-9.]/g, "");
  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? Math.round(price) : null;
};

const price = toPrice(result.price);
if (!result.url) throw new Error("商品URLを取得できなかったため、自動反映を中止しました。");
if (!result.name) throw new Error("商品名を取得できなかったため、自動反映を中止しました。");
if (!price) throw new Error("価格を取得できなかったため、自動反映を中止しました。");

const cleanText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const makeId = (name, url) => {
  const ascii = cleanText(name)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (ascii) return ascii;
  const host = new URL(url).hostname.replace(/^www\./, "").split(".")[0] || "product";
  return `${host}-${Date.now().toString(36)}`;
};

const detailEntries = Array.isArray(result.details)
  ? result.details
      .map((item) => ({ label: cleanText(item?.label), value: cleanText(item?.value) }))
      .filter((item) => item.label && item.value)
      .slice(0, 12)
  : [];

if (result.brand && !detailEntries.some((item) => item.label === "ブランド")) {
  detailEntries.unshift({ label: "ブランド", value: cleanText(result.brand) });
}
if (result.sku && !detailEntries.some((item) => item.label === "型番")) {
  detailEntries.push({ label: "型番", value: cleanText(result.sku) });
}
if (result.availability && !detailEntries.some((item) => item.label === "在庫")) {
  detailEntries.push({ label: "在庫", value: cleanText(result.availability) });
}

const configurationParts = [result.brand, result.model, result.color, result.size]
  .map(cleanText)
  .filter(Boolean);
const configuration = configurationParts.join("・") || cleanText(result.description).slice(0, 100) || "リンクから自動取得";

const newProduct = {
  id: makeId(result.name, result.url),
  name: cleanText(result.name),
  configuration,
  image: /^https?:\/\//i.test(result.image || "") ? result.image : "",
  imageAlt: cleanText(result.name),
  imageClass: "product-image",
  selected: true,
  defaultVariant: 0,
  optionOrder: [],
  optionLabels: {},
  variants: [{ options: {}, price }],
  details: detailEntries,
  url: result.url,
};

const normalizedUrl = (value) => {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return String(value || "");
  }
};

const existingIndex = data.products.findIndex((product) => normalizedUrl(product.url) === normalizedUrl(result.url));
if (existingIndex >= 0) {
  const previous = data.products[existingIndex];
  data.products[existingIndex] = {
    ...previous,
    name: newProduct.name,
    configuration: newProduct.configuration,
    image: newProduct.image || previous.image,
    imageAlt: newProduct.imageAlt,
    variants: [{ options: {}, price }],
    details: newProduct.details.length ? newProduct.details : previous.details,
    url: newProduct.url,
  };
} else {
  const ids = new Set(data.products.map((product) => product.id));
  let id = newProduct.id;
  let suffix = 2;
  while (ids.has(id)) id = `${newProduct.id}-${suffix++}`;
  newProduct.id = id;
  data.products.push(newProduct);
}

data.lastChecked = new Date().toISOString().slice(0, 10);
fs.writeFileSync(productsPath, `${JSON.stringify(data, null, 2)}\n`);

process.stdout.write(JSON.stringify({
  action: existingIndex >= 0 ? "updated" : "added",
  name: newProduct.name,
  price,
  url: newProduct.url,
}, null, 2));
