const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const state = {
  catalog: null,
  products: [],
  openDetail: null,
};

const productList = document.querySelector("#product-list");
productList.append(document.querySelector("#loading-template").content.cloneNode(true));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mergeProductOverride(product) {
  const override = window.WANT_PRODUCT_OVERRIDES?.[product.id];
  if (!override) return product;

  return {
    ...product,
    ...override,
    optionLabels: { ...(product.optionLabels || {}), ...(override.optionLabels || {}) },
    optionColors: { ...(product.optionColors || {}), ...(override.optionColors || {}) },
  };
}

function currentVariant(product) {
  return product.variants.find((variant) =>
    product.optionOrder.every((key) => variant.options[key] === product.selections[key]),
  ) || product.variants[0];
}

function optionValues(product, key) {
  const optionIndex = product.optionOrder.indexOf(key);
  const previousKeys = product.optionOrder.slice(0, optionIndex);
  const compatible = product.variants.filter((variant) =>
    previousKeys.every((previousKey) => variant.options[previousKey] === product.selections[previousKey]),
  );

  return [...new Set(compatible.map((variant) => variant.options[key]).filter(Boolean))];
}

function chooseOption(product, key, value) {
  const optionIndex = product.optionOrder.indexOf(key);
  const desired = { ...product.selections, [key]: value };
  const lockedKeys = product.optionOrder.slice(0, optionIndex + 1);
  const laterKeys = product.optionOrder.slice(optionIndex + 1);
  const compatible = product.variants.filter((variant) =>
    lockedKeys.every((optionKey) => variant.options[optionKey] === desired[optionKey]),
  );

  const variant = compatible.find((candidate) =>
    laterKeys.every((optionKey) => candidate.options[optionKey] === desired[optionKey]),
  ) || compatible[0];

  if (variant) product.selections = { ...variant.options };
  render();
}

function configurationFor(product, variant) {
  if (variant.configuration) return variant.configuration;
  if (!product.optionOrder.length) return product.configuration;

  const selected = product.optionOrder
    .map((key) => variant.options[key])
    .filter(Boolean);
  if (product.configurationSuffix) selected.push(product.configurationSuffix);
  return selected.join("・") || product.configuration;
}

function detailsFor(product, variant) {
  const replacements = {};
  Object.entries(variant.options || {}).forEach(([key, value]) => {
    Object.assign(replacements, product.optionDetailValues?.[key]?.[value] || {});
  });

  return product.details.map((detail) => ({
    ...detail,
    value: replacements[detail.label] ?? detail.value,
  }));
}

function renderOptions(product) {
  return product.optionOrder.map((key) => {
    const values = optionValues(product, key);
    const buttons = values.map((value) => {
      const active = product.selections[key] === value;
      const color = product.optionColors?.[value];
      const swatch = key === "color" && /^#[0-9a-f]{6}$/i.test(color || "")
        ? `<span class="color-swatch" style="--swatch:${color}" aria-hidden="true"></span>`
        : "";
      return `<button type="button" class="${key === "color" ? "color-choice " : ""}${active ? "active" : ""}" data-option="${escapeHtml(key)}" data-value="${escapeHtml(value)}" aria-pressed="${active}">${swatch}${escapeHtml(value)}</button>`;
    }).join("");

    return `<fieldset class="choice-group"><legend>${escapeHtml(product.optionLabels[key] || key)}</legend><div class="segmented-options option-count-${Math.min(values.length, 4)}">${buttons}</div></fieldset>`;
  }).join("");
}

function renderDetails(product, variant) {
  if (state.openDetail !== product.id) return "";
  const details = detailsFor(product, variant).map((detail) =>
    `<div><span>${escapeHtml(detail.label)}</span><strong>${escapeHtml(detail.value)}</strong></div>`,
  ).join("");
  const url = variant.url || product.url;

  return `<div class="detail-panel"><div class="detail-grid">${details}</div><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">この構成を公式ページで開く ↗</a></div>`;
}

