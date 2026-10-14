(function () {
  "use strict";

  const rows = value => Array.isArray(value) ? value : [];
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const text = value => String(value || "").trim();
  const timestamp = value => {
    if (!value) return 0;
    const raw = String(value);
    const parsed = Date.parse(raw.includes("T") ? raw : `${raw}T00:00:00`);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  function sortNewest(items = [], dateFields = ["Date", "UpdatedAt", "CreatedAt"]) {
    return rows(items).slice().sort((a, b) => {
      const value = row => dateFields.reduce((found, field) => found || timestamp(row?.[field]), 0);
      return value(b) - value(a);
    });
  }

  function summarizeStock(items = [], getStatus) {
    const active = rows(items).filter(item => String(item?.Active || "Yes").toLowerCase() !== "no");
    const statusFor = item => typeof getStatus === "function"
      ? getStatus(item?.Stock_g, 15)
      : { key: number(item?.Stock_g) > 0 ? "ready" : "empty", label: number(item?.Stock_g) > 0 ? "Tersedia" : "Habis", cups: Math.floor(Math.max(0, number(item?.Stock_g)) / 15) };
    const priority = { empty: 0, critical: 1, low: 2, ready: 3 };
    const entries = active.map(item => ({ item, status: statusFor(item) })).sort((a, b) => {
      const urgency = (priority[a.status?.key] ?? 9) - (priority[b.status?.key] ?? 9);
      return urgency || number(a.item?.Stock_g) - number(b.item?.Stock_g);
    });
    return Object.freeze({
      active,
      entries,
      issues: entries.filter(entry => ["empty", "critical", "low"].includes(entry.status?.key)),
      activeCount: active.length,
      totalGram: active.reduce((sum, item) => sum + Math.max(0, number(item?.Stock_g)), 0)
    });
  }

  function summarizeQA(qaItems = [], brewItems = []) {
    const qa = rows(qaItems);
    const brew = rows(brewItems);
    const linkedBrewIds = new Set(qa.map(item => text(item?.BrewID)).filter(Boolean));
    const pendingBrews = brew.filter(item => {
      const brewId = text(item?.BrewID);
      return brewId && !text(item?.QA_ID) && !linkedBrewIds.has(brewId);
    });
    const scores = qa.map(item => number(item?.Final_QA)).filter(Boolean);
    return Object.freeze({
      completedCount: qa.length,
      pendingBrews,
      average: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
      latest: sortNewest(qa, ["Date"]).slice(0, 4)
    });
  }

  function relevantBrews(brewItems = [], { role = "guest", userId = "", limit = 5 } = {}) {
    const ordered = sortNewest(brewItems, ["Date", "CreatedAt", "UpdatedAt"]);
    if (role === "brewer" && userId) {
      const own = ordered.filter(item => text(item?.CreatedBy) === text(userId));
      if (own.length) return own.slice(0, limit);
    }
    return ordered.slice(0, limit);
  }

  function buildActivity({ brews = [], qa = [], stock = [], limit = 6 } = {}) {
    const activity = [];
    rows(brews).forEach(item => activity.push({
      type: "brew",
      date: item?.Date || "",
      timestamp: timestamp(item?.Date),
      title: "Seduhan dicatat",
      detail: item?.BeanName || item?.BrewID || "Seduhan tanpa nama"
    }));
    rows(qa).forEach(item => activity.push({
      type: "qa",
      date: item?.Date || "",
      timestamp: timestamp(item?.Date),
      title: "Evaluasi QA disimpan",
      detail: [item?.BrewID, number(item?.Final_QA) ? `QA ${number(item.Final_QA).toFixed(2)}` : ""].filter(Boolean).join(" · ") || "Evaluasi kualitas"
    }));
    rows(stock).forEach(item => {
      const date = item?.UpdatedAt || item?.CreatedAt || "";
      if (!date) return;
      activity.push({
        type: "stock",
        date,
        timestamp: timestamp(date),
        title: "Inventori diperbarui",
        detail: item?.CoffeeName || item?.BeanID || "Biji kopi"
      });
    });
    return activity.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  window.COFFEE_HOME_VIEW = Object.freeze({ sortNewest, summarizeStock, summarizeQA, relevantBrews, buildActivity });

  window.COFFEE_PAGE_MODULES?.register({
    tab: "home",
    renderers: ["metrics"]
  });
})();
