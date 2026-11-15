// card-art.js：为所有 23 张信用卡生成逼真的卡面视觉（支持完整尺寸堆叠卡包与 .mini 推荐缩略图）
(function () {
  const ISSUER_DISPLAY = {
    chase: "CHASE",
    amex: "AMERICAN EXPRESS",
    citi: "citi",
    capitalone: "Capital One",
    discover: "DISCOVER",
    boa: "Bank of America",
    wellsfargo: "WELLS FARGO",
    usbank: "U.S. Bank",
    apple: " Apple",
  };

  const CARD_ART = {
    "chase-sapphire-preferred": {
      bg: "linear-gradient(135deg, #07192f 0%, #164e9f 48%, #1d4ed8 72%, #091526 100%)",
      text: "#f8fafc",
      accent: "#60a5fa",
      finish: "metal",
      chip: "silver",
      pattern: "facets",
      tagline: "SAPPHIRE PREFERRED",
      badge: "3x 餐厅 · 2x 旅行",
    },
    "chase-sapphire-reserve": {
      bg: "linear-gradient(135deg, #040914 0%, #0c223d 45%, #1e1b4b 78%, #050811 100%)",
      text: "#f8fafc",
      accent: "#38bdf8",
      finish: "metal",
      chip: "silver",
      pattern: "facets",
      tagline: "SAPPHIRE RESERVE · VISA INFINITE",
      badge: "4x 机票/酒店 · 3x 餐厅",
    },
    "chase-freedom-flex": {
      bg: "linear-gradient(135deg, #0369a1 0%, #0284c7 46%, #1e3a8a 100%)",
      text: "#ffffff",
      accent: "#38bdf8",
      finish: "gloss",
      chip: "silver",
      pattern: "waves",
      tagline: "FREEDOM FLEX",
      badge: "季度 5% · 3% 餐厅/药店",
    },
    "chase-freedom-unlimited": {
      bg: "linear-gradient(135deg, #172554 0%, #1d4ed8 55%, #0f172a 100%)",
      text: "#ffffff",
      accent: "#93c5fd",
      finish: "gloss",
      chip: "silver",
      pattern: "arcs",
      tagline: "FREEDOM UNLIMITED",
      badge: "1.5% 万金油 · 3% 餐厅/药店",
    },
    "chase-amazon-prime": {
      bg: "linear-gradient(135deg, #18181b 0%, #27272a 52%, #09090b 100%)",
      text: "#f4f4f5",
      accent: "#00a8e1",
      finish: "metal",
      chip: "gold",
      pattern: "prime",
      tagline: "PRIME VISA",
      badge: "5% Amazon & Whole Foods",
    },
    "amex-gold": {
      bg: "linear-gradient(135deg, #c99e32 0%, #f5e6ad 36%, #b8861b 70%, #7c580c 100%)",
      text: "#271705",
      accent: "#422006",
      lightText: true,
      finish: "metal",
      chip: "gold",
      pattern: "centurion",
      tagline: "AMERICAN EXPRESS GOLD",
      badge: "4x 餐厅/超市 · 3x 机票",
    },
    "amex-platinum": {
      bg: "linear-gradient(135deg, #cbd5e1 0%, #f8fafc 40%, #94a3b8 74%, #64748b 100%)",
      text: "#0f172a",
      accent: "#1e293b",
      lightText: true,
      finish: "metal",
      chip: "silver",
      pattern: "centurion",
      tagline: "THE PLATINUM CARD",
      badge: "5x 机票直订 · 金属卡",
    },
    "amex-bcp": {
      bg: "linear-gradient(135deg, #002663 0%, #006fcf 54%, #091931 100%)",
      text: "#ffffff",
      accent: "#7dd3fc",
      finish: "gloss",
      chip: "silver",
      pattern: "amex-box",
      tagline: "BLUE CASH PREFERRED",
      badge: "6% 超市/流媒体 · 3% 加油/交通",
    },
    "amex-bce": {
      bg: "linear-gradient(135deg, #0284c7 0%, #38bdf8 50%, #0369a1 100%)",
      text: "#ffffff",
      accent: "#e0f2fe",
      finish: "gloss",
      chip: "silver",
      pattern: "amex-box",
      tagline: "BLUE CASH EVERYDAY",
      badge: "3% 超市/网购/加油",
    },
    "citi-double-cash": {
      bg: "linear-gradient(135deg, #0d9488 0%, #0f766e 48%, #1e3a8a 52%, #0f172a 100%)",
      text: "#ffffff",
      accent: "#5eead4",
      finish: "matte",
      chip: "gold",
      pattern: "double-arc",
      tagline: "DOUBLE CASH · 1% + 1%",
      badge: "2% 无上限万金油",
    },
    "citi-custom-cash": {
      bg: "linear-gradient(135deg, #1e1b4b 0%, #1d4ed8 46%, #be185d 100%)",
      text: "#ffffff",
      accent: "#f472b6",
      finish: "gloss",
      chip: "silver",
      pattern: "citi-arch",
      tagline: "CUSTOM CASH",
      badge: "每月最高类别自动 5%",
    },
    "citi-costco": {
      bg: "linear-gradient(135deg, #334155 0%, #475569 50%, #1e293b 100%)",
      text: "#f8fafc",
      accent: "#ef4444",
      finish: "matte",
      chip: "silver",
      pattern: "costco",
      tagline: "COSTCO ANYWHERE VISA",
      badge: "4% 加油 · 3% 餐厅/旅行 · 2% Costco",
    },
    "citi-strata-premier": {
      bg: "linear-gradient(135deg, #042f2e 0%, #115e59 50%, #0f172a 100%)",
      text: "#f0fdfa",
      accent: "#2dd4bf",
      finish: "metal",
      chip: "gold",
      pattern: "strata",
      tagline: "STRATA PREMIER",
      badge: "3x 餐厅/超市/加油/旅行",
    },
    "capitalone-savor": {
      bg: "linear-gradient(135deg, #7c2d12 0%, #c2410c 48%, #431407 100%)",
      text: "#fff7ed",
      accent: "#fdba74",
      finish: "metal",
      chip: "gold",
      pattern: "swoosh",
      tagline: "SAVOR REWARDS",
      badge: "3% 餐厅/超市/娱乐/流媒体",
    },
    "capitalone-quicksilver": {
      bg: "linear-gradient(135deg, #475569 0%, #94a3b8 48%, #334155 100%)",
      text: "#ffffff",
      accent: "#f1f5f9",
      finish: "metal",
      chip: "silver",
      pattern: "swoosh",
      tagline: "QUICKSILVER",
      badge: "1.5% 全类别返现",
    },
    "capitalone-venture-x": {
      bg: "linear-gradient(135deg, #090d16 0%, #1e293b 50%, #0f172a 100%)",
      text: "#f8fafc",
      accent: "#38bdf8",
      finish: "metal",
      chip: "silver",
      pattern: "venture",
      tagline: "VENTURE X · VISA INFINITE",
      badge: "2x 全类别里程 · 金属卡",
    },
    "capitalone-venture": {
      bg: "linear-gradient(135deg, #0f172a 0%, #1e40af 55%, #172554 100%)",
      text: "#f8fafc",
      accent: "#60a5fa",
      finish: "metal",
      chip: "silver",
      pattern: "venture",
      tagline: "VENTURE REWARDS",
      badge: "2x 全类别里程",
    },
    "discover-it": {
      bg: "linear-gradient(135deg, #ea580c 0%, #f97316 45%, #9a3412 100%)",
      text: "#ffffff",
      accent: "#ffedd5",
      finish: "gloss",
      chip: "gold",
      pattern: "discover-dawn",
      tagline: "DISCOVER IT CASH BACK",
      badge: "季度轮换 5% Cashback Bonus",
    },
    "boa-customized-cash": {
      bg: "linear-gradient(135deg, #991b1b 0%, #dc2626 52%, #7f1d1d 100%)",
      text: "#ffffff",
      accent: "#fca5a5",
      finish: "gloss",
      chip: "gold",
      pattern: "boa-flag",
      tagline: "CUSTOMIZED CASH REWARDS",
      badge: "3% 自选类别 · 2% 超市/仓储",
    },
    "wf-active-cash": {
      bg: "linear-gradient(135deg, #881337 0%, #b91c1c 50%, #450a0a 100%)",
      text: "#ffffff",
      accent: "#fbbf24",
      finish: "gloss",
      chip: "gold",
      pattern: "waves",
      tagline: "ACTIVE CASH · VISA SIGNATURE",
      badge: "2% 全类别现金返还",
    },
    "wf-autograph": {
      bg: "linear-gradient(135deg, #7f1d1d 0%, #9f1239 50%, #3b0764 100%)",
      text: "#ffffff",
      accent: "#fda4af",
      finish: "metal",
      chip: "gold",
      pattern: "facets",
      tagline: "AUTOGRAPH",
      badge: "3x 餐厅/旅行/加油/交通/流媒体",
    },
    "usbank-cash-plus": {
      bg: "linear-gradient(135deg, #172554 0%, #1e3a8a 55%, #0c4a6e 100%)",
      text: "#ffffff",
      accent: "#f87171",
      finish: "gloss",
      chip: "gold",
      pattern: "plus",
      tagline: "CASH+ VISA SIGNATURE",
      badge: "每季两项自选 5% + 一项 2%",
    },
    "apple-card": {
      bg: "linear-gradient(135deg, #ffffff 0%, #f1f5f9 55%, #cbd5e1 100%)",
      text: "#0f172a",
      accent: "#334155",
      lightText: true,
      finish: "titanium",
      chip: "silver",
      pattern: "apple",
      tagline: "TITANIUM · APPLE PAY",
      badge: "Apple Pay 2% Daily Cash",
    },
  };

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderChipSvg(tone = "gold") {
    const isSilver = tone === "silver";
    const c1 = isSilver ? "#f8fafc" : "#fef08a";
    const c2 = isSilver ? "#cbd5e1" : "#eab308";
    const c3 = isSilver ? "#64748b" : "#a16207";
    const uid = isSilver ? "chip-s" : "chip-g";
    return `<svg viewBox="0 0 46 34" width="100%" height="100%" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${c1}"/>
          <stop offset="55%" stop-color="${c2}"/>
          <stop offset="100%" stop-color="${c3}"/>
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="44" height="32" rx="6" fill="url(#${uid})" stroke="${c3}" stroke-width="1"/>
      <path d="M15 1v32M31 1v32M1 12h14M31 12h14M1 22h14M31 22h14" stroke="${c3}" stroke-width="1" stroke-opacity="0.65" fill="none"/>
      <rect x="15" y="9" width="16" height="16" rx="3" fill="none" stroke="${c3}" stroke-width="1" stroke-opacity="0.75"/>
    </svg>`;
  }

  function renderContactlessSvg() {
    return `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M5.5 13.5a5 5 0 0 0 0-7M8.5 15.5a8 8 0 0 0 0-11M11.5 17.5a11 11 0 0 0 0-15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity="0.78"/>
    </svg>`;
  }

  function renderNetworkSvg(network) {
    switch (network) {
      case "visa":
        return `<svg viewBox="0 0 64 22" width="50" height="18" aria-label="Visa">
          <text x="2" y="18" font-family="-apple-system, BlinkMacSystemFont, 'Arial Black', sans-serif" font-size="20" font-weight="900" font-style="italic" letter-spacing="-0.8" fill="currentColor">VISA</text>
        </svg>`;
      case "mastercard":
        return `<svg viewBox="0 0 52 32" width="42" height="26" aria-label="Mastercard">
          <circle cx="19" cy="16" r="12" fill="#eb001b" fill-opacity="0.92"/>
          <circle cx="33" cy="16" r="12" fill="#f79e1b" fill-opacity="0.92"/>
          <path d="M26 6.6a12 12 0 0 0 0 18.8 12 12 0 0 0 0-18.8z" fill="#ff5f00"/>
        </svg>`;
      case "amex":
        return `<svg viewBox="0 0 60 26" width="46" height="20" aria-label="American Express">
          <rect x="1" y="1" width="58" height="24" rx="4" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="1.3"/>
          <text x="30" y="17.5" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Arial Black', sans-serif" font-size="13" font-weight="900" letter-spacing="0.6" fill="currentColor">AMEX</text>
        </svg>`;
      case "discover":
        return `<svg viewBox="0 0 84 22" width="62" height="17" aria-label="Discover">
          <text x="0" y="16" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13.5" font-weight="800" letter-spacing="0.8" fill="currentColor">DISC</text>
          <circle cx="43" cy="11" r="6" fill="#fb923c"/>
          <text x="51" y="16" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13.5" font-weight="800" letter-spacing="0.8" fill="currentColor">VER</text>
        </svg>`;
      default:
        return `<span class="net-text">${esc(network)}</span>`;
    }
  }

  function renderPatternSvg(pattern, accent = "#ffffff") {
    switch (pattern) {
      case "facets":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <polygon points="160,0 320,0 260,110" fill="${accent}" fill-opacity="0.14"/>
          <polygon points="160,0 260,110 110,140" fill="#ffffff" fill-opacity="0.07"/>
          <polygon points="260,110 320,200 140,200 110,140" fill="${accent}" fill-opacity="0.1"/>
          <polygon points="0,60 160,0 110,140 0,180" fill="#ffffff" fill-opacity="0.04"/>
        </svg>`;
      case "waves":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-20,140 C80,60 180,190 340,70 L340,210 L-20,210 Z" fill="${accent}" fill-opacity="0.16"/>
          <path d="M-20,175 C110,105 210,205 340,115" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.18"/>
        </svg>`;
      case "arcs":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <circle cx="290" cy="30" r="140" fill="none" stroke="${accent}" stroke-width="24" stroke-opacity="0.12"/>
          <circle cx="290" cy="30" r="95" fill="none" stroke="#ffffff" stroke-width="10" stroke-opacity="0.08"/>
        </svg>`;
      case "prime":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M95,125 Q180,168 265,120" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round" stroke-opacity="0.38"/>
          <path d="M252,115 L270,118 L261,134" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.38"/>
        </svg>`;
      case "centurion":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <circle cx="160" cy="100" r="62" fill="none" stroke="currentColor" stroke-width="2" stroke-opacity="0.16" stroke-dasharray="4 3"/>
          <circle cx="160" cy="100" r="48" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.18"/>
          <rect x="8" y="8" width="304" height="184" rx="12" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.22"/>
        </svg>`;
      case "amex-box":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <rect x="115" y="45" width="110" height="110" rx="10" transform="rotate(-8 170 100)" fill="${accent}" fill-opacity="0.18" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>
          <rect x="135" y="65" width="70" height="70" rx="6" transform="rotate(-8 170 100)" fill="#ffffff" fill-opacity="0.1"/>
        </svg>`;
      case "double-arc":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <circle cx="135" cy="100" r="72" fill="#2dd4bf" fill-opacity="0.16"/>
          <circle cx="195" cy="100" r="72" fill="#38bdf8" fill-opacity="0.16"/>
        </svg>`;
      case "citi-arch":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M120,170 A110,110 0 0,1 310,170" fill="none" stroke="${accent}" stroke-width="22" stroke-opacity="0.22" stroke-linecap="round"/>
        </svg>`;
      case "costco":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M170,0 L320,0 L320,55 L140,55 Z" fill="#ef4444" fill-opacity="0.22"/>
          <path d="M190,62 L320,62 L320,76 L182,76 Z" fill="#38bdf8" fill-opacity="0.28"/>
        </svg>`;
      case "strata":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,130 L320,55 L320,200 L0,200 Z" fill="${accent}" fill-opacity="0.12"/>
          <path d="M0,165 L320,95 L320,200 L0,200 Z" fill="#ffffff" fill-opacity="0.06"/>
        </svg>`;
      case "swoosh":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M110,30 Q290,55 150,175 Q245,95 95,45 Z" fill="${accent}" fill-opacity="0.2"/>
        </svg>`;
      case "venture":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M180,0 L245,0 L150,200 L110,200 Z" fill="${accent}" fill-opacity="0.14"/>
          <path d="M255,0 L285,0 L190,200 L170,200 Z" fill="#ffffff" fill-opacity="0.07"/>
        </svg>`;
      case "discover-dawn":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <circle cx="245" cy="115" r="78" fill="#fde047" fill-opacity="0.18"/>
          <circle cx="245" cy="115" r="44" fill="#ffffff" fill-opacity="0.12"/>
        </svg>`;
      case "boa-flag":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M190,28 Q250,15 305,42 M180,48 Q245,35 305,62 M170,68 Q240,55 305,82" fill="none" stroke="#ffffff" stroke-width="6" stroke-opacity="0.16" stroke-linecap="round"/>
        </svg>`;
      case "plus":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M235,45 v70 M200,80 h70" stroke="${accent}" stroke-width="18" stroke-opacity="0.22" stroke-linecap="round"/>
        </svg>`;
      case "apple":
        return `<svg class="card-art-bg card-pattern card-face-pattern" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
          <circle cx="265" cy="48" r="18" fill="#0f172a" fill-opacity="0.07"/>
        </svg>`;
      default:
        return "";
    }
  }

  function resolveArt(card) {
    const id = card?.id || "";
    const preset = CARD_ART[id] || {};
    const custom = card?.art || {};
    const finish = custom.finish || preset.finish || "gloss";
    const bg = custom.bg || preset.bg || "linear-gradient(135deg, #1e293b 0%, #334155 50%, #0f172a 100%)";
    const text = custom.text || preset.text || "#f8fafc";
    const accent = custom.accent || preset.accent || "#38bdf8";
    const chip = custom.chip || preset.chip || "gold";
    const pattern = custom.pattern || preset.pattern || "facets";
    const lightText = Boolean(custom.lightText ?? preset.lightText ?? false);
    const border = lightText ? "rgba(15, 23, 42, 0.16)" : "rgba(255, 255, 255, 0.2)";
    const issuerLabel = ISSUER_DISPLAY[card?.issuer] || String(card?.issuer || "").toUpperCase();
    const badge = preset.badge || (card?.annualFee ? `年费 $${card.annualFee}` : "免年费");
    return { bg, text, accent, finish, chip, pattern, lightText, border, issuerLabel, badge };
  }

  function renderCardArt(card, opts = {}) {
    if (!card) return "";
    const art = resolveArt(card);
    const mini = Boolean(opts.mini);
    const owned = Boolean(opts.owned);
    const active = Boolean(opts.active);
    const isMetal = art.finish === "metal" || art.finish === "titanium";

    const classes = [
      "card-face",
      mini ? "mini" : "",
      owned ? "owned is-owned" : "",
      active ? "active is-active" : "",
      isMetal ? "metal" : "",
      art.lightText ? "light-text" : "",
      `finish-${art.finish}`,
    ]
      .filter(Boolean)
      .join(" ");

    const styleVars = [
      `--card-bg: ${art.bg}`,
      `--card-fg: ${art.text}`,
      `--card-text: ${art.text}`,
      `--card-accent: ${art.accent}`,
      `--card-border: ${art.border}`,
      `background: ${art.bg}`,
      `color: ${art.text}`,
    ].join("; ");

    if (mini) {
      const html = `<div class="${classes}" data-card-id="${esc(card.id)}" data-issuer="${esc(card.issuer)}" data-network="${esc(card.network)}" style="${styleVars}">
        ${renderPatternSvg(art.pattern, art.accent)}
        <div class="card-face-shine"></div>
        <div class="card-top card-face-top">
          <span class="card-issuer card-face-issuer">${esc(art.issuerLabel.split(" ")[0])}</span>
          ${owned ? `<span class="card-owned-badge owned-badge" title="已持有">✓</span>` : ""}
        </div>
        <div class="card-mid card-chip-row card-face-middle">
          <span class="card-chip emv-chip ${art.chip} chip-${art.chip}">${renderChipSvg(art.chip)}</span>
          <span class="card-network net-logo card-network-logo net-${esc(card.network)}">${renderNetworkSvg(card.network)}</span>
        </div>
      </div>`;
      return opts.asElement ? toElement(html) : html;
    }

    const metaText =
      opts.badgeText ||
      opts.subtitle ||
      `${art.badge} · ${card.annualFee ? "年费 $" + card.annualFee : "免年费"}`;

    const html = `<div class="${classes}" data-card-id="${esc(card.id)}" data-issuer="${esc(card.issuer)}" data-network="${esc(card.network)}" style="${styleVars}">
      ${renderPatternSvg(art.pattern, art.accent)}
      <div class="card-face-shine"></div>
      <div class="card-top card-face-top">
        <div class="card-face-brand">
          <div class="card-issuer card-face-issuer">${esc(art.issuerLabel)}</div>
          <div class="card-title card-name card-face-title">${esc(card.name)}</div>
        </div>
        <div class="card-face-badges">
          ${isMetal ? `<span class="card-tier-badge">${art.finish === "titanium" ? "TITANIUM" : "METAL"}</span>` : ""}
          ${owned ? `<span class="card-owned-badge owned-badge">✓ 已持有</span>` : ""}
        </div>
      </div>
      <div class="card-mid card-chip-row card-face-middle">
        <span class="card-chip emv-chip ${art.chip} chip-${art.chip}">${renderChipSvg(art.chip)}</span>
        <span class="card-contactless contactless">${renderContactlessSvg()}</span>
      </div>
      <div class="card-bottom card-face-bottom">
        <span class="card-highlight card-rate-badge card-face-meta">${esc(metaText)}</span>
        <span class="card-network net-logo card-network-logo net-${esc(card.network)}">${renderNetworkSvg(card.network)}</span>
      </div>
    </div>`;

    return opts.asElement ? toElement(html) : html;
  }

  function toElement(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  window.CARD_ART = CARD_ART;
  window.renderCardArt = renderCardArt;
  window.renderCardArtElement = (card, opts = {}) => renderCardArt(card, { ...opts, asElement: true });
})();
