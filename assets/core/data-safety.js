(function () {
  "use strict";

  const core = window.COFFEE_CORE = window.COFFEE_CORE || {};

  function createUuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  function ensureInsertIdentity(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Payload insert tidak valid.");
    if (!payload.id) payload.id = createUuid();
    return payload;
  }

  function normalizeMutation(mutation = {}) {
    const type = mutation.type === "update" ? "update" : "insert";
    const table = String(mutation.table || "").trim();
    const payload = { ...(mutation.payload || {}) };
    if (!table) throw new Error("Tabel mutation belum ditentukan.");
    if (type === "insert") ensureInsertIdentity(payload);
    const id = type === "update" ? String(mutation.id || "").trim() : String(payload.id || "");
    if (!id) throw new Error("Mutation belum memiliki ID stabil.");
    return { type, table, id, payload };
  }

  function isDuplicateKeyError(error) {
    let current = error;
    for (let depth = 0; current && depth < 4; depth += 1) {
      const text = `${current.code || ""} ${current.message || ""} ${current.details || ""}`.toLowerCase();
      if (String(current.code || "") === "23505" || /duplicate key|already exists|unique constraint/.test(text)) return true;
      current = current.originalError || current.cause;
    }
    return false;
  }

  function remainingMutations(mutations = [], failedIndex = 0) {
    const index = Number.isInteger(failedIndex) && failedIndex >= 0 ? failedIndex : 0;
    return mutations.slice(index).map(normalizeMutation);
  }

  function csvCell(value) {
    if (value === null || value === undefined) return "";
    let text = String(value).replace(/\r?\n/g, " ");
    if (/^[\t ]*[=+\-@]/.test(text)) text = `'${text}`;
    return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", "\"": "&quot;"
    }[character]));
  }

  core.dataSafety = Object.freeze({
    createUuid,
    ensureInsertIdentity,
    normalizeMutation,
    isDuplicateKeyError,
    remainingMutations,
    csvCell,
    escapeHtml
  });
})();
