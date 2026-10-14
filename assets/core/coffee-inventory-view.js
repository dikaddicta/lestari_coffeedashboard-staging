(function () {
  "use strict";

  const core = window.COFFEE_CORE = window.COFFEE_CORE || {};

  function normalize(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function recordKey(bean = {}) {
    return String(bean.CloudID || bean.BeanID || "");
  }

  function searchableText(bean = {}) {
    return [
      bean.CoffeeName,
      bean.BeanID,
      bean.Origin,
      bean.Producer,
      bean.Variety,
      bean.Variety2_optional,
      bean.Process,
      bean.RoastProfile,
      bean.FlavorFamily,
      bean.FlavorFamily2_optional,
      bean.FlavorFamily3_optional,
      bean.Notes
    ].map(normalize).filter(Boolean).join(" ");
  }

  function compareCoffee(a = {}, b = {}) {
    return String(a.CoffeeName || a.BeanID || "").localeCompare(String(b.CoffeeName || b.BeanID || ""), "id", { sensitivity: "base" });
  }

  function filterCoffee(rows = [], filters = {}) {
    const query = normalize(filters.query);
    const origin = normalize(filters.origin);
    const process = normalize(filters.process);
    const active = normalize(filters.active || "all");
    return (rows || [])
      .filter(bean => !query || searchableText(bean).includes(query))
      .filter(bean => !origin || origin === "all" || normalize(bean.Origin) === origin)
      .filter(bean => !process || process === "all" || normalize(bean.Process) === process)
      .filter(bean => active === "all" || normalize(bean.Active || "Yes") === active)
      .slice()
      .sort(compareCoffee);
  }

  function filterInventory(rows = [], filters = {}, statusFor = () => ({ key: "ready" })) {
    const query = normalize(filters.query);
    const status = normalize(filters.status || "all");
    const active = normalize(filters.active || "all");
    return (rows || [])
      .filter(bean => !query || searchableText(bean).includes(query))
      .filter(bean => status === "all" || normalize(statusFor(bean.Stock_g, 15)?.key) === status)
      .filter(bean => active === "all" || normalize(bean.Active || "Yes") === active)
      .slice()
      .sort(compareCoffee);
  }

  function inventorySummary(rows = [], statusFor = () => ({ key: "ready" })) {
    const list = Array.isArray(rows) ? rows : [];
    return Object.freeze({
      records: list.length,
      available: list.filter(bean => Number(bean.Stock_g || 0) > 0).length,
      attention: list.filter(bean => ["low", "critical"].includes(statusFor(bean.Stock_g, 15)?.key)).length,
      empty: list.filter(bean => statusFor(bean.Stock_g, 15)?.key === "empty").length,
      grams: list.reduce((sum, bean) => sum + Math.max(0, Number(bean.Stock_g) || 0), 0)
    });
  }

  function distinctValues(rows = [], field) {
    const values = new Map();
    (rows || []).forEach(row => {
      const value = String(row?.[field] || "").trim();
      if (value && !values.has(normalize(value))) values.set(normalize(value), value);
    });
    return [...values.values()].sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
  }

  function hasFilters(filters = {}) {
    return Boolean(normalize(filters.query)
      || !["", "all"].includes(normalize(filters.origin))
      || !["", "all"].includes(normalize(filters.process))
      || !["", "all"].includes(normalize(filters.status))
      || !["", "all"].includes(normalize(filters.active)));
  }

  function capabilities({ role = "guest", workspaceReady = false } = {}) {
    const activeRole = normalize(role);
    const member = Boolean(workspaceReady && ["admin", "qa", "brewer"].includes(activeRole));
    return Object.freeze({
      view: member,
      create: member,
      edit: member && activeRole === "admin",
      delete: member && activeRole === "admin",
      consume: member
    });
  }

  core.coffeeInventoryView = Object.freeze({
    capabilities,
    distinctValues,
    filterCoffee,
    filterInventory,
    hasFilters,
    inventorySummary,
    normalize,
    recordKey,
    searchableText
  });
})();
