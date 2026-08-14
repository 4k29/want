import net from "node:net";

const issueBody = process.env.ISSUE_BODY || "";
const match = issueBody.match(/https?:\/\/[^\s<>)]+/i);

if (!match) throw new Error("商品URLが見つかりませんでした。");

const inputUrl = new URL(match[0]);
if (!["http:", "https:"].includes(inputUrl.protocol)) throw new Error("HTTP(S)のURLを入力してください。");

const hostname = inputUrl.hostname.toLowerCase();
const ipVersion = net.isIP(hostname);
const privateIpv4 = ipVersion === 4 && (
  hostname.startsWith("10.") || hostname.startsWith("127.") || hostname.startsWith("169.254.") ||
  hostname.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
);
if (hostname === "localhost" || hostname.endsWith(".local") || privateIpv4 || (ipVersion === 6 && (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd")))) {
  throw new Error("ローカルまたはプライベートネットワークのURLは確認できません。");
}

const response = await fetch(inputUrl, {
  redirect: "follow",
  headers: {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36",
    "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.7",
  },
});
if (!response.ok) throw new Error(`商品ページを取得できませんでした（HTTP ${response.status}）。`);

const html = await response.text();
const decode = (value = "") => String(value)
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");
const cleanText = (value = "") => decode(String(value)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const pageText = cleanText(html);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const meta = (key) => {
  const escaped = escapeRegex(key);
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  return cleanText(patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean) || "");
};
const elementText = (pattern) => cleanText(html.match(pattern)?.[1] || "");
const issueOverride = (label) => cleanText(issueBody.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*[:：]\\s*(.+)`, "im"))?.[1] || "");
const issueFormValue = (label) => cleanText(issueBody.match(new RegExp(`###\\s*${escapeRegex(label)}\\s*\\n+([^\\n]+)`, "im"))?.[1] || "");
const overrideName = issueOverride("商品名");
const overridePrice = issueOverride("価格").replace(/[^0-9.]/g, "");
const requestedCategory = issueFormValue("カテゴリー") || issueOverride("カテゴリー");
const listCategory = requestedCategory === "カメラ" ? "camera" : requestedCategory === "その他" ? "other" : "apple";

const jsonLd = [];
for (const script of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
  try { jsonLd.push(JSON.parse(script[1])); } catch { /* Some sites serve invalid JSON-LD. */ }
}
const flatten = (value) => {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (!value || typeof value !== "object") return [];
  return [value, ...Object.values(value).flatMap(flatten)];
};
const product = flatten(jsonLd).find((item) => {
  const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
  return types.includes("Product");
}) || {};

const offers = Array.isArray(product.offers) ? product.offers : (product.offers ? [product.offers] : []);
const offer = offers.find((item) => item?.price || item?.lowPrice) || offers[0] || {};
const imageValue = Array.isArray(product.image) ? product.image[0] : product.image;
let image = typeof imageValue === "string" ? imageValue : (imageValue?.url || imageValue?.contentUrl || meta("og:image"));
let brandValue = typeof product.brand === "string" ? product.brand : product.brand?.name;
const manufacturerValue = typeof product.manufacturer === "string" ? product.manufacturer : product.manufacturer?.name;
const rawAvailability = offer.availability || meta("product:availability");
const additionalProperties = Array.isArray(product.additionalProperty) ? product.additionalProperty : [];

let fallbackName = "";
let fallbackPrice = "";
let fallbackSku = "";
let fallbackDescription = "";
let fallbackCategory = "";

if (hostname === "nij.nikon.com" || hostname.endsWith(".nikon.com")) {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  fallbackName = cleanText(h1Match?.[1] || "");
  const productSectionText = h1Match?.index != null ? cleanText(html.slice(h1Match.index, h1Match.index + 12000)) : pageText;
  fallbackPrice = productSectionText.match(/ニコンダイレクト販売価格[\s\S]{0,180}?([0-9]{1,3}(?:,[0-9]{3})+)\s*円/)?.[1]?.replaceAll(",", "") || "";
  fallbackSku = productSectionText.match(/JANコード\s*[:：]\s*([0-9]{8,14})/)?.[1] || pageText.match(/JANコード\s*[:：]\s*([0-9]{8,14})/)?.[1] || "";
  fallbackCategory = pageText.includes("Zマウントレンズ") ? "Zマウントレンズ" : pageText.includes("メモリーカード") ? "カメラ用アクセサリー" : pageText.includes("Z CINEMA") ? "Z CINEMA" : "Nikon製品";
  const release = productSectionText.match(/([0-9]{4}\/[0-9]{2}\/[0-9]{2})\s*発売/)?.[1];
  fallbackDescription = [release ? `${release} 発売` : "", fallbackSku ? `JANコード ${fallbackSku}` : ""].filter(Boolean).join("・");
  brandValue ||= "Nikon";
  if (!image && fallbackSku) image = `https://nij.nikon.com/ec/img/goods/L/${fallbackSku}.jpg`;
}

if (hostname === "amazon.co.jp" || hostname.endsWith(".amazon.co.jp")) {
  fallbackName = elementText(/<span[^>]+id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)
    || cleanText(html.match(/"TURBO_CHECKOUT_HEADER"\s*:\s*"今すぐ購入：([^"]+)"/i)?.[1] || "");
  fallbackPrice = (
    elementText(/<span[^>]+class=["'][^"']*a-price-whole[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)
    || html.match(/"priceAmount"\s*:\s*([0-9.]+)/i)?.[1]
    || ""
  ).replace(/[^0-9.]/g, "");
  fallbackSku = html.match(/data-csa-c-asin=["']([A-Z0-9]{10})["']/i)?.[1] || "";
  fallbackCategory = "スマートフォンアクセサリー";
}

const details = [];
const addDetail = (label, value) => {
  const text = cleanText(value);
  if (!text || details.some((item) => item.label === label && item.value === text)) return;
  details.push({ label, value: text.slice(0, 220) });
};

addDetail("ブランド", brandValue || manufacturerValue);
addDetail("型番", product.mpn || product.model);
addDetail("SKU", product.sku || fallbackSku);
addDetail("カテゴリ", product.category || fallbackCategory);
addDetail("在庫", String(rawAvailability || "").split("/").pop());
if (fallbackDescription) addDetail("製品情報", fallbackDescription);
for (const property of additionalProperties.slice(0, 12)) {
  addDetail(property?.name || property?.propertyID, property?.value);
}

const result = {
  url: response.url,
  sourceHost: new URL(response.url).hostname,
  name: overrideName || cleanText(product.name || fallbackName || meta("og:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""),
  description: cleanText(product.description || meta("og:description") || meta("description") || fallbackDescription).slice(0, 320),
  brand: cleanText(brandValue || manufacturerValue),
  sku: cleanText(product.sku || fallbackSku || ""),
  mpn: cleanText(product.mpn || product.model || ""),
  category: cleanText(product.category || fallbackCategory || ""),
  listCategory,
  price: String(overridePrice || offer.price || offer.lowPrice || meta("product:price:amount") || fallbackPrice || "").replace(/[^0-9.]/g, "").trim(),
  priceCurrency: String(offer.priceCurrency || meta("product:price:currency") || "JPY").trim(),
  availability: String(rawAvailability || "").split("/").pop(),
  image: /^https?:\/\//i.test(image || "") ? image : "",
  details,
};

if (!result.name) throw new Error("商品名を取得できませんでした。");
if (!result.price || Number.isNaN(Number(result.price))) throw new Error("価格を取得できませんでした。");

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
