const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const state = {
  catalog: null,
  products: [],
  openDetail: null,
  activeView: ["apple", "camera", "payment"].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "apple",
  financeProductIds: new Set(["iphone-air", "ipad-pro-m4-refurb", "apple-watch-series-11"]),
  financeAmount: 0,
  financeAmountMode: "full",
  paymentCount: 24,
  annualRate: 0,
  subscriptions: [
    { id: "rakuten-unext", name: "Rakuten最強U-NEXT", price: 4378 },
    { id: "apple-one", name: "Apple One", price: 1350 },
    { id: "icloud", name: "iCloud+", price: 540 },
    { id: "chatgpt", name: "ChatGPT", price: 3000 },
  ],
};

const CAMERA_PRODUCT_IDS = new Set([
  "zr-d595fe6",
  "nikkor-z-28-135mm-f-4-pz-5582c31",
  "nikkor-z-35mm-f-1-4-630b829",
  "nd-nextorage-cfexpress-type-b-usb-40gbps-8a11cd3",
  "zr-ee26373",
  "nd-nextorage-165gb-cfexpress-type-b-nx-b2p-c3bdc6f",
]);

const PRODUCT_GROUPS = [
  { id: "apple", number: "01", title: "Apple製品", test: (product) => !CAMERA_PRODUCT_IDS.has(product.id) },
  { id: "camera", number: "02", title: "カメラ", test: (product) => CAMERA_PRODUCT_IDS.has(product.id) },
];

const STORAGE_KEY = "want-payment-settings-v1";

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
  const hasVariantUrl = Boolean(variant.url);
  const url = variant.url || product.url;
  const linkLabel = hasVariantUrl ? "この構成を公式ページで開く ↗" : "公式ページを開く ↗";

  return `<div class="detail-panel"><div class="detail-grid">${details}</div><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${linkLabel}</a></div>`;
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
  const group = PRODUCT_GROUPS.find((item) => item.id === state.activeView) || PRODUCT_GROUPS[0];
  const selected = state.products.filter((product) => group.test(product) && product.selected);
  const total = selected.reduce((sum, product) => sum + currentVariant(product).price, 0);
  const lines = selected.length
    ? selected.map((product) => `<div><span>${escapeHtml(product.name)}</span><span>${yen.format(currentVariant(product).price)}</span></div>`).join("")
    : "<p>商品を選択してください。</p>";

  document.querySelector("#bag-count").textContent = selected.length;
  document.querySelector("#summary-label").textContent = `${group.title}・選択中`;
  document.querySelector("#selected-count").textContent = selected.length;
  document.querySelector("#summary-lines").innerHTML = lines;
  document.querySelector("#total-price").textContent = yen.format(total);
  document.querySelector("#budget-progress").style.width = `${Math.min((total / state.catalog.budget) * 100, 100)}%`;
  document.querySelector("#budget-label").textContent = yen.format(state.catalog.budget);
}

function loadPaymentSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    if (Array.isArray(saved.financeProductIds)) state.financeProductIds = new Set(saved.financeProductIds);
    if (Number.isFinite(saved.financeAmount)) state.financeAmount = saved.financeAmount;
    if (["full", "custom"].includes(saved.financeAmountMode)) state.financeAmountMode = saved.financeAmountMode;
    if (Number.isFinite(saved.paymentCount)) state.paymentCount = saved.paymentCount;
    if (Number.isFinite(saved.annualRate)) state.annualRate = saved.annualRate;
    if (Array.isArray(saved.subscriptions)) {
      state.subscriptions = saved.subscriptions.filter((item) =>
        item && typeof item.id === "string" && typeof item.name === "string" && Number.isFinite(item.price),
      );
    }
  } catch (error) {
    console.warn("支払い設定を読み込めませんでした。", error);
  }
}

function savePaymentSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      financeProductIds: [...state.financeProductIds],
      financeAmount: state.financeAmount,
      financeAmountMode: state.financeAmountMode,
      paymentCount: state.paymentCount,
      annualRate: state.annualRate,
      subscriptions: state.subscriptions,
    }));
  } catch (error) {
    console.warn("支払い設定を保存できませんでした。", error);
  }
}

function financedProducts() {
  return state.products.filter((product) => state.financeProductIds.has(product.id));
}

function financePurchaseTotal() {
  return financedProducts().reduce((sum, product) => sum + currentVariant(product).price, 0);
}

