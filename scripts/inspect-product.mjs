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
    "User-Agent": "Mozilla/5.0 (compatible; WantListProductInspector/1.0)",
    "Accept-Language": "ja,en;q=0.8",
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
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const meta = (key) => {
  const escaped = escapeRegex(key);
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  return decode(patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean) || "");
};

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
const offer = Array.isArray(product.offers) ? product.offers[0] : (product.offers || {});
const imageValue = Array.isArray(product.image) ? product.image[0] : product.image;
const image = typeof imageValue === "string" ? imageValue : (imageValue?.url || imageValue?.contentUrl || meta("og:image"));
const rawAvailability = offer.availability || meta("product:availability");

const result = {
  url: response.url,
  name: decode(product.name || meta("og:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim(),
  price: String(offer.price || offer.lowPrice || meta("product:price:amount") || "").trim(),
  priceCurrency: String(offer.priceCurrency || meta("product:price:currency") || "").trim(),
  availability: String(rawAvailability || "").split("/").pop(),
  image: /^https?:\/\//i.test(image || "") ? image : "",
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
