(function () {
  const screens = {
    home: document.getElementById("screen-home"),
    play: document.getElementById("screen-play"),
    end: document.getElementById("screen-end"),
  };

  const els = {
    gameList: document.getElementById("game-list"),
    progress: document.getElementById("progress"),
    productImage: document.getElementById("product-image"),
    productName: document.getElementById("product-name"),
    productHint: document.getElementById("product-hint"),
    guessInput: document.getElementById("guess-input"),
    checkBtn: document.getElementById("check-btn"),
    nextBtn: document.getElementById("next-btn"),
    result: document.getElementById("result"),
    actualPrice: document.getElementById("actual-price"),
    verdict: document.getElementById("verdict"),
    diff: document.getElementById("diff"),
    endTitle: document.getElementById("end-title"),
    endScore: document.getElementById("end-score"),
    endList: document.getElementById("end-list"),
  };

  const state = {
    game: null,
    index: 0,
    results: [],
    revealed: false,
  };

  function show(name) {
    Object.values(screens).forEach((el) => el.classList.remove("active"));
    screens[name].classList.add("active");
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

  function scoreGuess(guess, actual) {
    const diff = Math.abs(guess - actual);
    const pct = actual === 0 ? 0 : (diff / actual) * 100;
    if (diff < 0.01 || pct <= 2) {
      return { points: 100, label: "Idealnie!", className: "good", pct, diff };
    }
    if (pct <= 10) {
      return { points: 70, label: "Bardzo blisko", className: "ok", pct, diff };
    }
    if (pct <= 25) {
      return { points: 40, label: "W okolicy", className: "ok", pct, diff };
    }
    return { points: 10, label: "Daleko", className: "bad", pct, diff };
  }

  function renderHome() {
    const games = window.GAMES || [];
    const placeholders = Math.max(0, 6 - games.length);
    els.gameList.innerHTML = "";

    games.forEach((game) => {
      const btn = document.createElement("button");
      btn.className = "game-card";
      btn.type = "button";
      btn.innerHTML = `<strong>${game.title}</strong><span>${game.subtitle} · ${game.products.length} produktów</span>`;
      btn.addEventListener("click", () => startGame(game.id));
      els.gameList.appendChild(btn);
    });

    for (let i = 0; i < placeholders; i++) {
      const btn = document.createElement("button");
      btn.className = "game-card disabled";
      btn.type = "button";
      btn.disabled = true;
      btn.innerHTML = `<strong>Gra ${games.length + i + 1}</strong><span>Wkrótce</span>`;
      els.gameList.appendChild(btn);
    }
  }

  function startGame(id) {
    const game = (window.GAMES || []).find((g) => g.id === id);
    if (!game) return;
    state.game = game;
    state.index = 0;
    state.results = [];
    state.revealed = false;
    show("play");
    renderProduct();
  }

  function currentProduct() {
    return state.game.products[state.index];
  }

  function renderProduct() {
    const product = currentProduct();
    state.revealed = false;
    els.progress.textContent = `${state.index + 1} / ${state.game.products.length}`;
    els.productImage.src = product.image;
    els.productImage.alt = product.name;
    els.productName.textContent = product.name;
    els.productHint.textContent = product.hint || state.game.note || "";
    els.guessInput.value = "";
    els.guessInput.disabled = false;
    els.checkBtn.disabled = false;
    els.checkBtn.hidden = false;
    els.nextBtn.hidden = true;
    els.result.classList.remove("show");
    els.guessInput.focus({ preventScroll: true });
  }

  function reveal() {
    const guess = parseGuess(els.guessInput.value);
    if (guess === null) {
      els.guessInput.focus();
      return;
    }

    const product = currentProduct();
    const scored = scoreGuess(guess, product.price);
    state.revealed = true;
    state.results[state.index] = {
      name: product.name,
      guess,
      actual: product.price,
      ...scored,
    };

    els.actualPrice.textContent = formatPrice(product.price);
    els.verdict.textContent = scored.label;
    els.verdict.className = `verdict ${scored.className}`;
    els.diff.textContent = `Twoja cena: ${formatPrice(guess)} · różnica ${formatPrice(scored.diff)} (${scored.pct.toFixed(0)}%) · +${scored.points} pkt`;
    els.result.classList.add("show");
    els.guessInput.disabled = true;
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
    const total = state.results.reduce((sum, r) => sum + r.points, 0);
    const max = state.game.products.length * 100;
    els.endTitle.textContent = state.game.title;
    els.endScore.textContent = `${total} / ${max}`;
    els.endList.innerHTML = state.results
      .map(
        (r) =>
          `<li><span class="name">${r.name}<br>${formatPrice(r.guess)} → ${formatPrice(r.actual)}</span><span class="pts">+${r.points}</span></li>`
      )
      .join("");
    show("end");
  }

  document.getElementById("back-home").addEventListener("click", () => {
    show("home");
  });
  document.getElementById("again-btn").addEventListener("click", () => {
    if (state.game) startGame(state.game.id);
  });
  document.getElementById("home-btn").addEventListener("click", () => {
    show("home");
  });
  els.checkBtn.addEventListener("click", reveal);
  els.nextBtn.addEventListener("click", next);
  els.guessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (state.revealed) next();
      else reveal();
    }
  });

  renderHome();
  show("home");
})();