function monthlyLoanPayment(principal, count, annualRate) {
  if (principal <= 0 || count <= 0) return 0;
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return principal / count;
  const factor = (1 + monthlyRate) ** count;
  return principal * monthlyRate * factor / (factor - 1);
}

function updatePaymentResults() {
  const purchaseTotal = financePurchaseTotal();
  const principal = Math.min(Math.max(Number(state.financeAmount) || 0, 0), purchaseTotal);
  const count = Math.min(Math.max(Math.round(Number(state.paymentCount) || 1), 1), 120);
  const annualRate = Math.min(Math.max(Number(state.annualRate) || 0, 0), 100);
  const monthlyLoan = monthlyLoanPayment(principal, count, annualRate);
  const interest = Math.max(monthlyLoan * count - principal, 0);
  const subscriptionTotal = state.subscriptions.reduce((sum, item) => sum + Math.max(Number(item.price) || 0, 0), 0);

  document.querySelector("#finance-product-count").textContent = `${financedProducts().length}点`;
  document.querySelector("#finance-purchase-total").textContent = yen.format(purchaseTotal);
  document.querySelector("#upfront-total").textContent = yen.format(purchaseTotal - principal);
  document.querySelector("#interest-total").textContent = yen.format(Math.round(interest));
  document.querySelector("#subscription-total").textContent = yen.format(subscriptionTotal);
  document.querySelector("#monthly-total").textContent = yen.format(Math.ceil(monthlyLoan) + subscriptionTotal);
  document.querySelector("#monthly-breakdown").textContent = `分割 ${yen.format(Math.ceil(monthlyLoan))} ＋ 固定費 ${yen.format(subscriptionTotal)}`;
}

function bindPaymentEvents() {
  document.querySelectorAll("[data-finance-product]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.financeProductIds.add(checkbox.dataset.financeProduct);
      else state.financeProductIds.delete(checkbox.dataset.financeProduct);
      state.financeAmountMode = "full";
      state.financeAmount = financePurchaseTotal();
      savePaymentSettings();
      renderPayments();
    });
  });

  const amountInput = document.querySelector("#finance-amount");
  const countInput = document.querySelector("#payment-count");
  const rateInput = document.querySelector("#annual-rate");
  amountInput.addEventListener("input", () => {
    state.financeAmountMode = "custom";
    state.financeAmount = Number(amountInput.value) || 0;
    savePaymentSettings();
    updatePaymentResults();
  });
  amountInput.addEventListener("change", () => {
    state.financeAmount = Math.min(Math.max(state.financeAmount, 0), financePurchaseTotal());
    savePaymentSettings();
    renderPayments();
  });
  countInput.addEventListener("input", () => {
    state.paymentCount = Number(countInput.value) || 1;
    savePaymentSettings();
    updatePaymentResults();
  });
  rateInput.addEventListener("input", () => {
    state.annualRate = Number(rateInput.value) || 0;
    savePaymentSettings();
    updatePaymentResults();
  });
  document.querySelector("#use-full-amount").addEventListener("click", () => {
    state.financeAmountMode = "full";
    state.financeAmount = financePurchaseTotal();
    savePaymentSettings();
    renderPayments();
  });

  document.querySelectorAll("[data-subscription-name]").forEach((input) => {
    input.addEventListener("input", () => {
      const subscription = state.subscriptions.find((item) => item.id === input.dataset.subscriptionName);
      if (subscription) subscription.name = input.value;
      savePaymentSettings();
    });
  });
  document.querySelectorAll("[data-subscription-price]").forEach((input) => {
    input.addEventListener("input", () => {
      const subscription = state.subscriptions.find((item) => item.id === input.dataset.subscriptionPrice);
      if (subscription) subscription.price = Number(input.value) || 0;
      savePaymentSettings();
      updatePaymentResults();
    });
  });
  document.querySelectorAll("[data-remove-subscription]").forEach((button) => {
    button.addEventListener("click", () => {
      state.subscriptions = state.subscriptions.filter((item) => item.id !== button.dataset.removeSubscription);
      savePaymentSettings();
      renderPayments();
    });
  });
  document.querySelector("#subscription-form").onsubmit = (event) => {
    event.preventDefault();
    const nameInput = document.querySelector("#new-subscription-name");
    const priceInput = document.querySelector("#new-subscription-price");
    const name = nameInput.value.trim();
    if (!name) return;
    state.subscriptions.push({ id: `fixed-${Date.now()}`, name, price: Number(priceInput.value) || 0 });
    savePaymentSettings();
    renderPayments();
  };
}

