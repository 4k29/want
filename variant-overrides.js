(() => {
  const macImages = {
    "シルバー": "https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/mac-macbook-pro-specs-select-202601-14inch-silver?wid=1200&hei=630&fmt=jpeg&qlt=95&.v=1767814014293",
    "スペースブラック": "https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/mac-macbook-pro-specs-select-202601-14inch-spaceblack_AV1?wid=1200&hei=630&fmt=jpeg&qlt=95",
  };

  const colors = ["シルバー", "スペースブラック"];
  const displays = ["標準", "Nano-texture"];
  const nanoPrice = 27000;

  const chips = [
    {
      value: "M5 Pro 15CPU / 16GPU",
      family: "M5 Pro",
      cpu: "15コア",
      gpu: "16コア",
      configurations: {
        "24GB": { "1TB": 429800, "2TB": 519800 },
        "48GB": { "1TB": 537800, "2TB": 626800 },
      },
    },
    {
      value: "M5 Pro 18CPU / 20GPU",
      family: "M5 Pro",
      cpu: "18コア",
      gpu: "20コア",
      configurations: {
        "24GB": { "1TB": 459800, "2TB": 549800 },
        "48GB": { "1TB": 567800, "2TB": 657800 },
        "64GB": { "1TB": 643800, "2TB": 729800 },
      },
    },
    {
      value: "M5 Max 18CPU / 32GPU",
      family: "M5 Max",
      cpu: "18コア",
      gpu: "32コア",
      configurations: {
        "36GB": { "2TB": 699800 },
      },
    },
    {
      value: "M5 Max 18CPU / 40GPU",
      family: "M5 Max",
      cpu: "18コア",
      gpu: "40コア",
      configurations: {
        "48GB": { "2TB": 807800 },
        "64GB": { "2TB": 879800 },
        "128GB": { "2TB": 1167800 },
      },
    },
  ];

  const colorSlug = (color) => color === "シルバー" ? "silver" : "space-black";
  const displaySlug = (display) => display === "Nano-texture" ? "nano-textureディスプレイ" : "標準ディスプレイ";
  const chipSlug = (chip) => chip.family === "M5 Max" ? "apple-m5-max-チップ" : "apple-m5-pro-チップ";

  const buildMacUrl = ({ color, display, chip, memory, storage }) =>
    `https://www.apple.com/jp/shop/buy-mac/macbook-pro/14インチ-${colorSlug(color)}-${displaySlug(display)}-${chipSlug(chip)}-${chip.cpu.replace("コア", "コアcpu")}-${chip.gpu.replace("コア", "コアgpu")}-${memory.toLowerCase()}-のメモリ-${storage.toLowerCase()}-のストレージ`;

  const macVariants = [];
  for (const color of colors) {
    for (const display of displays) {
      for (const chip of chips) {
        for (const [memory, storagePrices] of Object.entries(chip.configurations)) {
          for (const [storage, basePrice] of Object.entries(storagePrices)) {
            const options = { color, display, chip: chip.value, memory, storage };
            macVariants.push({
              options,
              price: basePrice + (display === "Nano-texture" ? nanoPrice : 0),
              image: macImages[color],
              configuration: `${color}・${display}・${chip.value}・${memory}・${storage}`,
              url: buildMacUrl({ color, display, chip, memory, storage }),
            });
          }
        }
      }
    }
  }

  const macDefaultVariant = macVariants.findIndex((variant) =>
    variant.options.color === "シルバー" &&
    variant.options.display === "Nano-texture" &&
    variant.options.chip === "M5 Pro 18CPU / 20GPU" &&
    variant.options.memory === "48GB" &&
    variant.options.storage === "1TB"
  );

  window.WANT_PRODUCT_OVERRIDES = {
    "iphone-air": {
      configurationSuffix: "SIMフリー・学生・教職員向けストア",
    },
    "macbook-pro-14-m5-pro": {
      defaultVariant: macDefaultVariant,
      optionOrder: ["color", "display", "chip", "memory", "storage"],
      optionLabels: {
        color: "カラー",
        display: "ディスプレイ",
        chip: "チップ",
        memory: "メモリ",
        storage: "ストレージ",
      },
      optionColors: {
        "シルバー": "#e3e4e1",
        "スペースブラック": "#2c2d2f",
      },
      optionDetailValues: {
        color: {
          "シルバー": { "カラー": "シルバー" },
          "スペースブラック": { "カラー": "スペースブラック" },
        },
        display: {
          "標準": { "ディスプレイ": "14インチ・標準ディスプレイ" },
          "Nano-texture": { "ディスプレイ": "14インチ・Nano-texture" },
        },
        chip: {
          "M5 Pro 15CPU / 16GPU": { "チップ": "Apple M5 Pro", "CPU": "15コア", "GPU": "16コア" },
          "M5 Pro 18CPU / 20GPU": { "チップ": "Apple M5 Pro", "CPU": "18コア", "GPU": "20コア" },
          "M5 Max 18CPU / 32GPU": { "チップ": "Apple M5 Max", "CPU": "18コア", "GPU": "32コア" },
          "M5 Max 18CPU / 40GPU": { "チップ": "Apple M5 Max", "CPU": "18コア", "GPU": "40コア" },
        },
        memory: {
          "24GB": { "メモリ": "24GBユニファイドメモリ" },
          "36GB": { "メモリ": "36GBユニファイドメモリ" },
          "48GB": { "メモリ": "48GBユニファイドメモリ" },
          "64GB": { "メモリ": "64GBユニファイドメモリ" },
          "128GB": { "メモリ": "128GBユニファイドメモリ" },
        },
        storage: {
          "1TB": { "ストレージ": "1TB SSD" },
          "2TB": { "ストレージ": "2TB SSD" },
        },
      },
      variants: macVariants,
    },
  };
})();
