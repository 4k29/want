const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const state = {
  catalog: null,
  products: [],
  openDetail: null,
  activeView: ["apple", "camera", "other", "payment"].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "apple",
  financeProductIds: new Set(["iphone-air", "ipad-pro-m4-refurb", "apple-watch-series-11"]),
  financeTerms: {
    "iphone-air": { amount: 0, amountMode: "full", count: 24, rate: 0 },
    "ipad-pro-m4-refurb": { amount: 0, amountMode: "full", count: 24, rate: 0 },
    "apple-watch-series-11": { amount: 0, amountMode: "full", count: 24, rate: 0 },
  },
  subscriptions: [
    { id: "rakuten-unext", name: "Rakuten最強U-NEXT", price: 4378, cycle: "monthly" },
    { id: "apple-one", name: "Apple One", price: 1350, cycle: "monthly" },
    { id: "icloud", name: "iCloud+", price: 540, cycle: "monthly" },
    { id: "chatgpt", name: "ChatGPT", price: 3000, cycle: "monthly" },
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
  { id: "apple", number: "01", title: "Apple製品", test: (product) => productCategory(product) === "apple" },
  { id: "camera", number: "02", title: "カメラ", test: (product) => productCategory(product) === "camera" },
  { id: "other", number: "03", title: "その他", test: (product) => productCategory(product) === "other" },
];

const STORAGE_KEY = "want-payment-settings-v1";

function productCategory(product) {
  if (["apple", "camera", "other"].includes(product.listCategory)) return product.listCategory;
  return CAMERA_PRODUCT_IDS.has(product.id) ? "camera" : "apple";
}

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

function deleteProductUrl(product) {
  const title = `[商品削除] ${product.name}`;
  const body = `商品ID: ${product.id}\n\n商品名: ${product.name}\n\nこの商品を欲しいものリストから削除します。`;
  return `https://github.com/4k29/want/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
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
          <div class="product-card-actions"><button class="detail-button" type="button" aria-expanded="${isOpen}">詳細を見る <span class="chevron ${isOpen ? "is-open" : ""}">⌄</span></button><a class="product-delete-button" href="${escapeHtml(deleteProductUrl(product))}" target="_blank" rel="noreferrer">削除</a></div>
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
    if (saved.financeTerms && typeof saved.financeTerms === "object") {
      state.financeTerms = saved.financeTerms;
    } else if (Number.isFinite(saved.paymentCount)) {
      [...state.financeProductIds].forEach((id) => {
        state.financeTerms[id] = {
          amount: Number(saved.financeAmount) || 0,
          amountMode: saved.financeAmountMode === "custom" ? "custom" : "full",
          count: saved.paymentCount,
          rate: Number(saved.annualRate) || 0,
        };
      });
    }
    if (Array.isArray(saved.subscriptions)) {
      state.subscriptions = saved.subscriptions.filter((item) =>
        item && typeof item.id === "string" && typeof item.name === "string" && Number.isFinite(item.price),
      ).map((item) => ({ ...item, cycle: item.cycle === "yearly" ? "yearly" : "monthly" }));
    }
  } catch (error) {
    console.warn("支払い設定を読み込めませんでした。", error);
  }
}

function savePaymentSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      financeProductIds: [...state.financeProductIds],
      financeTerms: state.financeTerms,
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

function financeTermFor(product) {
  const existing = state.financeTerms[product.id] || {};
  const term = {
    amount: Number(existing.amount) || 0,
    amountMode: existing.amountMode === "custom" ? "custom" : "full",
    count: Math.min(Math.max(Math.round(Number(existing.count) || 24), 1), 120),
    rate: Math.min(Math.max(Number(existing.rate) || 0, 0), 100),
  };
  const price = currentVariant(product).price;
  if (term.amountMode === "full") term.amount = price;
  else term.amount = Math.min(Math.max(term.amount, 0), price);
  state.financeTerms[product.id] = term;
  return term;
}

function monthlyLoanPayment(principal, count, annualRate) {
  if (principal <= 0 || count <= 0) return 0;
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return principal / count;
  const factor = (1 + monthlyRate) ** count;
  return principal * monthlyRate * factor / (factor - 1);
}

function loanResultFor(product) {
  const price = currentVariant(product).price;
  const term = financeTermFor(product);
  const principal = Math.min(Math.max(term.amount, 0), price);
  const monthly = monthlyLoanPayment(principal, term.count, term.rate);
  return {
    price,
    principal,
    monthly,
    upfront: price - principal,
    interest: Math.max(monthly * term.count - principal, 0),
  };
}

function updatePaymentResults() {
  let monthlyInstallments = 0;
  financedProducts().forEach((product) => {
    const result = loanResultFor(product);
    const monthlyRounded = Math.ceil(result.monthly);
    monthlyInstallments += monthlyRounded;
    document.querySelector(`[data-term-monthly="${product.id}"]`).textContent = yen.format(monthlyRounded);
    document.querySelector(`[data-term-upfront="${product.id}"]`).textContent = yen.format(result.upfront);
    document.querySelector(`[data-term-interest="${product.id}"]`).textContent = yen.format(Math.round(result.interest));
  });
  const monthlySubscriptionTotal = state.subscriptions
    .filter((item) => item.cycle !== "yearly")
    .reduce((sum, item) => sum + Math.max(Number(item.price) || 0, 0), 0);
  const yearlySubscriptionTotal = state.subscriptions
    .filter((item) => item.cycle === "yearly")
    .reduce((sum, item) => sum + Math.max(Number(item.price) || 0, 0), 0);

  document.querySelector("#finance-product-count").textContent = `${financedProducts().length}点`;
  document.querySelector("#subscription-total").textContent = `月 ${yen.format(monthlySubscriptionTotal)}・年 ${yen.format(yearlySubscriptionTotal)}`;
  document.querySelector("#monthly-total").textContent = yen.format(monthlyInstallments + monthlySubscriptionTotal);
  document.querySelector("#monthly-breakdown").textContent = `分割 ${yen.format(monthlyInstallments)} ＋ 月払い ${yen.format(monthlySubscriptionTotal)}｜年払い ${yen.format(yearlySubscriptionTotal)}`;
}

function bindPaymentEvents() {
  document.querySelectorAll("[data-finance-product]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.financeProductIds.add(checkbox.dataset.financeProduct);
      else state.financeProductIds.delete(checkbox.dataset.financeProduct);
      const product = state.products.find((item) => item.id === checkbox.dataset.financeProduct);
      if (product) financeTermFor(product);
      savePaymentSettings();
      renderPayments();
    });
  });

  document.querySelectorAll("[data-term-amount]").forEach((input) => {
    input.addEventListener("input", () => {
      const product = state.products.find((item) => item.id === input.dataset.termAmount);
      if (!product) return;
      const term = financeTermFor(product);
      term.amountMode = "custom";
      term.amount = Number(input.value) || 0;
      savePaymentSettings();
      updatePaymentResults();
    });
    input.addEventListener("change", () => {
      const product = state.products.find((item) => item.id === input.dataset.termAmount);
      if (!product) return;
      const term = financeTermFor(product);
      term.amount = Math.min(Math.max(term.amount, 0), currentVariant(product).price);
      savePaymentSettings();
      renderPayments();
    });
  });
  document.querySelectorAll("[data-term-count]").forEach((input) => {
    input.addEventListener("input", () => {
      const product = state.products.find((item) => item.id === input.dataset.termCount);
      if (!product) return;
      financeTermFor(product).count = Number(input.value) || 1;
      savePaymentSettings();
      updatePaymentResults();
    });
  });
  document.querySelectorAll("[data-term-rate]").forEach((input) => {
    input.addEventListener("input", () => {
      const product = state.products.find((item) => item.id === input.dataset.termRate);
      if (!product) return;
      financeTermFor(product).rate = Number(input.value) || 0;
      savePaymentSettings();
      updatePaymentResults();
    });
  });
  document.querySelectorAll("[data-full-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const product = state.products.find((item) => item.id === button.dataset.fullProduct);
      if (!product) return;
      const term = financeTermFor(product);
      term.amountMode = "full";
      term.amount = currentVariant(product).price;
      savePaymentSettings();
      renderPayments();
    });
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
  document.querySelectorAll("[data-subscription-cycle]").forEach((select) => {
    select.addEventListener("change", () => {
      const subscription = state.subscriptions.find((item) => item.id === select.dataset.subscriptionCycle);
      if (subscription) subscription.cycle = select.value === "yearly" ? "yearly" : "monthly";
      savePaymentSettings();
      renderPayments();
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
    const cycleInput = document.querySelector("#new-subscription-cycle");
    const name = nameInput.value.trim();
    if (!name) return;
    state.subscriptions.push({
      id: `fixed-${Date.now()}`,
      name,
      price: Number(priceInput.value) || 0,
      cycle: cycleInput.value === "yearly" ? "yearly" : "monthly",
    });
    nameInput.value = "";
    priceInput.value = "";
    cycleInput.value = "monthly";
    savePaymentSettings();
    renderPayments();
  };
}

function renderSubscriptionRow(item) {
  return `<div class="subscription-edit-row">
    <input type="text" value="${escapeHtml(item.name)}" data-subscription-name="${escapeHtml(item.id)}" aria-label="固定費の名前" />
    <div class="input-with-unit"><input type="number" min="0" step="1" value="${Math.max(Number(item.price) || 0, 0)}" data-subscription-price="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}の金額" /><span>円</span></div>
    <select data-subscription-cycle="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}の支払い周期"><option value="monthly" ${item.cycle !== "yearly" ? "selected" : ""}>月払い</option><option value="yearly" ${item.cycle === "yearly" ? "selected" : ""}>年払い</option></select>
    <button type="button" data-remove-subscription="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}を削除">×</button>
  </div>`;
}

function renderPayments() {
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

  const selected = financedProducts();
  document.querySelector("#product-terms").innerHTML = selected.length
    ? selected.map((product) => {
      const variant = currentVariant(product);
      const term = financeTermFor(product);
      return `<article class="product-term-card">
        <div class="product-term-heading"><div><strong>${escapeHtml(product.name)}</strong><span>${yen.format(variant.price)}</span></div><button type="button" data-full-product="${escapeHtml(product.id)}">全額を分割</button></div>
        <div class="term-fields product-term-fields">
          <label><span>分割する金額</span><div class="input-with-unit"><input type="number" min="0" max="${variant.price}" step="1000" inputmode="numeric" value="${Math.round(term.amount)}" data-term-amount="${escapeHtml(product.id)}" /><span>円</span></div></label>
          <label><span>支払回数</span><div class="input-with-unit"><input type="number" min="1" max="120" step="1" inputmode="numeric" value="${term.count}" data-term-count="${escapeHtml(product.id)}" /><span>回</span></div></label>
          <label><span>実質年率</span><div class="input-with-unit"><input type="number" min="0" max="100" step="0.1" inputmode="decimal" value="${term.rate}" data-term-rate="${escapeHtml(product.id)}" /><span>%</span></div></label>
        </div>
        <div class="product-term-result">
          <div><span>月々</span><strong data-term-monthly="${escapeHtml(product.id)}">￥0</strong></div>
          <div><span>先に支払う金額</span><strong data-term-upfront="${escapeHtml(product.id)}">￥0</strong></div>
          <div><span>利息・手数料</span><strong data-term-interest="${escapeHtml(product.id)}">￥0</strong></div>
        </div>
      </article>`;
    }).join("")
    : `<p class="empty-terms">左の一覧から分割する商品を選択してください。</p>`;

  const monthlySubscriptions = state.subscriptions.filter((item) => item.cycle !== "yearly");
  const yearlySubscriptions = state.subscriptions.filter((item) => item.cycle === "yearly");
  document.querySelector("#subscription-lines").innerHTML = `
    <section class="subscription-cycle-group">
      <div class="subscription-cycle-heading"><h4>月払いの固定費</h4><strong>${yen.format(monthlySubscriptions.reduce((sum, item) => sum + Math.max(Number(item.price) || 0, 0), 0))}/月</strong></div>
      ${monthlySubscriptions.length ? monthlySubscriptions.map(renderSubscriptionRow).join("") : `<p class="empty-subscriptions">月払いの固定費はありません。</p>`}
    </section>
    <section class="subscription-cycle-group yearly-subscriptions">
      <div class="subscription-cycle-heading"><h4>年払いするサブスク</h4><strong>${yen.format(yearlySubscriptions.reduce((sum, item) => sum + Math.max(Number(item.price) || 0, 0), 0))}/年</strong></div>
      ${yearlySubscriptions.length ? yearlySubscriptions.map(renderSubscriptionRow).join("") : `<p class="empty-subscriptions">年払いするサブスクを追加すると、ここに表示されます。</p>`}
    </section>`;

  bindPaymentEvents();
  document.querySelectorAll("#payment-simulator input").forEach((input) => input.setAttribute("enterkeyhint", "done"));
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
    <a class="add-hint add-link" href="https://github.com/4k29/want/issues/new?template=product.yml" target="_blank" rel="noreferrer"><span class="plus">＋</span><div><h3>リンクから追加する</h3><p>商品URLとカテゴリーを選ぶと、商品名・価格・画像・詳細を取得して自動追加・更新します。</p></div></a>`;
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

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches("input")) {
    setTimeout(() => event.target.blur(), 0);
  }
});

document.addEventListener("pointerdown", (event) => {
  const active = document.activeElement;
  if (active?.matches("input, textarea") && !event.target.closest("input, textarea, select")) {
    active.blur();
  }
});

window.addEventListener("hashchange", () => {
  const nextView = ["apple", "camera", "other", "payment"].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "apple";
  if (nextView !== state.activeView) {
    state.activeView = nextView;
    state.openDetail = null;
    render();
  }
});