function renderPayments() {
  const purchaseTotal = financePurchaseTotal();
  if (state.financeAmountMode === "full") state.financeAmount = purchaseTotal;
  else state.financeAmount = Math.min(Math.max(Number(state.financeAmount) || 0, 0), purchaseTotal);

  document.querySelector("#finance-products").innerHTML = PRODUCT_GROUPS.map((group) => {
    const rows = state.products.filter(group.test).map((product) => {
      const variant = currentVariant(product);
      return `<label class="finance-product-row">
        <input type="checkbox" data-finance-product="${escapeHtml(product.id)}" ${state.financeProductIds.has(product.id) ? "checked" : ""} />
        <span class="finance-check" aria-hidden="true">✓</span>
        <span class="finance-product-name"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(configurationFor(product, variant))}</small></span>
        <strong class="finance-product-price">${yen.format(variant.price)}</strong>
      </label>`;
    }).join("");
    return `<section class="finance-group"><h4>${group.title}</h4>${rows}</section>`;
  }).join("");

  document.querySelector("#subscription-lines").innerHTML = state.subscriptions.map((item) => `
    <div class="subscription-edit-row">
      <input type="text" value="${escapeHtml(item.name)}" data-subscription-name="${escapeHtml(item.id)}" aria-label="固定費の名前" />
      <div class="input-with-unit"><input type="number" min="0" step="1" value="${Math.max(Number(item.price) || 0, 0)}" data-subscription-price="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}の月額" /><span>円</span></div>
      <button type="button" data-remove-subscription="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}を削除">×</button>
    </div>`).join("");

  const amountInput = document.querySelector("#finance-amount");
  amountInput.max = String(purchaseTotal);
  amountInput.value = String(Math.round(state.financeAmount));
  document.querySelector("#payment-count").value = String(state.paymentCount);
  document.querySelector("#annual-rate").value = String(state.annualRate);
  bindPaymentEvents();
  updatePaymentResults();
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

function bindTabEvents() {
  document.querySelectorAll("[data-category]").forEach((tab) => {
    const active = tab.dataset.category === state.activeView;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    tab.onclick = () => {
      state.activeView = tab.dataset.category;
      state.openDetail = null;
      history.replaceState(null, "", `#${state.activeView}`);
      render();
    };
  });
}

function render() {
  const productView = document.querySelector("#product-view");
  const paymentView = document.querySelector("#payment-simulator");
  const isPaymentView = state.activeView === "payment";
  productView.hidden = isPaymentView;
  paymentView.hidden = !isPaymentView;
  bindTabEvents();

  if (isPaymentView) {
    document.querySelector("#bag-count").textContent = state.financeProductIds.size;
    renderPayments();
    return;
  }

  const group = PRODUCT_GROUPS.find((item) => item.id === state.activeView) || PRODUCT_GROUPS[0];
  const products = state.products.filter(group.test);
  const groupMarkup = `<section class="product-group" aria-labelledby="group-${group.id}">
    <div class="group-heading"><span>${group.number}</span><h2 id="group-${group.id}">${group.title}</h2><small>${products.length}点</small></div>
    <div class="group-products">${products.map(renderProduct).join("")}</div>
  </section>`;

  productList.innerHTML = groupMarkup + `
    <a class="add-hint add-link" href="https://github.com/4k29/want/issues/new?template=product.yml" target="_blank" rel="noreferrer"><span class="plus">＋</span><div><h3>リンクから追加する</h3><p>商品URLを貼ると、商品名・価格・画像・詳細を取得してこのページに自動追加・更新します。</p></div></a>`;
  productList.setAttribute("aria-label", `${group.title}の欲しいもの`);
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
    loadPaymentSettings();
    state.financeProductIds = new Set([...state.financeProductIds].filter((id) =>
      state.products.some((product) => product.id === id),
    ));
    document.querySelector("#last-checked").textContent = `最終価格確認 ${state.catalog.lastChecked.replaceAll("-", ".")}`;
    render();
  } catch (error) {
    productList.innerHTML = `<div class="loading-card error-card"><strong>読み込めませんでした。</strong><span>ページを再読み込みしてください。</span></div>`;
    console.error(error);
  }
}

start();

window.addEventListener("hashchange", () => {
  const nextView = ["apple", "camera", "payment"].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "apple";
  if (nextView !== state.activeView) {
    state.activeView = nextView;
    state.openDetail = null;
    render();
  }
});
