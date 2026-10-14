(function () {
  "use strict";

  const text = value => String(value ?? "").trim();
  const norm = value => text(value).toLowerCase();
  const number = value => value === "" || value === null || value === undefined
    ? null
    : Number.isFinite(Number(value)) ? Number(value) : null;

  function linkedQA(log = {}, qaRows = []) {
    const matches = (qaRows || []).filter(row => {
      if (log.QA_ID && row?.QA_ID && String(row.QA_ID) === String(log.QA_ID)) return true;
      return Boolean(log.BrewID && row?.BrewID && String(row.BrewID) === String(log.BrewID));
    });
    return matches.slice().sort((a, b) => text(b.Date).localeCompare(text(a.Date)))[0] || null;
  }

  function qaState(log = {}, qaRows = []) {
    const qa = linkedQA(log, qaRows);
    const score = number(log.QA_Final ?? qa?.Final_QA);
    const storedStatus = text(log.QA_Status || qa?.Status);
    if (score === null && !log.QA_ID && !qa) {
      return Object.freeze({ key: "pending", label: "Pending QA", score: null, status: "", qa: null });
    }
    const pass = /qa pass/i.test(storedStatus) || (score !== null && score >= 6.5);
    return Object.freeze({
      key: pass ? "pass" : "retest",
      label: pass ? "QA PASS" : "RETEST",
      score,
      status: storedStatus || (pass ? "QA PASS" : "RETEST"),
      qa
    });
  }

  function recipeSummary(log = {}) {
    const parts = [];
    if (number(log.Dose_g) !== null && Number(log.Dose_g) > 0) parts.push(`${number(log.Dose_g)}g`);
    if (number(log.TotalWater_ml) !== null && Number(log.TotalWater_ml) > 0) parts.push(`${number(log.TotalWater_ml)}ml`);
    if (number(log.Ratio) !== null && Number(log.Ratio) > 0) parts.push(`1:${number(log.Ratio)}`);
    if (number(log.Temp_C) !== null && Number(log.Temp_C) > 0) parts.push(`${number(log.Temp_C)}°C`);
    return parts.join(" · ") || "Recipe belum dicatat";
  }

  function searchText(log = {}) {
    return [
      log.BrewID, log.BeanName, log.Origin, log.Variety, log.Process, log.RoastProfile,
      log.Method, log.Dripper, log.Grinder, log.GrindSetting, log.BrewerName,
      log.PrimaryVariableChanged, log.Hypothesis, log.ResultNotes
    ].map(norm).filter(Boolean).join(" ");
  }

  function filterRows(rows = [], filters = {}, qaRows = []) {
    const query = norm(filters.search);
    const method = norm(filters.method);
    const qa = norm(filters.qa);
    const dateFrom = text(filters.dateFrom);
    const dateTo = text(filters.dateTo);
    return (rows || []).filter(log => {
      const state = qaState(log, qaRows);
      const date = text(log.Date);
      if (query && !searchText(log).includes(query)) return false;
      if (method && method !== "all" && norm(log.Method) !== method) return false;
      if (qa && qa !== "all" && state.key !== qa) return false;
      if (dateFrom && (!date || date < dateFrom)) return false;
      if (dateTo && (!date || date > dateTo)) return false;
      return true;
    });
  }

  function options(rows = []) {
    return Object.freeze({
      methods: [...new Set((rows || []).map(row => text(row.Method)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")),
      brewers: [...new Set((rows || []).map(row => text(row.BrewerName)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")),
      coffees: [...new Set((rows || []).map(row => text(row.BeanName || row.Variety)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"))
    });
  }

  function summary(rows = [], qaRows = []) {
    const states = (rows || []).map(row => qaState(row, qaRows));
    return Object.freeze({
      total: states.length,
      pending: states.filter(state => state.key === "pending").length,
      reviewed: states.filter(state => state.key !== "pending").length,
      pass: states.filter(state => state.key === "pass").length,
      retest: states.filter(state => state.key === "retest").length
    });
  }

  window.COFFEE_BREW_LOG_QA_VIEW = Object.freeze({
    filterRows,
    linkedQA,
    options,
    qaState,
    recipeSummary,
    searchText,
    summary
  });

  window.COFFEE_PAGE_MODULES?.register({
    tab: "qa",
    renderers: ["qaPreview", "brewLogTable", "qaBrewOptions"]
  });
})();
