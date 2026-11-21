(function () {
  const PLAYERS = [
    { id: "tomek", name: "Tomek" },
    { id: "karolina", name: "Karolina" },
  ];
  const STORAGE_KEY = "gry-cenowe-scores-v1";
  const CATALOG_KEY = "gry-cenowe-catalog-v1";
  const PLACEHOLDER_IMAGE =
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720">
        <rect width="720" height="720" fill="#1a221c"/>
        <rect x="180" y="210" width="360" height="300" rx="28" fill="#243028" stroke="#3a4a40" stroke-width="4"/>
        <circle cx="300" cy="320" r="36" fill="#3a4a40"/>
        <path d="M220 470l90-90 70 70 50-50 90 70z" fill="#3a4a40"/>
        <text x="360" y="560" text-anchor="middle" fill="#a8b5ad" font-family="sans-serif" font-size="28">Brak zdjęcia</text>
      </svg>`
    );

  const screens = {
    home: document.getElementById("screen-home"),
    play: document.getElementById("screen-play"),
    end: document.getElementById("screen-end"),
    manage: document.getElementById("screen-manage"),
    editor: document.getElementById("screen-editor"),
  };

  const els = {
    gameList: document.getElementById("game-list"),
    footerNote: document.getElementById("footer-note"),
    manageList: document.getElementById("manage-list"),
    restoreDefaultsBtn: document.getElementById("restore-defaults-btn"),
    productsEditor: document.getElementById("products-editor"),
    editorTitle: document.getElementById("editor-title"),
    editorSubtitle: document.getElementById("editor-subtitle"),
    editorError: document.getElementById("editor-error"),
    editorHeading: document.getElementById("editor-heading"),
    editorProgress: document.getElementById("editor-progress"),
    progress: document.getElementById("progress"),
    productImage: document.getElementById("product-image"),
    productName: document.getElementById("product-name"),
    productHint: document.getElementById("product-hint"),
    guessTomek: document.getElementById("guess-tomek"),
    guessKarolina: document.getElementById("guess-karolina"),
    checkBtn: document.getElementById("check-btn"),
    nextBtn: document.getElementById("next-btn"),
    result: document.getElementById("result"),
    actualPrice: document.getElementById("actual-price"),
    duel: document.getElementById("duel"),
    diff: document.getElementById("diff"),
    liveTomek: document.getElementById("live-tomek"),
    liveKarolina: document.getElementById("live-karolina"),
    homeTomek: document.getElementById("home-tomek"),
    homeKarolina: document.getElementById("home-karolina"),
    endTitle: document.getElementById("end-title"),
    endScore: document.getElementById("end-score"),
    endVerdict: document.getElementById("end-verdict"),
    endList: document.getElementById("end-list"),
  };

  const state = {
    game: null,
    index: 0,
    results: [],
    revealed: false,
    gamePoints: { tomek: 0, karolina: 0 },
    screen: "home",
    wakeLock: null,
    editorDraft: null,
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadCatalogMeta() {
    try {
      const raw = localStorage.getItem(CATALOG_KEY);
      if (!raw) return { hiddenIds: [], custom: [] };
      const parsed = JSON.parse(raw);
      return {
        hiddenIds: Array.isArray(parsed.hiddenIds) ? parsed.hiddenIds.map(String) : [],
        custom: Array.isArray(parsed.custom) ? parsed.custom : [],
      };
    } catch {
      return { hiddenIds: [], custom: [] };
    }
  }

  function saveCatalogMeta(meta) {
    localStorage.setItem(
      CATALOG_KEY,
      JSON.stringify({
        hiddenIds: meta.hiddenIds || [],
        custom: meta.custom || [],
      })
    );
  }

  function getGames() {
    const builtins = Array.isArray(window.GAMES) ? window.GAMES : [];
    const meta = loadCatalogMeta();
    const hidden = new Set(meta.hiddenIds);
    const visibleBuiltins = builtins.filter((g) => !hidden.has(g.id));
    return visibleBuiltins.concat(meta.custom);
  }

  function findGame(id) {
    return getGames().find((g) => g.id === id) || null;
  }

  function isBuiltin(id) {
    return (window.GAMES || []).some((g) => g.id === id);
  }

  function loadTotals() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { tomek: 0, karolina: 0 };
      const parsed = JSON.parse(raw);
      return {
        tomek: Number(parsed.tomek) || 0,
        karolina: Number(parsed.karolina) || 0,
      };
    } catch {
      return { tomek: 0, karolina: 0 };
    }
  }

  function saveTotals(totals) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(totals));
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      if (state.wakeLock) {
        try {
          await state.wakeLock.release();
        } catch (_) {}
        state.wakeLock = null;
      }
      state.wakeLock = await navigator.wakeLock.request("screen");
      state.wakeLock.addEventListener("release", () => {
        state.wakeLock = null;
      });
    } catch (_) {
      /* przeglądarka / bateria może odmówić */
    }
  }

  async function releaseWakeLock() {
    if (!state.wakeLock) return;
    try {
      await state.wakeLock.release();
    } catch (_) {}
    state.wakeLock = null;
  }

  function syncWakeLock() {
    if (state.screen === "play" && document.visibilityState === "visible") {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  }

  function show(name) {
    Object.values(screens).forEach((el) => el && el.classList.remove("active"));
    screens[name].classList.add("active");
    state.screen = name;
    syncWakeLock();
  }

  function formatPrice(n) {
    return (
      n.toLocaleString("pl-PL", {
        minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
        maximumFractionDigits: 2,
      }) + " zł"
    );
  }

  function parseGuess(raw) {
    if (!raw) return null;
    const normalized = String(raw)
      .trim()
      .replace(/\s/g, "")
      .replace(",", ".")
      .replace(/[^\d.]/g, "");
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  function refreshScoreDisplays() {
    const totals = loadTotals();
    els.homeTomek.textContent = String(totals.tomek);
    els.homeKarolina.textContent = String(totals.karolina);
    els.liveTomek.textContent = String(state.gamePoints.tomek);
    els.liveKarolina.textContent = String(state.gamePoints.karolina);
  }

  function renderHome() {
    const games = getGames();
    els.gameList.innerHTML = "";
    refreshScoreDisplays();

    if (!games.length) {
      const empty = document.createElement("p");
      empty.className = "empty-manage";
      empty.textContent = "Brak gier. Wejdź w Zarządzaj grami i dodaj pierwszą.";
      els.gameList.appendChild(empty);
    } else {
      games.forEach((game) => {
        const btn = document.createElement("button");
        btn.className = "game-card";
        btn.type = "button";
        btn.innerHTML = `<strong>${escapeHtml(game.title)}</strong><span>${escapeHtml(
          game.subtitle || "Własna gra"
        )} · ${game.products.length} produktów</span>`;
        btn.addEventListener("click", () => startGame(game.id));
        els.gameList.appendChild(btn);
      });
    }

    const productCount = games.reduce((sum, g) => sum + g.products.length, 0);
    els.footerNote.textContent = games.length
      ? `${games.length} ${games.length === 1 ? "gra" : "gier"} · ${productCount} produktów. Punkty i własne gry zapisują się na tym urządzeniu.`
      : "Punkty i własne gry zapisują się na tym urządzeniu.";
  }

  function renderManage() {
    const games = getGames();
    const meta = loadCatalogMeta();
    els.manageList.innerHTML = "";

    if (!games.length) {
      const empty = document.createElement("p");
      empty.className = "empty-manage";
      empty.textContent = "Lista jest pusta. Dodaj nową grę poniżej.";
      els.manageList.appendChild(empty);
    } else {
      games.forEach((game) => {
        const row = document.createElement("div");
        row.className = "manage-row";
        const kind = isBuiltin(game.id) ? "startowa" : "własna";
        row.innerHTML = `
          <div class="meta">
            <strong>${escapeHtml(game.title)}</strong>
            <span>${escapeHtml(game.subtitle || kind)} · ${game.products.length} produktów · ${kind}</span>
          </div>
        `;
        const del = document.createElement("button");
        del.type = "button";
        del.className = "ghost danger";
        del.textContent = "Usuń";
        del.addEventListener("click", () => deleteGame(game.id, game.title));
        row.appendChild(del);
        els.manageList.appendChild(row);
      });
    }

    els.restoreDefaultsBtn.hidden = meta.hiddenIds.length === 0;
  }

  function deleteGame(id, title) {
    if (!confirm(`Usunąć „${title}" z listy gier?`)) return;
    const meta = loadCatalogMeta();
    if (isBuiltin(id)) {
      if (!meta.hiddenIds.includes(id)) meta.hiddenIds.push(id);
    } else {
      meta.custom = meta.custom.filter((g) => g.id !== id);
    }
    saveCatalogMeta(meta);
    renderManage();
    renderHome();
  }

  function restoreDefaults() {
    const meta = loadCatalogMeta();
    meta.hiddenIds = [];
    saveCatalogMeta(meta);
    renderManage();
    renderHome();
  }

  function blankProduct() {
    return { name: "", price: "", hint: "", image: PLACEHOLDER_IMAGE, sourceUrl: "" };
  }

  function normalizeUrl(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return null;
    try {
      const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const url = new URL(withProtocol);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function hostHint(pageUrl) {
    try {
      return new URL(pageUrl).hostname.replace(/^www\./, "");
    } catch {
      return "Link produktu";
    }
  }

  function flattenJsonLd(node, out = []) {
    if (!node) return out;
    if (Array.isArray(node)) {
      node.forEach((item) => flattenJsonLd(item, out));
      return out;
    }
    if (typeof node === "object") {
      out.push(node);
      if (node["@graph"]) flattenJsonLd(node["@graph"], out);
    }
    return out;
  }

  function ldTypes(node) {
    const t = node && node["@type"];
    if (!t) return [];
    return (Array.isArray(t) ? t : [t]).map((x) => String(x).toLowerCase());
  }

  function pickLdImage(image) {
    if (!image) return "";
    if (typeof image === "string") return image;
    if (Array.isArray(image)) return pickLdImage(image[0]);
    if (typeof image === "object") return image.url || image.contentUrl || image["@id"] || "";
    return "";
  }

  function pickLdPrice(offers) {
    if (!offers) return null;
    const list = Array.isArray(offers) ? offers : [offers];
    for (const offer of list) {
      if (!offer || typeof offer !== "object") continue;
      const direct = offer.price ?? offer.lowPrice ?? offer.highPrice;
      const parsed = parseGuess(direct);
      if (parsed !== null) return parsed;
      if (offer.priceSpecification) {
        const specs = Array.isArray(offer.priceSpecification)
          ? offer.priceSpecification
          : [offer.priceSpecification];
        for (const spec of specs) {
          const fromSpec = parseGuess(spec && spec.price);
          if (fromSpec !== null) return fromSpec;
        }
      }
    }
    return null;
  }

  function metaContent(doc, key) {
    const el =
      doc.querySelector(`meta[property="${key}"]`) ||
      doc.querySelector(`meta[name="${key}"]`) ||
      doc.querySelector(`meta[itemprop="${key}"]`);
    return el ? (el.getAttribute("content") || "").trim() : "";
  }

  function absoluteUrl(maybeRelative, baseUrl) {
    if (!maybeRelative) return "";
    try {
      return new URL(maybeRelative, baseUrl).href;
    } catch {
      return maybeRelative;
    }
  }

  function cleanProductName(name) {
    return String(name || "")
      .replace(/\s+/g, " ")
      .replace(/\s*[|\-–—]\s*(Allegro|Amazon|Empik|MediaExpert|OleOle|x-kom|Morele|Reserved|Zalando).*$/i, "")
      .trim()
      .slice(0, 80);
  }

  function parseProductFromHtml(html, pageUrl) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    let name = "";
    let price = null;
    let image = "";

    const ldNodes = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        flattenJsonLd(JSON.parse(script.textContent || "null"), ldNodes);
      } catch (_) {
        /* ignore bad json-ld */
      }
    });

    for (const node of ldNodes) {
      const types = ldTypes(node);
      const isProduct =
        types.some((t) => t.includes("product")) ||
        (!types.length && (node.offers || node.sku) && node.name);
      if (!isProduct) continue;
      if (!name && node.name) name = String(node.name);
      if (!image) image = pickLdImage(node.image);
      if (price === null) price = pickLdPrice(node.offers);
    }

    if (!name) name = metaContent(doc, "og:title") || metaContent(doc, "twitter:title");
    if (!name) {
      const titleEl = doc.querySelector("title");
      if (titleEl) name = titleEl.textContent || "";
    }
    if (!image) {
      image =
        metaContent(doc, "og:image") ||
        metaContent(doc, "og:image:url") ||
        metaContent(doc, "twitter:image") ||
        metaContent(doc, "twitter:image:src");
    }
    if (price === null) {
      price =
        parseGuess(metaContent(doc, "product:price:amount")) ??
        parseGuess(metaContent(doc, "og:price:amount")) ??
        parseGuess(metaContent(doc, "price"));
    }
    if (price === null) {
      const priceEl =
        doc.querySelector('[itemprop="price"]') ||
        doc.querySelector('meta[itemprop="price"]');
      if (priceEl) {
        price = parseGuess(
          priceEl.getAttribute("content") || priceEl.getAttribute("value") || priceEl.textContent
        );
      }
    }
    if (price === null) {
      const bodyText = (doc.body && doc.body.textContent) || "";
      const match = bodyText.match(/(?:cena|price)[^\d]{0,20}(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:zł|PLN)/i);
      if (match) price = parseGuess(match[1]);
    }

    name = cleanProductName(name);
    image = absoluteUrl(image, pageUrl);
    return {
      name,
      price,
      image,
      hint: hostHint(pageUrl),
    };
  }

  async function fetchTextViaProxy(targetUrl) {
    const builders = [
      (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    ];
    let lastError = null;
    for (const build of builders) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18000);
      try {
        const res = await fetch(build(targetUrl), {
          signal: controller.signal,
          headers: { Accept: "text/html,application/xhtml+xml" },
        });
        clearTimeout(timer);
        if (!res.ok) {
          lastError = new Error(`HTTP ${res.status}`);
          continue;
        }
        const text = await res.text();
        if (text && text.length > 200) return text;
        lastError = new Error("pusta odpowiedź");
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
      }
    }
    throw lastError || new Error("proxy");
  }

  async function compressImageFromUrl(imageUrl) {
    if (!imageUrl) throw new Error("brak obrazu");
    const builders = [
      (u) => u,
      (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    ];
    for (const build of builders) {
      try {
        const res = await fetch(build(imageUrl));
        if (!res.ok) continue;
        const blob = await res.blob();
        if (!blob || !(blob.type || "").startsWith("image/")) {
          if (build === builders[0]) continue;
        }
        const file = new File([blob], "product.jpg", {
          type: blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg",
        });
        return await compressImage(file);
      } catch (_) {
        /* try next */
      }
    }
    throw new Error("image");
  }

  async function fetchProductFromUrl(rawUrl) {
    const pageUrl = normalizeUrl(rawUrl);
    if (!pageUrl) throw new Error("Zły adres URL.");
    const html = await fetchTextViaProxy(pageUrl);
    const parsed = parseProductFromHtml(html, pageUrl);
    if (!parsed.name && parsed.price === null && !parsed.image) {
      throw new Error("Nie udało się odczytać danych z tej strony.");
    }
    let image = PLACEHOLDER_IMAGE;
    if (parsed.image) {
      try {
        image = await compressImageFromUrl(parsed.image);
      } catch (_) {
        image = parsed.image;
      }
    }
    return {
      name: parsed.name || "",
      price: parsed.price,
      image,
      hint: parsed.hint,
      sourceUrl: pageUrl,
    };
  }

  function openEditor() {
    state.editorDraft = {
      title: "",
      subtitle: "",
      products: [blankProduct(), blankProduct(), blankProduct(), blankProduct(), blankProduct()],
    };
    els.editorTitle.value = "";
    els.editorSubtitle.value = "";
    els.editorError.hidden = true;
    els.editorError.textContent = "";
    els.editorHeading.textContent = "Nowa gra";
    els.editorProgress.textContent = "Nowa gra";
    renderProductsEditor();
    show("editor");
  }

  function renderProductsEditor() {
    const draft = state.editorDraft;
    els.productsEditor.innerHTML = "";
    draft.products.forEach((product, index) => {
      const card = document.createElement("div");
      card.className = "product-edit";
      card.dataset.index = String(index);

      const top = document.createElement("div");
      top.className = "product-edit-top";
      top.innerHTML = `<span class="label">Produkt ${index + 1}</span>`;
      if (draft.products.length > 1) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "ghost danger";
        removeBtn.textContent = "Usuń";
        removeBtn.addEventListener("click", () => {
          draft.products.splice(index, 1);
          renderProductsEditor();
        });
        top.appendChild(removeBtn);
      }
      card.appendChild(top);

      const urlRow = document.createElement("div");
      urlRow.className = "url-import";
      const urlInput = document.createElement("input");
      urlInput.type = "url";
      urlInput.inputMode = "url";
      urlInput.placeholder = "Wklej link do produktu (sklep)";
      urlInput.value = product.sourceUrl || "";
      urlInput.addEventListener("input", () => {
        draft.products[index].sourceUrl = urlInput.value;
      });
      const fetchBtn = document.createElement("button");
      fetchBtn.type = "button";
      fetchBtn.className = "ghost";
      fetchBtn.textContent = "Wczytaj";
      const fetchStatus = document.createElement("p");
      fetchStatus.className = "url-import-status";
      fetchStatus.hidden = true;

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "Nazwa produktu";
      nameInput.maxLength = 80;
      nameInput.value = product.name;
      nameInput.addEventListener("input", () => {
        draft.products[index].name = nameInput.value;
      });

      const priceInput = document.createElement("input");
      priceInput.type = "text";
      priceInput.inputMode = "decimal";
      priceInput.placeholder = "Cena prawdziwa, np. 29,90";
      priceInput.value = product.price;
      priceInput.addEventListener("input", () => {
        draft.products[index].price = priceInput.value;
      });

      const hintInput = document.createElement("input");
      hintInput.type = "text";
      hintInput.placeholder = "Podpowiedź / źródło (opcjonalnie)";
      hintInput.maxLength = 120;
      hintInput.value = product.hint || "";
      hintInput.addEventListener("input", () => {
        draft.products[index].hint = hintInput.value;
      });

      const photo = document.createElement("div");
      photo.className = "product-photo";
      const img = document.createElement("img");
      img.alt = "Podgląd";
      img.src = product.image || PLACEHOLDER_IMAGE;
      const actions = document.createElement("div");
      actions.className = "photo-actions";
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      const pickBtn = document.createElement("button");
      pickBtn.type = "button";
      pickBtn.className = "ghost";
      pickBtn.textContent = "Zdjęcie / aparat";
      pickBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        try {
          const dataUrl = await compressImage(file);
          draft.products[index].image = dataUrl;
          img.src = dataUrl;
        } catch (_) {
          alert("Nie udało się wczytać zdjęcia.");
        }
      });
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "ghost";
      clearBtn.textContent = "Bez zdjęcia";
      clearBtn.addEventListener("click", () => {
        draft.products[index].image = PLACEHOLDER_IMAGE;
        img.src = PLACEHOLDER_IMAGE;
        fileInput.value = "";
      });
      actions.appendChild(pickBtn);
      actions.appendChild(clearBtn);
      actions.appendChild(fileInput);
      photo.appendChild(img);
      photo.appendChild(actions);

      fetchBtn.addEventListener("click", async () => {
        const raw = urlInput.value.trim() || draft.products[index].sourceUrl;
        if (!raw) {
          fetchStatus.hidden = false;
          fetchStatus.className = "url-import-status error";
          fetchStatus.textContent = "Wklej najpierw link do produktu.";
          return;
        }
        fetchBtn.disabled = true;
        urlInput.disabled = true;
        fetchStatus.hidden = false;
        fetchStatus.className = "url-import-status";
        fetchStatus.textContent = "Pobieram dane ze sklepu…";
        try {
          const data = await fetchProductFromUrl(raw);
          draft.products[index].sourceUrl = data.sourceUrl;
          urlInput.value = data.sourceUrl;
          if (data.name) {
            draft.products[index].name = data.name;
            nameInput.value = data.name;
          }
          if (data.price !== null && data.price !== undefined) {
            draft.products[index].price = String(data.price).replace(".", ",");
            priceInput.value = draft.products[index].price;
          }
          if (data.hint) {
            draft.products[index].hint = data.hint;
            hintInput.value = data.hint;
          }
          if (data.image) {
            draft.products[index].image = data.image;
            img.src = data.image;
          }
          const missing = [];
          if (!data.name) missing.push("nazwa");
          if (data.price === null || data.price === undefined) missing.push("cena");
          if (!data.image || data.image === PLACEHOLDER_IMAGE) missing.push("zdjęcie");
          fetchStatus.className = missing.length
            ? "url-import-status warn"
            : "url-import-status ok";
          fetchStatus.textContent = missing.length
            ? `Częściowo OK — uzupełnij ręcznie: ${missing.join(", ")}.`
            : "Wczytano nazwę, cenę i zdjęcie.";
        } catch (err) {
          fetchStatus.className = "url-import-status error";
          fetchStatus.textContent =
            (err && err.message) ||
            "Nie udało się wczytać. Uzupełnij ręcznie albo spróbuj inny sklep.";
        } finally {
          fetchBtn.disabled = false;
          urlInput.disabled = false;
        }
      });

      urlRow.appendChild(urlInput);
      urlRow.appendChild(fetchBtn);
      card.appendChild(urlRow);
      card.appendChild(fetchStatus);
      card.appendChild(nameInput);
      card.appendChild(priceInput);
      card.appendChild(hintInput);
      card.appendChild(photo);

      els.productsEditor.appendChild(card);
    });
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 720;
        let w = img.width;
        let h = img.height;
        if (w > max || h > max) {
          const ratio = Math.min(max / w, max / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("image"));
      };
      img.src = url;
    });
  }

  function showEditorError(msg) {
    els.editorError.hidden = !msg;
    els.editorError.textContent = msg || "";
  }

  function saveGameFromEditor() {
    const draft = state.editorDraft;
    if (!draft) return;
    const title = els.editorTitle.value.trim();
    const subtitle = els.editorSubtitle.value.trim() || "Własna gra";
    if (!title) {
      showEditorError("Podaj nazwę gry.");
      els.editorTitle.focus();
      return;
    }
    if (!draft.products.length) {
      showEditorError("Dodaj przynajmniej jeden produkt.");
      return;
    }

    const products = [];
    for (let i = 0; i < draft.products.length; i += 1) {
      const p = draft.products[i];
      const name = String(p.name || "").trim();
      const price = parseGuess(p.price);
      if (!name) {
        showEditorError(`Uzupełnij nazwę produktu ${i + 1}.`);
        return;
      }
      if (price === null || price < 0) {
        showEditorError(`Podaj poprawną cenę produktu ${i + 1}.`);
        return;
      }
      products.push({
        name,
        price,
        hint: String(p.hint || "").trim(),
        image: p.image || PLACEHOLDER_IMAGE,
      });
    }

    const game = {
      id: `custom-${Date.now().toString(36)}`,
      title,
      subtitle,
      note: "Gra dodana na telefonie",
      products,
    };

    try {
      const meta = loadCatalogMeta();
      meta.custom.push(game);
      saveCatalogMeta(meta);
    } catch (_) {
      showEditorError("Za mało miejsca na telefonie (zdjęcia są duże). Usuń jakąś grę albo zrób mniejsze zdjęcia.");
      return;
    }

    showEditorError("");
    state.editorDraft = null;
    renderHome();
    renderManage();
    show("manage");
  }

  function startGame(id) {
    const game = findGame(id);
    if (!game) return;
    state.game = game;
    state.index = 0;
    state.results = [];
    state.revealed = false;
    state.gamePoints = { tomek: 0, karolina: 0 };
    show("play");
    refreshScoreDisplays();
    renderProduct();
  }

  function currentProduct() {
    return state.game.products[state.index];
  }

  function renderProduct() {
    const product = currentProduct();
    state.revealed = false;
    els.progress.textContent = `${state.index + 1} / ${state.game.products.length}`;
    els.productImage.src = product.image || PLACEHOLDER_IMAGE;
    els.productImage.alt = product.name;
    els.productName.textContent = product.name;
    els.productHint.textContent = product.hint || state.game.note || "";
    els.guessTomek.value = "";
    els.guessKarolina.value = "";
    els.guessTomek.disabled = false;
    els.guessKarolina.disabled = false;
    els.checkBtn.disabled = false;
    els.checkBtn.hidden = false;
    els.nextBtn.hidden = true;
    els.result.classList.remove("show");
    els.duel.innerHTML = "";
    els.diff.textContent = "";
    els.guessTomek.focus({ preventScroll: true });
  }

  function closerWinner(diffT, diffK) {
    if (Math.abs(diffT - diffK) < 0.005) return "remis";
    return diffT < diffK ? "tomek" : "karolina";
  }

  function reveal() {
    const guessT = parseGuess(els.guessTomek.value);
    const guessK = parseGuess(els.guessKarolina.value);
    if (guessT === null) {
      els.guessTomek.focus();
      return;
    }
    if (guessK === null) {
      els.guessKarolina.focus();
      return;
    }

    const product = currentProduct();
    const actual = product.price;
    const diffT = Math.abs(guessT - actual);
    const diffK = Math.abs(guessK - actual);
    const winner = closerWinner(diffT, diffK);

    let pointsT = 0;
    let pointsK = 0;
    if (winner === "remis") {
      pointsT = 1;
      pointsK = 1;
    } else if (winner === "tomek") {
      pointsT = 1;
    } else {
      pointsK = 1;
    }

    state.gamePoints.tomek += pointsT;
    state.gamePoints.karolina += pointsK;

    const totals = loadTotals();
    totals.tomek += pointsT;
    totals.karolina += pointsK;
    saveTotals(totals);
    refreshScoreDisplays();

    state.revealed = true;
    state.results[state.index] = {
      name: product.name,
      actual,
      tomek: { guess: guessT, diff: diffT, points: pointsT },
      karolina: { guess: guessK, diff: diffK, points: pointsK },
      winner,
    };

    els.actualPrice.textContent = formatPrice(actual);
    els.duel.innerHTML = PLAYERS.map((p) => {
      const row = state.results[state.index][p.id];
      const isWin = winner === "remis" || winner === p.id;
      return `<div class="duel-row ${isWin ? "winner" : ""}">
        <div class="duel-name">${p.name}${isWin ? " · bliżej" : ""}</div>
        <div class="duel-guess">${formatPrice(row.guess)}</div>
        <div class="duel-diff">różnica ${formatPrice(row.diff)}${row.points ? ` · +${row.points} pkt` : ""}</div>
      </div>`;
    }).join("");

    if (winner === "remis") {
      els.diff.textContent = "Remis — oboje dostają punkt.";
    } else {
      const w = PLAYERS.find((p) => p.id === winner);
      els.diff.textContent = `${w.name} był(a) bliżej i dostaje 1 punkt.`;
    }

    els.result.classList.add("show");
    els.guessTomek.disabled = true;
    els.guessKarolina.disabled = true;
    els.checkBtn.hidden = true;
    els.nextBtn.hidden = false;
    els.nextBtn.textContent =
      state.index === state.game.products.length - 1 ? "Podsumowanie" : "Następny produkt";
  }

  function next() {
    if (!state.revealed) return;
    if (state.index >= state.game.products.length - 1) {
      renderEnd();
      return;
    }
    state.index += 1;
    renderProduct();
  }

  function renderEnd() {
    const t = state.gamePoints.tomek;
    const k = state.gamePoints.karolina;
    els.endTitle.textContent = state.game.title;
    els.endScore.innerHTML = `<span>Tomek <b>${t}</b></span><span>Karolina <b>${k}</b></span>`;
    if (t === k) {
      els.endVerdict.textContent = "Remis w tej grze!";
      els.endVerdict.className = "verdict ok";
    } else if (t > k) {
      els.endVerdict.textContent = "Wygrywa Tomek!";
      els.endVerdict.className = "verdict good";
    } else {
      els.endVerdict.textContent = "Wygrywa Karolina!";
      els.endVerdict.className = "verdict good";
    }

    els.endList.innerHTML = state.results
      .map((r) => {
        const mark =
          r.winner === "remis"
            ? "remis"
            : r.winner === "tomek"
              ? "Tomek"
              : "Karolina";
        return `<li>
          <span class="name">${escapeHtml(r.name)}<br>
            T: ${formatPrice(r.tomek.guess)} · K: ${formatPrice(r.karolina.guess)} → ${formatPrice(r.actual)}
          </span>
          <span class="pts">${mark}</span>
        </li>`;
      })
      .join("");
    show("end");
  }

  document.getElementById("back-home").addEventListener("click", () => {
    refreshScoreDisplays();
    renderHome();
    show("home");
  });
  document.getElementById("again-btn").addEventListener("click", () => {
    if (state.game) startGame(state.game.id);
  });
  document.getElementById("home-btn").addEventListener("click", () => {
    refreshScoreDisplays();
    renderHome();
    show("home");
  });
  document.getElementById("reset-scores").addEventListener("click", () => {
    saveTotals({ tomek: 0, karolina: 0 });
    refreshScoreDisplays();
  });
  document.getElementById("manage-games-btn").addEventListener("click", () => {
    renderManage();
    show("manage");
  });
  document.getElementById("manage-back").addEventListener("click", () => {
    renderHome();
    show("home");
  });
  document.getElementById("add-game-btn").addEventListener("click", openEditor);
  document.getElementById("editor-back").addEventListener("click", () => {
    state.editorDraft = null;
    renderManage();
    show("manage");
  });
  document.getElementById("add-product-btn").addEventListener("click", () => {
    if (!state.editorDraft) return;
    if (state.editorDraft.products.length >= 12) {
      showEditorError("Maks. 12 produktów w jednej grze.");
      return;
    }
    state.editorDraft.products.push(blankProduct());
    showEditorError("");
    renderProductsEditor();
  });
  document.getElementById("save-game-btn").addEventListener("click", saveGameFromEditor);
  document.getElementById("restore-defaults-btn").addEventListener("click", () => {
    if (!confirm("Przywrócić usunięte gry startowe?")) return;
    restoreDefaults();
  });

  els.checkBtn.addEventListener("click", reveal);
  els.nextBtn.addEventListener("click", next);

  function onEnter(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (state.revealed) next();
    else reveal();
  }
  els.guessTomek.addEventListener("keydown", onEnter);
  els.guessKarolina.addEventListener("keydown", onEnter);

  document.addEventListener("visibilitychange", () => {
    syncWakeLock();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  const installHint = document.getElementById("install-hint");
  if (
    installHint &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true)
  ) {
    installHint.hidden = true;
  }

  renderHome();
  show("home");
})();