function renderProduct(product) {
  const variant = currentVariant(product);
  const isOpen = state.openDetail === product.id;
  const image = variant.image || product.image;
  const imageMarkup = image
    ? `<img class="${escapeHtml(product.imageClass || "")}" src="${escapeHtml(image)}" alt="${escapeHtml(variant.options.color ? `${variant.options.color}の${product.name}` : product.imageAlt)}" />`
    : `<div class="image-placeholder" aria-label="商品画像なし">No image</div>`;

  return `
    <article class="product-card ${product.selected ? "is-selected" : ""}" data-product="${escapeHtml(product.id)}">
      <div class="product-main">
        <label class="select-control">
          <input type="checkbox" aria-label="${escapeHtml(product.name)}を合計に含める" ${product.selected ? "checked" : ""} />
          <span class="custom-check" aria-hidden="true">✓</span>
        </label>
        <div class="product-visual">${imageMarkup}</div>
        <div class="product-info">
          <div class="product-heading"><div><h2>${escapeHtml(product.name)}</h2><p class="configuration">${escapeHtml(configurationFor(product, variant))}</p></div><p class="product-price">${yen.format(variant.price)}</p></div>
          ${renderOptions(product)}
          <button class="detail-button" type="button" aria-expanded="${isOpen}">詳細を見る <span class="chevron ${isOpen ? "is-open" : ""}">⌄</span></button>
        </div>
      </div>
      ${renderDetails(product, variant)}
    </article>`;
}

function renderSummary() {
  const selected = state.products.filter((product) => product.selected);
  const total = selected.reduce((sum, product) => sum + currentVariant(product).price, 0);
  const lines = selected.length
    ? selected.map((product) => `<div><span>${escapeHtml(product.name)}</span><span>${yen.format(currentVariant(product).price)}</span></div>`).join("")
    : "<p>商品を選択してください。</p>";

  document.querySelector("#bag-count").textContent = selected.length;
  document.querySelector("#selected-count").textContent = selected.length;
  document.querySelector("#summary-lines").innerHTML = lines;
  document.querySelector("#total-price").textContent = yen.format(total);
  document.querySelector("#budget-progress").style.width = `${Math.min((total / state.catalog.budget) * 100, 100)}%`;
  document.querySelector("#budget-label").textContent = yen.format(state.catalog.budget);
}

function bindProductEvents() {
  document.querySelectorAll(".product-card").forEach((card) => {
    const product = state.products.find((item) => item.id === card.dataset.product);
    card.querySelector('input[type="checkbox"]').addEventListener("change", (event) => {
      product.selected = event.target.checked;
      render();
    });
    card.querySelectorAll("[data-option]").forEach((button) => {
      button.addEventListener("click", () => chooseOption(product, button.dataset.option, button.dataset.value));
    });
    card.querySelector(".detail-button").addEventListener("click", () => {
      state.openDetail = state.openDetail === product.id ? null : product.id;
      render();
    });
  });
}

function render() {
  productList.innerHTML = state.products.map(renderProduct).join("") + `
    <a class="add-hint add-link" href="https://github.com/4k29/want/issues/new?template=product.yml" target="_blank" rel="noreferrer"><span class="plus">＋</span><div><h3>リンクから追加する</h3><p>商品URLを貼ると、商品名・価格・画像・詳細を取得してこのページに自動追加・更新します。</p></div></a>`;
  renderSummary();
  bindProductEvents();
}

async function start() {
  try {
    const response = await fetch("products.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.catalog = await response.json();
    state.products = state.catalog.products.map((originalProduct) => {
      const product = mergeProductOverride(originalProduct);
      const variant = product.variants[product.defaultVariant] || product.variants[0];
      return { ...product, selections: { ...variant.options } };
    });
    document.querySelector("#last-checked").textContent = `最終価格確認 ${state.catalog.lastChecked.replaceAll("-", ".")}`;
    render();
  } catch (error) {
    productList.innerHTML = `<div class="loading-card error-card"><strong>読み込めませんでした。</strong><span>ページを再読み込みしてください。</span></div>`;
    console.error(error);
  }
}

start();
