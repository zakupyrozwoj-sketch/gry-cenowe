(function () {
  const PLAYERS = [
    { id: "tomek", name: "Tomek" },
    { id: "karolina", name: "Karolina" },
  ];
  const STORAGE_KEY = "gry-cenowe-scores-v1";

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
  };

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
    Object.values(screens).forEach((el) => el.classList.remove("active"));
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
    const games = window.GAMES || [];
    els.gameList.innerHTML = "";
    refreshScoreDisplays();

    games.forEach((game) => {
      const btn = document.createElement("button");
      btn.className = "game-card";
      btn.type = "button";
      btn.innerHTML = `<strong>${game.title}</strong><span>${game.subtitle} · ${game.products.length} produktów</span>`;
      btn.addEventListener("click", () => startGame(game.id));
      els.gameList.appendChild(btn);
    });
  }

  function startGame(id) {
    const game = (window.GAMES || []).find((g) => g.id === id);
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
    els.productImage.src = product.image;
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
          <span class="name">${r.name}<br>
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
    show("home");
  });
  document.getElementById("again-btn").addEventListener("click", () => {
    if (state.game) startGame(state.game.id);
  });
  document.getElementById("home-btn").addEventListener("click", () => {
    refreshScoreDisplays();
    show("home");
    renderHome();
  });
  document.getElementById("reset-scores").addEventListener("click", () => {
    saveTotals({ tomek: 0, karolina: 0 });
    refreshScoreDisplays();
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
