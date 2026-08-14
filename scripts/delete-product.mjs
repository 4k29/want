import fs from "node:fs";

const catalogPath = "products.json";
const issueBody = process.env.ISSUE_BODY || "";
const issueTitle = process.env.ISSUE_TITLE || "";
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const field = (label) => String(issueBody.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*[:：]\\s*(.+)`, "i"))?.[1] || "")
  .replaceAll("`", "")
  .trim();
const formField = (label) => String(issueBody.match(new RegExp(`###\\s*${label}\\s*\\n+([^\\n]+)`, "i"))?.[1] || "")
  .replaceAll("`", "")
  .trim();

const productId = field("商品ID") || formField("商品ID");
const productUrl = field("商品URL") || formField("商品URL");
const titleName = issueTitle.replace(/^\[商品削除\]\s*/, "").trim();
const index = catalog.products.findIndex((product) =>
  (productId && product.id === productId) ||
  (productUrl && product.url === productUrl) ||
  (!productId && !productUrl && titleName && product.name === titleName),
);

if (index < 0) throw new Error("削除対象の商品が見つかりませんでした。");

const [deleted] = catalog.products.splice(index, 1);
catalog.lastChecked = new Date().toISOString().slice(0, 10);
fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ id: deleted.id, name: deleted.name, url: deleted.url })}\n`);
