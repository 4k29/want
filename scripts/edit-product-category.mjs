import fs from "node:fs";

const catalogPath = "products.json";
const issueBody = process.env.ISSUE_BODY || "";
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const field = (label) => String(issueBody.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*[:：]\\s*(.+)`, "i"))?.[1] || "")
  .replaceAll("`", "")
  .trim();
const formField = (label) => String(issueBody.match(new RegExp(`###\\s*${label}\\s*\\n+([^\\n]+)`, "i"))?.[1] || "")
  .replaceAll("`", "")
  .trim();

const productId = field("商品ID") || formField("商品ID");
const categoryInput = field("カテゴリー") || formField("カテゴリー");
const categoryAliases = {
  apple: "apple",
  "Apple製品": "apple",
  camera: "camera",
  "カメラ": "camera",
  other: "other",
  "その他": "other",
};
const category = categoryAliases[categoryInput];

if (!productId) throw new Error("商品IDが入力されていません。");
if (!category) throw new Error("カテゴリーはApple製品、カメラ、その他のいずれかを指定してください。");

const product = catalog.products.find((item) => item.id === productId);
if (!product) throw new Error("カテゴリーを変更する商品が見つかりませんでした。");

product.listCategory = category;
catalog.lastChecked = new Date().toISOString().slice(0, 10);
fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ id: product.id, name: product.name, category })}\n`);
