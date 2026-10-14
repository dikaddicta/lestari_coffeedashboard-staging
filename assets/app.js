(function () {
  "use strict";

  const APP_CONFIG = window.COFFEE_APP_CONFIG || {};
  const PRODUCT_NAME = APP_CONFIG?.site?.productName || "Lestari Coffee Dashboard";
  const RUNTIME = window.COFFEE_RUNTIME || {};
  const SERVICES = window.COFFEE_SERVICES || {};
  const CORE = window.COFFEE_CORE || {};
  const EVENT_BUS = CORE.events || { on: () => () => {}, emit: () => 0 };
  const HOME_VIEW = window.COFFEE_HOME_VIEW || null;
  const BREW_LOG_QA_VIEW = window.COFFEE_BREW_LOG_QA_VIEW || null;
  const VALIDATION = CORE.validation || null;
  const APP_STATE_SERVICE = CORE.state || null;
  const DATA_SAFETY = CORE.dataSafety || null;
  const COFFEE_INVENTORY_VIEW = CORE.coffeeInventoryView || null;
  const AUTH_SERVICE = SERVICES.auth || null;
  const STOCK_SERVICE = SERVICES.stock || null;
  const BREW_SERVICE = SERVICES.brew || null;
  const RECOMMENDATION_SERVICE = SERVICES.recommendation || null;
  const QA_SERVICE = SERVICES.qa || null;
  const ANALYTICS_SERVICE = SERVICES.analytics || null;
  const NOTIFICATION_SERVICE = SERVICES.notification || null;
  const SECURITY_SERVICE = SERVICES.security || null;
  const AUDIT_SERVICE = SERVICES.audit || null;
  const ERROR_SERVICE = SERVICES.errors || null;
  const BACKUP_SERVICE = SERVICES.backup || null;
  const SAFE_STORAGE = SERVICES.storage || RUNTIME.storage || {
    get(key, fallback = null, kind = "local") {
      try {
        const storage = kind === "session" ? window.sessionStorage : window.localStorage;
        const value = storage.getItem(key);
        return value === null ? fallback : value;
      } catch (_error) { return fallback; }
    },
    set(key, value, kind = "local") {
      try {
        const storage = kind === "session" ? window.sessionStorage : window.localStorage;
        storage.setItem(key, String(value));
        return true;
      } catch (_error) { return false; }
    },
    remove(key, kind = "local") {
      try {
        const storage = kind === "session" ? window.sessionStorage : window.localStorage;
        storage.removeItem(key);
        return true;
      } catch (_error) { return false; }
    },
    keys(kind = "local") {
      try {
        const storage = kind === "session" ? window.sessionStorage : window.localStorage;
        return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean);
      } catch (_error) { return []; }
    },
    readJSON(key, fallback, kind = "local") {
      const raw = this.get(key, null, kind);
      if (raw === null) return fallback;
      try { return JSON.parse(raw); } catch (_error) { return fallback; }
    },
    writeJSON(key, value, kind = "local") {
      try { return this.set(key, JSON.stringify(value), kind); } catch (_error) { return false; }
    }
  };
  const AUTH_STORAGE_ADAPTER = SERVICES.storage?.authAdapter || {
    getItem: key => SAFE_STORAGE.get(key, null),
    setItem: (key, value) => { SAFE_STORAGE.set(key, value); },
    removeItem: key => { SAFE_STORAGE.remove(key); }
  };
  const SUPABASE_SERVICE = SERVICES.supabase || null;

  const DATA = window.COFFEE_DATA || {};
  const STORAGE_KEY = "coffeeDashboardWebV1";
  const APPROVAL_THRESHOLD = 6.5;
  let stockSaving = false;
  let brewDraftSaving = false;
  let qaSaving = false;
  let manualBrewSaving = false;
  let manualEditingBrewId = null;
  let manualEditingOriginalLog = null;
  let manualEditingOriginalQA = null;
  let editingStockId = null;
  let brewStockOptionsSignature = "";
  const SUPABASE_CONFIG = window.SUPABASE_CONFIG || {};
  let supabaseClient = null;
  let cloudReady = false;
  let cloudBootstrapPending = true;
  let cloudBootstrapFailed = false;
  let cloudLastSync = null;
  let currentSession = null;
  let currentUser = null;
  let userProfile = null;
  let joinedWorkspaces = [];
  let userMemberships = [];
  let publicWorkspaces = [];
  let currentWorkspace = null;
  let currentRole = "guest";
  let moderationRows = [];
  let pendingMemberRows = [];
  let workspaceMemberRows = [];
  let suggestionRows = [];
  let auditRows = [];
  let auditCloudAvailable = false;
  let auditLastError = null;
  let auditLoading = false;
  let auditLoadedWorkspaceId = null;
  let dashboardUserCount = null;
  let dashboardUserCountSource = "local";
  let libraryCurrentRows = [];
  let libraryCurrentDataset = "varieties";
  let libraryCurrentFocus = "all";
  const LAST_WORKSPACE_KEY = "coffeeDashboardActiveWorkspace";
  const DEFAULT_PUBLIC_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
  const CLOUD_WRITE_TIMEOUT_MS = 45000;
  const CLOUD_READ_TIMEOUT_MS = 60000;
  const SESSION_REFRESH_BUFFER_MS = 10 * 60 * 1000;
  const SESSION_KEEPALIVE_MS = 4 * 60 * 1000;
  const AUTOSAVE_KEY = "coffeeDashboardAutosaveV19";
  const PENDING_SYNC_KEY = "coffeeDashboardPendingSyncV19";
  const AUTOSAVE_DEBOUNCE_MS = 900;
  let sessionKeepAliveTimer = null;
  let autosaveTimer = null;
  let pendingSyncRunning = false;
  let pendingRecovery = null;

  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => Number.isFinite(Number(n)) ? Number(n).toFixed(d).replace(/\.0$/, "") : "-";
  const fmtCurrency = (n) => Number.isFinite(Number(n)) ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(n)) : "-";
  const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
  const round = (n, d = 0) => Number(Number(n || 0).toFixed(d));
  const norm = (v) => String(v || "").trim().toLowerCase();
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const uniq = (arr) => [...new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ""))];
  const isSwitch = (dripperName) => /switch/i.test(dripperName || "");
  const html = (s) => String(s ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;","\"":"&quot;"}[ch]));
  const statusLabel = (status) => ({ pending: "Menunggu review", approved: "Disetujui", rejected: "Ditolak" }[String(status || "").toLowerCase()] || status || "-");
  const memberStatusLabel = (status) => ({ pending: "Menunggu persetujuan", active: "Aktif", rejected: "Ditolak", disabled: "Ditangguhkan" }[String(status || "").toLowerCase()] || status || "-");
  const roleDisplayLabel = (role) => SECURITY_SERVICE?.roleLabel?.(role) || ({ admin: "Admin", qa: "QA", brewer: "Brewer", guest: "Tamu", viewer: "Viewer" }[String(role || "").toLowerCase()] || role || "-");
  const emptyRow = (colspan, title, detail = "", icon = "✦") => `<tr class="empty-state-row"><td colspan="${colspan}"><div class="empty-state"><span class="empty-icon">${html(icon)}</span><strong>${html(title)}</strong>${detail ? `<small>${html(detail)}</small>` : ""}</div></td></tr>`;



  window.addEventListener("unhandledrejection", event => {
    console.error("Unhandled promise rejection", event.reason);
    ERROR_SERVICE?.capture?.({ type: "unhandledrejection", reason: event.reason, message: event.reason?.message || event.reason });
    showMessage(`Terjadi error proses: ${event.reason?.message || event.reason || "unknown error"}`, "error");
  });

  window.addEventListener("error", event => {
    console.error("Unhandled error", event.error || event.message);
    ERROR_SERVICE?.capture?.({
      type: "error",
      error: event.error,
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno
    });
    showMessage(`Terjadi error aplikasi: ${event.message || "unknown error"}`, "error");
  });

  const defaultState = {
    userStock: [],
    userBrewLogs: [],
    userQA: [],
    suggestions: [],
    cloudStock: [],
    cloudBrewLogs: [],
    cloudQA: []
  };
  const stateStore = APP_STATE_SERVICE?.createStore
    ? APP_STATE_SERVICE.createStore({ storage: SAFE_STORAGE, key: STORAGE_KEY, defaults: defaultState })
    : null;
  const state = stateStore?.state || loadState();
  if (stateStore) {
    state.cloudStock = [];
    state.cloudBrewLogs = [];
    state.cloudQA = [];
  }

  function loadState() {
    try {
      const saved = SAFE_STORAGE.readJSON(STORAGE_KEY, {});
      return {
        userStock: Array.isArray(saved.userStock) ? saved.userStock : [],
        userBrewLogs: Array.isArray(saved.userBrewLogs) ? saved.userBrewLogs : [],
        userQA: Array.isArray(saved.userQA) ? saved.userQA : [],
        suggestions: Array.isArray(saved.suggestions) ? saved.suggestions : [],
        cloudStock: [],
        cloudBrewLogs: [],
        cloudQA: []
      };
    } catch (err) {
      return { userStock: [], userBrewLogs: [], userQA: [], suggestions: [], cloudStock: [], cloudBrewLogs: [], cloudQA: [] };
    }
  }

  function persist() {
    const saved = stateStore ? stateStore.persist() : SAFE_STORAGE.writeJSON(STORAGE_KEY, state);
    if (!saved) showMessage("Penyimpanan browser penuh atau tidak tersedia. Ekspor data penting sebelum melanjutkan.", "error");
    return saved;
  }


  function getSupabaseProjectUrl() {
    if (SUPABASE_SERVICE) return SUPABASE_SERVICE.getProjectUrl(SUPABASE_CONFIG);
    const raw = String(SUPABASE_CONFIG.url || "").trim();
    if (!raw) return "";
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (_err) {
      throw new Error("Supabase URL tidak valid. Gunakan Project URL utama, misalnya https://xxxxx.supabase.co.");
    }
    if (parsed.protocol !== "https:") throw new Error("Supabase URL harus menggunakan https://.");
    if (parsed.pathname && parsed.pathname !== "/") {
      throw new Error("Supabase URL harus berupa Project URL utama tanpa path tambahan seperti /rest/v1 atau /auth/v1.");
    }
    return parsed.origin;
  }

  function getSupabaseAnonKey() {
    return SUPABASE_SERVICE
      ? SUPABASE_SERVICE.getAnonKey(SUPABASE_CONFIG)
      : String(SUPABASE_CONFIG.anonKey || "").trim();
  }

  function isSupabaseConfigured() {
    return SUPABASE_SERVICE
      ? SUPABASE_SERVICE.isConfigured(SUPABASE_CONFIG)
      : Boolean(SUPABASE_CONFIG.enabled !== false && String(SUPABASE_CONFIG.url || "").trim() && getSupabaseAnonKey());
  }

  function updateDbStatus(kind, title, detail = "") {
    const el = $("dbStatus");
    if (!el) return;
    const cls = kind === "online" ? "online" : kind === "syncing" ? "syncing" : "offline";
    el.innerHTML = `<span class="status-dot ${cls}"></span><div><strong>${html(title)}</strong><small>${html(detail)}</small></div>`;
  }

  function createClientId() {
    const key = "coffeeDashboardClientId";
    let id = SAFE_STORAGE.get(key, null);
    if (!id) {
      id = `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      SAFE_STORAGE.set(key, id);
    }
    return id;
  }

  function hasSession() {
    return Boolean(currentUser && currentUser.id);
  }

  function canModerate() {
    return currentRole === "qa" || currentRole === "admin";
  }

  function canAdmin() {
    return currentRole === "admin";
  }

  function activeWorkspaceId() {
    return currentWorkspace?.id || null;
  }

  async function recordAuditEvent(action, options = {}) {
    if (!AUDIT_SERVICE || !currentUser) return null;
    return AUDIT_SERVICE.record({
      client: supabaseClient,
      workspaceId: options.workspaceId === undefined ? activeWorkspaceId() : options.workspaceId,
      action,
      category: options.category || "system",
      entityType: options.entityType || null,
      entityId: options.entityId || null,
      outcome: options.outcome || "success",
      severity: options.severity || "info",
      message: options.message || "",
      metadata: options.metadata || {},
      userAgent: navigator.userAgent
    });
  }

  function bindAuditEventCapture() {
    if (document.body?.dataset.auditCaptureReady === "true") return;
    if (document.body) document.body.dataset.auditCaptureReady = "true";
    EVENT_BUS.on("auth:login", payload => recordAuditEvent("auth.login", {
      workspaceId: payload?.workspace?.id || null,
      category: "auth",
      entityType: "user",
      entityId: payload?.user?.id || null,
      message: "Pengguna berhasil masuk ke dashboard.",
      metadata: { role: payload?.role || "guest", workspace: payload?.workspace?.name || null }
    }));
    EVENT_BUS.on("stock:saved", payload => recordAuditEvent(payload?.editing ? "stock.updated" : "stock.created", {
      category: "stock", entityType: "stock_bean", entityId: payload?.bean?.CloudID || payload?.bean?.BeanID || null,
      message: payload?.editing ? "Data stok diperbarui." : "Data stok ditambahkan."
    }));
    EVENT_BUS.on("stock:deleted", payload => recordAuditEvent("stock.deleted", {
      category: "stock", entityType: "stock_bean", entityId: payload?.bean?.CloudID || payload?.bean?.BeanID || null,
      severity: "warning", message: "Data stok dihapus."
    }));
    EVENT_BUS.on("stock:consumed", payload => recordAuditEvent("stock.consumed", {
      category: "stock", entityType: "stock_bean", entityId: payload?.bean?.CloudID || payload?.bean?.BeanID || null,
      message: "Stok digunakan untuk seduhan.", metadata: { amount_g: Number(payload?.amount || 0) }
    }));
    EVENT_BUS.on("brew:saved", payload => recordAuditEvent("brew.saved", {
      category: "brew", entityType: "brew_log", entityId: payload?.brew?.CloudID || payload?.brew?.BrewID || null,
      message: "Log seduhan disimpan.", metadata: { source: payload?.source || "unknown" }
    }));
    EVENT_BUS.on("qa:saved", payload => recordAuditEvent("qa.saved", {
      category: "qa", entityType: "qa_score", entityId: payload?.qa?.CloudID || payload?.qa?.QAID || null,
      message: "Evaluasi QA disimpan.", metadata: { final: Number(payload?.final || 0), approved: Boolean(payload?.approved) }
    }));
  }

  function publicStatusForInsert() {
    return canModerate() ? "approved" : "pending";
  }

  function isApprovedRecipeLog(log) {
    return norm(log?.ApprovedForRecipe) === "yes" && Number(log?.QA_Final || 0) >= APPROVAL_THRESHOLD;
  }

  function moderationStatusForBrew(log) {
    if (!isApprovedRecipeLog(log)) return "pending";
    if (!currentUser) return "approved";
    return canModerate() ? "approved" : "pending";
  }

  function moderationStatusForQA(qa) {
    const pass = Number(qa?.Final_QA || 0) >= APPROVAL_THRESHOLD && /qa pass/i.test(String(qa?.Status || ""));
    if (!pass) return "pending";
    if (!currentUser) return "approved";
    return canModerate() ? "approved" : "pending";
  }

  function currentBrewerName() {
    return userProfile?.display_name || currentUser?.user_metadata?.display_name || currentUser?.email?.split("@")[0] || "Brewer";
  }

  function requestedMembershipFromMetadata() {
    const meta = currentUser?.user_metadata || {};
    const role = norm(meta.requested_role);
    const workspaceId = String(meta.requested_workspace_id || "").trim();
    if (!["brewer", "qa"].includes(role) || !workspaceId) return null;
    return { role, workspaceId };
  }

  function displayRoleContext() {
    const active = currentRole && currentRole !== "guest" && currentRole !== "viewer";
    if (active) return { role: currentRole, workspace: currentWorkspace?.name || "-", status: "active" };
    const pending = (userMemberships || []).find(ws => ws.membershipStatus === "pending");
    if (pending) return { role: pending.role, workspace: pending.name || "-", status: "pending" };
    const disabled = (userMemberships || []).find(ws => ws.membershipStatus === "disabled");
    if (disabled) return { role: disabled.role, workspace: disabled.name || "-", status: "disabled" };
    const rejected = (userMemberships || []).find(ws => ws.membershipStatus === "rejected");
    if (rejected) return { role: rejected.role, workspace: rejected.name || "-", status: "rejected" };
    const requested = requestedMembershipFromMetadata();
    if (requested) {
      const workspace = (publicWorkspaces || []).find(ws => ws.id === requested.workspaceId);
      return { role: requested.role, workspace: workspace?.name || "Menunggu data workspace", status: "pending" };
    }
    return { role: currentRole || "guest", workspace: currentWorkspace?.name || "-", status: currentUser ? "none" : "guest" };
  }

  let toastTimer = null;

  function showMessage(message, type = "info") {
    const toast = $("appToast");
    if (!toast) {
      console.log(message);
      return;
    }
    toast.textContent = message;
    toast.dataset.type = type;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), type === "error" ? 7000 : 4500);
  }

  function readJSONStorage(key, fallback) {
    return SAFE_STORAGE.readJSON(key, fallback);
  }

  function writeJSONStorage(key, value) {
    const written = SAFE_STORAGE.writeJSON(key, value);
    if (!written && RUNTIME.warn) RUNTIME.warn("Browser storage write failed", key);
    return written;
  }

  function pendingSyncItems() {
    const stored = readJSONStorage(PENDING_SYNC_KEY, []);
    if (!Array.isArray(stored)) return [];
    let migrated = false;
    const normalized = stored.map(item => ({
      ...item,
      mutations: (item?.mutations || []).map(mutation => {
        const safeMutation = normalizeSyncMutation(mutation);
        if (mutation.type !== safeMutation.type || mutation.id !== safeMutation.id || mutation.payload?.id !== safeMutation.payload.id) migrated = true;
        return safeMutation;
      })
    }));
    if (migrated) writeJSONStorage(PENDING_SYNC_KEY, normalized);
    return normalized;
  }

  function normalizeSyncMutation(mutation) {
    if (!DATA_SAFETY?.normalizeMutation) throw new Error("Data safety utility belum siap.");
    return DATA_SAFETY.normalizeMutation(mutation);
  }

  function savePendingSyncItems(items) {
    writeJSONStorage(PENDING_SYNC_KEY, Array.isArray(items) ? items : []);
    updateSystemStatus();
    ensureCriticalUiState();
    updateSyncGuardStatus();
  }

  function autosaveDrafts() {
    return readJSONStorage(AUTOSAVE_KEY, {});
  }

  function saveAutosaveDrafts(value) {
    writeJSONStorage(AUTOSAVE_KEY, value || {});
    updateSyncGuardStatus();
  }

  function collectFieldValues(root) {
    const values = {};
    if (!root) return values;
    root.querySelectorAll("input[id], select[id], textarea[id]").forEach(el => {
      if (el.type === "password") return;
      if (el.type === "checkbox") values[el.id] = Boolean(el.checked);
      else if (el.type === "radio") {
        if (el.checked) values[el.id] = el.value;
      } else {
        values[el.id] = el.value;
      }
    });
    return values;
  }

  function applyFieldValues(values = {}) {
    Object.entries(values).forEach(([id, value]) => {
      const el = $(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = Boolean(value);
      else if (el.type === "radio") {
        if (el.value === value) el.checked = true;
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function saveAutosaveScope(scope, root) {
    const values = collectFieldValues(root);
    const hasValue = Object.values(values).some(value => String(value ?? "").trim() !== "");
    const drafts = autosaveDrafts();
    if (hasValue) {
      drafts[scope] = { updatedAt: new Date().toISOString(), values };
    } else {
      delete drafts[scope];
    }
    saveAutosaveDrafts(drafts);
  }

  function scheduleAutosaveScope(scope, root) {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => saveAutosaveScope(scope, root), AUTOSAVE_DEBOUNCE_MS);
  }

  function clearAutosaveScope(scope) {
    const drafts = autosaveDrafts();
    delete drafts[scope];
    saveAutosaveDrafts(drafts);
  }

  function restoreAutosaveDrafts() {
    const drafts = autosaveDrafts();
    let restored = 0;
    ["brew", "manualBrew"].forEach(scope => {
      const draft = drafts[scope];
      if (!draft?.values) return;
      applyFieldValues(draft.values);
      restored += 1;
    });
    if (restored) {
      updateSyncGuardStatus("draft", "Draft lokal dipulihkan", "Input sebelumnya dipulihkan dari autosave browser.");
    }
  }

  function enqueuePendingSyncBatch(label, mutations = []) {
    const cleanMutations = (mutations || [])
      .filter(item => item?.table && item?.payload)
      .map(normalizeSyncMutation);
    if (!cleanMutations.length) return;
    const items = pendingSyncItems();
    items.unshift({
      id: `sync-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label,
      createdAt: new Date().toISOString(),
      attempts: 0,
      mutations: cleanMutations
    });
    savePendingSyncItems(items.slice(0, 25));
    updateSyncGuardStatus("queued", "Disimpan lokal", `${label} masuk antrean sync. Klik Sync ulang saat koneksi stabil.`);
  }

  function updateSyncGuardStatus(state, title, text) {
    const widget = $("syncGuardWidget");
    if (!widget) return;
    const pendingCount = pendingSyncItems().length;
    const drafts = autosaveDrafts();
    const draftCount = Object.keys(drafts || {}).length;
    const finalState = state || (pendingCount ? "queued" : draftCount ? "draft" : "idle");
    const finalTitle = title || (pendingCount ? `${pendingCount} antrean sync` : draftCount ? "Draft lokal aktif" : "Draft aman");
    const finalText = text || (pendingCount ? "Ada data yang belum terkirim ke Supabase." : draftCount ? "Autosave aktif; data aman bila halaman tertutup." : "Autosave lokal aktif.");
    widget.dataset.state = finalState;
    const titleEl = $("syncGuardTitle");
    const textEl = $("syncGuardText");
    const retryBtn = $("syncRetryBtn");
    if (titleEl) titleEl.textContent = finalTitle;
    if (textEl) textEl.textContent = finalText;
    setElementHidden(retryBtn, !pendingCount);
  }

  async function processPendingSyncQueue(showToast = false) {
    if (pendingSyncRunning) return;
    const queue = pendingSyncItems();
    if (!queue.length) {
      updateSyncGuardStatus();
      if (showToast) showMessage("Tidak ada antrean sync.", "info");
      return;
    }
    if (!supabaseClient || !cloudReady) {
      updateSyncGuardStatus("queued", `${queue.length} antrean sync`, "Supabase belum siap. Coba lagi setelah status online.");
      if (showToast) showMessage("Supabase belum siap untuk sync ulang.", "error");
      return;
    }
    pendingSyncRunning = true;
    const includesManualBrew = queue.some(item => item?.label === "Input Seduhan Publik");
    const includesQASave = queue.some(item => item?.label === "Brew Log & QA");
    updateSyncGuardStatus("syncing", "Sync berjalan", "Mengirim antrean lokal ke Supabase...");
    const remaining = [];
    try {
      for (const item of [...queue].reverse()) {
        const mutations = (item.mutations || []).map(normalizeSyncMutation);
        let failedAt = -1;
        let lastError = null;
        for (let index = 0; index < mutations.length; index += 1) {
          try {
            await executeSyncMutation(mutations[index], item.label || `Sync ${mutations[index].table}`);
          } catch (err) {
            failedAt = index;
            lastError = err;
            break;
          }
        }
        if (failedAt >= 0) {
          remaining.unshift({
            ...item,
            attempts: Number(item.attempts || 0) + 1,
            lastError: lastError?.message || String(lastError),
            lastAttemptAt: new Date().toISOString(),
            mutations: DATA_SAFETY.remainingMutations(mutations, failedAt)
          });
        }
      }
      savePendingSyncItems(remaining);
      if (remaining.length) {
        updateSyncGuardStatus("queued", `${remaining.length} antrean tersisa`, "Sebagian data belum terkirim. Coba sync ulang.");
        if (showToast) showMessage(`${remaining.length} antrean masih gagal terkirim.`, "error");
      } else {
        updateSyncGuardStatus("synced", "Semua tersinkron", "Antrean lokal berhasil dikirim ke Supabase.");
        if (includesManualBrew) {
          setManualSaveState("success", "SUCCESS", "Antrean Brew Log dan QA berhasil disinkronkan.");
        }
        if (includesQASave) {
          setQASaveState("success", "SUCCESS", "Antrean QA dan pembaruan Brew berhasil disinkronkan.");
        }
        if (showToast) showMessage("Semua antrean lokal berhasil tersinkron.", "success");
        syncFromCloud(false).then(renderAll).catch(console.warn);
      }
    } finally {
      pendingSyncRunning = false;
    }
  }

  function bindAutosaveDrafts() {
    const brewRoot = $("tab-brew");
    const manualRoot = $("manualBrewForm");
    if (brewRoot && brewRoot.dataset.autosaveReady !== "true") {
      brewRoot.dataset.autosaveReady = "true";
      ["input", "change"].forEach(eventName => brewRoot.addEventListener(eventName, event => {
        if (event.target?.matches?.("input,select,textarea")) scheduleAutosaveScope("brew", brewRoot);
      }, true));
    }
    if (manualRoot && manualRoot.dataset.autosaveReady !== "true") {
      manualRoot.dataset.autosaveReady = "true";
      ["input", "change"].forEach(eventName => manualRoot.addEventListener(eventName, event => {
        if (event.target?.matches?.("input,select,textarea")) scheduleAutosaveScope("manualBrew", manualRoot);
      }, true));
    }
    $("syncRetryBtn")?.addEventListener("click", () => processPendingSyncQueue(true));
    updateSyncGuardStatus();
  }

  function normalizeSlug(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  async function ensureProfile() {
    if (!supabaseClient || !currentUser) return null;
    const displayName = $("authDisplayName")?.value || currentUser.user_metadata?.display_name || currentUser.email?.split("@")[0] || "Pengguna Kopi";
    const payload = { id: currentUser.id, email: currentUser.email, display_name: displayName };
    const { data, error } = await supabaseClient.from("profiles").upsert(payload, { onConflict: "id" }).select().single();
    if (error) { console.warn("profile upsert failed", error); return null; }
    userProfile = data;
    return data;
  }

  function flattenWorkspaceMembership(row) {
    const ws = row.workspaces || row.workspace || {};
    return {
      id: row.workspace_id || ws.id,
      name: ws.name || "Workspace",
      slug: ws.slug || "workspace",
      visibility: ws.visibility || "public",
      role: row.role || "brewer",
      membershipStatus: row.status || "active"
    };
  }

  async function loadWorkspaces() {
    joinedWorkspaces = [];
    userMemberships = [];
    publicWorkspaces = [];
    currentWorkspace = null;
    currentRole = "guest";
    if (!supabaseClient) return;

    const workspaceRes = await supabaseClient
      .from("workspaces")
      .select("id,name,slug,visibility,description,status")
      .eq("status", "active")
      .order("name");
    if (!workspaceRes.error) publicWorkspaces = workspaceRes.data || [];

    if (currentUser) {
      const memberRes = await supabaseClient
        .from("workspace_members")
        .select("workspace_id, role, status, workspaces(id,name,slug,visibility,description)")
        .eq("user_id", currentUser.id);
      if (!memberRes.error) {
        userMemberships = (memberRes.data || []).map(flattenWorkspaceMembership).filter(ws => ws.id);
        joinedWorkspaces = userMemberships.filter(ws => ws.membershipStatus === "active");
      }
    }

    const last = SAFE_STORAGE.get(LAST_WORKSPACE_KEY, null);
    const preferredWorkspace = joinedWorkspaces.find(ws => ws.slug !== "public-brew-community") || joinedWorkspaces[0] || null;
    currentWorkspace = joinedWorkspaces.find(ws => ws.id === last) || preferredWorkspace;
    const joined = joinedWorkspaces.find(ws => ws.id === currentWorkspace?.id);
    currentRole = joined?.role || (currentWorkspace ? "viewer" : "guest");
    renderWorkspaceUI();
  }

  function renderWorkspaceUI() {
    const allKnown = uniq([...(joinedWorkspaces || [])].map(ws => ws.id))
      .map(id => joinedWorkspaces.find(ws => ws.id === id))
      .filter(Boolean);

    [$(`activeWorkspaceSelect`), $(`adminWorkspaceSelect`)].forEach(sel => {
      if (!sel) return;
      sel.innerHTML = allKnown.length
        ? allKnown.map(ws => `<option value="${html(ws.id)}">${html(ws.name)} · ${html(ws.role)} · ${html(ws.slug || "company")}</option>`).join("")
        : `<option value="">Belum ada workspace aktif</option>`;
      if (currentWorkspace?.id) sel.value = currentWorkspace.id;
    });

    const signupSel = $("signupWorkspace");
    if (signupSel) {
      const rows = (publicWorkspaces || []).filter(ws => ws.slug !== "public-brew-community");
      signupSel.innerHTML = rows.length
        ? `<option value="">Pilih workspace / company</option>` + rows.map(ws => `<option value="${html(ws.id)}">${html(ws.name)} · ${html(ws.slug || "company")}</option>`).join("")
        : `<option value="">Belum ada workspace terdaftar</option>`;
    }

    const hint = $("workspaceHint");
    if (hint) {
      const pending = (userMemberships || []).filter(ws => ws.membershipStatus === "pending");
      hint.textContent = currentWorkspace
        ? `${currentWorkspace.name} · peran aktif: ${currentRole}`
        : pending.length
          ? `Menunggu approval: ${pending.map(ws => `${ws.name} (${ws.role})`).join(", ")}`
          : "Belum ada workspace aktif.";
    }
    const switchStatus = $("workspaceSwitchStatus");
    if (switchStatus) {
      switchStatus.dataset.state = currentWorkspace ? "success" : "ready";
      switchStatus.textContent = currentWorkspace
        ? `${currentWorkspace.name} · ${roleDisplayLabel(currentRole)}`
        : "Belum ada workspace aktif.";
    }
    const securitySettings = $("workspaceSecuritySettings");
    if (securitySettings) setElementHidden(securitySettings, !(currentWorkspace && canAdmin()));
    if ($("workspaceVisibilitySetting") && currentWorkspace) $("workspaceVisibilitySetting").value = currentWorkspace.visibility || "private";

    renderAuthUI();
    renderAccessUI();
    renderSignupRoleUI();
  }

  async function saveWorkspaceVisibility() {
    if (!supabaseClient || !currentUser || !currentWorkspace || !canAdmin()) return showMessage("Aksi ini memerlukan peran Admin Workspace.", "error");
    const visibility = $("workspaceVisibilitySetting")?.value || "private";
    const button = $("saveWorkspaceVisibilityBtn");
    const original = button?.textContent || "Simpan Visibilitas";
    if (button) { button.disabled = true; button.textContent = "Menyimpan..."; }
    try {
      await prepareCloudWrite("Simpan visibilitas workspace");
      const { data, error } = await withTimeout(
        supabaseClient.from("workspaces").update({ visibility }).eq("id", currentWorkspace.id).select("id,name,slug,visibility,description,status").single(),
        CLOUD_WRITE_TIMEOUT_MS,
        "Simpan visibilitas workspace"
      );
      if (error || !data) throw error || new Error("Workspace tidak ditemukan.");
      currentWorkspace = { ...currentWorkspace, ...data };
      joinedWorkspaces = joinedWorkspaces.map(ws => ws.id === data.id ? { ...ws, ...data } : ws);
      renderWorkspaceUI();
      await loadAuditTrail().catch(console.warn);
      showMessage(visibility === "public" ? "Workspace sekarang dapat dipilih saat pendaftaran." : "Workspace sekarang hanya terlihat oleh anggota aktif.", "success");
    } catch (error) {
      showMessage(`Gagal menyimpan visibilitas: ${error.message || error}`, "error");
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  }

  async function setActiveWorkspace(id) {
    if (!id) return;
    const ws = [...joinedWorkspaces, ...publicWorkspaces].find(w => w.id === id);
    if (!ws) return;
    const switchStatus = $("workspaceSwitchStatus");
    currentWorkspace = ws;
    const joined = joinedWorkspaces.find(j => j.id === id);
    currentRole = joined?.role || "viewer";
    SAFE_STORAGE.set(LAST_WORKSPACE_KEY, id);
    renderWorkspaceUI();
    if (switchStatus) {
      switchStatus.dataset.state = "loading";
      switchStatus.textContent = `Beralih ke ${ws.name || "workspace"}…`;
    }
    let syncError = null;
    try {
      await syncFromCloud(true);
    } catch (error) {
      syncError = error;
      console.warn(error);
    }
    if (canModerate()) await loadModerationRows().catch(console.warn);
    auditRows = [];
    auditCloudAvailable = false;
    auditLastError = null;
    auditLoadedWorkspaceId = null;
    if (canAdmin()) {
      await loadMemberRequests().catch(console.warn);
      await loadWorkspaceMembers().catch(console.warn);
      await loadSuggestionRows().catch(console.warn);
      await loadAuditTrail().catch(console.warn);
    }
    renderSecurityAuditModule();
    if (switchStatus) {
      switchStatus.dataset.state = syncError ? "error" : "success";
      switchStatus.textContent = syncError
        ? `${ws.name || "Workspace"} aktif · sinkronisasi perlu dicoba lagi`
        : `${ws.name || "Workspace"} aktif · ${roleDisplayLabel(currentRole)}`;
    }
  }

  function setElementHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle("hidden", hidden);
    el.hidden = Boolean(hidden);
    el.style.display = hidden ? "none" : "";
  }

  function renderAuthUI() {
    const userLabel = $("authUserLabel");
    const roleLabel = $("authRoleLabel");
    const accountBox = $("accountBox");
    const authJumpLink = $("authJumpLink");
    const loggedOutArea = $("authLoggedOutArea");
    const loggedInArea = $("authLoggedInArea");
    const title = $("authPanelTitle");
    const isLoggedIn = Boolean(currentUser);
    setElementHidden($("authSignupShortcut"), isLoggedIn);

    const roleCtx = displayRoleContext();
    const roleStatusClass = roleCtx.status === "active" ? "approved" : roleCtx.status === "rejected" ? "rejected" : roleCtx.status === "pending" ? "pending" : roleCtx.status === "disabled" ? "disabled" : "";
    const roleStatusText = roleCtx.status === "pending" ? "Menunggu persetujuan" : roleCtx.status === "rejected" ? "Ditolak" : roleCtx.status === "disabled" ? "Akses ditangguhkan" : roleCtx.status === "active" ? "Aktif" : "Belum ada workspace";

    if (title) title.textContent = isLoggedIn ? "Akun yang sedang digunakan" : "Masuk ke dashboard";
    if (userLabel) userLabel.textContent = isLoggedIn ? (userProfile?.display_name || currentUser.email || "Akun Pengguna") : "Mode Tamu";
    const avatarLabel = isLoggedIn ? (userProfile?.display_name || currentUser.email || "A") : "T";
    if ($("authAvatar")) $("authAvatar").textContent = String(avatarLabel).trim().charAt(0).toUpperCase() || "A";
    if (roleLabel) roleLabel.textContent = isLoggedIn
      ? `${currentUser.email || "-"} · ${roleCtx.workspace || "-"} · ${roleDisplayLabel(roleCtx.role || "guest")}`
      : "Masuk untuk menyimpan dan membagikan data.";

    if (accountBox) {
      accountBox.innerHTML = isLoggedIn
        ? `<strong>${html(userProfile?.display_name || currentUser.email)}</strong><br>Email: ${html(currentUser.email)}<br>Workspace: ${html(roleCtx.workspace || "-")}<br>Peran: <span class="status-pill ${html(roleStatusClass)}">${html(roleCtx.role)}</span><br>Status: ${html(roleStatusText)}`
        : `Belum masuk. Tamu tetap bisa membaca data publik yang sudah disetujui, tetapi pengiriman data ke database online memerlukan akun.`;
    }

    if ($("suggestionName") && isLoggedIn && !$('suggestionName').value) $("suggestionName").value = userProfile?.display_name || currentUser.email?.split("@")[0] || "";
    if ($("suggestionEmail") && isLoggedIn && !$('suggestionEmail').value) $("suggestionEmail").value = currentUser.email || "";

    setElementHidden(loggedOutArea, isLoggedIn);
    setElementHidden(loggedInArea, !isLoggedIn);
    setElementHidden(authJumpLink, isLoggedIn);
    renderAccountRoleStatus();
  }

  async function ensureRequestedMembership() {
    if (!supabaseClient || !currentUser) return;
    const request = requestedMembershipFromMetadata();
    if (!request) return;
    const { data: existing, error: readError } = await supabaseClient
      .from("workspace_members")
      .select("workspace_id,user_id,role,status")
      .eq("workspace_id", request.workspaceId)
      .eq("user_id", currentUser.id)
      .maybeSingle();
    if (readError) return;
    if (existing) return;
    await requestWorkspaceAccess(request.workspaceId, request.role, currentUser.id);
  }

  async function initAuth() {
    if (!supabaseClient) return;
    const { data: sessionData } = AUTH_SERVICE
      ? await AUTH_SERVICE.getSession(supabaseClient)
      : await supabaseClient.auth.getSession();
    currentSession = sessionData?.session || null;
    currentUser = currentSession?.user || null;
    if (currentUser) {
      await ensureProfile();
      await ensureRequestedMembership().catch(console.warn);
    }
    await loadWorkspaces();
    scheduleSessionKeepAlive();
    const authStateHandler = async (_event, session) => {
      currentSession = session || null;
      currentUser = currentSession?.user || null;
      if (currentUser) {
        await ensureProfile();
        await ensureRequestedMembership().catch(console.warn);
      } else {
        userProfile = null;
        joinedWorkspaces = [];
        userMemberships = [];
        currentWorkspace = null;
        currentRole = "guest";
      }
      await loadWorkspaces();
      scheduleSessionKeepAlive();
      await syncFromCloud(true).catch(console.warn);
      EVENT_BUS.emit("auth:changed", { user: currentUser, workspace: currentWorkspace, role: currentRole });
    };
    if (AUTH_SERVICE) AUTH_SERVICE.onAuthStateChange(supabaseClient, authStateHandler);
    else supabaseClient.auth.onAuthStateChange(authStateHandler);
    renderAuthUI();
  }

  async function handleLogin() {
    if (!supabaseClient) return showMessage("Supabase belum aktif.");
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    if (!email || !password) return showMessage("Isi email dan kata sandi untuk masuk.", "error");
    const { data, error } = AUTH_SERVICE
      ? await AUTH_SERVICE.signIn(supabaseClient, { email, password })
      : await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showMessage(`Gagal masuk: ${error.message}`, "error");
    currentSession = data?.session || currentSession;
    currentUser = data?.user || currentSession?.user || currentUser;
    await ensureProfile().catch(console.warn);
    await ensureRequestedMembership().catch(console.warn);
    await loadWorkspaces().catch(console.warn);
    await syncFromCloud(true).catch(console.warn);
    renderAll();
    EVENT_BUS.emit("auth:login", { user: currentUser, workspace: currentWorkspace, role: currentRole });
    showMessage("Berhasil masuk.", "success");
  }

  async function handleSignup() {
    if (!supabaseClient) return showMessage("Supabase belum aktif.");
    const email = ($("signupEmail")?.value || $("authEmail")?.value || "").trim();
    const password = $("signupPassword")?.value || $("authPassword")?.value || "";
    const displayName = $("authDisplayName")?.value.trim() || email.split("@")[0];
    const requestedRole = $("signupRole")?.value || "admin";
    const requestedWorkspaceId = $("signupWorkspace")?.value || "";
    if (!email || !password) return showMessage("Isi email dan kata sandi untuk daftar akun baru.", "error");
    if (!$("signupConsent")?.checked) return showMessage("Setujui Ketentuan Penggunaan dan Kebijakan Privasi sebelum membuat akun.", "error");
    if (password.length < 8) return showMessage("Gunakan kata sandi minimal 8 karakter.", "error");
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return showMessage("Kata sandi perlu memuat huruf dan angka.", "error");
    if (["brewer", "qa"].includes(requestedRole) && !requestedWorkspaceId) {
      return showMessage("Pilih workspace/company untuk mendaftar sebagai Brewer atau QA.", "error");
    }
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const signupMetadata = {
      display_name: displayName,
      requested_role: requestedRole,
      requested_workspace_id: requestedWorkspaceId || null,
      legal_consent_version: "2026-07-14-v1",
      legal_consent_at: new Date().toISOString()
    };
    const { data, error } = AUTH_SERVICE
      ? await AUTH_SERVICE.signUp(supabaseClient, { email, password, redirectTo, metadata: signupMetadata })
      : await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, data: signupMetadata } });
    if (error) {
      const message = /Invalid path specified/i.test(error.message)
        ? "Pendaftaran gagal: Supabase URL di assets/supabase-config.js kemungkinan salah. Pakai Project URL utama, contoh https://xxxxx.supabase.co, bukan URL dashboard, /rest/v1, atau /auth/v1."
        : `Pendaftaran gagal: ${error.message}`;
      return showMessage(message, "error");
    }

    if (data?.session?.user && ["brewer", "qa"].includes(requestedRole) && requestedWorkspaceId) {
      await requestWorkspaceAccess(requestedWorkspaceId, requestedRole, data.session.user.id).catch(console.warn);
    }

    const roleMessage = requestedRole === "admin"
      ? "Pendaftaran berhasil. Konfirmasi pendaftaran melalui email. Setelah email terverifikasi dan masuk, buat workspace/company sebagai Admin Workspace."
      : "Pendaftaran berhasil. Konfirmasi pendaftaran melalui email. Setelah email terverifikasi, request akses workspace akan menunggu approval Admin Workspace.";
    showMessage(`${roleMessage} Cek inbox atau folder spam/promosi.`, "success");
  }

  async function requestWorkspaceAccess(workspaceId, role, userId = currentUser?.id) {
    if (!supabaseClient || !userId || !workspaceId || !["brewer", "qa"].includes(role)) return;
    if (currentUser && cloudReady) await prepareCloudWrite("Request akses workspace");
    const { error } = await withTimeout(
      supabaseClient.from("workspace_members").insert({
        workspace_id: workspaceId,
        user_id: userId,
        role,
        status: "pending"
      }),
      CLOUD_WRITE_TIMEOUT_MS,
      "Request akses workspace"
    );
    if (error && error.code !== "23505" && !/duplicate|already exists/i.test(error.message || "")) throw error;
  }

  function clearLocalAuthState() {
    currentSession = null;
    currentUser = null;
    userProfile = null;
    joinedWorkspaces = [];
    userMemberships = [];
    currentWorkspace = null;
    currentRole = "guest";
    state.cloudStock = [];
    state.cloudBrewLogs = [];
    state.cloudQA = [];
    SAFE_STORAGE.remove(LAST_WORKSPACE_KEY);

    SAFE_STORAGE.keys("local").forEach(key => {
      if (/^sb-.*-auth-token$/.test(key) || key.includes("supabase.auth.token")) {
        SAFE_STORAGE.remove(key);
      }
    });
    SAFE_STORAGE.keys("session").forEach(key => {
      if (/^sb-.*-auth-token$/.test(key) || key.includes("supabase.auth.token")) {
        SAFE_STORAGE.remove(key, "session");
      }
    });
  }

  function withTimeout(request, arg2 = CLOUD_READ_TIMEOUT_MS, arg3 = "request") {
    const ms = typeof arg2 === "number" ? arg2 : CLOUD_READ_TIMEOUT_MS;
    const label = typeof arg2 === "string" ? arg2 : arg3;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let task = request;
    if (task && typeof task.abortSignal === "function" && controller) {
      task = task.abortSignal(controller.signal);
    }
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { controller?.abort?.(); } catch (_err) {}
        reject(new Error(`${label} belum memberi respons dari Supabase. Coba lagi beberapa saat atau refresh halaman.`));
      }, ms);
    });
    return Promise.race([Promise.resolve(task), timeout]).finally(() => clearTimeout(timer));
  }

  async function refreshCurrentSession(label = "Validasi sesi Supabase") {
    if (!supabaseClient) return null;
    const { data: sessionData, error: sessionError } = await withTimeout(supabaseClient.auth.getSession(), 15000, label);
    if (sessionError) throw sessionError;
    let session = sessionData?.session || null;
    if (!session) {
      currentSession = null;
      currentUser = null;
      return null;
    }

    const expiresAtMs = Number(session.expires_at || 0) * 1000;
    if (expiresAtMs && expiresAtMs - Date.now() < SESSION_REFRESH_BUFFER_MS) {
      const { data: refreshed, error: refreshError } = await withTimeout(supabaseClient.auth.refreshSession(), 15000, "Refresh sesi Supabase");
      if (refreshError) {
        throw new Error(`Sesi login perlu diperbarui. Masuk ulang lalu coba simpan lagi. Detail: ${refreshError.message}`);
      }
      session = refreshed?.session || session;
    }

    const previousUserId = currentUser?.id || null;
    currentSession = session;
    currentUser = session?.user || null;
    if (currentUser && previousUserId && currentUser.id !== previousUserId) {
      userProfile = null;
      await ensureProfile().catch(console.warn);
      await loadWorkspaces().catch(console.warn);
    }
    return session;
  }

  function explainCloudError(err) {
    const raw = `${err?.message || ""} ${err?.details || ""} ${err?.hint || ""}`.trim();
    const lower = raw.toLowerCase();
    if (lower.includes("jwt") || lower.includes("expired") || lower.includes("refresh") || lower.includes("session")) {
      return "Sesi login Supabase kedaluwarsa atau gagal refresh. Data form tetap aman di browser; masuk ulang lalu klik simpan lagi.";
    }
    if (lower.includes("row-level security") || lower.includes("rls") || lower.includes("permission denied") || lower.includes("not allowed")) {
      return "Data ditolak oleh RLS/policy Supabase. Pastikan akun masih anggota workspace aktif dan policy database sudah memakai versi repair terbaru.";
    }
    if (lower.includes("network") || lower.includes("failed to fetch") || lower.includes("timeout") || lower.includes("belum memberi respons")) {
      return "Koneksi ke Supabase timeout/terputus. Data form tetap aman; coba simpan ulang setelah koneksi stabil.";
    }
    return raw || "Supabase menolak request tanpa detail error.";
  }

  function isRetryableCloudError(err) {
    const lower = `${err?.message || ""} ${err?.details || ""} ${err?.hint || ""}`.toLowerCase();
    return lower.includes("jwt") || lower.includes("expired") || lower.includes("refresh") || lower.includes("network") || lower.includes("failed to fetch") || lower.includes("timeout") || lower.includes("belum memberi respons");
  }

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function scheduleSessionKeepAlive() {
    clearInterval(sessionKeepAliveTimer);
    if (!currentUser || !supabaseClient) return;
    sessionKeepAliveTimer = setInterval(() => {
      refreshCurrentSession("Jaga sesi Supabase")
        .then(session => {
          if (!session) clearInterval(sessionKeepAliveTimer);
        })
        .catch(err => console.warn("Supabase session keepalive failed", err));
    }, SESSION_KEEPALIVE_MS);
  }

  async function runCloudMutation(label, operation) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await prepareCloudWrite(label);
        const result = await withTimeout(operation(), CLOUD_WRITE_TIMEOUT_MS, label);
        if (result?.error) throw result.error;
        return result;
      } catch (err) {
        lastError = err;
        if (attempt === 0 && isRetryableCloudError(err)) {
          await refreshCurrentSession(`Retry ${label}`).catch(console.warn);
          await loadWorkspaces().catch(console.warn);
          await sleep(700);
          continue;
        }
        const friendly = explainCloudError(err);
        const wrapped = new Error(friendly);
        wrapped.originalError = err;
        throw wrapped;
      }
    }
    throw lastError;
  }

  async function prepareCloudWrite(label = "Simpan data") {
    if (!cloudReady || !supabaseClient) throw new Error("Supabase belum siap.");
    if (!currentUser) return;
    const session = await refreshCurrentSession(label);
    if (!session) throw new Error("Sesi login sudah habis. Silakan masuk ulang lalu coba simpan lagi.");
  }

  function createButtonWatchdog({ key, button, originalText, label, ms = CLOUD_WRITE_TIMEOUT_MS + 5000 }) {
    return setTimeout(() => {
      if (key === "brew") brewDraftSaving = false;
      if (key === "qa") qaSaving = false;
      if (key === "stock") stockSaving = false;
      if (key === "manual-brew") manualBrewSaving = false;
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
        button.setAttribute("aria-busy", "false");
      }
      if (key === "manual-brew") {
        setManualSaveState("failed", "FAILED / RETRY", "Supabase belum merespons. Draft tetap aman; periksa koneksi lalu coba lagi.");
        renderManualBrewPreview();
      }
      if (key === "qa") {
        setQASaveState("failed", "FAILED / RETRY", "Supabase belum merespons. Operasi yang tersisa tetap aman di antrean sinkronisasi.");
      }
      showMessage(`${label} belum selesai karena Supabase belum memberi respons. Tombol sudah diaktifkan kembali; coba ulangi atau refresh halaman.`, "error");
    }, ms);
  }

  async function handleLogout() {
    const btn = $("logoutBtn");
    const originalText = btn?.textContent || "Keluar";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Keluar...";
    }

    try {
      await recordAuditEvent("auth.logout", {
        category: "auth", entityType: "user", entityId: currentUser?.id || null,
        message: "Pengguna keluar dari dashboard."
      }).catch(console.warn);
      if (supabaseClient) {
        const logoutRequest = AUTH_SERVICE
          ? AUTH_SERVICE.signOut(supabaseClient)
          : supabaseClient.auth.signOut({ scope: "local" });
        const { error } = await withTimeout(logoutRequest, 2500, "logout");
        if (error) console.warn("logout warning", error);
      }
    } catch (err) {
      console.warn("logout fallback", err);
    } finally {
      clearLocalAuthState();
      renderWorkspaceUI();
      renderAll();
      EVENT_BUS.emit("auth:logout", {});
      showMessage("Berhasil keluar.", "success");
      setTimeout(() => window.location.reload(), 150);
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }

  async function createWorkspace(e) {
    e.preventDefault();
    if (!supabaseClient || !currentUser) return showMessage("Masuk terlebih dahulu untuk membuat workspace.", "error");

    const button = $("createWorkspaceBtn");
    const originalText = button?.textContent || "Buat Workspace";
    if (button) {
      button.disabled = true;
      button.textContent = "Membuat workspace...";
    }

    try {
      const name = $("workspaceName").value.trim();
      const slug = normalizeSlug($("workspaceSlug").value || name);
      if (!name || !slug) {
        showMessage("Nama workspace dan company wajib diisi.", "error");
        return;
      }

      const payload = {
        name,
        slug,
        visibility: $("workspaceVisibility")?.value || "public",
        description: $("workspaceDescription").value,
        created_by: currentUser.id
      };

      showMessage("Sedang membuat workspace...", "info");
      await prepareCloudWrite("Buat workspace");
      const { data, error } = await withTimeout(
        supabaseClient.from("workspaces").insert(payload).select().single(),
        CLOUD_WRITE_TIMEOUT_MS,
        "Buat workspace"
      );
      if (error) {
        const duplicate = /duplicate key|already exists|unique/i.test(error.message || "");
        showMessage(duplicate ? "Company sudah dipakai. Coba company lain." : `Gagal membuat workspace: ${error.message}`, "error");
        return;
      }

      await loadWorkspaces();
      await setActiveWorkspace(data.id);
      e.target.reset();
      showMessage("Workspace berhasil dibuat dan sudah menjadi workspace aktif. Kamu otomatis menjadi admin di workspace ini.", "success");
    } catch (err) {
      console.error(err);
      showMessage(`Gagal membuat workspace: ${err.message || err}`, "error");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  async function joinWorkspace() {
    if (!supabaseClient || !currentUser) return showMessage("Masuk terlebih dahulu untuk bergabung ke workspace.");
    const workspaceId = $("joinWorkspaceSelect").value;
    if (!workspaceId) return showMessage("Pilih workspace yang ingin diikuti.");
    await prepareCloudWrite("Join workspace");
    const { error } = await withTimeout(
      supabaseClient.from("workspace_members").insert({ workspace_id: workspaceId, user_id: currentUser.id, role: "brewer", status: "active" }),
      CLOUD_WRITE_TIMEOUT_MS,
      "Join workspace"
    );
    if (error) return showMessage(`Gagal bergabung ke workspace: ${error.message}`);
    await loadWorkspaces();
    await setActiveWorkspace(workspaceId);
    showMessage("Berhasil join sebagai brewer.");
  }

  function toSnakeStock(bean) {
    return {
      bean_code: bean.BeanID || null,
      coffee_name: bean.CoffeeName || "Kopi Tanpa Nama",
      origin: bean.Origin || null,
      producer: bean.Producer || null,
      variety: bean.Variety || null,
      variety2_optional: bean.Variety2_optional || null,
      process: bean.Process || null,
      roast_profile: bean.RoastProfile || null,
      flavor_family: bean.FlavorFamily || null,
      flavor_family2_optional: bean.FlavorFamily2_optional || null,
      flavor_family3_optional: bean.FlavorFamily3_optional || null,
      notes: bean.Notes || null,
      sweetness: Number(bean.Sweetness || 0),
      acidity: Number(bean.Acidity || 0),
      body: Number(bean.Body || 0),
      stock_g: Number(bean.Stock_g || 0),
      best_brew: bean.BestBrew || "Both",
      price: Number(bean.Price || 0),
      roast_date: bean.RoastDate || null,
      active: bean.Active || "Yes",
      visibility: "private",
      status: "private",
      moderation_status: "approved",
      workspace_id: activeWorkspaceId(),
      created_by: currentUser?.id || null,
      moderated_by: canModerate() ? currentUser?.id : null,
      moderated_at: canModerate() ? new Date().toISOString() : null,
      source_client_id: createClientId()
    };
  }

  function fromSnakeStock(row) {
    return {
      CloudID: row.id,
      BeanID: row.bean_code || `CLOUD-${String(row.id || "").slice(0, 8)}`,
      CoffeeName: row.coffee_name,
      Origin: row.origin,
      Producer: row.producer,
      Variety: row.variety,
      Variety2_optional: row.variety2_optional,
      Process: row.process,
      RoastProfile: row.roast_profile,
      FlavorFamily: row.flavor_family,
      FlavorFamily2_optional: row.flavor_family2_optional,
      FlavorFamily3_optional: row.flavor_family3_optional,
      Notes: row.notes,
      Sweetness: row.sweetness,
      Acidity: row.acidity,
      Body: row.body,
      Stock_g: row.stock_g,
      BestBrew: row.best_brew,
      Price: row.price,
      RoastDate: row.roast_date,
      Active: row.active || "Yes",
      WorkspaceID: row.workspace_id,
      CreatedBy: row.created_by,
      ModerationStatus: row.moderation_status || row.status || "approved",
      Visibility: row.visibility || "public",
      WorkspaceName: row.workspaces?.name || row.workspace_name || "",
      CreatedAt: row.created_at || "",
      UpdatedAt: row.updated_at || "",
      Source: "Supabase"
    };
  }

  function toSnakeBrew(log) {
    return {
      brew_code: log.BrewID,
      brew_date: log.Date || todayISO(),
      brewer_name: log.BrewerName || currentBrewerName(),
      bean_name: log.BeanName || null,
      origin: log.Origin || null,
      stock_bean_id: log.StockBeanID || null,
      stock_bean_code: log.StockBeanCode || null,
      stock_usage_g: log.StockUsage_g === "" ? null : Number(log.StockUsage_g || 0),
      variety: log.Variety || null,
      process: log.Process || null,
      roast_profile: log.RoastProfile || null,
      dripper: log.Dripper || null,
      method: log.Method || null,
      grinder: log.Grinder || null,
      grind_setting: log.GrindSetting || null,
      temp_c: Number(log.Temp_C || 0),
      ratio: Number(log.Ratio || 0),
      dose_g: Number(log.Dose_g || 0),
      total_water_ml: Number(log.TotalWater_ml || 0),
      hot_water_ml: Number(log.HotWater_ml || 0),
      ice_g: Number(log.Ice_g || 0),
      brew_time_sec: Number(log.BrewTime_sec || 0),
      bloom_ml: Number(log.Bloom_ml || 0),
      pour_count: Number(log.PourCount || 0),
      pour_plan: log.PourPlan || null,
      water: log.Water || null,
      tds_ppm: Number(log.TDS_ppm || 0),
      agitation: log.Agitation || null,
      filter_type: log.Filter || null,
      parent_brew_code: log.ParentBrewID || null,
      primary_variable_changed: log.PrimaryVariableChanged || null,
      hypothesis: log.Hypothesis || null,
      result_notes: log.ResultNotes || null,
      qa_code: log.QA_ID || null,
      qa_final: log.QA_Final === "" ? null : Number(log.QA_Final || 0),
      qa_status: log.QA_Status || null,
      manual_approval: log.ManualApproval || "No",
      approved_for_recipe: log.ApprovedForRecipe || "No",
      recipe_key: log.RecipeKey || null,
      current_match_score: log.CurrentMatchScore === "" ? null : Number(log.CurrentMatchScore || 0),
      water_formula_note: log.Water_Formula_Note || null,
      switch_valve_mode: log.SwitchValveMode || null,
      valve_plan: log.ValvePlan || null,
      visibility: "public",
      status: log.ModerationStatus || moderationStatusForBrew(log),
      moderation_status: log.ModerationStatus || moderationStatusForBrew(log),
      workspace_id: log.WorkspaceID || activeWorkspaceId() || DEFAULT_PUBLIC_WORKSPACE_ID,
      created_by: log.CreatedBy || currentUser?.id || null,
      moderated_by: canModerate() ? currentUser?.id : null,
      moderated_at: canModerate() ? new Date().toISOString() : null,
      source_client_id: createClientId()
    };
  }


  function toSnakeBrewQAUpdate(log) {
    return {
      primary_variable_changed: log.PrimaryVariableChanged || null,
      hypothesis: log.Hypothesis || null,
      result_notes: log.ResultNotes || null,
      qa_code: log.QA_ID || null,
      qa_final: log.QA_Final === "" ? null : Number(log.QA_Final || 0),
      qa_status: log.QA_Status || null,
      manual_approval: log.ManualApproval || "No",
      approved_for_recipe: log.ApprovedForRecipe || "No",
      status: log.ModerationStatus || moderationStatusForBrew(log),
      moderation_status: log.ModerationStatus || moderationStatusForBrew(log),
      moderated_by: canModerate() ? currentUser?.id : null,
      moderated_at: canModerate() ? new Date().toISOString() : null
    };
  }

  function fromSnakeBrew(row) {
    return {
      CloudID: row.id,
      BrewID: row.brew_code || `BL-${String(row.id || "").slice(0, 8)}`,
      Date: row.brew_date,
      BrewerName: row.brewer_name || "Brewer",
      BeanName: row.bean_name,
      Origin: row.origin,
      StockBeanID: row.stock_bean_id,
      StockBeanCode: row.stock_bean_code,
      StockUsage_g: row.stock_usage_g,
      Variety: row.variety,
      Process: row.process,
      RoastProfile: row.roast_profile,
      Dripper: row.dripper,
      Method: row.method,
      Grinder: row.grinder,
      GrindSetting: row.grind_setting,
      Temp_C: row.temp_c,
      Ratio: row.ratio,
      Dose_g: row.dose_g,
      TotalWater_ml: row.total_water_ml,
      HotWater_ml: row.hot_water_ml,
      Ice_g: row.ice_g,
      BrewTime_sec: row.brew_time_sec,
      Bloom_ml: row.bloom_ml,
      PourCount: row.pour_count,
      PourPlan: row.pour_plan,
      Water: row.water,
      TDS_ppm: row.tds_ppm,
      Agitation: row.agitation,
      Filter: row.filter_type,
      ParentBrewID: row.parent_brew_code,
      PrimaryVariableChanged: row.primary_variable_changed,
      Hypothesis: row.hypothesis,
      ResultNotes: row.result_notes,
      QA_ID: row.qa_code,
      QA_Final: row.qa_final,
      QA_Status: row.qa_status,
      ManualApproval: row.manual_approval,
      ApprovedForRecipe: row.approved_for_recipe,
      RecipeKey: row.recipe_key,
      CurrentMatchScore: row.current_match_score,
      Water_Formula_Note: row.water_formula_note,
      SwitchValveMode: row.switch_valve_mode,
      ValvePlan: row.valve_plan,
      WorkspaceID: row.workspace_id,
      CreatedBy: row.created_by,
      ModerationStatus: row.moderation_status || row.status || "approved",
      Visibility: row.visibility || "public",
      WorkspaceName: row.workspaces?.name || row.workspace_name || "",
      SourceClientID: row.source_client_id,
      Source: "Supabase"
    };
  }

  function toSnakeQA(qa) {
    return {
      qa_code: qa.QA_ID,
      brew_code: qa.BrewID,
      qa_date: qa.Date || todayISO(),
      evaluator: qa.Evaluator || null,
      aroma: Number(qa.Aroma || 0),
      flavor: Number(qa.Flavor || 0),
      aftertaste: Number(qa.Aftertaste || 0),
      acidity_quality: Number(qa.AcidityQuality || 0),
      sweetness: Number(qa.Sweetness || 0),
      body: Number(qa.Body || 0),
      balance: Number(qa.Balance || 0),
      clarity: Number(qa.Clarity || 0),
      finish: Number(qa.Finish || 0),
      defect_penalty: Number(qa.DefectPenalty || 0),
      consistency: Number(qa.Consistency || 0),
      final_qa: Number(qa.Final_QA || 0),
      status: qa.Status || null,
      approver: qa.Approver || null,
      qa_notes: qa.QA_Notes || null,
      primary_variable_changed: qa.PrimaryVariableChanged || null,
      hypothesis: qa.Hypothesis || null,
      result_notes: qa.ResultNotes || qa.QA_Notes || null,
      visibility: "public",
      moderation_status: qa.ModerationStatus || moderationStatusForQA(qa),
      workspace_id: qa.WorkspaceID || activeWorkspaceId() || DEFAULT_PUBLIC_WORKSPACE_ID,
      created_by: qa.CreatedBy || currentUser?.id || null,
      moderated_by: canModerate() ? currentUser?.id : null,
      moderated_at: canModerate() ? new Date().toISOString() : null,
      source_client_id: createClientId()
    };
  }

  function fromSnakeQA(row) {
    return {
      CloudID: row.id,
      QA_ID: row.qa_code,
      BrewID: row.brew_code,
      Date: row.qa_date,
      Evaluator: row.evaluator,
      Aroma: row.aroma,
      Flavor: row.flavor,
      Aftertaste: row.aftertaste,
      AcidityQuality: row.acidity_quality,
      Sweetness: row.sweetness,
      Body: row.body,
      Balance: row.balance,
      Clarity: row.clarity,
      Finish: row.finish,
      DefectPenalty: row.defect_penalty,
      Consistency: row.consistency,
      Final_QA: row.final_qa,
      Status: row.status,
      Approver: row.approver,
      QA_Notes: row.qa_notes,
      PrimaryVariableChanged: row.primary_variable_changed,
      Hypothesis: row.hypothesis,
      ResultNotes: row.result_notes,
      WorkspaceID: row.workspace_id,
      CreatedBy: row.created_by,
      ModerationStatus: row.moderation_status || "approved",
      SourceClientID: row.source_client_id,
      Source: "Supabase"
    };
  }

  async function initCloud() {
    cloudBootstrapPending = true;
    cloudBootstrapFailed = false;
    if (!isSupabaseConfigured()) {
      cloudReady = false;
      cloudBootstrapPending = false;
      updateDbStatus("offline", "Local fallback mode", "Supabase belum dikonfigurasi. Data hanya tersimpan di browser ini.");
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      cloudReady = false;
      cloudBootstrapPending = false;
      cloudBootstrapFailed = true;
      updateDbStatus("offline", "Supabase library tidak terbaca", "Cek koneksi internet atau CDN supabase-js.");
      return;
    }

    let clientCreated = false;
    try {
      updateDbStatus("syncing", "Menghubungkan ke Supabase...", "Membaca sesi pengguna, workspace, dan data publik yang sudah disetujui.");
      if (SUPABASE_SERVICE) {
        supabaseClient = SUPABASE_SERVICE.createClient({
          config: SUPABASE_CONFIG,
          library: window.supabase,
          storageAdapter: AUTH_STORAGE_ADAPTER,
          clientHeader: "v42-security-audit"
        });
      } else {
        const projectUrl = getSupabaseProjectUrl();
        const anonKey = getSupabaseAnonKey();
        supabaseClient = window.supabase.createClient(projectUrl, anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: AUTH_STORAGE_ADAPTER
          },
          global: {
            headers: { "x-coffee-dashboard-client": "v42-security-audit" }
          }
        });
      }
      clientCreated = true;
      cloudReady = true;
      await initAuth();
      await syncFromCloud(false);
      processPendingSyncQueue(false).catch(console.warn);
      updateDbStatus("online", "Supabase online", `Data publik yang sudah disetujui tersinkron. Sinkron terakhir: ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      cloudReady = false;
      cloudBootstrapFailed = true;
      if (!clientCreated) supabaseClient = null;
      const detail = err.message || "Cek config, schema, atau RLS policy.";
      const title = clientCreated ? "Supabase tersambung, sinkron awal gagal" : "Supabase gagal tersambung";
      updateDbStatus("offline", title, detail);
    } finally {
      cloudBootstrapPending = false;
    }
  }

  function uniqueByCloudId(rows) {
    const seen = new Set();
    return (rows || []).filter(row => {
      const key = row.CloudID || row.BrewID || row.QA_ID || JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function enrichBrewLogsWithQADetails(logs, qaRows) {
    const qaByBrew = new Map();
    (qaRows || []).forEach(qa => {
      if (!qa?.BrewID) return;
      const existing = qaByBrew.get(qa.BrewID);
      if (!existing || String(qa.Date || "") >= String(existing.Date || "")) qaByBrew.set(qa.BrewID, qa);
    });
    return (logs || []).map(log => {
      const qa = qaByBrew.get(log.BrewID);
      if (!qa) return log;
      return {
        ...log,
        QA_ID: log.QA_ID || qa.QA_ID,
        QA_Final: log.QA_Final ?? qa.Final_QA,
        QA_Status: log.QA_Status || qa.Status,
        PrimaryVariableChanged: log.PrimaryVariableChanged || qa.PrimaryVariableChanged || "",
        Hypothesis: log.Hypothesis || qa.Hypothesis || "",
        ResultNotes: log.ResultNotes || qa.ResultNotes || qa.QA_Notes || ""
      };
    });
  }

  function backgroundBrewLogQAUpdate(cloudId, payload, localLog) {
    if (!cloudId || !payload || !supabaseClient) return;
    updateCloudNoReturn("brew_logs", cloudId, payload, "Sinkronisasi detail Brew Log")
      .then(() => {
        if (localLog?.CloudID) {
          state.cloudBrewLogs = uniqueByCloudId([localLog, ...(state.cloudBrewLogs || []).filter(item => item.CloudID !== localLog.CloudID)]);
        }
      })
      .catch(err => {
        console.warn("Sinkronisasi detail Brew Log tertunda", err);
        enqueuePendingSyncBatch("Sinkronisasi detail Brew Log", [
          { type: "update", table: "brew_logs", id: cloudId, payload }
        ]);
        showMessage("QA sudah tersimpan. Pembaruan detail Brew Log masuk antrean sync dan dapat dicoba ulang dari status sinkronisasi.", "info");
      });
  }

  async function syncFromCloud(shouldRender = true) {
    if (!supabaseClient) throw new Error("Supabase belum aktif.");
    updateDbStatus("syncing", "Menyinkronkan data dari Supabase...", "Mengambil data privat workspace dan hasil seduhan publik terbaru.");

    const empty = { data: [], error: null };
    const workspaceId = activeWorkspaceId();

    const stockPromise = currentUser && workspaceId
      ? supabaseClient.from("stock_beans").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1000)
      : Promise.resolve(empty);

    const publicBrewPromise = supabaseClient.from("brew_logs").select("*").eq("visibility", "public").eq("moderation_status", "approved").order("brew_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000);

    const workspaceBrewPromise = currentUser && workspaceId
      ? supabaseClient.from("brew_logs").select("*").eq("workspace_id", workspaceId).order("brew_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000)
      : Promise.resolve(empty);

    const workspaceQaPromise = currentUser && workspaceId
      ? supabaseClient.from("qa_scores").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1000)
      : Promise.resolve(empty);

    const [stockRes, publicBrewRes, workspaceBrewRes, workspaceQaRes] = await withTimeout(Promise.all([stockPromise, publicBrewPromise, workspaceBrewPromise, workspaceQaPromise]), "Sinkronisasi Supabase");
    if (stockRes.error) throw stockRes.error;
    if (publicBrewRes.error) throw publicBrewRes.error;
    if (workspaceBrewRes.error) throw workspaceBrewRes.error;
    if (workspaceQaRes.error) throw workspaceQaRes.error;

    state.cloudStock = (stockRes.data || []).map(fromSnakeStock);
    state.cloudQA = (workspaceQaRes.data || []).map(fromSnakeQA);
    state.cloudBrewLogs = enrichBrewLogsWithQADetails(
      uniqueByCloudId([...(publicBrewRes.data || []).map(fromSnakeBrew), ...(workspaceBrewRes.data || []).map(fromSnakeBrew)]),
      state.cloudQA
    );
    cloudLastSync = new Date();
    cloudReady = true;
    updateDbStatus("online", "Supabase online", `Data workspace dan hasil seduhan publik tersinkron. Sinkron terakhir: ${cloudLastSync.toLocaleTimeString()}`);
    if (shouldRender) renderAll();
  }

  async function readCloudRowById(table, id, label = `Baca ${table}`) {
    const result = await withTimeout(
      supabaseClient.from(table).select("*").eq("id", id).single(),
      CLOUD_READ_TIMEOUT_MS,
      label
    );
    if (result?.error) throw result.error;
    if (!result?.data) throw new Error(`${label} tidak menemukan row ${id}.`);
    return result.data;
  }

  async function executeSyncMutation(mutation, label = "Sinkronisasi data") {
    const normalized = normalizeSyncMutation(mutation);
    if (normalized.type === "update") {
      return runCloudMutation(label, () => supabaseClient
        .from(normalized.table)
        .update(normalized.payload)
        .eq("id", normalized.id)
        .select()
        .single());
    }

    try {
      return await runCloudMutation(label, () => supabaseClient
        .from(normalized.table)
        .insert(normalized.payload)
        .select()
        .single());
    } catch (error) {
      if (!DATA_SAFETY?.isDuplicateKeyError?.(error)) throw error;
      const data = await readCloudRowById(normalized.table, normalized.id, `Verifikasi ulang ${normalized.table}`);
      return { data, error: null, replayed: true };
    }
  }

  async function insertCloud(table, payload, mapper) {
    if (!DATA_SAFETY?.ensureInsertIdentity) throw new Error("Data safety utility belum siap.");
    DATA_SAFETY.ensureInsertIdentity(payload);
    const { data } = await executeSyncMutation({ type: "insert", table, payload }, `Simpan ${table}`);
    return mapper(data);
  }

  async function updateCloud(table, id, payload, mapper) {
    const { data } = await runCloudMutation(`Update ${table}`, () => supabaseClient.from(table).update(payload).eq("id", id).select().single());
    return mapper(data);
  }

  async function updateCloudNoReturn(table, id, payload, label = "Update data") {
    await runCloudMutation(label, () => supabaseClient.from(table).update(payload).eq("id", id));
    return true;
  }

  function isActiveWorkspaceMember() {
    const workspaceId = activeWorkspaceId();
    return Boolean(currentUser && workspaceId && joinedWorkspaces.some(ws => ws.id === workspaceId));
  }

  function canUseWorkspaceModules() {
    return Boolean(cloudReady && supabaseClient && isActiveWorkspaceMember());
  }

  function canSubmitOnline() {
    return canUseWorkspaceModules();
  }

  function privateModuleMessage(moduleName = "fitur ini") {
    if (!cloudReady || !supabaseClient) return "Database belum tersambung. Hubungkan Supabase terlebih dahulu.";
    if (!currentUser) return `Silakan masuk untuk menggunakan ${moduleName}.`;
    if (!activeWorkspaceId()) return `Buat atau pilih workspace terlebih dahulu untuk menggunakan ${moduleName}.`;
    if (!isActiveWorkspaceMember()) return `Kamu belum menjadi anggota workspace aktif. Gabung atau pilih workspace lain untuk menggunakan ${moduleName}.`;
    return "";
  }

  function onlineSubmitHint() {
    return privateModuleMessage("fitur ini");
  }

  function workspaceStock() {
    if (!canUseWorkspaceModules()) return [];
    const workspaceId = activeWorkspaceId();
    return (state.cloudStock || []).filter(bean => bean.WorkspaceID === workspaceId || !bean.WorkspaceID);
  }

  function workspaceBrewLogs() {
    if (!canUseWorkspaceModules()) return [];
    const workspaceId = activeWorkspaceId();
    return (state.cloudBrewLogs || []).filter(log => log.WorkspaceID === workspaceId);
  }

  function workspaceQA() {
    if (!canUseWorkspaceModules()) return [];
    const workspaceId = activeWorkspaceId();
    return (state.cloudQA || []).filter(qa => qa.WorkspaceID === workspaceId);
  }

  function allStock() {
    return workspaceStock();
  }

  function stockOptionLabel(bean) {
    const name = bean.CoffeeName || bean.BeanID || "Kopi tanpa nama";
    const meta = [bean.Producer, bean.Origin, bean.Stock_g !== undefined ? `${bean.Stock_g}g` : ""].filter(Boolean).join(" · ");
    return meta ? `${name} · ${meta}` : name;
  }

  function selectedBrewStockBean() {
    const value = $("brewStockSelect")?.value || "non_stock";
    if (!value || value === "non_stock") return null;
    return allStock().find(bean => String(bean.CloudID || bean.BeanID) === String(value)) || null;
  }

  function setSelectIfAvailable(id, value) {
    const select = $(id);
    if (!select || !value) return;
    const hasOption = Array.from(select.options || []).some(opt => opt.value === value);
    if (hasOption) select.value = value;
  }

  function syncBrewStockUI({ apply = true } = {}) {
    const hasWorkspace = canUseWorkspaceModules();
    const stockWrap = $("brewStockWrap");
    const nameWrap = $("brewBeanNameWrap");
    const stockSelect = $("brewStockSelect");
    const stockBean = selectedBrewStockBean();
    const usingStock = Boolean(stockBean);

    setElementHidden(stockWrap, !hasWorkspace);
    setElementHidden(nameWrap, !hasWorkspace || usingStock);

    ["brewVariety", "brewProcess", "brewRoast"].forEach(id => {
      const el = $(id);
      if (el) el.disabled = hasWorkspace && usingStock;
    });

    if (!hasWorkspace) {
      if (stockSelect) stockSelect.value = "non_stock";
      return null;
    }

    if (stockBean && apply) {
      setSelectIfAvailable("brewVariety", stockBean.Variety);
      setProcessFieldValue("brewProcess", "brewProcessCustom", stockBean.Process);
      setSelectIfAvailable("brewRoast", stockBean.RoastProfile);
    }

    const hint = $("brewStockHint");
    if (hint) {
      const stockMeta = stockBean
        ? [stockBean.Origin, Number.isFinite(Number(stockBean.Stock_g)) ? `${Number(stockBean.Stock_g)}g tersedia` : ""].filter(Boolean).join(" · ")
        : "";
      hint.textContent = stockBean
        ? `Menggunakan stok: ${stockBean.CoffeeName || "Kopi"}${stockMeta ? ` · ${stockMeta}` : ""}. Brew log akan mengurangi stok sebesar dosis seduh.`
        : "Non-stok: isi nama kopi, lalu pilih varietas, proses pascapanen, dan profil sangrai secara manual.";
    }
    return stockBean;
  }

  function renderBrewStockOptions(force = false) {
    const select = $("brewStockSelect");
    if (!select) return;
    const hasWorkspace = canUseWorkspaceModules();
    const previous = select.value || "non_stock";
    const beans = hasWorkspace
      ? allStock().filter(bean => String(bean.Active || "Yes").toLowerCase() !== "no")
      : [];
    const signature = `${hasWorkspace}|${beans.map(bean => [bean.CloudID || bean.BeanID, bean.CoffeeName, bean.Stock_g, bean.Active].join(":"))}`;
    if (!force && signature === brewStockOptionsSignature) {
      syncBrewStockUI({ apply: false });
      return;
    }
    brewStockOptionsSignature = signature;
    const options = [`<option value="non_stock">Non Stock / Manual</option>`]
      .concat(beans.map(bean => `<option value="${html(bean.CloudID || bean.BeanID)}">${html(stockOptionLabel(bean))}</option>`));
    select.innerHTML = options.join("");
    const values = new Set(["non_stock", ...beans.map(bean => String(bean.CloudID || bean.BeanID))]);
    select.value = values.has(previous) ? previous : "non_stock";
    syncBrewStockUI({ apply: false });
  }

  function brewDateValue(log) {
    const rawDate = log?.Date || log?.BrewDate || "";
    const parsed = rawDate ? Date.parse(`${rawDate}T00:00:00`) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function brewCreatedValue(log) {
    const parsed = Date.parse(log?.CreatedAt || log?.created_at || log?.UpdatedAt || log?.updated_at || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function brewSerialValue(log) {
    const match = String(log?.BrewID || "").match(/(\d+)(?!.*\d)/);
    return match ? Number(match[1]) : 0;
  }

  function sortBrewNewest(rows) {
    return (rows || []).slice().sort((a, b) => {
      const dateDiff = brewDateValue(b) - brewDateValue(a);
      if (dateDiff) return dateDiff;
      const createdDiff = brewCreatedValue(b) - brewCreatedValue(a);
      if (createdDiff) return createdDiff;
      return brewSerialValue(b) - brewSerialValue(a);
    });
  }

  function allBrewLogs() {
    return workspaceBrewLogs();
  }

  function allQA() {
    return workspaceQA();
  }

  function getBy(list, key, value) {
    const target = norm(value);
    return (list || []).find(item => {
      if (norm(item[key]) === target) return true;
      return (item.Aliases || []).some(alias => norm(alias) === target);
    }) || {};
  }

  function makeOptions(select, values, opts = {}) {
    if (!select) return;
    const { blank = false, blankLabel = "—", selected = null } = opts;
    const finalValues = uniq(values).sort((a, b) => String(a).localeCompare(String(b)));
    select.innerHTML = `${blank ? `<option value="">${html(blankLabel)}</option>` : ""}${finalValues.map(v => `<option value="${html(v)}">${html(v)}</option>`).join("")}`;
    if (selected !== null && finalValues.includes(selected)) select.value = selected;
  }

  function hydrateSelects() {
    const varieties = (DATA.varieties || []).map(v => v.Variety);
    const processes = (DATA.processes || []).map(p => p.Process);
    const roasts = (DATA.roasts || []).map(r => r.RoastProfile);
    const drippers = (DATA.drippers || []).map(d => d.DripperName);
    const grinders = [...(DATA.grinders || []).map(g => g.Grinder), "Custom"];
    const waters = (DATA.waters || []).map(w => w.Water);
    const flavors = uniq([
      "All", "Fruity", "Floral", "Citrus", "Stone Fruit", "Tropical", "Berry", "Tea", "Chocolate", "Caramel", "Nutty", "Spicy", "Fermented", "Herbal", "Sweet"
    ]);

    makeOptions($("brewVariety"), varieties, { selected: varieties.includes("Catimor 129") ? "Catimor 129" : varieties[0] });
    makeOptions($("brewProcess"), processes, { selected: processes.includes("Carbonic Maceration - Original") ? "Carbonic Maceration - Original" : processes[0] });
    makeOptions($("brewRoast"), roasts, { selected: roasts.includes("Medium") ? "Medium" : roasts[0] });
    makeOptions($("brewDripper"), drippers, { selected: drippers.includes("Hario Switch 02 Glass") ? "Hario Switch 02 Glass" : drippers[0] });
    makeOptions($("brewGrinder"), grinders, { selected: grinders.includes("Hario EVCG-8B") ? "Hario EVCG-8B" : grinders[0] });
    makeOptions($("brewWater"), waters, { selected: waters.includes("Cleo 1:1 Le Minerale") ? "Cleo 1:1 Le Minerale" : waters[0] });

    makeOptions($("manualVariety"), varieties, { selected: varieties.includes("Catimor 129") ? "Catimor 129" : varieties[0] });
    makeOptions($("manualVariety2"), varieties, { blank: true, blankLabel: "Opsional / tidak ada" });
    makeOptions($("manualVariety3"), varieties, { blank: true, blankLabel: "Opsional / tidak ada" });
    makeOptions($("manualProcess"), processes, { selected: processes.includes("Natural") ? "Natural" : processes[0] });
    addCustomProcessOption($("manualProcess"));
    makeOptions($("manualRoast"), roasts, { selected: roasts.includes("Medium") ? "Medium" : roasts[0] });
    makeOptions($("manualDripper"), drippers, { selected: drippers.includes("Hario V60 02 Plastic") ? "Hario V60 02 Plastic" : drippers[0] });
    makeOptions($("manualGrinder"), grinders, { selected: grinders.includes("Custom") ? "Custom" : grinders[0] });
    makeOptions($("manualWater"), waters, { selected: waters.includes("Cleo 1:1 Le Minerale") ? "Cleo 1:1 Le Minerale" : waters[0] });

    ["filterVariety1", "filterVariety2", "stockVariety1", "stockVariety2"].forEach(id => makeOptions($(id), varieties, { blank: id.includes("2") || id.startsWith("filter"), blankLabel: id.includes("2") ? "Opsional" : "Semua" }));
    ["stockProcess"].forEach(id => {
      makeOptions($(id), processes);
      addCustomProcessOption($(id));
    });
    ["stockRoast"].forEach(id => makeOptions($(id), roasts));
    ["filterFlavor1", "filterFlavor2", "filterFlavor3", "stockFlavor1", "stockFlavor2", "stockFlavor3"].forEach(id => makeOptions($(id), flavors, { blank: id.includes("2") || id.includes("3"), blankLabel: "Opsional" }));

    if ($("filterFlavor1")) $("filterFlavor1").value = "Floral";
    if ($("filterFlavor2")) $("filterFlavor2").value = "";
    if ($("filterFlavor3")) $("filterFlavor3").value = "";
    if ($("stockFlavor1")) $("stockFlavor1").value = "Fruity";
    syncCustomProcessFields();
  }

  function knownDashboardContributorCount() {
    const accountIds = new Set();
    const guestKeys = new Set();
    const addAccount = (value) => {
      const key = String(value || "").trim();
      if (key) accountIds.add(`u:${key}`);
    };
    const addGuest = (value, prefix = "guest") => {
      const key = norm(value);
      if (key) guestKeys.add(`${prefix}:${key}`);
    };

    [state.cloudBrewLogs, state.cloudQA, state.cloudStock, state.userBrewLogs, state.userQA, state.userStock].forEach(rows => {
      (rows || []).forEach(row => {
        if (row.CreatedBy) {
          addAccount(row.CreatedBy);
          return;
        }
        addGuest(row.SourceClientID, "client");
        addGuest(row.Evaluator, "name");
        addGuest(row.BrewerName, "name");
      });
    });
    (userMemberships || []).forEach(ws => addAccount(ws.user_id));
    (workspaceMemberRows || []).forEach(row => addAccount(row.user_id));
    (pendingMemberRows || []).forEach(row => addAccount(row.user_id));
    if (currentUser?.id) addAccount(currentUser.id);

    return {
      accounts: accountIds.size,
      guests: guestKeys.size,
      total: accountIds.size + guestKeys.size
    };
  }

  function localDashboardUserCount() {
    return knownDashboardContributorCount().total;
  }

  function dashboardUserMetric() {
    const local = localDashboardUserCount();
    const remote = Number.isFinite(Number(dashboardUserCount)) ? Number(dashboardUserCount) : null;
    if (remote !== null) {
      return {
        value: Math.max(remote, local),
        hint: remote >= local
          ? "Dihitung dari RPC Supabase: akun profiles, workspace member, pemilik brew/QA/stok, dan kontributor guest."
          : "Dihitung dari data Supabase yang terbaca di dashboard; nilai lokal lebih tinggi dari RPC sehingga dipakai sebagai fallback aman."
      };
    }
    if (isSupabaseConfigured() && !cloudReady && local === 0) {
      return {
        value: "…",
        hint: "Sedang membaca jumlah pengguna dari Supabase. Jika tetap 0, jalankan migration get_dashboard_user_count terbaru."
      };
    }
    return {
      value: local,
      hint: "Fallback lokal: dihitung dari pemilik data brew log, QA, stok, workspace member yang bisa dibaca, dan user login saat ini."
    };
  }

  async function loadDashboardUserCount() {
    const local = localDashboardUserCount();
    if (!supabaseClient) {
      dashboardUserCount = local;
      dashboardUserCountSource = "local";
      return;
    }
    const { data, error } = await supabaseClient.rpc("get_dashboard_user_count");
    if (!error && Number.isFinite(Number(data))) {
      dashboardUserCount = Math.max(Number(data), local);
      dashboardUserCountSource = Number(data) >= local ? "supabase_rpc" : "local_fallback";
    } else {
      dashboardUserCount = local;
      dashboardUserCountSource = "local_fallback";
      console.warn("get_dashboard_user_count fallback", error);
    }
  }

  function homePermission(permission) {
    if (!permission) return true;
    if (SECURITY_SERVICE?.can) return SECURITY_SERVICE.can(currentRole, permission);
    const fallback = {
      guest: ["library:read", "public_brews:read", "suggestion:create"],
      brewer: ["stock:read", "stock:create", "brew:create", "qa:create"],
      qa: ["stock:read", "stock:create", "brew:create", "qa:create", "moderation:review"],
      admin: ["stock:read", "stock:create", "stock:manage", "brew:create", "qa:create", "moderation:review", "workspace:manage"]
    };
    return (fallback[currentRole] || fallback.guest).includes(permission);
  }

  function homeRoleKey() {
    if (!currentUser) return "guest";
    return ["admin", "brewer", "qa"].includes(currentRole) ? currentRole : "viewer";
  }

  function homeDateLabel(value, includeTime = false) {
    if (!value) return "Tanggal belum tersedia";
    try {
      const raw = String(value);
      const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const date = dateOnly
        ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
        : new Date(raw);
      if (Number.isNaN(date.getTime())) return raw.slice(0, 10) || "Tanggal belum tersedia";
      return new Intl.DateTimeFormat("id-ID", includeTime
        ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "short", year: "numeric" }).format(date);
    } catch (_error) {
      return String(value).slice(0, 10) || "Tanggal belum tersedia";
    }
  }

  function homeEmptyState(title, detail, action = null) {
    const button = action
      ? `<button class="secondary small-action" type="button" data-jump-tab="${html(action.tab)}">${html(action.label)}</button>`
      : "";
    return `<div class="v45-empty-state home-empty-state"><strong>${html(title)}</strong><p>${html(detail)}</p>${button}</div>`;
  }

  function homeStockSummary(rows) {
    if (HOME_VIEW?.summarizeStock) return HOME_VIEW.summarizeStock(rows, STOCK_SERVICE?.getStatus);
    const active = (rows || []).filter(item => String(item?.Active || "Yes").toLowerCase() !== "no");
    const entries = active.map(item => ({ item, status: STOCK_SERVICE?.getStatus?.(item.Stock_g, 15) || { key: Number(item.Stock_g || 0) > 0 ? "ready" : "empty", label: Number(item.Stock_g || 0) > 0 ? "Tersedia" : "Habis", cups: Math.floor(Number(item.Stock_g || 0) / 15) } }));
    return {
      active,
      entries,
      issues: entries.filter(entry => ["empty", "critical", "low"].includes(entry.status?.key)),
      activeCount: active.length,
      totalGram: active.reduce((sum, item) => sum + Math.max(0, Number(item.Stock_g || 0)), 0)
    };
  }

  function homeQASummary(qaRows, brewRows) {
    if (HOME_VIEW?.summarizeQA) return HOME_VIEW.summarizeQA(qaRows, brewRows);
    const linked = new Set((qaRows || []).map(row => String(row.BrewID || "")).filter(Boolean));
    const pendingBrews = (brewRows || []).filter(row => row.BrewID && !row.QA_ID && !linked.has(String(row.BrewID)));
    const values = (qaRows || []).map(row => Number(row.Final_QA || 0)).filter(Boolean);
    return {
      completedCount: (qaRows || []).length,
      pendingBrews,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      latest: (qaRows || []).slice().sort((a, b) => String(b.Date || "").localeCompare(String(a.Date || ""))).slice(0, 4)
    };
  }

  function homeDashboardData() {
    const role = homeRoleKey();
    const isGuest = role === "guest";
    const privateReady = !isGuest && canUseWorkspaceModules();
    const canReadStock = privateReady && homePermission("stock:read");
    const publicRows = isGuest ? publicApprovedRows() : [];
    const brewRows = privateReady ? allBrewLogs() : publicRows;
    const qaRows = privateReady ? allQA() : [];
    const stockRows = canReadStock ? workspaceStock() : [];
    const stock = homeStockSummary(stockRows);
    const qa = homeQASummary(qaRows, brewRows);
    const recentBrews = HOME_VIEW?.relevantBrews
      ? HOME_VIEW.relevantBrews(brewRows, { role, userId: currentUser?.id || "", limit: 5 })
      : sortBrewNewest(brewRows).slice(0, 5);
    const activity = HOME_VIEW?.buildActivity
      ? HOME_VIEW.buildActivity({ brews: brewRows, qa: qaRows, stock: stockRows, limit: 6 })
      : [];
    const publicScores = publicRows.map(row => Number(row.QA_Final || 0)).filter(Boolean);
    const libraryTotal = ["varieties", "processes", "roasts", "drippers", "filters", "waters", "grinders"]
      .reduce((sum, key) => sum + (DATA[key]?.length || 0), 0);
    const incompleteBrews = privateReady ? brewRows.filter(row => brewCompleteness(row) < 75) : [];
    const moderationPending = privateReady && canModerate()
      ? [...brewRows, ...qaRows].filter(row => norm(row.ModerationStatus || row.status || "pending") === "pending").length
      : 0;

    return Object.freeze({
      role,
      isGuest,
      privateReady,
      canReadStock,
      loading: cloudBootstrapPending && isSupabaseConfigured(),
      cloudFailed: cloudBootstrapFailed,
      brewRows,
      qaRows,
      stockRows,
      recentBrews,
      activity,
      stock,
      qa,
      incompleteBrews,
      moderationPending,
      pendingSyncCount: privateReady ? pendingSyncItems().length : 0,
      libraryTotal,
      publicAverageQA: publicScores.length ? publicScores.reduce((sum, value) => sum + value, 0) / publicScores.length : null,
      publicMethodCount: uniq(publicRows.map(row => row.Method).filter(Boolean)).length
    });
  }

  function homeHeaderCopy(model) {
    const copy = {
      admin: ["Ikhtisar operasional workspace", "Pantau inventori, aktivitas seduh, kualitas, dan pekerjaan yang perlu ditindaklanjuti."],
      brewer: ["Siap untuk seduhan berikutnya", "Lihat kopi yang tersedia, seduhan terbaru, umpan balik QA, dan langkah berikutnya."],
      qa: ["Antrean kualitas dan evaluasi", "Prioritaskan seduhan yang belum dinilai, status kualitas, dan tindak lanjut QA."],
      guest: ["Ringkasan akses publik", "Jelajahi hasil seduhan yang sudah disetujui dan lanjutkan ke fitur publik yang tersedia."],
      viewer: ["Ringkasan workspace", "Akses baca mengikuti workspace dan peran aktif saat ini."]
    };
    return copy[model.role] || copy.viewer;
  }

  function homeKpiItems(model) {
    const qaAverage = Number.isFinite(model.qa.average) ? fmt(model.qa.average, 2) : "—";
    if (model.isGuest) {
      return [
        { label: "Resep publik", value: model.brewRows.length, hint: "Hasil seduhan publik yang sudah lolos moderasi.", tone: "info" },
        { label: "Rata-rata QA publik", value: Number.isFinite(model.publicAverageQA) ? fmt(model.publicAverageQA, 2) : "—", hint: "Hanya dari hasil publik dengan nilai QA.", tone: "success" },
        { label: "Metode publik", value: model.publicMethodCount, hint: "Metode unik pada hasil seduhan publik.", tone: "info" },
        { label: "Referensi pustaka", value: model.libraryTotal, hint: "Total referensi lokal yang dapat dijelajahi.", tone: "info" }
      ];
    }
    if (model.role === "qa") {
      return [
        { label: "Menunggu QA", value: model.qa.pendingBrews.length, hint: "Brew workspace tanpa evaluasi QA terhubung.", tone: model.qa.pendingBrews.length ? "warning" : "success" },
        { label: "Rata-rata QA", value: qaAverage, hint: "Rata-rata evaluasi QA yang sudah tersimpan.", tone: "success" },
        { label: "QA selesai", value: model.qa.completedCount, hint: "Jumlah evaluasi QA di workspace aktif.", tone: "info" },
        { label: "Brew tercatat", value: model.brewRows.length, hint: "Total aktivitas seduh di workspace aktif.", tone: "info" }
      ];
    }
    return [
      { label: "Kopi aktif", value: model.stock.activeCount, hint: "Bean aktif yang tersedia untuk alur seduh.", tone: model.stock.issues.length ? "warning" : "success" },
      { label: "Stok tersedia", value: `${fmt(model.stock.totalGram)} g`, hint: "Total gram dari seluruh bean aktif.", tone: model.stock.issues.length ? "warning" : "success" },
      { label: model.role === "brewer" ? "Aktivitas seduh" : "Brew tercatat", value: model.brewRows.length, hint: "Total aktivitas seduh di workspace aktif.", tone: "info" },
      { label: "Rata-rata QA", value: qaAverage, hint: "Rata-rata evaluasi QA yang sudah tersimpan.", tone: "success" }
    ];
  }

  function homeAttentionItems(model) {
    if (model.isGuest) {
      return [{ key: "public", tone: "info", title: "Mode publik aktif", detail: "Hanya hasil yang sudah disetujui dan referensi publik yang ditampilkan.", marker: "i", label: "Info", tab: "public-brews", action: "Lihat hasil" }];
    }
    if (!model.privateReady) {
      return [{ key: "workspace", tone: "warning", title: "Workspace belum siap", detail: privateModuleMessage("ringkasan operasional"), marker: "!", label: "Perhatian", tab: "admin", action: "Atur akses" }];
    }

    const stockNames = model.stock.issues.slice(0, 3).map(entry => entry.item?.CoffeeName || entry.item?.BeanID).filter(Boolean);
    const items = {
      stock: model.canReadStock && model.stock.issues.length ? {
        key: "stock", tone: model.stock.issues.some(entry => ["empty", "critical"].includes(entry.status?.key)) ? "danger" : "warning",
        title: `${model.stock.issues.length} stok perlu diperiksa`, detail: stockNames.length ? `${stockNames.join(", ")}${model.stock.issues.length > stockNames.length ? ", dan lainnya" : ""}.` : "Ada stok rendah atau habis.",
        marker: "!", label: "Stok", tab: "stock", action: "Buka inventori"
      } : null,
      qa: model.qa.pendingBrews.length ? {
        key: "qa", tone: "warning", title: `${model.qa.pendingBrews.length} seduhan menunggu QA`, detail: "Evaluasi seduhan agar hasil dan langkah dial-in berikutnya tetap terhubung.", marker: "!", label: "QA", tab: "qa", action: "Buka QA"
      } : null,
      moderation: model.moderationPending ? {
        key: "moderation", tone: "warning", title: `${model.moderationPending} item menunggu moderasi`, detail: "Tinjau status brew atau QA sesuai wewenang peran aktif.", marker: "!", label: "Moderasi", tab: "admin", action: "Tinjau"
      } : null,
      incomplete: model.incompleteBrews.length ? {
        key: "incomplete", tone: "warning", title: `${model.incompleteBrews.length} catatan belum lengkap`, detail: "Lengkapi parameter penting sebelum catatan dipakai sebagai referensi.", marker: "!", label: "Data", tab: "qa", action: "Periksa log"
      } : null,
      sync: model.pendingSyncCount ? {
        key: "sync", tone: "danger", title: `${model.pendingSyncCount} antrean belum tersinkron`, detail: "Data tetap tersimpan lokal. Gunakan Sync ulang ketika koneksi stabil.", marker: "!", label: "Sinkronisasi"
      } : null
    };
    const order = model.role === "qa"
      ? ["qa", "moderation", "incomplete", "sync", "stock"]
      : model.role === "brewer"
        ? ["stock", "qa", "sync", "incomplete"]
        : ["stock", "qa", "moderation", "sync", "incomplete"];
    const result = order.map(key => items[key]).filter(Boolean);
    return result.length ? result : [{ key: "ready", tone: "success", title: "Tidak ada prioritas mendesak", detail: "Stok, QA, dan antrean sinkronisasi yang terbaca berada dalam kondisi siap.", marker: "✓", label: "Siap" }];
  }

  function homeQuickActionItems(model) {
    const definitions = {
      admin: [
        { tab: "stock", label: "Kelola inventori", detail: "Periksa stok dan ketersediaan.", permission: "stock:manage" },
        { tab: "qa", label: "Tinjau Brew & QA", detail: "Selesaikan evaluasi dan moderasi.", permission: "moderation:review" },
        { tab: "analytics", label: "Buka analitik", detail: "Baca pola operasional workspace." },
        { tab: "admin", label: "Kelola workspace", detail: "Periksa akses dan anggota.", permission: "workspace:manage" }
      ],
      brewer: [
        { tab: "brew", label: "Brew Recommendation", detail: "Bangun baseline resep berikutnya.", permission: "brew:create" },
        { tab: "input-seduhan", label: "Catat seduhan", detail: "Simpan eksperimen manual.", permission: "brew:create" },
        { tab: "stock", label: "Lihat kopi tersedia", detail: "Cek stok sebelum menyeduh.", permission: "stock:read" },
        { tab: "qa", label: "Isi evaluasi QA", detail: "Hubungkan feedback ke brew.", permission: "qa:create" }
      ],
      qa: [
        { tab: "qa", label: "Buka antrean QA", detail: "Nilai seduhan yang tertunda.", permission: "qa:create" },
        { tab: "quality", label: "Periksa notifikasi", detail: "Tinjau issue kualitas data.", permission: "moderation:review" },
        { tab: "analytics", label: "Baca tren kualitas", detail: "Bandingkan hasil yang tersimpan." },
        { tab: "brew", label: "Buat baseline", detail: "Siapkan pembanding seduhan.", permission: "brew:create" }
      ],
      guest: [
        { tab: "brew", label: "Coba rekomendasi", detail: "Susun baseline tanpa data privat.", public: true },
        { tab: "public-brews", label: "Hasil seduhan publik", detail: "Baca resep yang sudah disetujui.", permission: "public_brews:read", public: true },
        { tab: "library", label: "Jelajahi pustaka", detail: "Buka referensi kopi dan alat.", permission: "library:read", public: true },
        { tab: "suggestion", label: "Kirim saran", detail: "Berikan masukan untuk dashboard.", permission: "suggestion:create", public: true }
      ],
      viewer: [
        { tab: "admin", label: "Periksa akses", detail: "Lihat status workspace aktif." },
        { tab: "guide", label: "Buka panduan", detail: "Pelajari alur sesuai peran." }
      ]
    };
    if (!model.isGuest && !model.privateReady) return definitions.viewer;
    return (definitions[model.role] || definitions.viewer).filter(item => item.public || !item.permission || homePermission(item.permission));
  }

  function renderHomeLoading() {
    const root = $("homeCommandCenter");
    if (!root) return;
    root.dataset.homeState = "loading";
    root.setAttribute("aria-busy", "true");
    if ($("homeDashboardTitle")) $("homeDashboardTitle").textContent = "Menyiapkan ringkasan operasional";
    if ($("homeDashboardSubtitle")) $("homeDashboardSubtitle").textContent = "Membaca sesi, workspace, dan data yang tersedia.";
    if ($("homeContextBadges")) $("homeContextBadges").innerHTML = `<span class="v45-badge v45-badge--info">Memuat data</span>`;
    if ($("homeStatusAlert")) $("homeStatusAlert").innerHTML = "";
    if ($("homeAttentionCount")) {
      $("homeAttentionCount").textContent = "Memuat";
      $("homeAttentionCount").className = "v45-badge v45-badge--info";
    }
    if ($("homeKpiGrid")) $("homeKpiGrid").innerHTML = Array.from({ length: 4 }, () => `<article class="v45-kpi-card home-loading-card" aria-hidden="true"><span class="v45-skeleton"></span><span class="v45-skeleton"></span><span class="v45-skeleton"></span></article>`).join("");
    const skeleton = `<span class="v45-skeleton" style="width:42%"></span><span class="v45-skeleton" style="width:88%"></span><span class="v45-skeleton" style="width:68%"></span>`;
    if ($("homeAttentionList")) $("homeAttentionList").innerHTML = `<li class="home-loading-card" aria-hidden="true">${skeleton}</li>`;
    if ($("homeQuickActions")) $("homeQuickActions").innerHTML = `<div class="home-loading-card" aria-hidden="true">${skeleton}</div>`;
    if ($("homeRecentBrews")) $("homeRecentBrews").innerHTML = `<div class="home-loading-card" aria-hidden="true">${skeleton}</div>`;
    if ($("homeQaSnapshot")) $("homeQaSnapshot").innerHTML = `<div class="home-loading-card" aria-hidden="true">${skeleton}</div>`;
    if ($("homeStockHealth")) $("homeStockHealth").innerHTML = `<div class="home-loading-card" aria-hidden="true">${skeleton}</div>`;
    if ($("homeActivityList")) $("homeActivityList").innerHTML = `<li class="home-loading-card" aria-hidden="true">${skeleton}</li>`;
  }

  function renderHomeHeader(model) {
    const [title, subtitle] = homeHeaderCopy(model);
    if ($("homeDashboardTitle")) $("homeDashboardTitle").textContent = title;
    if ($("homeDashboardSubtitle")) $("homeDashboardSubtitle").textContent = subtitle;
    const syncLabel = model.cloudFailed ? "Sinkronisasi terbatas" : cloudReady ? "Tersinkron" : "Mode lokal";
    const syncClass = model.cloudFailed ? "v45-badge--warning" : cloudReady ? "v45-badge--success" : "v45-badge--info";
    const badges = [
      `<span class="v45-badge v45-badge--info">${html(roleDisplayLabel(model.role))}</span>`,
      model.isGuest ? `<span class="v45-badge">Akses publik</span>` : `<span class="v45-badge">${html(currentWorkspace?.name || "Belum ada workspace")}</span>`,
      `<span class="v45-badge ${syncClass}">${html(syncLabel)}</span>`
    ];
    if ($("homeContextBadges")) $("homeContextBadges").innerHTML = badges.join("");

    let alertMarkup = "";
    if (model.cloudFailed) {
      alertMarkup = `<div class="v45-alert v45-alert--warning"><div><strong>Data online belum dapat dimuat.</strong><br><small>Status yang tersedia mungkin belum lengkap. Coba sinkronisasi lagi saat koneksi stabil.</small></div></div>`;
    } else if (!model.isGuest && !model.privateReady) {
      alertMarkup = `<div class="v45-alert v45-alert--warning"><div><strong>Ringkasan workspace belum tersedia.</strong><br><small>${html(privateModuleMessage("ringkasan operasional"))}</small></div></div>`;
    }
    if ($("homeStatusAlert")) $("homeStatusAlert").innerHTML = alertMarkup;
  }

  function renderHomeKpis(model) {
    const target = $("homeKpiGrid");
    if (!target) return;
    target.innerHTML = homeKpiItems(model).map(item => `
      <article class="v45-kpi-card home-kpi-card" data-tone="${html(item.tone || "info")}" title="${html(item.hint)}">
        <span class="home-kpi-card__label">${html(item.label)}</span>
        <strong>${html(item.value)}</strong>
        <small>${html(item.hint)}</small>
      </article>`).join("");
  }

  function renderHomeAttention(model) {
    const target = $("homeAttentionList");
    if (!target) return;
    const items = homeAttentionItems(model);
    const actionableCount = items.filter(item => !["success", "info"].includes(item.tone)).length;
    if ($("homeAttentionCount")) {
      $("homeAttentionCount").textContent = actionableCount ? `${actionableCount} item` : "Terkendali";
      $("homeAttentionCount").className = `v45-badge ${actionableCount ? "v45-badge--warning" : "v45-badge--success"}`;
    }
    target.innerHTML = items.map(item => {
      const action = item.tab && item.action ? `<button class="secondary small-action" type="button" data-jump-tab="${html(item.tab)}">${html(item.action)}</button>` : "";
      return `<li class="home-attention-item" data-tone="${html(item.tone)}">
        <span class="home-attention-item__marker" aria-hidden="true">${html(item.marker)}</span>
        <div><span class="v45-badge ${item.tone === "danger" ? "v45-badge--danger" : item.tone === "warning" ? "v45-badge--warning" : item.tone === "success" ? "v45-badge--success" : "v45-badge--info"}">${html(item.label)}</span><strong>${html(item.title)}</strong><small>${html(item.detail)}</small></div>
        ${action}
      </li>`;
    }).join("");
  }

  function renderHomeQuickActions(model) {
    const target = $("homeQuickActions");
    if (!target) return;
    const actions = homeQuickActionItems(model);
    target.innerHTML = actions.map((item, index) => `<button class="${index === 0 ? "primary" : "secondary"} home-quick-action" type="button" data-jump-tab="${html(item.tab)}"><span>${html(item.label)}</span><small>${html(item.detail)}</small></button>`).join("");
  }

  function renderHomeRecentBrews(model) {
    const target = $("homeRecentBrews");
    if (!target) return;
    const action = $("homeRecentBrewsAction");
    if (action) {
      action.dataset.jumpTab = model.isGuest ? "public-brews" : "qa";
      action.textContent = model.isGuest ? "Buka Hasil Publik" : "Buka Brew Log";
    }
    if (!model.recentBrews.length) {
      target.innerHTML = model.isGuest
        ? homeEmptyState("Belum ada hasil seduhan publik.", "Hasil yang sudah disetujui akan tampil di sini.", { tab: "brew", label: "Coba rekomendasi" })
        : model.privateReady
          ? homeEmptyState("Belum ada seduhan tercatat.", "Catat seduhan pertama untuk mulai membangun riwayat operasional.", { tab: "input-seduhan", label: "Catat seduhan" })
          : homeEmptyState("Data seduhan belum tersedia.", "Pilih workspace aktif untuk membuka aktivitas seduh.", { tab: "admin", label: "Atur workspace" });
      return;
    }
    target.innerHTML = model.recentBrews.map(log => {
      const score = Number(log.QA_Final || 0);
      const qaBadge = score
        ? `<span class="v45-badge ${score >= APPROVAL_THRESHOLD ? "v45-badge--success" : "v45-badge--warning"}">QA ${html(fmt(score, 2))}</span>`
        : `<span class="v45-badge">Belum QA</span>`;
      const profile = [log.Variety, log.Process, log.RoastProfile].filter(Boolean).join(" · ") || "Profil belum lengkap";
      const method = [log.Method, log.Dripper].filter(Boolean).join(" · ") || "Metode belum diisi";
      const recipe = [log.Dose_g ? `${fmt(log.Dose_g)} g` : "", log.TotalWater_ml ? `${fmt(log.TotalWater_ml)} ml` : "", log.Temp_C ? `${fmt(log.Temp_C)}°C` : ""].filter(Boolean).join(" · ") || "Resep belum lengkap";
      return `<article class="home-brew-row">
        <time class="home-brew-row__date" datetime="${html(log.Date || "")}">${html(homeDateLabel(log.Date))}</time>
        <div class="home-brew-row__name"><strong>${html(log.BeanName || log.BrewID || "Seduhan tanpa nama")}</strong><small>${html(profile)}</small></div>
        <span class="home-brew-row__meta">${html(method)}</span>
        <span class="home-brew-row__recipe">${html(recipe)}</span>
        <span class="home-brew-row__qa">${qaBadge}</span>
      </article>`;
    }).join("");
  }

  function renderHomeStock(model) {
    const panel = document.querySelector(".home-panel--stock");
    const visible = !model.isGuest && model.canReadStock;
    setElementHidden(panel, !visible);
    if (!visible) return;
    const target = $("homeStockHealth");
    if (!target) return;
    setElementHidden($("homeStockAction"), !model.privateReady);
    if (!model.stock.entries.length) {
      target.innerHTML = homeEmptyState("Inventori masih kosong.", "Tambahkan kopi pertama agar tim dapat melihat ketersediaan bahan.", { tab: "stock", label: "Buka inventori" });
      return;
    }
    target.innerHTML = model.stock.entries.slice(0, 5).map(({ item, status }) => {
      const badgeClass = status?.key === "ready" ? "v45-badge--success" : status?.key === "empty" ? "v45-badge--danger" : "v45-badge--warning";
      return `<article class="home-stock-item">
        <div><strong>${html(item.CoffeeName || item.BeanID || "Kopi tanpa nama")}</strong><small><span class="v45-badge ${badgeClass}">${html(status?.label || "Status tidak tersedia")}</span> · ${html([item.Origin, item.RoastProfile].filter(Boolean).join(" · ") || "Profil belum lengkap")}</small></div>
        <div class="home-stock-item__measure"><strong>${html(fmt(item.Stock_g))} g</strong><small>${html(status?.cups ?? 0)} seduhan @15 g</small></div>
      </article>`;
    }).join("");
  }

  function renderHomeQA(model) {
    const panel = document.querySelector(".home-panel--qa");
    const visible = !model.isGuest && model.privateReady && homePermission("qa:create");
    setElementHidden(panel, !visible);
    if (!visible) return;
    const target = $("homeQaSnapshot");
    if (!target) return;
    const average = Number.isFinite(model.qa.average) ? fmt(model.qa.average, 2) : "—";
    const summary = `<div class="home-qa-summary"><div><strong>${html(average)}</strong><span>Rata-rata QA</span></div><div><strong>${html(model.qa.completedCount)}</strong><span>Evaluasi selesai</span></div><div><strong>${html(model.qa.pendingBrews.length)}</strong><span>Menunggu QA</span></div></div>`;
    if (!model.qa.latest.length) {
      target.innerHTML = `${summary}${homeEmptyState("Belum ada evaluasi QA.", "Nilai seduhan pertama untuk membangun snapshot kualitas.", { tab: "qa", label: "Mulai QA" })}`;
      return;
    }
    target.innerHTML = `${summary}<div>${model.qa.latest.map(item => `<article class="home-qa-item"><div><strong>${html(item.BrewID || item.QA_ID || "Evaluasi QA")}</strong><small>${html(item.Evaluator || "Evaluator belum dicatat")} · ${html(homeDateLabel(item.Date))}</small></div><div class="home-qa-item__score"><strong>${html(fmt(item.Final_QA, 2))}</strong><small>${html(item.Status || "Status QA")}</small></div></article>`).join("")}</div>`;
  }

  function renderHomeActivity(model) {
    const target = $("homeActivityList");
    if (!target) return;
    const title = $("homeActivityTitle");
    if (title) title.textContent = model.isGuest ? "Publik terbaru" : "Aktivitas terbaru";
    if (!model.activity.length) {
      target.innerHTML = `<li>${homeEmptyState(model.isGuest ? "Belum ada aktivitas publik." : "Belum ada aktivitas workspace.", model.isGuest ? "Hasil seduhan yang disetujui akan muncul di sini." : "Aktivitas brew, QA, dan inventori akan tampil setelah data tersimpan.")}</li>`;
      return;
    }
    target.innerHTML = model.activity.map(item => `<li class="home-activity-item" data-type="${html(item.type)}"><span class="home-activity-dot" aria-hidden="true"></span><div><strong>${html(item.title)}</strong><small>${html(item.detail)}</small></div><time datetime="${html(item.date || "")}">${html(homeDateLabel(item.date, String(item.date || "").includes("T")))}</time></li>`).join("");
  }

  function renderMetrics() {
    const root = $("homeCommandCenter");
    if (!root) return;
    const model = homeDashboardData();
    root.dataset.homeRole = model.role;
    if (model.loading) {
      renderHomeLoading();
      return;
    }
    root.dataset.homeState = model.cloudFailed ? "partial" : "ready";
    root.setAttribute("aria-busy", "false");
    renderHomeHeader(model);
    renderHomeKpis(model);
    renderHomeAttention(model);
    renderHomeQuickActions(model);
    renderHomeRecentBrews(model);
    renderHomeStock(model);
    renderHomeQA(model);
    renderHomeActivity(model);
  }

  function resolveSwitchMode() {
    const dripper = $("brewDripper").value;
    const selected = $("switchValveMode").value;
    if (!isSwitch(dripper)) return "-";
    if (selected === "Auto") return $("brewMode").value === "Japanese Iced" ? "Hybrid" : "Hybrid";
    return selected;
  }

  function numberField(row, field, fallback = 0) {
    const value = Number(row?.[field]);
    return Number.isFinite(value) ? value : fallback;
  }

  function roastWeight(roast = {}) {
    const text = `${roast.RoastProfile || ""} ${roast.Level || ""}`.toLowerCase();
    if (/very light|cinnamon|nordic/.test(text)) return -2;
    if (/light/.test(text)) return -1;
    if (/medium light|medium-light/.test(text)) return -0.5;
    if (/medium dark|medium-dark/.test(text)) return 1;
    if (/dark|italian|french/.test(text)) return 2;
    if (/medium/.test(text)) return 0;
    return 0;
  }

  function waterMineralBand(tds) {
    if (tds < 35) return "soft";
    if (tds > 220) return "hard";
    if (tds >= 70 && tds <= 160) return "balanced";
    return "moderate";
  }

  function brewIntent({ acidity, sweetness, body, fruity, floral, risk, roastTone, mode }) {
    const cues = [];
    if (floral >= 4 || acidity >= 4) cues.push("clarity");
    if (sweetness >= 4) cues.push("sweetness");
    if (body >= 4 || roastTone > 0.8) cues.push("body");
    if (fruity >= 4 || risk >= 4) cues.push("fruit");
    const primary = cues[0] || (mode === "Japanese Iced" ? "refreshing clarity" : "balanced sweetness");
    const labelMap = {
      clarity: "Clarity-forward",
      sweetness: "Sweetness-first",
      body: "Body & comfort",
      fruit: "Fruit expression",
      "refreshing clarity": "Refreshing clarity",
      "balanced sweetness": "Balanced sweetness"
    };
    return { primary, label: labelMap[primary] || "Balanced sweetness", cues };
  }


  function inferProcessProfile(processName = "") {
    const text = norm(processName);
    if (!text) return {};
    const contains = (...words) => words.some(word => text.includes(word));
    const row = {
      Process: processName,
      Category: "Custom / Inferred",
      Stage: "Custom post-harvest process inferred from label keywords",
      AcidityMod: 0,
      SweetnessMod: 0,
      BodyMod: 0,
      FruityMod: 0,
      FloralMod: 0,
      SpicyMod: 0,
      FermentRisk_1low_5high: 2,
      TempMod_C: 0,
      GrindMod_coarser: 0,
      RatioMod_ml_per_g: 0,
      BrewTimeMod_sec: 0,
      TransparencyNote: "Process tidak ada di pustaka utama. Dashboard memakai keyword guardrail sementara; validasi dengan tasting dan update pustaka bila proses sering digunakan.",
      BrewingCue: "start conservative; validate by taste",
      Inferred: true
    };

    if (contains("natural")) {
      row.Category = "Natural / Inferred";
      row.Stage = "Whole cherry / dry process inferred from label";
      row.SweetnessMod += 1;
      row.BodyMod += 1;
      row.FruityMod += 1;
      row.FermentRisk_1low_5high = Math.max(row.FermentRisk_1low_5high, 3);
      row.TempMod_C -= 0.5;
      row.BrewingCue = "low-medium agitation; protect fruit sweetness";
    }
    if (contains("fermented", "ferment", "extended", "long")) {
      row.Category = "Extended Fermentation / Inferred";
      row.FruityMod += 1;
      row.SweetnessMod += 1;
      row.FermentRisk_1low_5high = Math.max(row.FermentRisk_1low_5high, 4);
      row.TempMod_C -= 1.2;
      row.GrindMod_coarser += 1;
      row.RatioMod_ml_per_g -= 0.3;
      row.BrewTimeMod_sec += 10;
      row.BrewingCue = "cooler water; fewer pours; avoid aggressive swirl";
    }
    if (contains("anaerobic", "anoxic", "oxygen")) {
      row.Category = "Anaerobic / Inferred";
      row.FruityMod += 2;
      row.SweetnessMod += 1;
      row.BodyMod += 1;
      row.FermentRisk_1low_5high = 5;
      row.TempMod_C -= 2;
      row.GrindMod_coarser += 2;
      row.RatioMod_ml_per_g -= 0.5;
      row.BrewTimeMod_sec += 20;
      row.BrewingCue = "lower temp; coarse; low agitation";
    }
    if (contains("carbonic", "maceration", "cm")) {
      row.Category = "Carbonic Maceration / Inferred";
      row.FruityMod += 2;
      row.FloralMod += 1;
      row.FermentRisk_1low_5high = 5;
      row.TempMod_C -= 2;
      row.GrindMod_coarser += 2;
      row.RatioMod_ml_per_g -= 0.5;
      row.BrewingCue = "aroma first; cooler water; gentle pulses";
    }
    if (contains("co-ferment", "coferment", "infused", "infusion", "fruit")) {
      row.Category = "Co-ferment / Inferred";
      row.FruityMod += 2;
      row.SweetnessMod += 1;
      row.FermentRisk_1low_5high = 5;
      row.TempMod_C -= 2;
      row.GrindMod_coarser += 2;
      row.RatioMod_ml_per_g -= 0.6;
      row.BrewingCue = "cooler water; protect aromatics; monitor artificial/boozy notes";
    }
    if (contains("honey")) {
      row.Category = "Honey / Inferred";
      row.SweetnessMod += 1;
      row.BodyMod += 1;
      row.FermentRisk_1low_5high = Math.max(row.FermentRisk_1low_5high, 3);
      row.RatioMod_ml_per_g -= 0.1;
      row.BrewingCue = "steady pour; balance sweetness and clean finish";
    }
    if (contains("washed", "wet")) {
      row.Category = "Washed / Inferred";
      row.AcidityMod += 1;
      row.BodyMod -= 1;
      row.FermentRisk_1low_5high = Math.min(row.FermentRisk_1low_5high, 2);
      row.TempMod_C += 0.4;
      row.RatioMod_ml_per_g += 0.2;
      row.BrewingCue = "clarity-friendly; use stable pulse";
    }
    if (contains("thermal", "shock")) {
      row.Category = "Thermal Shock / Inferred";
      row.FruityMod += 1;
      row.SweetnessMod += 1;
      row.FermentRisk_1low_5high = Math.max(row.FermentRisk_1low_5high, 4);
      row.TempMod_C -= 1.4;
      row.GrindMod_coarser += 1;
      row.BrewingCue = "cooler water; gentle pour; avoid over-extraction";
    }

    row.AcidityMod = clamp(row.AcidityMod, -2, 2);
    row.SweetnessMod = clamp(row.SweetnessMod, -1, 3);
    row.BodyMod = clamp(row.BodyMod, -2, 2);
    row.FruityMod = clamp(row.FruityMod, -1, 3);
    row.FloralMod = clamp(row.FloralMod, -1, 2);
    row.FermentRisk_1low_5high = clamp(row.FermentRisk_1low_5high, 1, 5);
    row.TempMod_C = clamp(row.TempMod_C, -3, 1.5);
    row.GrindMod_coarser = clamp(row.GrindMod_coarser, -1, 3);
    row.RatioMod_ml_per_g = clamp(row.RatioMod_ml_per_g, -0.8, 0.5);
    row.BrewTimeMod_sec = clamp(row.BrewTimeMod_sec, -10, 35);
    return row;
  }

  function resolveProcessProfile(processName = "") {
    const exact = getBy(DATA.processes, "Process", processName);
    return exact?.Process ? exact : inferProcessProfile(processName);
  }

  function effectiveBrewVarietyNames() {
    const stockBean = selectedBrewStockBean?.();
    if (stockBean) {
      const values = [
        stockBean.Variety,
        stockBean.Variety2_optional,
        stockBean.Variety3_optional,
        stockBean.VarietyList
      ].flatMap(splitVarietyLabel);
      return uniq(values);
    }
    return uniq([$("brewVariety")?.value || ""]);
  }

  function resolveVarietyProfile(names = []) {
    const cleanNames = uniq((names || []).flatMap(splitVarietyLabel));
    const rows = cleanNames.map(name => getBy(DATA.varieties, "Variety", name)).filter(row => row?.Variety);
    if (rows.length <= 1) return rows[0] || getBy(DATA.varieties, "Variety", cleanNames[0] || $("brewVariety")?.value);
    const avg = field => round(rows.reduce((sum, row) => sum + numberField(row, field, 3), 0) / rows.length, 1);
    return {
      Variety: cleanNames.join(" / "),
      Species: uniq(rows.map(row => row.Species)).join(" / "),
      Genetic_Market_Group: uniq(rows.map(row => row.Genetic_Market_Group)).join(" / "),
      Typical_Regions: uniq(rows.map(row => row.Typical_Regions)).join(" / "),
      Acidity_Base: avg("Acidity_Base"),
      Sweetness_Base: avg("Sweetness_Base"),
      Body_Base: avg("Body_Base"),
      Fruity_Base: avg("Fruity_Base"),
      Floral_Base: avg("Floral_Base"),
      Fermentation_Tolerance: avg("Fermentation_Tolerance"),
      Notes: `Composite profile from ${cleanNames.length} varieties: ${cleanNames.join(", ")}. Dashboard averages sensory bases and keeps process/roast guardrails active.`,
      SourceURL: rows.find(row => sourceUrl(row))?.SourceURL || "",
      IsComposite: true
    };
  }

  function brewLogicSummary(brew = {}) {
    const parts = [];
    if (brew.variety?.IsComposite) parts.push(`Composite variety: ${brew.variety.Variety}`);
    if (brew.process?.Inferred) parts.push(`Custom process inferred: ${brew.process.Process}`);
    if (brew.risk >= 4) parts.push("High ferment guardrail active");
    if (brew.mineralBand === "soft") parts.push("Soft water compensation");
    if (brew.mineralBand === "hard") parts.push("Hard water guardrail");
    return parts.join(" · ") || "Standard library match";
  }


  function extractBrewSignals({ variety, process, roast, dripper, water, mode }) {
    const acidity = clamp(numberField(variety, "Acidity_Base", 3) + numberField(process, "AcidityMod", 0) + numberField(roast, "AcidityMod", 0), 1, 5);
    const sweetness = clamp(numberField(variety, "Sweetness_Base", 3) + numberField(process, "SweetnessMod", 0), 1, 5);
    const body = clamp(numberField(variety, "Body_Base", 3) + numberField(process, "BodyMod", 0) + numberField(roast, "BodyMod", 0), 1, 5);
    const fruity = clamp(numberField(variety, "Fruity_Base", 3) + numberField(process, "FruityMod", 0), 1, 5);
    const floral = clamp(numberField(variety, "Floral_Base", 2) + numberField(process, "FloralMod", 0), 1, 5);
    const risk = clamp(numberField(process, "FermentRisk_1low_5high", 2), 1, 5);
    const flow = clamp(numberField(dripper, "FlowSpeed_1slow_5fast", 3), 1, 5);
    const heat = clamp(numberField(dripper, "HeatRetention_1low_5high", 3), 1, 5);
    const tds = numberField(water, "TDS_ppm", 150);
    const roastTone = roastWeight(roast);
    const intent = brewIntent({ acidity, sweetness, body, fruity, floral, risk, roastTone, mode });
    return { acidity, sweetness, body, fruity, floral, risk, flow, heat, tds, roastTone, intent, mineralBand: waterMineralBand(tds) };
  }

  function confidenceScore({ variety, process, roast, dripper, water, grinderName, isCustom }) {
    let score = 86;
    if (!variety?.Variety) score -= 12;
    if (variety?.IsComposite) score -= 2;
    if (!process?.Process) score -= 12;
    if (process?.Inferred) score -= 5;
    if (!roast?.RoastProfile) score -= 10;
    if (!dripper?.DripperName) score -= 8;
    if (!water?.Water) score -= 6;
    if (isCustom) score -= 5;
    if (/custom/i.test(grinderName || "")) score -= 4;
    return clamp(score, 54, 96);
  }

  function dialInTips(brew) {
    const tips = [];
    const modeIce = brew.mode === "Japanese Iced";
    if (brew.risk >= 4) tips.push("Fermentasi tinggi: kurangi agitasi, hindari swirl agresif, mulai dari grind sedikit lebih kasar bila aroma ferment terlalu dominan.");
    if (brew.acidity >= 4 && brew.body <= 3) tips.push("Target clarity: jika cup terlalu tajam, naikkan rasio +0.3 atau perpanjang kontak 10–15 detik sebelum mengubah suhu.");
    if (brew.body >= 4) tips.push("Body tinggi: jaga flow tetap bersih. Jika finish terasa berat, kasar 1–2 step atau turunkan suhu 1°C.");
    if (brew.mineralBand === "soft") tips.push("Air sangat soft: gunakan mineral/blend atau naikkan suhu 1°C agar sweetness tidak terasa tipis.");
    if (brew.mineralBand === "hard") tips.push("Air mineral tinggi: turunkan suhu 1°C dan hindari ekstraksi terlalu panjang agar aftertaste tidak chalky.");
    if (brew.process?.Inferred) tips.push("Custom process: dashboard memakai keyword guardrail. Setelah tasting, simpan proses ini ke Pustaka bila sering digunakan.");
    if (brew.variety?.IsComposite) tips.push("Multi-varietas: gunakan hasil ini sebagai baseline gabungan; validasi apakah satu karakter varietas terlalu dominan.");
    if (modeIce) tips.push("Japanese iced: swirl server setelah drawdown supaya meltwater dan konsentrasi kopi homogen.");
    if (!tips.length) tips.push("Mulai dari resep ini sebagai control. Setelah tasting, ubah satu variabel saja: grind → suhu → rasio.");
    return tips.slice(0, 3);
  }

  function extractionMood(brew) {
    if (brew.risk >= 4) return "Low agitation / aromatic control";
    if (brew.intent?.primary === "clarity") return "Clean clarity / high definition";
    if (brew.intent?.primary === "body") return "Round body / soft finish";
    if (brew.intent?.primary === "sweetness") return "Sweet balance / syrupy cup";
    return "Balanced extraction";
  }

  function computeBrew() {
    const varietyNames = effectiveBrewVarietyNames();
    const variety = resolveVarietyProfile(varietyNames);
    const processValue = selectedProcessValue("brewProcess", "brewProcessCustom");
    const process = resolveProcessProfile(processValue);
    const roast = getBy(DATA.roasts, "RoastProfile", $("brewRoast").value);
    const dripper = getBy(DATA.drippers, "DripperName", $("brewDripper").value);
    const water = getBy(DATA.waters, "Water", $("brewWater").value);
    const dose = clamp($("brewDose").value, 1, 100);
    const mode = $("brewMode").value;
    const switchMode = resolveSwitchMode();
    const signals = extractBrewSignals({ variety, process, roast, dripper, water, mode });
    const { acidity, sweetness, body, fruity, floral, risk, flow, heat, tds, roastTone, intent, mineralBand } = signals;

    const isImmersion = switchMode === "Full Immersion" || $("pourPattern").value === "Immersion Full";
    const switchHybrid = switchMode === "Hybrid" || switchMode === "Auto";

    const tempBase = mode === "Japanese Iced" ? 93.5 : isImmersion ? 90.5 : switchHybrid ? 92 : 93;
    const fermentTempGuard = risk >= 4 ? -1.2 : risk === 3 ? -0.4 : 0;
    const heatGuard = heat >= 4 ? -0.5 : heat <= 2 ? 0.4 : 0;
    const mineralTempGuard = mineralBand === "soft" ? 0.8 : mineralBand === "hard" ? -0.8 : 0;
    const aromaticLift = (floral >= 4 || acidity >= 4) ? 0.5 : 0;
    const temp = round(clamp(
      tempBase + numberField(process, "TempMod_C", 0) + numberField(roast, "TempMod_C", 0) + numberField(water, "TempMod_C", 0) + fermentTempGuard + heatGuard + mineralTempGuard + aromaticLift,
      mode === "Japanese Iced" ? 88 : 86,
      roastTone >= 1.5 ? 94 : 98
    ));

    const ratioBase = mode === "Japanese Iced" ? 15 : isImmersion ? 15.4 : switchHybrid ? 15.8 : 16;
    const sensoryRatio = (acidity >= 4 && body <= 3 ? 0.25 : 0) + (sweetness >= 4 ? 0.15 : 0) + (body >= 4 ? -0.35 : 0) + (risk >= 4 ? -0.25 : 0) + (roastTone <= -1 ? 0.2 : 0);
    const ratio = round(clamp(ratioBase + numberField(process, "RatioMod_ml_per_g", 0) + numberField(roast, "RatioMod_ml_per_g", 0) + sensoryRatio, 14, 18), 1);
    const totalWater = Math.round(dose * ratio);
    const hotWaterRatio = mode === "Japanese Iced" ? (risk >= 4 ? 0.58 : 0.6) : 1;
    const hotWater = mode === "Japanese Iced" ? Math.round(totalWater * hotWaterRatio) : totalWater;
    const ice = mode === "Japanese Iced" ? totalWater - hotWater : 0;

    const grindBase = mode === "Japanese Iced" ? 748 : isImmersion ? 850 : switchHybrid ? 720 : 690;
    const processGrind = numberField(process, "GrindMod_coarser", 0) * 32;
    const roastGrind = numberField(roast, "GrindMod_coarser", 0) * 42;
    const flowComp = (3 - flow) * 24;
    const heatComp = (heat - 3) * 8;
    const mineralComp = mineralBand === "soft" ? -18 : mineralBand === "hard" ? 22 : 0;
    const doseComp = (dose - 15) * 4;
    const fermentComp = risk >= 4 ? 36 : risk <= 1 ? -8 : 0;
    const clarityComp = (floral >= 4 || acidity >= 4) && risk < 4 ? -10 : 0;
    const grindTarget = round(clamp(
      grindBase + processGrind + roastGrind + flowComp + heatComp + mineralComp + doseComp + fermentComp + clarityComp,
      450,
      1020
    ));
    const grinderSetting = getGrinderSetting($("brewGrinder").value, grindTarget, mode, isImmersion);

    const timeBase = mode === "Japanese Iced" ? 150 : isImmersion ? 220 : switchHybrid ? 190 : 178;
    const flowTime = (3 - flow) * 18;
    const bodyTime = body >= 4 ? -8 : acidity >= 4 ? 8 : 0;
    const fermentTime = risk >= 4 ? -10 : risk <= 1 ? 8 : 0;
    const doseTime = (dose - 15) * 3;
    const brewTime = round(clamp(
      timeBase + numberField(process, "BrewTimeMod_sec", 0) + numberField(roast, "BrewTimeMod_sec", 0) + flowTime + bodyTime + fermentTime + doseTime,
      mode === "Japanese Iced" ? 120 : 135,
      isImmersion ? 360 : 330
    ));

    const pourCount = resolvePourCount($("pourPattern").value, isImmersion, risk, body, acidity, floral);
    const bloomMultiplier = risk >= 4 ? 2.1 : acidity >= 4 || roastTone <= -1 ? 2.8 : body >= 4 ? 2.3 : 2.5;
    const bloom = isImmersion ? 0 : Math.min(Math.round(hotWater * 0.34), Math.round(dose * bloomMultiplier));
    const steps = buildSteps({ dose, mode, switchMode, isImmersion, hotWater, ice, bloom, pourCount, brewTime, process, roast, dripper, risk, body, acidity, floral, intent });
    const pourSum = steps.reduce((sum, st) => sum + (Number(st.water) || 0), 0);
    const confidence = confidenceScore({ variety, process, roast, dripper, water, grinderName: $("brewGrinder").value, isCustom: isCustomGrinderSelected() });

    const brew = { variety, process, roast, dripper, water, dose, mode, switchMode, acidity, sweetness, body, fruity, floral, risk, flow, heat, tds, mineralBand, roastTone, intent, temp, ratio, totalWater, hotWater, ice, grindTarget, grinderSetting, brewTime, pourCount, bloom, steps, pourSum, confidence };
    brew.extractionMood = extractionMood(brew);
    brew.dialInTips = dialInTips(brew);
    return brew;
  }

  function isCustomGrinderSelected() {
    return norm($("brewGrinder")?.value) === "custom";
  }

  function getSelectedGrinderName() {
    if (isCustomGrinderSelected()) return $("customGrinderName")?.value.trim() || "Custom Grinder";
    return $("brewGrinder")?.value || "";
  }

  function formatOneZpressoSetting(totalClicks, clicksPerRotation = 30, clicksPerNumber = 3) {
    const clicks = Math.max(0, Math.round(totalClicks));
    const rotations = Math.floor(clicks / clicksPerRotation);
    const remain = clicks % clicksPerRotation;
    const dialNumber = Math.floor(remain / clicksPerNumber);
    const subClicks = remain % clicksPerNumber;
    return `${rotations}.${dialNumber}.${subClicks}`;
  }

  function formatCentirotationSetting(totalCentirotations, centirotationsPerRotation = 100) {
    const value = Number(totalCentirotations) / centirotationsPerRotation;
    return `${value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} rotations`;
  }

  function formatGrinderDisplay(grinder, value) {
    const precision = Number.isFinite(Number(grinder.Precision)) ? Number(grinder.Precision) : 0;
    const rounded = round(value, precision);
    if (grinder.DisplayFormat === "onezpresso30") {
      return `${formatOneZpressoSetting(rounded, Number(grinder.ClicksPerRotation || 30), Number(grinder.ClicksPerNumber || 3))} rotations`;
    }
    if (grinder.DisplayFormat === "rotation100") {
      return formatCentirotationSetting(rounded, Number(grinder.ClicksPerRotation || 100));
    }
    const template = grinder.DisplayFormat || "{value}";
    return template.replace("{value}", fmt(rounded, precision));
  }

  function getGrinderSetting(grinderName, micron, mode, isImmersion) {
    if (norm(grinderName) === "custom") {
      return $("customGrinderSetting")?.value.trim() || "klik/dial";
    }
    const grinder = getBy(DATA.grinders, "Grinder", grinderName);
    if (!grinder.Grinder) return `${micron} µm target`;
    const methodKey = isImmersion ? "Immersion" : mode === "Japanese Iced" ? "Japanese" : "V60";
    const min = Number(grinder[`${methodKey}_Min`] ?? grinder.V60_Min);
    const max = Number(grinder[`${methodKey}_Max`] ?? grinder.V60_Max);
    const micronMin = Number(grinder.MicronMin || 400);
    const micronMax = Number(grinder.MicronMax || 930);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return `${micron} µm target`;
    const ratio = clamp((Number(micron) - micronMin) / Math.max(1, micronMax - micronMin), 0, 1);
    const setting = min + ratio * (max - min);
    return formatGrinderDisplay(grinder, setting);
  }

  function resolvePourCount(pattern, isImmersion, risk, body, acidity = 3, floral = 2) {
    if (isImmersion) return 1;
    if (/2x/.test(pattern)) return 2;
    if (/3x/.test(pattern)) return 3;
    if (/4x/.test(pattern)) return 4;
    if (risk >= 4) return 2;
    if (body >= 4) return 4;
    if (acidity >= 4 || floral >= 4) return 3;
    return 3;
  }

  function splitWater(total, parts) {
    if (parts <= 1) return [Math.round(total)];
    const base = Math.floor(total / parts);
    const arr = Array(parts).fill(base);
    arr[parts - 1] += Math.round(total) - base * parts;
    return arr;
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function buildSteps(ctx) {
    const { mode, switchMode, isImmersion, hotWater, ice, bloom, pourCount, brewTime, process, roast, dripper, risk = 2, body = 3, acidity = 3, floral = 2, intent } = ctx;
    const switchActive = isSwitch(dripper.DripperName);
    const basePouring = dripper.BasePouring || "center-to-spiral pulse; jaga bed rata";
    const roastTone = roastWeight(roast);
    const flavorCue = intent?.label || "Balanced extraction";

    if (isImmersion) {
      const valveStart = switchActive ? "CLOSED" : "N/A";
      const steepEnd = fmtTime(Math.max(120, brewTime - 25));
      return [
        { stage: "Full Pour", water: hotWater, time: "0:00 - 0:30", valve: valveStart, instruction: `${mode === "Japanese Iced" ? "Tuang hot water ke bed kopi di atas ice server." : "Tuang semua air panas."} Saturate semua grounds, lalu stir 1x lembut.` },
        { stage: "Steep", water: 0, time: `0:30 - ${steepEnd}`, valve: valveStart, instruction: risk >= 4 ? "Steep tenang; minim agitasi agar karakter ferment tetap bersih." : "Steep stabil; swirl ringan jika crust terlalu tebal." },
        { stage: "Release", water: 0, time: `${steepEnd} - ${fmtTime(brewTime)}`, valve: switchActive ? "OPEN" : "N/A", instruction: "Open valve dan biarkan drawdown selesai tanpa menekan bed kopi." },
        ...(ice ? [{ stage: "Ice", water: ice, time: "Server", valve: "N/A", instruction: "Ice berada di server; swirl 8–10 detik setelah drawdown agar homogen." }] : [])
      ];
    }

    const mainWater = Math.max(0, hotWater - bloom);
    const pours = splitWater(mainWater, pourCount);
    const steps = [];
    const fullOpen = switchMode === "Full Open" || !switchActive;
    const hybrid = switchMode === "Hybrid" || switchMode === "Auto";
    const bloomEnd = risk >= 4 ? 30 : roastTone <= -1 || acidity >= 4 ? 42 : 35;
    const pourWindow = Math.max(24, Math.min(42, Math.round((brewTime - bloomEnd - 30) / Math.max(1, pourCount))));
    const releaseAt = Math.min(Math.max(55, bloomEnd + pourWindow), Math.max(65, brewTime - 70));

    steps.push({
      stage: "Bloom",
      water: bloom,
      time: `0:00 - ${fmtTime(bloomEnd)}`,
      valve: switchActive ? (fullOpen ? "OPEN" : "CLOSED") : "N/A",
      instruction: `Bloom ${Math.round(bloom)}g (${flavorCue}). ${risk >= 4 ? "Swirl sangat ringan; hindari blooming terlalu agresif." : "Swirl ringan sampai semua grounds basah."} ${process.BrewingCue || ""}`.trim()
    });

    pours.forEach((water, idx) => {
      const n = idx + 1;
      const start = bloomEnd + idx * pourWindow;
      const end = Math.min(start + pourWindow, brewTime - 20);
      let valve = "N/A";
      let instruction = basePouring;

      if (switchActive) {
        if (fullOpen) {
          valve = "OPEN";
          instruction = `${basePouring}; treat seperti cone V60 dengan flow terbuka.`;
        } else if (hybrid) {
          valve = n === 1 ? `CLOSED → OPEN ${fmtTime(releaseAt)}` : "OPEN";
          instruction = n === 1
            ? `Valve closed untuk fase ekstraksi awal, open sekitar ${fmtTime(releaseAt)} agar sweetness naik tanpa over-immersion.`
            : risk >= 4
              ? "Valve open; pour rendah, minim agitasi, jaga aroma ferment tetap clean."
              : "Valve open; pulse stabil, jaga bed rata dan flow konsisten.";
        } else {
          valve = "CLOSED";
          instruction = "Valve closed; gunakan pour lembut, lalu release sesuai target waktu akhir.";
        }
      } else if (risk >= 4) {
        instruction = "Low agitation pulse; tuang dekat bed, hindari wall-only pouring dan swirl akhir.";
      } else if (body >= 4 && n === pours.length) {
        instruction = "Finishing pulse lebih lembut; stop agitasi bila bed sudah rata agar finish tidak berat.";
      } else if (floral >= 4 || acidity >= 4) {
        instruction = `${basePouring}; pertahankan flow bersih untuk clarity.`;
      }

      steps.push({ stage: `Pour ${n}`, water, time: `${fmtTime(start)} - ${fmtTime(end)}`, valve, instruction });
    });

    if (switchActive && switchMode === "Full Immersion") {
      steps.push({ stage: "Release", water: 0, time: fmtTime(brewTime), valve: "OPEN", instruction: "Open valve dan biarkan drawdown selesai." });
    }
    if (ice) steps.push({ stage: "Ice", water: ice, time: "Server", valve: "N/A", instruction: "Ice berada di server; swirl setelah brew selesai agar homogen." });
    return steps;
  }

  function sourceUrl(row = {}) {
    const raw = String(row.SourceURL || row.SourceUrl || row.URL || "").trim();
    if (raw) return raw;
    const source = String(row.Source || "").trim();
    return /^https?:\/\//i.test(source) ? source : "";
  }

  function sourceDomain(url) {
    try {
      return new URL(String(url)).hostname.replace(/^www\./, "");
    } catch (_err) {
      return String(url || "").replace(/^https?:\/\//, "").split("/")[0] || "Source";
    }
  }

  function sourceLink(row = {}, label = "Source") {
    const url = sourceUrl(row);
    const staticSource = String(row.Source || "").trim();
    if (!url && staticSource) return `<span class="source-link source-static">${html(staticSource)}</span>`;
    if (!url) return `<span class="source-missing">-</span>`;
    return `<a class="source-link" href="${html(url)}" target="_blank" rel="noopener noreferrer" title="${html(url)}">${html(label === "Source" ? sourceDomain(url) : label)}</a>`;
  }

  function sourceChip(label, row = {}) {
    const url = sourceUrl(row);
    if (!url) return "";
    return `<a class="source-chip" href="${html(url)}" target="_blank" rel="noopener noreferrer"><span>${html(label)}</span><strong>${html(sourceDomain(url))}</strong></a>`;
  }

  function compatibleDripper(row = {}, mode = "Hot V60") {
    const methods = String(row.CompatibleMethods || "Hot V60").toLowerCase();
    if (/japanese iced/i.test(mode)) return methods.includes("japanese iced") || methods.includes("hot v60");
    return methods.includes("hot v60") || methods.includes("open/percolation") || methods.includes("hybrid");
  }

  function pickDripperByStyle(style, brew = {}, excludeNames = []) {
    const mode = brew.mode || "Hot V60";
    const current = brew.dripper || {};
    const excluded = new Set(excludeNames.map(norm));
    const rows = (DATA.drippers || []).filter(row => row.DripperName && compatibleDripper(row, mode) && !excluded.has(norm(row.DripperName)));
    if (!rows.length) return current;
    const score = (row) => {
      const nameText = `${row.DripperName || ""} ${row.Brand || ""} ${row.Geometry || ""} ${row.BrewFamily || ""} ${row.RecommendedFor || ""} ${row.Bypass || ""}`.toLowerCase();
      const flow = numberField(row, "FlowSpeed_1slow_5fast", 3);
      const heat = numberField(row, "HeatRetention_1low_5high", 3);
      let value = 0;
      if (style === "clarity") {
        value += flow * 10;
        if (/v60|flower|origami|graycano|sibarist|crystal eye|suiren/.test(nameText)) value += 20;
        if (/clarity|aroma|floral|fast|bright/.test(nameText)) value += 22;
        if (/flat-bottom|no-bypass|immersion/.test(nameText)) value -= 7;
        if (mode === "Japanese Iced" && /plastic|resin|polypropylene/.test(nameText)) value += 5;
      } else if (style === "sweetness") {
        value += (6 - flow) * 8 + heat * 4;
        if (/flat-bottom|wave|april|b75|stagg|orea|kalita|low/.test(nameText)) value += 24;
        if (/sweet|even|body|rounded|low-bypass/.test(nameText)) value += 18;
        if (/very low|no-bypass/.test(nameText)) value += 8;
      } else if (style === "fermentSafe") {
        value += (6 - flow) * 9 + heat * 3;
        if (/switch|clever|pulsar|valve|hybrid|immersion|steep/.test(nameText)) value += 30;
        if (/low agitation|consistent|body|sweet/.test(nameText)) value += 10;
        if (/metal mesh|high oils/.test(nameText)) value -= 18;
      } else if (style === "cleanBody") {
        value += (6 - flow) * 6;
        if (/flat-bottom|kalita|april|stagg|b75|orea/.test(nameText)) value += 26;
        if (/conical 60/.test(nameText)) value -= 4;
      }
      if (norm(row.DripperName) === norm(current.DripperName)) value -= 10;
      return value;
    };
    return rows.sort((a, b) => score(b) - score(a))[0] || current;
  }

  function optionGrinderSetting(micron, brew = {}) {
    return getGrinderSetting(getSelectedGrinderName(), micron, brew.mode, brew.switchMode === "Full Immersion" || /Immersion/i.test(brew.switchMode || ""));
  }

  function buildRecipeOption(brew, spec, index) {
    const dose = Number(brew.dose || 15);
    const temp = round(clamp(brew.temp + (spec.tempDelta || 0), brew.mode === "Japanese Iced" ? 87 : 86, brew.roastTone >= 1.5 ? 94 : 98), 0);
    const ratio = round(clamp(brew.ratio + (spec.ratioDelta || 0), 14, 18), 1);
    const totalWater = Math.round(dose * ratio);
    const hotWaterRatio = brew.mode === "Japanese Iced" ? (brew.risk >= 4 ? 0.58 : 0.6) : 1;
    const hotWater = brew.mode === "Japanese Iced" ? Math.round(totalWater * hotWaterRatio) : totalWater;
    const ice = brew.mode === "Japanese Iced" ? totalWater - hotWater : 0;
    const grindTarget = round(clamp(brew.grindTarget + (spec.grindDelta || 0), 450, 1020));
    const brewTime = round(clamp(brew.brewTime + (spec.timeDelta || 0), brew.mode === "Japanese Iced" ? 115 : 130, 360));
    const pourCount = clamp(spec.pourCount || brew.pourCount || 3, 1, 5);
    const dripper = spec.dripper || brew.dripper || {};
    return {
      index,
      key: spec.key,
      title: spec.title,
      badge: spec.badge,
      dripperName: dripper.DripperName || $("brewDripper")?.value || "Dripper input",
      dripper,
      mode: brew.mode,
      switchMode: isSwitch(dripper.DripperName) ? (spec.switchMode || brew.switchMode || "Hybrid") : "-",
      dose,
      temp,
      ratio,
      totalWater,
      hotWater,
      ice,
      grindTarget,
      grinderSetting: optionGrinderSetting(grindTarget, brew),
      brewTime,
      pourCount,
      agitation: spec.agitation,
      fit: spec.fit,
      why: spec.why,
      source: spec.source || "Engine rekomendasi"
    };
  }

  function recipeOptionSpecs(brew) {
    const selected = brew.dripper || {};
    const used = [selected.DripperName];
    const specs = [
      {
        key: "control",
        badge: "Opsi 1 · Control",
        title: brew.intent?.label || "Balanced Control",
        dripper: selected,
        tempDelta: 0,
        ratioDelta: 0,
        grindDelta: 0,
        timeDelta: 0,
        pourCount: brew.pourCount,
        agitation: brew.risk >= 4 ? "Low" : brew.body >= 4 ? "Medium-soft" : "Medium",
        fit: "Titik awal paling aman untuk membandingkan hasil tasting.",
        why: "Mengikuti input user dan koreksi data varietas × proses × roast × dripper × air."
      }
    ];

    if (brew.risk >= 4) {
      const safe = pickDripperByStyle("fermentSafe", brew, used); used.push(safe.DripperName);
      specs.push({
        key: "ferment-safe",
        badge: "Opsi 2 · Ferment-Safe",
        title: "Ferment-safe clarity",
        dripper: safe,
        tempDelta: -1.5,
        ratioDelta: -0.4,
        grindDelta: 45,
        timeDelta: -12,
        pourCount: 2,
        switchMode: /switch|pulsar|clever/i.test(safe.DripperName || "") ? "Hybrid" : "-",
        agitation: "Low",
        fit: "Untuk anaerobic, co-ferment, infused, atau proses intens supaya aroma tetap bersih.",
        why: "Suhu lebih rendah, grind lebih kasar, dan tuangan lebih sedikit mengurangi risiko over-extraction/boozy."
      });
      const sweet = pickDripperByStyle("sweetness", brew, used); used.push(sweet.DripperName);
      specs.push({
        key: "sweet-clean",
        badge: "Opsi 3 · Sweet Clean",
        title: "Sweetness tanpa berat",
        dripper: sweet,
        tempDelta: -0.5,
        ratioDelta: -0.1,
        grindDelta: 18,
        timeDelta: 4,
        pourCount: 3,
        agitation: "Medium-soft",
        fit: "Untuk menjaga sweetness dan body tanpa membuat aftertaste ferment terlalu dominan.",
        why: "Flat/hybrid brewer dan agitasi lembut membantu ekstraksi rata sambil tetap menjaga clean finish."
      });
      return specs;
    }

    if (brew.acidity >= 4 || brew.floral >= 4 || brew.intent?.primary === "clarity") {
      const clarity = pickDripperByStyle("clarity", brew, used); used.push(clarity.DripperName);
      specs.push({
        key: "clarity",
        badge: "Opsi 2 · Clarity",
        title: "Aroma & clarity lift",
        dripper: clarity,
        tempDelta: brew.roastTone <= 0 ? 0.8 : 0.2,
        ratioDelta: 0.2,
        grindDelta: -20,
        timeDelta: 8,
        pourCount: 3,
        agitation: "Medium",
        fit: "Untuk varietas floral/bright seperti Ethiopia, Gesha, Rume Sudan, atau proses washed bersih.",
        why: "Sedikit lebih fine dan suhu/rasio lebih tinggi mengangkat clarity, acidity, dan aromatik."
      });
      const sweet = pickDripperByStyle("sweetness", brew, used); used.push(sweet.DripperName);
      specs.push({
        key: "sweet-balance",
        badge: "Opsi 3 · Sweet Balance",
        title: "Sweetness balancer",
        dripper: sweet,
        tempDelta: -0.5,
        ratioDelta: -0.1,
        grindDelta: 20,
        timeDelta: 2,
        pourCount: 3,
        agitation: "Medium-soft",
        fit: "Jika cup control terasa terlalu tajam atau finish terlalu kering.",
        why: "Dripper lebih stabil dan grind sedikit kasar membuat cup lebih rounded."
      });
      return specs;
    }

    if (brew.body >= 4 || brew.intent?.primary === "body") {
      const clean = pickDripperByStyle("cleanBody", brew, used); used.push(clean.DripperName);
      specs.push({
        key: "clean-body",
        badge: "Opsi 2 · Clean Body",
        title: "Body bersih",
        dripper: clean,
        tempDelta: -0.7,
        ratioDelta: 0,
        grindDelta: 28,
        timeDelta: -4,
        pourCount: 3,
        agitation: "Low-medium",
        fit: "Untuk kopi body-forward, wet-hulled, dark-ish, atau robusta/fine robusta.",
        why: "Menjaga tekstur tanpa membuat aftertaste berat/chalky."
      });
      const sweet = pickDripperByStyle("sweetness", brew, used); used.push(sweet.DripperName);
      specs.push({
        key: "sweet-body",
        badge: "Opsi 3 · Round Sweet",
        title: "Round sweetness",
        dripper: sweet,
        tempDelta: -0.2,
        ratioDelta: -0.2,
        grindDelta: 12,
        timeDelta: 8,
        pourCount: 4,
        agitation: "Medium-soft",
        fit: "Jika ingin cup lebih syrupy dan nyaman untuk daily brew.",
        why: "Flat-bottom/low-bypass style meningkatkan konsistensi dan persepsi sweetness."
      });
      return specs;
    }

    const clarity = pickDripperByStyle("clarity", brew, used); used.push(clarity.DripperName);
    const sweet = pickDripperByStyle("sweetness", brew, used); used.push(sweet.DripperName);
    specs.push({
      key: "clarity-check",
      badge: "Opsi 2 · Brighter",
      title: "Clarity check",
      dripper: clarity,
      tempDelta: 0.6,
      ratioDelta: 0.2,
      grindDelta: -18,
      timeDelta: 6,
      pourCount: 3,
      agitation: "Medium",
      fit: "Untuk melihat apakah kopi punya potensi aroma/acidity yang belum keluar.",
      why: "Sedikit lebih agresif menaikkan ekstraksi tanpa keluar dari rentang filter aman."
    });
    specs.push({
      key: "sweetness-check",
      badge: "Opsi 3 · Sweeter",
      title: "Sweetness check",
      dripper: sweet,
      tempDelta: -0.4,
      ratioDelta: -0.1,
      grindDelta: 18,
      timeDelta: 4,
      pourCount: 3,
      agitation: "Medium-soft",
      fit: "Untuk membandingkan apakah cup lebih enak saat lebih manis dan rounded.",
      why: "Agitasi lebih lembut dan flow lebih stabil menekan dryness."
    });
    return specs;
  }

  function recipeOptionsFromBrew(brew) {
    return recipeOptionSpecs(brew).slice(0, 3).map((spec, idx) => buildRecipeOption(brew, spec, idx + 1));
  }

  function floatingMascotFeedback(brew) {
    if (!brew) return { mood: "balanced", label: "Balanced Brew", text: "Mascot siap memberi feedback seduh." };
    if (brew.risk >= 4) return { mood: "risk", label: "Too Risky", text: "Ferment tinggi: kurangi agitasi, hindari swirl agresif, dan coba grind sedikit lebih kasar." };
    if (brew.intent?.primary === "clarity" || brew.acidity >= 4 || brew.floral >= 4) return { mood: "clarity", label: "Clarity Mode", text: "Fokus clarity: jaga flow stabil, rasio sedikit panjang, dan pouring tetap bersih." };
    if (brew.sweetness >= 4 && brew.risk <= 2) return { mood: "sweet", label: "Sweet Spot", text: "Sweetness sudah kuat. Jadikan ini baseline dan ubah satu variabel saja." };
    if (brew.body >= 4) return { mood: "body", label: "Body Comfort", text: "Body dominan: jaga suhu dan flow agar tekstur tidak berubah berat." };
    return { mood: "balanced", label: "Balanced Brew", text: "Profil aman untuk starting point. Validasi lewat drawdown dan taste." };
  }

  function updateFloatingMascot(brew) {
    const mascot = $("floatingMascot");
    if (!mascot) return;
    const feedback = floatingMascotFeedback(brew);
    mascot.dataset.mood = feedback.mood;
    const status = $("floatingMascotStatus");
    const text = $("floatingMascotText");
    if (status) status.textContent = feedback.label;
    if (text) text.textContent = feedback.text;
  }

  function renderBrewVisualizer(brew) {
    updateFloatingMascot(brew);
    updateBrewVisualNarrative(brew);
  }

  function waterNote(brew) {
    if (brew.mineralBand === "soft") return "Water intelligence: TDS sangat rendah. Gunakan sebagai base remineralisasi/blending, atau naikkan suhu ±1°C jika cup terasa tipis dan acidity terlalu tajam.";
    if (brew.mineralBand === "hard") return "Water intelligence: mineral tinggi. Body bisa naik, tetapi clarity dan aftertaste berisiko mute/chalky. Pertimbangkan blend dengan air rendah mineral.";
    if (brew.mineralBand === "balanced") return "Water intelligence: rentang mineral ideal untuk filter. Prioritaskan dial-in lewat grind dan agitation sebelum mengubah rasio.";
    return "Water intelligence: mineral masih usable. Validasi dengan drawdown dan QA taste, lalu ubah satu variabel saja per iterasi.";
  }

  function renderBrewInsight(brew) {
    const panel = $("brewInsightPanel");
    if (!panel) return;
    panel.classList.remove("is-live");
    const tips = (brew.dialInTips || []).map(tip => `<li>${html(tip)}</li>`).join("");
    const qaSignal = brew.confidence >= 88 ? "High confidence" : brew.confidence >= 74 ? "Ready to test" : "Needs validation";
    const sources = [
      ["Varietas", brew.variety],
      ["Pasca panen", brew.process],
      ["Roast", brew.roast],
      ["Dripper", brew.dripper],
      ["Air", brew.water]
    ].map(([label, row]) => sourceChip(label, row)).filter(Boolean).join("");
    panel.innerHTML = `
      <div class="insight-header">
        <span class="insight-kicker">Brew Intelligence</span>
        <strong>${html(brew.extractionMood)}</strong>
        <em>${html(qaSignal)} · ${html(brew.confidence)}%</em>
      </div>
      <div class="insight-grid">
        <article><span>Focus</span><strong>${html(brew.intent?.label || "Balanced")}</strong><small>Acuan profil seduh utama.</small></article>
        <article><span>Agitation</span><strong>${html(brew.risk >= 4 ? "Low" : brew.body >= 4 ? "Medium-soft" : "Medium")}</strong><small>Disesuaikan dengan proses dan body.</small></article>
        <article><span>Water Band</span><strong>${html(brew.mineralBand)}</strong><small>TDS ${html(brew.tds)} ppm.</small></article>
        <article><span>Logic</span><strong>${html(brew.process?.Inferred || brew.variety?.IsComposite ? "Adaptive" : "Library")}</strong><small>${html(brewLogicSummary(brew))}</small></article>
      </div>
      <ul class="dial-tips">${tips}</ul>
      ${sources ? `<div class="source-chip-row"><span>Source</span>${sources}</div>` : ""}`;
    requestAnimationFrame(() => panel.classList.add("is-live"));
  }

  function renderBrewInputCompass(brew) {
    const panel = $("brewInputCompass");
    if (!panel || !brew) return;
    const focus = brew.intent?.label || "Balanced";
    const sourceRows = [brew.variety, brew.process, brew.roast, brew.dripper, brew.water].filter(Boolean);
    const sourceCount = sourceRows.filter(row => sourceUrl(row)).length;
    const flowText = brew.flow >= 4 ? "Fast flow" : brew.flow <= 2 ? "Slow flow" : "Medium flow";
    const riskText = brew.risk >= 4 ? "High ferment" : brew.risk >= 3 ? "Medium ferment" : "Clean process";
    const mineralText = brew.mineralBand === "balanced" ? "Balanced water" : brew.mineralBand === "soft" ? "Soft water" : brew.mineralBand === "hard" ? "Hard water" : "Usable water";
    const inferredCount = sourceRows.filter(row => row?.Inferred || row?.IsComposite).length;
    const sourceStatus = sourceCount >= 5 ? "Source lengkap" : inferredCount ? `${sourceCount}/5 source · ${inferredCount} inferred` : `${sourceCount}/5 source aktif`;
    const bars = [
      ["Clarity", clamp((brew.acidity + brew.fruity + brew.floral) / 15, .08, 1)],
      ["Sweetness", clamp(brew.sweetness / 5, .08, 1)],
      ["Body", clamp(brew.body / 5, .08, 1)],
      ["Risk", clamp(brew.risk / 5, .08, 1)]
    ].map(([label, value]) => `<span><em>${html(label)}</em><i style="--bar:${Number(value).toFixed(2)}"></i></span>`).join("");
    panel.innerHTML = `
      <div class="compass-copy">
        <span class="compass-kicker">Live Dial-In Compass</span>
        <strong>${html(focus)} · ${html(brew.extractionMood)}</strong>
        <small>${html(flowText)} · ${html(riskText)} · ${html(mineralText)} · ${html(sourceStatus)}</small>
      </div>
      <div class="compass-bars" aria-label="Profil dial in">${bars}</div>
    `;
  }

  function renderHeroSignals(brew) {
    if (!brew) return;
    const feedback = floatingMascotFeedback(brew);
    const sourceCount = [brew.variety, brew.process, brew.roast, brew.dripper, brew.water].filter(Boolean).filter(row => sourceUrl(row)).length;
    if ($("heroFeatureMode")) $("heroFeatureMode").textContent = feedback.label;
    if ($("heroFeatureModeCopy")) $("heroFeatureModeCopy").textContent = feedback.text;
    if ($("heroFeatureSource")) $("heroFeatureSource").textContent = `${sourceCount}/5 aktif`;
    if ($("heroFeatureSourceCopy")) $("heroFeatureSourceCopy").textContent = `${brew.dripper?.DripperName || "Dripper"} · ${brew.mineralBand} water · ${brew.intent?.label || "Balanced"}`;
    if ($("heroFeatureSaveCopy")) $("heroFeatureSaveCopy").textContent = `Draft lokal aktif, retry 1x, timeout 45s, dan refresh session saat tab kembali aktif.`;
  }

  function renderBrewPreflight(brew) {
    const wrap = $("brewPreflightPanel");
    if (!wrap || !brew) return;
    const feedback = floatingMascotFeedback(brew);
    const sourceCount = [brew.variety, brew.process, brew.roast, brew.dripper, brew.water].filter(Boolean).filter(row => sourceUrl(row)).length;
    const caution = brew.risk >= 4 ? "High caution" : brew.risk >= 3 ? "Moderate caution" : "Controlled";
    const logicText = brewLogicSummary(brew);
    const items = [
      ["Confidence", `${brew.confidence}%`, "Kesiapan rekomendasi berdasarkan data & fit."],
      ["Source", `${sourceCount}/5 aktif`, "Referensi utama sudah terhubung ke dashboard."],
      ["Guardrail", caution, feedback.text],
      ["Logic", brew.process?.Inferred || brew.variety?.IsComposite ? "Adaptive" : "Library", logicText]
    ];
    const cards = items.map(([label, value, desc], idx) => `<article class="preflight-card cinematic-reveal" style="--stagger:${idx}"><span>${html(label)}</span><strong>${html(value)}</strong><small>${html(desc)}</small></article>`).join("");
    wrap.innerHTML = `
      <div class="preflight-header">
        <div>
          <span class="mini-label">Brew Preflight</span>
          <strong>${html(feedback.label)} · ${html(brew.intent?.label || "Balanced")}</strong>
        </div>
        <p>${html(brew.dripper?.DripperName || "Dripper")} · ${html(brew.mode)} · ${html(brew.water?.WaterName || brew.water?.Brand || "Water profile")}</p>
      </div>
      <div class="preflight-grid">${cards}</div>
    `;
  }

  function updateBrewVisualNarrative(brew) {
    const visual = $("brewVisualizer");
    if (!visual || !brew) return;
    const feedback = floatingMascotFeedback(brew);
    visual.dataset.mood = feedback.mood === 'risk' ? 'ferment' : feedback.mood;
    if ($("brewVisualBadge")) $("brewVisualBadge").textContent = feedback.label;
    if ($("brewVisualTitle")) $("brewVisualTitle").textContent = `${brew.intent?.label || "Balanced"} / ${brew.dripper?.DripperName || "Filter Brewer"}`;
    if ($("brewVisualText")) $("brewVisualText").textContent = `${feedback.text} Rasio 1:${fmt(brew.ratio,1)} · ${brew.temp}°C · target ${brew.grindTarget} µm.`;
    visual.classList.remove("is-cinematic");
    void visual.offsetWidth;
    visual.classList.add("is-cinematic");
  }

  function decisionEngineItems(brew) {
    const tempReason = brew.risk >= 4
      ? "Ferment risk tinggi: suhu dibuat lebih konservatif agar aroma ferment tetap rapi."
      : brew.mineralBand === "soft"
        ? "Air soft butuh thermal support. Naikkan suhu bertahap bila cup terlalu tipis."
        : brew.body >= 4
          ? "Body tinggi: suhu stabil, jangan terlalu agresif agar finish tidak berat."
          : "Suhu berada di rentang aman untuk validasi awal.";
    const grindReason = brew.risk >= 4
      ? "Mulai sedikit lebih kasar untuk menekan over-ferment note dan dryness."
      : brew.flow >= 4
        ? "Flow cepat: target gilingan menjaga kontak cukup tanpa memperlambat berlebihan."
        : brew.flow <= 2
          ? "Flow lambat: hindari terlalu halus supaya drawdown tidak panjang."
          : "Target gilingan netral untuk baseline.";
    const ratioReason = brew.intent?.primary === "clarity"
      ? "Rasio sedikit panjang membantu clarity dan aftertaste bersih."
      : brew.body >= 4
        ? "Rasio dijaga agar body tidak terlalu heavy."
        : brew.sweetness >= 4
          ? "Rasio mendukung sweetness tanpa mengorbankan balance."
          : "Rasio baseline aman untuk eksperimen pertama.";
    const agitationReason = brew.risk >= 4
      ? "Agitasi rendah: pouring lembut, minim swirl, hindari fines migration."
      : brew.body >= 4
        ? "Agitasi medium-soft agar body round tapi finish tetap clean."
        : "Agitasi medium untuk ekstraksi seimbang.";
    const waterReason = brew.mineralBand === "hard"
      ? "Air cenderung hard: clarity bisa mute. Pertimbangkan blending dengan air mineral rendah."
      : brew.mineralBand === "soft"
        ? "Air cenderung soft: sweetness bisa kurang penuh. Pertimbangkan remineralisasi ringan."
        : "Water band cukup aman. Prioritaskan grind/agitation sebelum mengganti air.";
    const dripperReason = brew.flow >= 4
      ? "Dripper cepat: kontrol lewat pouring, grind, dan pulse lebih stabil."
      : brew.flow <= 2
        ? "Dripper lambat: jaga bed tidak terlalu padat dan hindari agitasi berlebihan."
        : "Dripper berada di flow tengah untuk baseline.";
    return [
      { label: "Grind", value: `${brew.grindTarget} µm`, action: brew.risk >= 4 || brew.body >= 4 ? "Coarser bias" : brew.flow <= 2 ? "Avoid too fine" : "Baseline", reason: grindReason },
      { label: "Temperature", value: `${brew.temp}°C`, action: brew.risk >= 4 ? "Lower control" : brew.mineralBand === "soft" ? "Thermal support" : "Stable", reason: tempReason },
      { label: "Ratio", value: `1:${fmt(brew.ratio, 1)}`, action: brew.intent?.primary === "clarity" ? "Clarity stretch" : "Balance", reason: ratioReason },
      { label: "Agitation", value: brew.risk >= 4 ? "Low" : brew.body >= 4 ? "Medium-soft" : "Medium", action: "Pouring rule", reason: agitationReason },
      { label: "Water", value: `${brew.mineralBand} · ${brew.tds}ppm`, action: "Water guardrail", reason: waterReason },
      { label: "Dripper", value: brew.dripper?.DripperName || "-", action: brew.flow >= 4 ? "Fast-flow control" : brew.flow <= 2 ? "Slow-flow control" : "Flow stable", reason: dripperReason }
    ];
  }

  function renderBrewDecisionGrid(brew) {
    const grid = $("brewDecisionGrid");
    if (!grid || !brew) return;
    const items = decisionEngineItems(brew);
    grid.classList.remove("is-live");
    grid.innerHTML = items.map((item, idx) => `
      <article class="decision-card cinematic-reveal" style="--stagger:${idx}">
        <span>${html(item.label)}</span>
        <strong>${html(item.value)}</strong>
        <em>${html(item.action)}</em>
        <p>${html(item.reason)}</p>
      </article>
    `).join("");
    requestAnimationFrame(() => grid.classList.add("is-live"));
  }

  function matchingBrewHistory(brew) {
    const currentKey = recipeKey($("brewVariety")?.value, $("brewProcess")?.value, $("brewRoast")?.value);
    return allBrewLogs()
      .filter(log => {
        const key = recipeKey(log.Variety, log.Process, log.RoastProfile);
        const sameRecipe = norm(key) === norm(currentKey);
        const sameDripper = !brew.dripper?.DripperName || norm(log.Dripper) === norm(brew.dripper.DripperName);
        return sameRecipe || sameDripper || Number(log.QA_Final || 0) >= APPROVAL_THRESHOLD;
      })
      .sort((a, b) => new Date(a.Date || a.CreatedAt || 0) - new Date(b.Date || b.CreatedAt || 0))
      .slice(-5);
  }

  function syntheticTimelineSteps(brew) {
    const issue = brew.risk >= 4 ? "ferment risk" : brew.body >= 4 ? "heavy body" : brew.intent?.primary === "clarity" ? "clarity target" : "baseline validation";
    const adjustment = brew.risk >= 4
      ? "Kurangi agitasi, grind +1–2 step kasar, validasi aroma ferment."
      : brew.body >= 4
        ? "Jika finish berat, grind sedikit lebih kasar atau turunkan suhu 1°C."
        : brew.intent?.primary === "clarity"
          ? "Jika acidity terlalu tajam, panjangkan rasio +0.2–0.3 atau turunkan agitasi."
          : "Ubah satu variabel saja: grind, suhu, atau agitation.";
    return [
      { label: "Brew 1", title: "Safe start baseline", meta: `${brew.temp}°C · 1:${fmt(brew.ratio,1)} · ${brew.grindTarget}µm`, note: `Mulai dari resep rekomendasi untuk membaca ${issue}.` },
      { label: "Taste check", title: "QA checkpoint", meta: "Aroma · sweetness · finish", note: "Catat drawdown, aftertaste, dan apakah cup clean/heavy/flat." },
      { label: "Brew 2", title: "Controlled adjustment", meta: "1 variable only", note: adjustment },
      { label: "Brew 3", title: "Lock winning recipe", meta: "QA ≥ 6.5", note: "Jika hasil lebih baik, simpan ke Brew Log dan jadikan baseline berikutnya." }
    ];
  }

  function renderDialInTimeline(brew) {
    const wrap = $("dialInTimeline");
    if (!wrap || !brew) return;
    const history = matchingBrewHistory(brew);
    const steps = history.length >= 2
      ? history.map((log, idx) => ({
          label: log.BrewID || `Brew ${idx + 1}`,
          title: `${log.Dripper || "Dripper"} · ${log.Method || "Method"}`,
          meta: `QA ${log.QA_Final ? fmt(log.QA_Final, 2) : "-"} · ${log.Temp_C || "-"}°C · 1:${log.Ratio || "-"}`,
          note: log.ResultNotes || log.PrimaryVariableChanged || log.Hypothesis || "Histori brew cocok dari database."
        }))
      : syntheticTimelineSteps(brew);
    wrap.classList.remove("is-live");
    wrap.innerHTML = steps.map((step, idx) => `
      <article class="timeline-step cinematic-reveal" style="--stagger:${idx}">
        <div class="timeline-index">${idx + 1}</div>
        <div>
          <span>${html(step.label)}</span>
          <strong>${html(step.title)}</strong>
          <em>${html(step.meta)}</em>
          <p>${html(step.note)}</p>
        </div>
      </article>
    `).join("");
    requestAnimationFrame(() => wrap.classList.add("is-live"));
  }

  function setBrewRecommendationState(state, message = "") {
    const wrap = $("brewRecommendationState");
    const text = $("brewRecommendationStateText");
    if (!wrap) return;
    wrap.dataset.state = state;
    wrap.hidden = state === "ready";
    wrap.classList.toggle("v45-loading-state", state === "loading");
    wrap.classList.toggle("v45-empty-state", state === "empty");
    wrap.classList.toggle("v45-alert", state === "error");
    wrap.classList.toggle("v45-alert--danger", state === "error");
    if (text && message) text.textContent = message;
  }

  function validateBrewInputUI() {
    const doseInput = $("brewDose");
    const doseError = $("brewDoseError");
    if (!doseInput || !doseError) return true;
    const dose = Number(doseInput.value);
    const valid = Number.isFinite(dose) && dose >= 5 && dose <= 50;
    doseInput.setAttribute("aria-invalid", valid ? "false" : "true");
    doseError.hidden = valid;
    doseError.textContent = valid ? "" : "Masukkan dosis 5–50 g agar resep dapat disimpan ke Brew Log.";
    return valid;
  }

  function renderBrewCoffeeContext(brew) {
    const wrap = $("brewCoffeeContext");
    if (!wrap || !brew) return;
    const stockBean = selectedBrewStockBean();
    const name = stockBean?.CoffeeName || $("brewBeanName")?.value.trim() || brew.variety?.Variety || "Kopi manual";
    const profile = [brew.variety?.Variety, brew.process?.Process, brew.roast?.RoastProfile].filter(Boolean).join(" · ");
    const privateMeta = stockBean
      ? [stockBean.Origin, Number.isFinite(Number(stockBean.Stock_g)) ? `${Number(stockBean.Stock_g)} g tersedia` : ""].filter(Boolean)
      : [];
    wrap.innerHTML = `
      <span class="brew-coffee-context__label">Kopi terpilih</span>
      <strong>${html(name)}</strong>
      <small>${html([profile, ...privateMeta].filter(Boolean).join(" · ") || "Profil katalog belum lengkap")}</small>
    `;
  }

  function renderBrew() {
    setBrewRecommendationState("loading", "Menghitung rekomendasi dari konfigurasi aktif…");
    try {
      renderBrewStockOptions();
      syncBrewStockUI({ apply: true });
      const requiredSelections = ["brewVariety", "brewProcess", "brewRoast", "brewDripper", "brewGrinder", "brewWater"];
      if (requiredSelections.some(id => !$(id)?.value)) {
        setBrewRecommendationState("empty", "Pilih kopi dan lengkapi brewing setup untuk membuat rekomendasi.");
        return null;
      }
      const brew = computeBrew();
      renderRecommendationEvidence(brew);
      const cards = [
        ["Dosis", `${fmt(brew.dose, 1)} g`, "Kopi", "dose"],
        ["Total air", `${brew.totalWater} ml`, "Dosis × rasio", "water"],
        ["Rasio", `1:${fmt(brew.ratio, 1)}`, "Kopi : air", "ratio"],
        ["Suhu", `${brew.temp} °C`, "Target air seduh", "thermo"],
        ["Setting grinder", brew.grinderSetting, `${brew.grindTarget} µm target`, "grinder"],
        ["Brew time", fmtTime(brew.brewTime), "Target selesai", "timer"],
        ["Air panas", `${brew.hotWater} ml`, brew.mode === "Japanese Iced" ? "Konsentrat iced" : "Sama dengan total", "kettle"],
        ["Es server", brew.ice ? `${brew.ice} g` : "—", brew.ice ? "Japanese iced" : "Tidak digunakan", "ice"],
        ["Tuangan", `${brew.pourCount} utama`, `Bloom ${brew.bloom ? `${brew.bloom} g` : "—"}`, "pours"],
      ];
      const outputWrap = $("brewOutputs");
      outputWrap.classList.remove("is-live");
      outputWrap.innerHTML = cards.map(([label, value, desc, icon], idx) => `<div class="output-card cinematic-reveal" style="--stagger:${idx}" data-output="${html(icon)}"><span>${html(label)}</span><strong>${html(value)}</strong><small>${html(desc)}</small></div>`).join("");
      requestAnimationFrame(() => outputWrap.classList.add("is-live"));
      $("waterNote").textContent = waterNote(brew);
      renderBrewCoffeeContext(brew);
      renderBrewInputCompass(brew);
      renderBrewPreflight(brew);
      renderHeroSignals(brew);
      renderBrewInsight(brew);
      renderBrewDecisionGrid(brew);
      renderDialInTimeline(brew);
      renderSteps(brew);
      renderRecipeOptions(brew);
      renderBrewVisualizer(brew);
      toggleSwitchVisibility();
      toggleCustomGrinderFields();
      const inputValid = validateBrewInputUI();
      const resultStatus = $("brewResultStatus");
      if (resultStatus) {
        resultStatus.textContent = inputValid ? `Siap · ${brew.confidence}%` : "Periksa dosis";
        resultStatus.classList.remove("v45-badge--danger");
        resultStatus.classList.toggle("v45-badge--info", inputValid);
        resultStatus.classList.toggle("v45-badge--warning", !inputValid);
      }
      setBrewRecommendationState("ready");
      return brew;
    } catch (error) {
      console.error("renderBrew error", error);
      setBrewRecommendationState("error", "Rekomendasi belum dapat dihitung. Periksa pilihan yang aktif, lalu coba lagi.");
      const resultStatus = $("brewResultStatus");
      if (resultStatus) {
        resultStatus.textContent = "Tidak tersedia";
        resultStatus.classList.remove("v45-badge--info");
        resultStatus.classList.remove("v45-badge--warning");
        resultStatus.classList.add("v45-badge--danger");
      }
      return null;
    }
  }

  function renderSteps(brew) {
    const tbody = $("brewStepsTable").querySelector("tbody");
    let hotCumulative = 0;
    tbody.innerHTML = brew.steps.map((st, index) => {
      const isIce = st.stage === "Ice";
      if (!isIce) hotCumulative += Number(st.water) || 0;
      const stageWater = Number(st.water) ? `${st.water} ${isIce ? "g" : "ml"}` : "—";
      const cumulative = isIce
        ? `${brew.totalWater} total · ${brew.hotWater} ml + ${brew.ice} g es`
        : `${hotCumulative} ml`;
      return `<tr data-step="${index + 1}"><td data-label="Tahap"><span class="brew-step-index" aria-hidden="true">${index + 1}</span><strong>${html(st.stage)}</strong></td><td data-label="Air tahap">${html(stageWater)}</td><td data-label="Target kumulatif"><strong>${html(cumulative)}</strong></td><td data-label="Waktu">${html(st.time)}</td><td data-label="Valve"><span class="badge">${html(st.valve)}</span></td><td data-label="Instruksi">${html(st.instruction)}</td></tr>`;
    }).join("");
    const hotSum = brew.steps.filter(st => st.stage !== "Ice").reduce((sum, st) => sum + (Number(st.water) || 0), 0);
    $("pourCheck").textContent = `Verifikasi air: ${hotSum} ml pada tahap panas = target ${brew.hotWater} ml. Total resep ${brew.totalWater} ml${brew.ice ? ` (${brew.hotWater} ml panas + ${brew.ice} g es)` : ""}.`;
  }

  function formatRecipeStepPlan(steps = []) {
    return (steps || []).map(st => `${st.stage}: ${st.water || 0}ml @ ${st.time} · ${st.valve} · ${st.instruction || ""}`).join(" | ");
  }

  function formatValvePlan(steps = []) {
    return (steps || []).map(st => `${st.stage}: ${st.valve}`).join(" | ");
  }

  function formatPublicRecipeSteps(log) {
    if (log.PourPlan && !/N\/A/i.test(log.PourPlan)) return log.PourPlan;
    const pieces = [];
    if (Number(log.Bloom_ml)) pieces.push(`Bloom: ${log.Bloom_ml}ml`);
    const pourCount = Number(log.PourCount || 0);
    const hot = Number(log.HotWater_ml || log.TotalWater_ml || 0);
    const bloom = Number(log.Bloom_ml || 0);
    if (pourCount > 0 && hot > 0) {
      const pours = splitWater(Math.max(0, hot - bloom), pourCount);
      pours.forEach((water, idx) => pieces.push(`Pour ${idx + 1}: ${water}ml`));
    }
    if (Number(log.Ice_g)) pieces.push(`Ice: ${log.Ice_g}g`);
    return pieces.length ? pieces.join(" | ") : (log.ValvePlan || "Detail tahapan belum tersedia");
  }

  function renderActiveRecipeSummary(opt, index = 0) {
    const wrap = $("recipeActiveSummary");
    if (!wrap || !opt) return;
    const waterText = opt.ice ? `Hot ${opt.hotWater}ml + es ${opt.ice}g` : `Total ${opt.totalWater}ml`;
    const points = [
      ["Dripper", opt.dripperName || "-"],
      ["Grind", `${opt.grindTarget}µm · ${opt.grinderSetting || "calibrate"}`],
      ["Thermal", `${opt.temp}°C · ${fmtTime(opt.brewTime)}`],
      ["Recipe", `1:${fmt(opt.ratio, 1)} · ${waterText}`]
    ];
    wrap.innerHTML = `
      <div class="active-recipe-copy">
        <span class="mini-label">Opsi Aktif ${index + 1}</span>
        <strong>${html(opt.title)}</strong>
        <p>${html(opt.why || opt.fit || "Gunakan sebagai baseline pembanding saat tasting.")}</p>
      </div>
      <div class="active-recipe-metrics">
        ${points.map(([label, value]) => `<article><span>${html(label)}</span><strong>${html(value)}</strong></article>`).join("")}
      </div>
    `;
    wrap.classList.remove("is-live");
    requestAnimationFrame(() => wrap.classList.add("is-live"));
  }

  function recipeKey(variety, process, roast) {
    return `${variety || ""}|${process || ""}|${roast || ""}`;
  }

  function matchingRecommendationHistory(brew = {}) {
    const key = recipeKey(brew.variety?.Variety, brew.process?.Process, brew.roast?.RoastProfile);
    return sortBrewNewest(allBrewLogs())
      .filter(log => {
        if (norm(log.RecipeKey) === norm(key)) return true;
        const sameVariety = norm(log.Variety) === norm(brew.variety?.Variety);
        const sameProcess = norm(log.Process) === norm(brew.process?.Process);
        const sameRoast = norm(log.RoastProfile) === norm(brew.roast?.RoastProfile);
        return sameVariety && sameProcess && sameRoast;
      })
      .slice(0, 8);
  }

  function renderRecommendationEvidence(brew = {}) {
    const confidenceEl = $("brewRecommendationConfidence");
    const rationaleEl = $("brewRecommendationRationale");
    const experimentEl = $("brewNextExperiment");
    if (!confidenceEl || !rationaleEl || !experimentEl || !RECOMMENDATION_SERVICE) return;

    const history = matchingRecommendationHistory(brew);
    const explanation = RECOMMENDATION_SERVICE.explain(brew, history);
    brew.recommendationExplanation = explanation;
    brew.confidence = explanation.confidence.score;

    confidenceEl.innerHTML = `
      <span>Tingkat Keyakinan</span>
      <div class="recommendation-score-line"><strong>${html(explanation.confidence.score)}</strong><span>/100 · ${html(explanation.confidence.level)}</span></div>
      <p>${html(explanation.confidence.summary)}</p>
      <ul class="confidence-factor-list">
        ${explanation.confidence.items.map(item => `<li><strong>${html(item.label)}</strong><em>${html(item.score)}/${html(item.max)}</em><small>${html(item.note)}</small></li>`).join("")}
      </ul>
    `;

    rationaleEl.innerHTML = `
      <span>Dasar Perhitungan</span>
      <ul class="rationale-list">
        ${explanation.rationale.map(item => `<li><div><strong>${html(item.label)}</strong><small>${html(item.text)}</small></div></li>`).join("")}
      </ul>
    `;

    const experiment = explanation.experiment;
    experimentEl.innerHTML = `
      <span>Percobaan Berikutnya</span>
      <strong>${html(experiment.variable)}: ${html(experiment.direction)}</strong>
      <p>${html(experiment.reason)}</p>
      <div class="experiment-change">
        <div><small>Saat ini</small><strong>${html(experiment.current)}</strong></div>
        <b class="experiment-arrow">→</b>
        <div><small>Uji berikutnya</small><strong>${html(experiment.next)}</strong></div>
      </div>
      <p class="experiment-hold"><strong>Pertahankan:</strong> ${html(experiment.holdConstant.join(", "))}.<br /><strong>Pembanding:</strong> ${html(experiment.reference)}</p>
    `;
  }

  function renderRecipeOptions(brew) {
    const key = recipeKey($("brewVariety").value, selectedProcessValue("brewProcess", "brewProcessCustom"), $("brewRoast").value);
    const approved = allBrewLogs()
      .filter(log => norm(log.RecipeKey) === norm(key) && Number(log.QA_Final) >= APPROVAL_THRESHOLD && norm(log.ManualApproval) === "yes" && norm(log.ApprovedForRecipe) === "yes")
      .sort((a, b) => Number(b.QA_Final || 0) - Number(a.QA_Final || 0))
      .slice(0, 2);

    const options = recipeOptionsFromBrew(brew);
    const optionCards = options.map((opt, idx) => {
      const waterText = opt.ice ? `Hot ${opt.hotWater}ml + es ${opt.ice}g` : `Total ${opt.totalWater}ml`;
      const dripperSource = sourceLink(opt.dripper, "Source dripper");
      const activeClass = idx === 0 ? " active" : "";
      return `<article class="recipe-card recipe-option-card cinematic-reveal${activeClass}${idx === 0 ? " base" : ""}" style="--stagger:${idx}" role="button" tabindex="0" data-recipe-option="${html(opt.key)}" data-recipe-title="${html(opt.title)}">
        <span class="badge">${html(opt.badge)}</span>
        <h3>${html(opt.title)}</h3>
        <p class="recipe-line"><strong>${html(opt.dripperName)}</strong><span>${html(opt.mode)}</span><span>${html(opt.switchMode)}</span></p>
        <p class="recipe-line"><strong>${html(opt.grinderSetting)}</strong><span>target ${html(opt.grindTarget)}µm</span><span>${html(opt.temp)}°C</span><span>1:${html(fmt(opt.ratio, 1))}</span></p>
        <p class="recipe-line"><strong>Dosis ${html(fmt(opt.dose, 1))}g</strong><span>${html(waterText)}</span><span>${html(opt.pourCount)} tuangan utama</span><span>${html(fmtTime(opt.brewTime))}</span></p>
        <div class="recipe-focus-list">
          <span>${html(opt.agitation)} agitation</span>
          <span>${html(opt.fit)}</span>
        </div>
        <p class="recipe-why">${html(opt.why)}</p>
        <div class="recipe-source-line">${dripperSource}</div>
      </article>`;
    }).join("");

    const approvedCards = approved.map((log, idx) => {
      const grinderText = [log.Grinder, log.GrindSetting].filter(Boolean).join(" · ") || "-";
      return `<article class="recipe-card verified-recipe-card cinematic-reveal" style="--stagger:${idx + options.length}"><span class="badge">Terverifikasi ${idx + 1} · QA ${fmt(log.QA_Final, 2)}</span><h3>${html(log.BrewID)}</h3><p><strong>${html(log.Dripper)}</strong> · ${html(log.Method)} · ${html(log.SwitchValveMode || "N/A")}</p><p>${html(grinderText)} · ${html(log.Temp_C)}°C · 1:${html(log.Ratio)}</p><p>Dosis ${html(log.Dose_g)}g · Total ${html(log.TotalWater_ml)}ml · Air panas ${html(log.HotWater_ml)}ml${Number(log.Ice_g) ? ` · Es ${html(log.Ice_g)}g` : ""}</p><p>${html(log.PrimaryVariableChanged || "Resep terverifikasi dari brew log")}</p></article>`;
    }).join("");

    const verifiedEmpty = approvedCards ? "" : `<article class="recipe-card verified-recipe-card muted cinematic-reveal" style="--stagger:${options.length + 1}"><span class="badge">Brew Log</span><h3>Belum ada resep terverifikasi</h3><p>Resep dengan QA ≥ 6.5 dan persetujuan manual akan muncul di sini jika key varietas × proses × profil sangrai cocok.</p></article>`;
    const recipeWrap = $("recipeOptions");
    recipeWrap.classList.remove("is-live");
    recipeWrap.innerHTML = optionCards + approvedCards + verifiedEmpty;
    renderActiveRecipeSummary(options[0], 0);
    requestAnimationFrame(() => recipeWrap.classList.add("is-live"));
  }

  function toggleSwitchVisibility() {
    const active = isSwitch($("brewDripper").value);
    $("switchModeWrap").style.display = active ? "grid" : "none";
  }

  function toggleCustomGrinderFields() {
    const custom = isCustomGrinderSelected();
    setElementHidden($("customGrinderNameWrap"), !custom);
    setElementHidden($("customGrinderSettingWrap"), !custom);
  }

  function selectedFlavors() {
    return [$("filterFlavor1").value, $("filterFlavor2").value, $("filterFlavor3").value].filter(v => v && v !== "All");
  }

  function beanFlavorList(bean) {
    return [bean.FlavorFamily, bean.FlavorFamily2_optional, bean.FlavorFamily3_optional].filter(Boolean);
  }

  function beanVarietyList(bean) {
    return [bean.Variety, bean.Variety2_optional].filter(Boolean);
  }

  function rankBeans() {
    const sweet = Number($("targetSweet").value) || 3;
    const acid = Number($("targetAcid").value) || 3;
    const body = Number($("targetBody").value) || 3;
    const flavors = selectedFlavors();
    const brew = $("filterBrew").value;
    const minStock = Number($("minStock").value) || 0;
    const v1 = $("filterVariety1").value;
    const v2 = $("filterVariety2").value;
    const varietyFilters = [v1, v2].filter(Boolean);

    return allStock()
      .filter(bean => norm(bean.Active || "Yes") !== "no")
      .filter(bean => Number(bean.Stock_g || 0) >= minStock)
      .filter(bean => !varietyFilters.length || varietyFilters.some(v => beanVarietyList(bean).some(bv => norm(bv) === norm(v))))
      .map(bean => {
        const beanFlavors = beanFlavorList(bean);
        const flavorMatches = flavors.length ? flavors.filter(f => beanFlavors.some(bf => norm(bf) === norm(f))).length : 1;
        const flavorScore = flavors.length ? (flavorMatches ? 25 + (flavorMatches - 1) * 5 : 0) : 25;
        const brewScore = (brew === "Both" || norm(bean.BestBrew) === "both" || norm(bean.BestBrew) === norm(brew)) ? 20 : 0;
        const varietyScore = varietyFilters.length ? 10 : 0;
        const score = (5 - Math.abs((Number(bean.Sweetness) || 3) - sweet)) * 20 +
          (5 - Math.abs((Number(bean.Acidity) || 3) - acid)) * 20 +
          (5 - Math.abs((Number(bean.Body) || 3) - body)) * 15 + flavorScore + brewScore + varietyScore;
        return { bean, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);
  }

  function suggestedBrew(bean) {
    const brew = $("filterBrew").value;
    if (brew === "Japanese Iced") return "Japanese Iced";
    if (brew === "Hot V60") return "Hot V60";
    if (/dark/i.test(bean.RoastProfile || "")) return "Hario Switch - Hybrid";
    if (/infused|carbonic|anaerobic|maceration/i.test(bean.Process || "")) return "Hot V60 - controlled";
    return "Hot V60";
  }

  function suggestedDripper(bean, brew) {
    if (brew === "Japanese Iced") return "Hario V60 02 Plastic / Hario Switch Full Open";
    if (/infused|carbonic|anaerobic|maceration/i.test(bean.Process || "")) return "Kalita Wave 185 / Orea V4 / Switch Hybrid";
    if (/light|nordic/i.test(bean.RoastProfile || "")) return "Origami M / V60 Ceramic";
    if (/dark/i.test(bean.RoastProfile || "")) return "Hario Switch Hybrid";
    return "Hario V60 02";
  }

  function coffeeInventoryCapabilities() {
    const workspaceReady = canUseWorkspaceModules();
    return COFFEE_INVENTORY_VIEW?.capabilities?.({ role: currentRole, workspaceReady }) || {
      view: workspaceReady,
      create: workspaceReady,
      edit: workspaceReady && canAdmin(),
      delete: workspaceReady && canAdmin(),
      consume: workspaceReady
    };
  }

  function coffeeRecordKey(bean = {}) {
    return COFFEE_INVENTORY_VIEW?.recordKey?.(bean) || String(bean.CloudID || bean.BeanID || "");
  }

  function stockStatusFor(bean = {}) {
    return STOCK_SERVICE?.getStatus(bean.Stock_g, 15) || {
      key: Number(bean.Stock_g || 0) > 0 ? "ready" : "empty",
      label: Number(bean.Stock_g || 0) > 0 ? "Tersedia" : "Habis",
      className: Number(bean.Stock_g || 0) > 0 ? "stock-ready" : "stock-empty",
      cups: Math.floor(Math.max(0, Number(bean.Stock_g) || 0) / 15)
    };
  }

  function recordDateLabel(value) {
    if (!value) return "Belum tercatat";
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return "Belum tercatat";
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
  }

  function updateOperationalFilterOptions(id, values = [], allLabel = "Semua") {
    const select = $(id);
    if (!select) return;
    const previous = select.value || "all";
    select.innerHTML = `<option value="all">${html(allLabel)}</option>${values.map(value => `<option value="${html(value)}">${html(value)}</option>`).join("")}`;
    if (previous === "all" || values.includes(previous)) select.value = previous;
  }

  function coffeeFilterState() {
    return {
      query: $("beansSearch")?.value || "",
      origin: $("beansOriginFilter")?.value || "all",
      process: $("beansProcessFilter")?.value || "all",
      active: $("beansActiveFilter")?.value || "all"
    };
  }

  function inventoryFilterState() {
    return {
      query: $("stockSearch")?.value || "",
      status: $("stockStatusFilter")?.value || "all",
      active: $("stockActiveFilter")?.value || "all"
    };
  }

  function hasOperationalFilters(filters = {}) {
    return COFFEE_INVENTORY_VIEW?.hasFilters?.(filters) || Object.values(filters).some(value => value && value !== "all");
  }

  function setOperationalListState(id, stateName, title = "", detail = "") {
    const target = $(id);
    if (!target) return;
    const visible = Boolean(stateName);
    target.classList.toggle("hidden", !visible);
    target.hidden = !visible;
    target.dataset.state = stateName || "ready";
    target.innerHTML = visible ? `<strong>${html(title)}</strong>${detail ? `<p>${html(detail)}</p>` : ""}` : "";
  }

  function setOperationalListVisible(kind, visible) {
    const selector = kind === "coffee" ? "#tab-beans .coffee-table-shell" : "#tab-stock .inventory-table-shell";
    document.querySelector(selector)?.classList.toggle("hidden", !visible);
    const mobile = $(kind === "coffee" ? "beansMobileList" : "stockMobileList");
    mobile?.classList.toggle("hidden", !visible);
  }

  function renderRecordDetailSection(title, pairs = []) {
    const visible = pairs.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");
    if (!visible.length) return "";
    return `<section class="record-detail-section"><h3>${html(title)}</h3><div class="record-detail-grid">${visible.map(([label, value]) => `<div><span>${html(label)}</span><strong>${html(value)}</strong></div>`).join("")}</div></section>`;
  }

  function coffeeActions(bean = {}) {
    const key = html(coffeeRecordKey(bean));
    const name = html(bean.CoffeeName || bean.BeanID || "Coffee");
    const capabilities = coffeeInventoryCapabilities();
    return `<div class="coffee-actions"><button class="secondary" type="button" data-coffee-action="view" data-coffee-id="${key}" aria-label="Lihat detail ${name}">Lihat</button>${capabilities.edit ? `<button class="ghost" type="button" data-coffee-action="edit" data-coffee-id="${key}" aria-label="Edit ${name} di Inventory">Edit</button>` : ""}</div>`;
  }

  function inventoryActions(bean = {}) {
    const key = html(coffeeRecordKey(bean));
    const name = html(bean.CoffeeName || bean.BeanID || "Coffee");
    const capabilities = coffeeInventoryCapabilities();
    return `<div class="inventory-actions"><button class="secondary" type="button" data-stock-action="view" data-stock-id="${key}" aria-label="Lihat Inventory ${name}">Lihat</button>${capabilities.edit ? `<button class="ghost" type="button" data-stock-action="edit" data-stock-id="${key}" aria-label="Edit Inventory ${name}">Edit</button>` : ""}${capabilities.delete ? `<button class="danger" type="button" data-stock-action="delete" data-stock-id="${key}" aria-label="Hapus Inventory ${name}">Hapus</button>` : ""}</div>`;
  }

  function renderBeansTable() {
    const tbody = $("beansTable")?.querySelector("tbody");
    const mobile = $("beansMobileList");
    if (!tbody || !mobile) return [];

    const capabilities = coffeeInventoryCapabilities();
    const locked = !capabilities.view;
    setModuleLocked("tab-beans", "beansAccessNotice", locked, privateModuleMessage("Biji Kopi"));
    if ($("beansAddCoffeeBtn")) $("beansAddCoffeeBtn").hidden = !capabilities.create;

    if (cloudBootstrapPending) {
      updateCoffeeOverview([], true);
      tbody.innerHTML = "";
      mobile.innerHTML = "";
      setOperationalListVisible("coffee", false);
      setOperationalListState("beansListState", "loading", "Menyiapkan Coffee", "Memeriksa sesi, workspace, dan sinkronisasi data.");
      if ($("beansResultStatus")) $("beansResultStatus").textContent = "Memuat workspace…";
      return [];
    }

    if (locked) {
      updateCoffeeOverview([], true);
      tbody.innerHTML = "";
      mobile.innerHTML = "";
      setOperationalListVisible("coffee", false);
      setOperationalListState("beansListState", cloudBootstrapFailed ? "error" : "locked", cloudBootstrapFailed ? "Coffee belum dapat dimuat" : "Coffee privat belum terbuka", privateModuleMessage("Biji Kopi"));
      if ($("beansResultStatus")) $("beansResultStatus").textContent = "Akses workspace diperlukan";
      return [];
    }

    const rows = allStock();
    const distinct = COFFEE_INVENTORY_VIEW?.distinctValues;
    updateOperationalFilterOptions("beansOriginFilter", distinct ? distinct(rows, "Origin") : uniq(rows.map(bean => bean.Origin)), "Semua origin");
    updateOperationalFilterOptions("beansProcessFilter", distinct ? distinct(rows, "Process") : uniq(rows.map(bean => bean.Process)), "Semua proses");
    updateCoffeeOverview(rows, false);

    const filters = coffeeFilterState();
    const visibleRows = COFFEE_INVENTORY_VIEW?.filterCoffee?.(rows, filters) || rows;
    if ($("beansResultStatus")) $("beansResultStatus").textContent = `${visibleRows.length} dari ${rows.length} Coffee`;

    if (!rows.length) {
      tbody.innerHTML = "";
      mobile.innerHTML = "";
      setOperationalListVisible("coffee", false);
      setOperationalListState("beansListState", "empty", "Belum ada Coffee", "Tambahkan record pertama melalui Inventory untuk membangun master data workspace.");
      return [];
    }

    if (!visibleRows.length) {
      tbody.innerHTML = "";
      mobile.innerHTML = "";
      setOperationalListVisible("coffee", false);
      setOperationalListState("beansListState", "no-results", "Tidak ada hasil", "Ubah kata kunci atau reset filter Coffee.");
      return [];
    }

    setOperationalListState("beansListState", "");
    setOperationalListVisible("coffee", true);
    tbody.innerHTML = visibleRows.map(bean => {
      const status = stockStatusFor(bean);
      const flavors = beanFlavorList(bean).join(" · ") || "Belum dicatat";
      const varieties = beanVarietyList(bean).join(" / ") || "Belum dicatat";
      return `<tr><td><div class="coffee-primary"><strong>${html(bean.CoffeeName || "Coffee tanpa nama")}</strong><small>${html([bean.Producer, bean.BeanID].filter(Boolean).join(" · ") || "Tanpa produsen / kode")}</small></div></td><td>${html(bean.Origin || "Belum dicatat")}</td><td><strong>${html(varieties)}</strong><br><small class="coffee-cell-meta">${html(bean.Process || "Proses belum dicatat")}</small></td><td><strong>${html(bean.RoastProfile || "Belum dicatat")}</strong><br><small class="coffee-cell-meta">${html(flavors)}</small></td><td><div class="coffee-stock-stack"><strong class="coffee-stock-value">${html(fmt(bean.Stock_g, 1))} g</strong><span class="coffee-status-pill ${html(status.className)}">${html(status.label)}</span></div></td><td>${html(recordDateLabel(bean.UpdatedAt || bean.CreatedAt))}</td><td>${coffeeActions(bean)}</td></tr>`;
    }).join("");
    mobile.innerHTML = visibleRows.map(bean => {
      const status = stockStatusFor(bean);
      return `<article class="coffee-mobile-card" role="listitem"><div class="coffee-mobile-card__header"><div><strong>${html(bean.CoffeeName || "Coffee tanpa nama")}</strong><small>${html([bean.Origin, bean.BeanID].filter(Boolean).join(" · ") || "Origin belum dicatat")}</small></div><span class="coffee-status-pill ${html(status.className)}">${html(status.label)}</span></div><div class="coffee-mobile-card__meta"><span>${html(beanVarietyList(bean).join(" / ") || "Varietas belum dicatat")} · ${html(bean.Process || "Proses belum dicatat")}</span><strong>${html(fmt(bean.Stock_g, 1))} g</strong></div>${coffeeActions(bean)}</article>`;
    }).join("");
    return visibleRows;
  }

  function setModuleLocked(sectionId, noticeId, locked, message) {
    const section = $(sectionId);
    const notice = $(noticeId);
    if (notice) {
      notice.classList.toggle("hidden", !locked);
      notice.innerHTML = locked ? `${html(message)}<small>Data di menu ini bersifat privat per akun dan workspace. Hasil seduhan publik tersedia di menu Hasil Seduhan Publik.</small>` : "";
    }
    if (!section) return;
    const forms = section.querySelectorAll("form");
    forms.forEach(form => form.classList.toggle("module-disabled", locked));
  }

  function updateCoffeeOverview(rows = [], locked = false) {
    const values = locked ? ["—", "—", "—", "—"] : [
      rows.length,
      rows.filter(bean => norm(bean.Active || "Yes") !== "no").length,
      uniq(rows.map(bean => bean.Origin).filter(Boolean)).length,
      rows.filter(bean => Number(bean.Stock_g || 0) > 0).length
    ];
    ["coffeeTotalCount", "coffeeActiveCount", "coffeeOriginCount", "coffeeAvailableCount"].forEach((id, index) => {
      if ($(id)) $(id).textContent = values[index];
    });
  }


  function updateStockOverview(rows = [], locked = false) {
    const summary = locked ? { records: "—", available: "—", attention: "—", empty: "—" }
      : COFFEE_INVENTORY_VIEW?.inventorySummary?.(rows, quantity => STOCK_SERVICE?.getStatus(quantity, 15) || stockStatusFor({ Stock_g: quantity })) || {
        records: rows.length,
        available: rows.filter(bean => Number(bean.Stock_g || 0) > 0).length,
        attention: rows.filter(bean => ["low", "critical"].includes(stockStatusFor(bean).key)).length,
        empty: rows.filter(bean => stockStatusFor(bean).key === "empty").length
      };
    [["stockBeanCount", summary.records], ["stockAvailableCount", summary.available], ["stockAttentionCount", summary.attention], ["stockEmptyCount", summary.empty]].forEach(([id, value]) => {
      if ($(id)) $(id).textContent = value;
    });
  }


  function renderStockTable() {
    renderBrewStockOptions();
    const tbody = $("stockTable")?.querySelector("tbody");
    const mobile = $("stockMobileList");
    if (!tbody || !mobile) return [];
    const capabilities = coffeeInventoryCapabilities();
    const locked = !capabilities.view;
    setModuleLocked("tab-stock", "stockAccessNotice", locked, privateModuleMessage("Stok Kopi"));
    if ($("stockAddRecordBtn")) $("stockAddRecordBtn").hidden = !capabilities.create;
    $("stockEditorPanel")?.classList.toggle("hidden", !capabilities.create);

    if (cloudBootstrapPending) {
      updateStockOverview([], true);
      tbody.innerHTML = "";
      mobile.innerHTML = "";
      setOperationalListVisible("inventory", false);
      setOperationalListState("stockListState", "loading", "Menyiapkan Inventory", "Memeriksa sesi, workspace, dan kuantitas terbaru.");
      if ($("stockResultStatus")) $("stockResultStatus").textContent = "Memuat workspace…";
      return [];
    }

    if (locked) {
      updateStockOverview([], true);
      tbody.innerHTML = "";
      mobile.innerHTML = "";
      setOperationalListVisible("inventory", false);
      setOperationalListState("stockListState", cloudBootstrapFailed ? "error" : "locked", cloudBootstrapFailed ? "Inventory belum dapat dimuat" : "Inventory privat belum terbuka", privateModuleMessage("Inventory"));
      if ($("stockResultStatus")) $("stockResultStatus").textContent = "Akses workspace diperlukan";
      return [];
    }

    const rows = allStock();
    updateStockOverview(rows, false);
    const filters = inventoryFilterState();
    const visibleRows = COFFEE_INVENTORY_VIEW?.filterInventory?.(rows, filters, quantity => STOCK_SERVICE?.getStatus(quantity, 15) || stockStatusFor({ Stock_g: quantity })) || rows;
    if ($("stockResultStatus")) $("stockResultStatus").textContent = `${visibleRows.length} dari ${rows.length} record`;

    if (!rows.length) {
      tbody.innerHTML = "";
      mobile.innerHTML = "";
      setOperationalListVisible("inventory", false);
      setOperationalListState("stockListState", "empty", "Inventory masih kosong", "Tambahkan record pertama untuk menghubungkan profil Coffee dan kuantitas workspace.");
      return [];
    }

    if (!visibleRows.length) {
      tbody.innerHTML = "";
      mobile.innerHTML = "";
      setOperationalListVisible("inventory", false);
      setOperationalListState("stockListState", "no-results", "Tidak ada hasil", "Ubah kata kunci atau reset filter Inventory.");
      return [];
    }

    setOperationalListState("stockListState", "");
    setOperationalListVisible("inventory", true);
    tbody.innerHTML = visibleRows.map(bean => {
      const stockStatus = stockStatusFor(bean);
      const profile = [bean.Variety, bean.Process, bean.RoastProfile].filter(Boolean).join(" · ") || "Profil belum dicatat";
      return `<tr><td><div class="inventory-primary"><strong>${html(bean.CoffeeName || "Coffee tanpa nama")}</strong><small>${html([bean.Producer, bean.BeanID].filter(Boolean).join(" · ") || "Tanpa produsen / kode")}</small></div></td><td><div class="inventory-quantity-stack"><strong class="inventory-quantity-value">${html(fmt(bean.Stock_g, 1))} g</strong><small class="inventory-cell-meta">${html(stockStatus.cups)} cangkir @15 g</small></div></td><td><div class="inventory-status-stack"><span class="inventory-status-pill ${html(stockStatus.className)}">${html(stockStatus.label)}</span><small class="inventory-cell-meta">Coffee ${norm(bean.Active || "Yes") === "no" ? "tidak aktif" : "aktif"}</small></div></td><td>${html(bean.Origin || "Belum dicatat")}</td><td>${html(profile)}</td><td>${html(recordDateLabel(bean.UpdatedAt || bean.CreatedAt))}</td><td>${inventoryActions(bean)}</td></tr>`;
    }).join("");
    mobile.innerHTML = visibleRows.map(bean => {
      const stockStatus = stockStatusFor(bean);
      return `<article class="inventory-mobile-card" role="listitem"><div class="inventory-mobile-card__header"><div><strong>${html(bean.CoffeeName || "Coffee tanpa nama")}</strong><small>${html([bean.Origin, bean.BeanID].filter(Boolean).join(" · ") || "Origin belum dicatat")}</small></div><span class="inventory-status-pill ${html(stockStatus.className)}">${html(stockStatus.label)}</span></div><div class="inventory-mobile-card__meta"><strong>${html(fmt(bean.Stock_g, 1))} g</strong><span>${html([bean.Variety, bean.Process, bean.RoastProfile].filter(Boolean).join(" · ") || "Profil belum dicatat")}</span></div>${inventoryActions(bean)}</article>`;
    }).join("");
    return visibleRows;
  }

  function findStockRecord(id) {
    return allStock().find(item => String(coffeeRecordKey(item)) === String(id)) || null;
  }

  function openCoffeeDetail(id, trigger) {
    const bean = findStockRecord(id);
    if (!bean) return showMessage("Coffee tidak ditemukan di workspace aktif.", "error");
    const status = stockStatusFor(bean);
    if ($("coffeeDetailTitle")) $("coffeeDetailTitle").textContent = bean.CoffeeName || bean.BeanID || "Detail Coffee";
    if ($("coffeeDetailMeta")) $("coffeeDetailMeta").textContent = [bean.BeanID, bean.Origin, `Diperbarui ${recordDateLabel(bean.UpdatedAt || bean.CreatedAt)}`].filter(Boolean).join(" · ");
    if ($("coffeeDetailBody")) $("coffeeDetailBody").innerHTML = [
      renderRecordDetailSection("Identity", [["Nama Coffee", bean.CoffeeName], ["Kode Coffee", bean.BeanID], ["Workspace", currentWorkspace?.name]]),
      renderRecordDetailSection("Origin / Production", [["Origin", bean.Origin], ["Produsen / farm", bean.Producer], ["Tanggal roast", bean.RoastDate]]),
      renderRecordDetailSection("Coffee", [["Varietas", beanVarietyList(bean).join(" / ")], ["Proses", bean.Process], ["Profil sangrai", bean.RoastProfile], ["Seduhan terbaik", bean.BestBrew]]),
      renderRecordDetailSection("Profile", [["Flavor", beanFlavorList(bean).join(" · ")], ["Sweetness", bean.Sweetness], ["Acidity", bean.Acidity], ["Body", bean.Body]]),
      renderRecordDetailSection("Inventory", [["Kuantitas", `${fmt(bean.Stock_g, 1)} g`], ["Status", status.label], ["Estimasi", `${status.cups} cangkir @15 g`], ["Coffee aktif", norm(bean.Active || "Yes") === "no" ? "Tidak" : "Ya"]]),
      bean.Notes ? `<section class="record-detail-section"><h3>Notes</h3><p class="record-detail-notes">${html(bean.Notes)}</p></section>` : ""
    ].filter(Boolean).join("");
    if (window.LESTARI_UI?.openModal) window.LESTARI_UI.openModal("coffeeDetailModal", trigger);
  }

  function openStockDetail(id, trigger) {
    const bean = findStockRecord(id);
    if (!bean) return showMessage("Record Inventory tidak ditemukan di workspace aktif.", "error");
    const status = stockStatusFor(bean);
    if ($("stockDetailTitle")) $("stockDetailTitle").textContent = bean.CoffeeName || bean.BeanID || "Detail Inventory";
    if ($("stockDetailMeta")) $("stockDetailMeta").textContent = [bean.BeanID, currentWorkspace?.name, `Diperbarui ${recordDateLabel(bean.UpdatedAt || bean.CreatedAt)}`].filter(Boolean).join(" · ");
    if ($("stockDetailBody")) $("stockDetailBody").innerHTML = [
      renderRecordDetailSection("Quantity state", [["Kuantitas", `${fmt(bean.Stock_g, 1)} g`], ["Status", status.label], ["Estimasi", `${status.cups} cangkir @15 g`], ["Unit", "gram"]]),
      renderRecordDetailSection("Linked Coffee", [["Coffee", bean.CoffeeName], ["Kode", bean.BeanID], ["Origin", bean.Origin], ["Profil", [bean.Variety, bean.Process, bean.RoastProfile].filter(Boolean).join(" · ")]]),
      renderRecordDetailSection("Operational context", [["Coffee aktif", norm(bean.Active || "Yes") === "no" ? "Tidak" : "Ya"], ["Seduhan terbaik", bean.BestBrew], ["Harga pembelian", Number(bean.Price || 0) > 0 ? fmtCurrency(bean.Price) : ""], ["Tanggal roast", bean.RoastDate]]),
      `<section class="record-detail-section"><h3>Riwayat</h3><p class="record-detail-notes">Aplikasi saat ini tidak memiliki ledger transaksi Inventory. Detail ini menampilkan state terbaru dari record Coffee yang sama.</p></section>`
    ].filter(Boolean).join("");
    if (window.LESTARI_UI?.openModal) window.LESTARI_UI.openModal("stockDetailModal", trigger);
  }

  function editCoffeeFromDirectory(id) {
    if (!canAdmin()) return showMessage("Edit Coffee hanya tersedia untuk Admin Workspace.", "error");
    showTab("stock");
    requestAnimationFrame(() => editStockBean(id));
  }

  function updateStockQuantityPreview() {
    const current = editingStockId ? findStockRecord(editingStockId) : null;
    const next = Number($("stockQty")?.value);
    if ($("stockCurrentQty")) $("stockCurrentQty").textContent = current ? `${fmt(current.Stock_g, 1)} g` : "—";
    if ($("stockResultQty")) $("stockResultQty").textContent = Number.isFinite(next) && next >= 0 ? `${fmt(next, 1)} g` : "Periksa nilai";
  }

  function setStockFormError(message = "") {
    const target = $("stockFormError");
    if (!target) return;
    target.textContent = message;
    target.classList.toggle("hidden", !message);
    target.hidden = !message;
  }

  function setStockFormMode(mode = "create") {
    const submitBtn = $("stockSubmitBtn");
    const cancelBtn = $("stockCancelEditBtn");
    const title = $("stockFormTitle");
    const badge = $("stockFormModeBadge");
    const editing = mode === "edit";
    if (submitBtn) submitBtn.textContent = editing ? "Simpan perubahan Coffee & Inventory" : "Simpan record Inventory";
    if (cancelBtn) cancelBtn.classList.toggle("hidden", !editing);
    if (title) title.textContent = editing ? "Edit Coffee & Inventory" : "Tambah record Inventory";
    if (badge) {
      badge.textContent = editing ? "Mode edit · Admin" : "Record baru";
      badge.className = `v45-badge ${editing ? "v45-badge--warning" : "v45-badge--info"}`;
    }
    updateStockQuantityPreview();
  }

  function resetStockForm() {
    editingStockId = null;
    $("stockForm")?.reset();
    setStockFormError("");
    hydrateSelects();
    setStockFormMode("create");
  }

  function editStockBean(id) {
    if (!canAdmin()) return showMessage("Edit stok hanya tersedia untuk Admin Workspace.", "error");
    const bean = allStock().find(item => String(item.CloudID || item.BeanID) === String(id));
    if (!bean) return showMessage("Data stok tidak ditemukan. Muat ulang data terlebih dahulu.", "error");
    editingStockId = bean.CloudID || bean.BeanID;
    if ($("stockName")) $("stockName").value = bean.CoffeeName || "";
    if ($("stockOrigin")) $("stockOrigin").value = bean.Origin || "";
    if ($("stockProducer")) $("stockProducer").value = bean.Producer || "";
    setSelectIfAvailable("stockVariety1", bean.Variety);
    setSelectIfAvailable("stockVariety2", bean.Variety2_optional);
    setProcessFieldValue("stockProcess", "stockProcessCustom", bean.Process);
    setSelectIfAvailable("stockRoast", bean.RoastProfile);
    setSelectIfAvailable("stockFlavor1", bean.FlavorFamily);
    setSelectIfAvailable("stockFlavor2", bean.FlavorFamily2_optional);
    setSelectIfAvailable("stockFlavor3", bean.FlavorFamily3_optional);
    if ($("stockSweet")) $("stockSweet").value = bean.Sweetness || 4;
    if ($("stockAcid")) $("stockAcid").value = bean.Acidity || 4;
    if ($("stockBody")) $("stockBody").value = bean.Body || 3;
    if ($("stockQty")) $("stockQty").value = bean.Stock_g || 0;
    setSelectIfAvailable("stockBestBrew", bean.BestBrew || "Both");
    if ($("stockPrice")) $("stockPrice").value = bean.Price || 0;
    if ($("stockRoastDate")) $("stockRoastDate").value = bean.RoastDate || "";
    setSelectIfAvailable("stockActive", bean.Active || "Yes");
    if ($("stockNotes")) $("stockNotes").value = bean.Notes || "";
    setStockFormMode("edit");
    document.querySelector("#stockEditorPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteStockBean(id) {
    if (!supabaseClient || !canAdmin() || !currentWorkspace) return showMessage("Hapus stok hanya tersedia untuk Admin Workspace.", "error");
    const bean = allStock().find(item => String(item.CloudID || item.BeanID) === String(id));
    if (!bean?.CloudID) return showMessage("Stok ini belum tersimpan di Supabase atau tidak punya CloudID.", "error");
    if (!confirm(`Hapus Coffee/Stock Record ${bean.CoffeeName || bean.BeanID} secara permanen dari workspace? Tindakan ini tidak menghapus Brew Log historis.`)) return;
    try {
      await prepareCloudWrite("Hapus stok kopi");
      const { data, error } = await withTimeout(
        supabaseClient
          .from("stock_beans")
          .delete()
          .eq("id", bean.CloudID)
          .eq("workspace_id", currentWorkspace.id)
          .select("id")
          .single(),
        CLOUD_WRITE_TIMEOUT_MS,
        "Hapus stok kopi"
      );
      if (error || !data) throw error || new Error("Data stok tidak terhapus. Cek policy RLS.");
      state.cloudStock = (state.cloudStock || []).filter(item => item.CloudID !== bean.CloudID);
      if (String(editingStockId || "") === String(bean.CloudID)) resetStockForm();
      renderStockTable();
      renderBeansTable();
      renderMetrics();
      EVENT_BUS.emit("stock:deleted", { bean });
      showMessage("Stok kopi berhasil dihapus.", "success");
    } catch (err) {
      console.error(err);
      showMessage(`Gagal menghapus stok: ${err.message || err}`, "error");
    }
  }

  function applyTopBeanToBrew() {
    const ranked = rankBeans();
    if (!ranked.length) return showMessage("Tidak ada biji kopi yang cocok dengan filter saat ini.", "info");
    const bean = ranked[0].bean;
    renderBrewStockOptions();
    if ($("brewStockSelect") && bean.CloudID && canUseWorkspaceModules()) {
      $("brewStockSelect").value = bean.CloudID;
      syncBrewStockUI({ apply: true });
    } else {
      $("brewVariety").value = bean.Variety || $("brewVariety").value;
      $("brewProcess").value = bean.Process || $("brewProcess").value;
      $("brewRoast").value = bean.RoastProfile || $("brewRoast").value;
    }
    renderBrew();
    showTab("brew");
  }

  function nextId(prefix, list, field) {
    const nums = list.map(x => String(x[field] || "").replace(/\D/g, "")).map(Number).filter(Boolean);
    return `${prefix}${String((Math.max(0, ...nums) + 1)).padStart(3, "0")}`;
  }

  function currentBrewLogBase(extra = {}) {
    syncBrewStockUI({ apply: true });
    const brew = computeBrew();
    const stockBean = selectedBrewStockBean();
    const manualBeanName = $("brewBeanName")?.value.trim() || "";
    const id = extra.BrewID || nextId("BL", allBrewLogs(), "BrewID");
    const qaId = extra.QA_ID || "";
    const defaultVerifyText = "Belum diverifikasi";
    return {
      BrewID: id,
      Date: todayISO(),
      BrewerName: extra.BrewerName || currentBrewerName(),
      BeanName: extra.BeanName || stockBean?.CoffeeName || manualBeanName || $("qaBeanName")?.value || $("brewVariety").value,
      Origin: extra.Origin || stockBean?.Origin || "",
      StockBeanID: extra.StockBeanID || stockBean?.CloudID || "",
      StockBeanCode: extra.StockBeanCode || stockBean?.BeanID || "",
      StockUsage_g: extra.StockUsage_g ?? (stockBean ? brew.dose : ""),
      Variety: $("brewVariety").value,
      Process: selectedProcessValue("brewProcess", "brewProcessCustom"),
      RoastProfile: $("brewRoast").value,
      Dripper: $("brewDripper").value,
      Method: $("brewMode").value,
      Grinder: getSelectedGrinderName(),
      GrindSetting: brew.grinderSetting,
      Temp_C: brew.temp,
      Ratio: brew.ratio,
      Dose_g: brew.dose,
      TotalWater_ml: brew.totalWater,
      HotWater_ml: brew.hotWater,
      Ice_g: brew.ice,
      BrewTime_sec: brew.brewTime,
      Bloom_ml: brew.steps.find(s => s.stage === "Bloom")?.water || 0,
      PourCount: brew.steps.filter(s => /^Pour/.test(s.stage)).length,
      PourPlan: formatRecipeStepPlan(brew.steps),
      Water: $("brewWater").value,
      TDS_ppm: getBy(DATA.waters, "Water", $("brewWater").value).TDS_ppm || "",
      Agitation: "Controlled",
      Filter: "Paper",
      ParentBrewID: extra.ParentBrewID || "",
      PrimaryVariableChanged: extra.PrimaryVariableChanged || defaultVerifyText,
      Hypothesis: extra.Hypothesis || "",
      ResultNotes: extra.ResultNotes || "",
      QA_ID: qaId,
      QA_Final: extra.QA_Final ?? "",
      QA_Status: extra.QA_Status || defaultVerifyText,
      ManualApproval: extra.ManualApproval || "No",
      ApprovedForRecipe: extra.ApprovedForRecipe || defaultVerifyText,
      RecipeKey: recipeKey($("brewVariety").value, selectedProcessValue("brewProcess", "brewProcessCustom"), $("brewRoast").value),
      CurrentMatchScore: "",
      Water_Formula_Note: "TotalWater_ml = Rasio × Dosis_g. Japanese: air panas = 60%, es = 40%.",
      SwitchValveMode: brew.switchMode,
      ValvePlan: formatValvePlan(brew.steps),
      CreatedAt: extra.CreatedAt || new Date().toISOString(),
      UpdatedAt: extra.UpdatedAt || new Date().toISOString()
    };
  }

  async function consumeStockForBrew(stockBean, amount) {
    if (!stockBean?.CloudID || !amount) return null;
    await prepareCloudWrite("Update stok kopi");
    const data = STOCK_SERVICE
      ? await STOCK_SERVICE.consume(supabaseClient, { stockId: stockBean.CloudID, amount, timeoutMs: CLOUD_WRITE_TIMEOUT_MS })
      : await (async () => {
          const { data: raw, error } = await withTimeout(supabaseClient.rpc("consume_stock_for_brew", {
            p_stock_id: stockBean.CloudID,
            p_amount: Number(amount || 0)
          }), CLOUD_WRITE_TIMEOUT_MS, "Update stok kopi");
          if (error) throw error;
          return raw;
        })();
    const updated = fromSnakeStock(data);
    state.cloudStock = uniqueByCloudId([updated, ...(state.cloudStock || []).filter(bean => bean.CloudID !== updated.CloudID)]);
    EVENT_BUS.emit("stock:consumed", { bean: updated, amount: Number(amount || 0) });
    return updated;
  }

  async function saveCurrentBrewDraft(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (brewDraftSaving) return;

    const btn = event?.target?.closest?.("#saveCurrentBrew,[data-action='save-brew-draft']") || $("saveCurrentBrew");
    const originalText = btn?.textContent || "Simpan draft ke Brew Log";

    if (!cloudReady || !supabaseClient) {
      showMessage("Supabase belum tersambung. Cek konfigurasi database, lalu refresh halaman.", "error");
      return;
    }

    if (!canUseWorkspaceModules()) {
      showMessage("Masuk dan pilih workspace untuk menyimpan draft ke Brew Log.", "error");
      return;
    }

    let watchdog;
    let pendingDraftMutations = [];
    try {
      brewDraftSaving = true;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Menyimpan draft...";
      }
      watchdog = createButtonWatchdog({ key: "brew", button: btn, originalText, label: "Simpan draft Brew Log" });
      showMessage("Sedang menyimpan draft ke Brew Log...", "info");

      const stockBean = selectedBrewStockBean();
      const log = currentBrewLogBase();
      const brewValidation = BREW_SERVICE?.validateBrew(log, { stockBean });
      if (brewValidation && !brewValidation.ok) throw new Error(brewValidation.first);
      const linkedPayload = toSnakeBrew(log);
      const initialPayload = stockBean
        ? { ...linkedPayload, stock_bean_id: null, stock_bean_code: null, stock_usage_g: null }
        : linkedPayload;
      pendingDraftMutations = [normalizeSyncMutation({ type: "insert", table: "brew_logs", payload: initialPayload })];
      const inserted = await executeSyncMutation(pendingDraftMutations[0], "Simpan draft Brew Log");
      pendingDraftMutations.shift();
      let saved = fromSnakeBrew(inserted.data);

      state.cloudBrewLogs.unshift(saved);
      let stockMessage = "";
      if (stockBean) {
        try {
          const updatedStock = await consumeStockForBrew(stockBean, log.Dose_g);
          const stockLinkPayload = {
            stock_bean_id: stockBean.CloudID,
            stock_bean_code: stockBean.BeanID || null,
            stock_usage_g: Number(log.Dose_g || 0),
            updated_at: new Date().toISOString()
          };
          pendingDraftMutations = [normalizeSyncMutation({
            type: "update",
            table: "brew_logs",
            id: saved.CloudID,
            payload: stockLinkPayload
          })];
          try {
            const linked = await executeSyncMutation(pendingDraftMutations[0], "Tautkan pemakaian stok ke Brew Log");
            pendingDraftMutations.shift();
            saved = fromSnakeBrew(linked.data);
            state.cloudBrewLogs = uniqueByCloudId([saved, ...(state.cloudBrewLogs || []).filter(item => item.CloudID !== saved.CloudID)]);
            stockMessage = updatedStock ? ` Stok ${updatedStock.CoffeeName || "kopi"} tersisa ${updatedStock.Stock_g}g.` : "";
          } catch (linkErr) {
            console.error("Stock link update failed", linkErr);
            enqueuePendingSyncBatch("Tautkan stok ke Brew Log", pendingDraftMutations);
            pendingDraftMutations = [];
            stockMessage = " Stok sudah berkurang, tetapi tautan pemakaian masuk antrean sinkronisasi. Jangan hapus draft sebelum antrean selesai.";
          }
        } catch (stockErr) {
          console.error("Stock deduction failed", stockErr);
          stockMessage = ` Draft tersimpan tanpa tautan stok karena pemotongan stok gagal: ${stockErr.message || stockErr}`;
        }
      }
      renderStockTable();
      renderBeansTable();
      renderBrewLogTable();
      renderQABrewOptions();
      renderRecipeOptions(computeBrew());
      renderPublicBrewTable();
      syncFromCloud(false).then(() => {
        renderStockTable();
        renderBrewLogTable();
        renderQABrewOptions();
        renderPublicBrewTable();
      }).catch(console.warn);

      clearAutosaveScope("brew");
      EVENT_BUS.emit("brew:saved", { brew: saved, source: "recommendation" });
      const stockLinkQueued = stockMessage.includes("antrean sinkronisasi");
      updateSyncGuardStatus(stockLinkQueued ? "queued" : "synced", stockLinkQueued ? "Tautan stok tertunda" : "Draft tersinkron", stockLinkQueued ? "Selesaikan antrean sebelum menghapus draft." : `Draft ${saved.BrewID} berhasil masuk Supabase.`);
      showMessage(`Draft ${saved.BrewID} berhasil tersimpan. Buka Brew Log & QA lalu pilih BrewID tersebut untuk verifikasi.${stockMessage}`, /gagal|antrean sinkronisasi/.test(stockMessage) ? "error" : "success");
    } catch (err) {
      console.error("saveCurrentBrewDraft error", err);
      const detail = err?.message || err?.details || err?.hint || String(err);
      if (pendingDraftMutations.length) enqueuePendingSyncBatch("Draft Brew Log", pendingDraftMutations);
      saveAutosaveScope("brew", $("tab-brew"));
      showMessage(`Gagal menyimpan draft ke Supabase: ${detail}. Data sudah diamankan lokal.`, "error");
    } finally {
      if (watchdog) clearTimeout(watchdog);
      brewDraftSaving = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }

  function setQASaveState(stateName, title, text) {
    const stateEl = $("qaSaveState");
    if (stateEl) stateEl.dataset.state = stateName || "ready";
    if ($("qaSaveStateTitle")) $("qaSaveStateTitle").textContent = title || "READY";
    if ($("qaSaveStateText")) $("qaSaveStateText").textContent = text || "Pilih Brew dan periksa hasil evaluasi sebelum menyimpan.";
  }

  function renderQABrewContext() {
    const target = $("qaBrewContext");
    if (!target) return;
    const draft = selectedDraftLog();
    if (!draft) {
      const hasEligible = draftBrewLogsForQA().length > 0;
      target.innerHTML = `<div><span>${hasEligible ? "Konteks belum dipilih" : "Tidak ada item Pending QA"}</span><strong>${hasEligible ? "Pilih Brew ID untuk melihat kopi, metode, resep, tanggal, dan brewer." : "Semua Brew yang tersedia sudah memiliki QA atau Brew Log masih kosong."}</strong></div>`;
      return;
    }
    const recipe = BREW_LOG_QA_VIEW?.recipeSummary?.(draft)
      || [draft.Dose_g ? `${fmt(draft.Dose_g)}g` : "", draft.TotalWater_ml ? `${fmt(draft.TotalWater_ml)}ml` : "", draft.Ratio ? `1:${fmt(draft.Ratio, 1)}` : "", draft.Temp_C ? `${fmt(draft.Temp_C, 1)}°C` : ""].filter(Boolean).join(" · ")
      || "Recipe belum dicatat";
    target.innerHTML = `
      <div><span>Kopi</span><strong>${html(draft.BeanName || draft.Variety || "Belum dicatat")}</strong></div>
      <div><span>Metode</span><strong>${html(draft.Method || draft.Dripper || "Belum dicatat")}</strong></div>
      <div><span>Recipe</span><strong>${html(recipe)}</strong></div>
      <div><span>Tanggal Brew</span><strong>${html(draft.Date || "Belum dicatat")}</strong></div>
      <div><span>Brewer</span><strong>${html(draft.BrewerName || "Belum dicatat")}</strong></div>
    `;
  }

  function computeQAFromForm() {
    const ids = ["qaAroma", "qaFlavor", "qaAftertaste", "qaAcidityQuality", "qaSweetness", "qaBody", "qaBalance", "qaClarity", "qaFinish", "qaConsistency"];
    const values = ids.map(id => Number($(id)?.value) || 0);
    if (QA_SERVICE) return QA_SERVICE.score(values, Number($("qaDefect")?.value) || 0);
    const avg = values.reduce((sum, value) => sum + value, 0) / ids.length;
    return round(clamp(avg - (Number($("qaDefect")?.value) || 0), 0, 10), 2);
  }

  function qaMetricsFromForm() {
    return {
      aroma: $("qaAroma")?.value,
      flavor: $("qaFlavor")?.value,
      aftertaste: $("qaAftertaste")?.value,
      acidity: $("qaAcidityQuality")?.value,
      sweetness: $("qaSweetness")?.value,
      body: $("qaBody")?.value,
      balance: $("qaBalance")?.value,
      clarity: $("qaClarity")?.value,
      finish: $("qaFinish")?.value,
      consistency: $("qaConsistency")?.value
    };
  }

  function qaMetricsFromRow(row = {}) {
    return {
      aroma: row.Aroma,
      flavor: row.Flavor,
      aftertaste: row.Aftertaste,
      acidity: row.AcidityQuality,
      sweetness: row.Sweetness,
      body: row.Body,
      balance: row.Balance,
      clarity: row.Clarity,
      finish: row.Finish,
      consistency: row.Consistency
    };
  }

  function previousQAContext() {
    const draft = selectedDraftLog();
    if (!draft) return null;
    const directParent = draft.ParentBrewID
      ? allQA().find(row => norm(row.BrewID) === norm(draft.ParentBrewID))
      : null;
    if (directParent) return { row: directParent, label: draft.ParentBrewID };

    const sameBeanBrewIds = new Set(sortBrewNewest(allBrewLogs())
      .filter(log => log.BrewID !== draft.BrewID && norm(log.BeanName || log.Variety) === norm(draft.BeanName || draft.Variety))
      .map(log => log.BrewID));
    const latest = allQA()
      .filter(row => sameBeanBrewIds.has(row.BrewID))
      .sort((a, b) => new Date(b.Date || 0) - new Date(a.Date || 0))[0];
    return latest ? { row: latest, label: latest.BrewID } : null;
  }

  function renderQAPreview() {
    const final = computeQAFromForm();
    const approvalRequested = currentUser ? $("qaApproval").value === "Yes" : true;
    const pass = final >= APPROVAL_THRESHOLD && (approvalRequested || !currentUser);
    $("qaFinalPreview").textContent = fmt(final, 2);
    $("qaStatusPreview").textContent = pass ? "QA PASS" : "RETEST";
    $("qaStatusPreview").className = pass ? "qa-pass" : "qa-retest";

    const selected = selectedDraftLog();
    if ($("qaReviewBrew")) $("qaReviewBrew").textContent = selected
      ? `${selected.BrewID} · ${selected.BeanName || selected.Variety || "Tanpa nama"}`
      : "Belum dipilih";
    if ($("qaReviewResult")) $("qaReviewResult").textContent = `${fmt(final, 2)} · ${pass ? "QA PASS" : "RETEST"}`;
    if ($("qaReviewValidation")) $("qaReviewValidation").textContent = selected ? "Siap disimpan" : "Pilih Brew ID";
    if (!qaSaving) setQASaveState("ready", "READY", selected
      ? "Brew dan hasil evaluasi siap diperiksa sebelum disimpan."
      : "Pilih Brew dan periksa hasil evaluasi sebelum menyimpan.");
    renderQABrewContext();

    if (!QA_SERVICE) return;
    const metrics = qaMetricsFromForm();
    const issue = $("qaPrimaryIssue")?.value || "none";
    const target = $("qaTargetFocus")?.value || "balanced";
    const previousContext = previousQAContext();
    const previous = previousContext ? {
      metrics: qaMetricsFromRow(previousContext.row),
      finalScore: Number(previousContext.row.Final_QA || 0),
      label: previousContext.label
    } : null;
    const guidance = QA_SERVICE.guidance(metrics, final, { issue, target });
    const diagnostic = QA_SERVICE.diagnose({ metrics, finalScore: final, issue, target, previous });

    const guidanceEl = $("qaGuidance");
    if (guidanceEl) {
      guidanceEl.innerHTML = `<strong>${html(guidance.message)}</strong><small>${html(guidance.advice)}</small>`;
      guidanceEl.dataset.status = pass ? "pass" : "review";
    }

    const planEl = $("qaDiagnosticPlan");
    if (planEl) {
      planEl.innerHTML = `
        <span>Rencana Dial-in</span>
        <strong>${html(diagnostic.status)}</strong>
        <p>${html(diagnostic.summary)}</p>
        <ul class="qa-action-list">
          <li><b>Hasil yang diharapkan:</b> ${html(diagnostic.expected)}</li>
          <li><b>Jangan diubah bersamaan:</b> ${html(diagnostic.avoid)}</li>
          <li><b>Target:</b> ${html(target === "balanced" ? "lebih seimbang" : target)}</li>
        </ul>
      `;
    }

    const comparisonEl = $("qaComparisonCard");
    if (comparisonEl) {
      const deltaClass = diagnostic.delta > 0.05 ? "is-up" : diagnostic.delta < -0.05 ? "is-down" : "";
      const deltaText = diagnostic.delta === null ? "Belum ada data" : `${diagnostic.delta > 0 ? "+" : ""}${fmt(diagnostic.delta, 2)}`;
      comparisonEl.innerHTML = `
        <span>Perbandingan</span>
        <strong>${html(previous?.label || "Belum ada brew pembanding")}</strong>
        <p>${html(diagnostic.comparison)}</p>
        <p class="qa-comparison-delta ${deltaClass}">${html(deltaText)}</p>
      `;
    }

    const metricEl = $("qaMetricMap");
    if (metricEl) {
      metricEl.innerHTML = `
        <span>Peta Sensorik</span>
        <div class="qa-metric-bars">
          ${diagnostic.entries.map(item => `<div class="qa-metric-row"><span>${html(item.label)}</span><div class="qa-metric-track"><i style="--metric-value:${clamp(item.value * 10, 0, 100)}%"></i></div><strong>${html(fmt(item.value, 1))}</strong></div>`).join("")}
        </div>
      `;
    }
  }

  async function saveQA(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (qaSaving) return;

    const btn = e?.target?.closest?.("#qaSubmitBtn") || $("qaSubmitBtn");
    const originalText = btn?.textContent || "Simpan Brew Log + QA";

    if (!cloudReady || !supabaseClient) {
      setQASaveState("failed", "FAILED / RETRY", "Supabase belum siap. Periksa koneksi lalu coba kembali.");
      showMessage("Database belum tersambung. Hubungkan Supabase terlebih dahulu.", "error");
      return;
    }

    const isGuest = !currentUser;
    if (currentUser && !canUseWorkspaceModules()) {
      setQASaveState("failed", "FAILED / RETRY", "Workspace aktif dan keanggotaan yang valid diperlukan sebelum menyimpan QA.");
      showMessage(privateModuleMessage("Brew Log & QA"), "error");
      showTab("admin");
      return;
    }

    let draft = null;
    if (currentUser) {
      draft = selectedDraftLog();
      if (!draft) {
        setQASaveState("failed", "FAILED / RETRY", "Pilih satu Brew berstatus Pending QA sebelum menyimpan.");
        showMessage("Pilih BrewID Asal dari draft Data Seduhan terlebih dahulu. Kalau belum ada, simpan draft dari menu Rekomendasi Seduh.", "error");
        return;
      }
    }

    const final = computeQAFromForm();
    const approvalRequested = currentUser ? $("qaApproval").value === "Yes" : true;
    const approved = final >= APPROVAL_THRESHOLD && (isGuest || (approvalRequested && canModerate()));
    const qaId = nextId("QA", allQA(), "QA_ID");

    const hasVariable = currentUser ? Boolean($("qaHasVariable")?.checked) : false;
    const variableText = currentUser
      ? (hasVariable ? ($("qaVariable").value.trim() || "Ada perubahan variabel") : "Tidak ada perubahan variabel")
      : "Input publik tanpa draft";

    const issueLabel = $("qaPrimaryIssue")?.selectedOptions?.[0]?.textContent?.trim() || "Belum ditentukan";
    const targetLabel = $("qaTargetFocus")?.selectedOptions?.[0]?.textContent?.trim() || "Lebih seimbang";
    const structuredNotes = [
      $("qaNotes").value.trim(),
      `Masalah utama: ${issueLabel}`,
      `Target berikutnya: ${targetLabel}`
    ].filter(Boolean).join(" | ");

    const qaLogFields = {
      QA_ID: qaId,
      PrimaryVariableChanged: variableText,
      Hypothesis: $("qaHypothesis").value,
      ResultNotes: structuredNotes,
      QA_Final: final,
      QA_Status: final >= APPROVAL_THRESHOLD ? "QA PASS" : "RETEST",
      ManualApproval: approvalRequested ? "Yes" : "No",
      ApprovedForRecipe: approved ? "Yes" : "No"
    };

    const log = draft
      ? {
          ...draft,
          ...qaLogFields,
          BrewID: draft.BrewID,
          Date: draft.Date || todayISO(),
          BrewerName: draft.BrewerName || currentBrewerName(),
          BeanName: draft.BeanName || $("qaBeanName").value || "",
          Origin: draft.Origin || "",
          StockBeanID: draft.StockBeanID || "",
          StockBeanCode: draft.StockBeanCode || "",
          StockUsage_g: draft.StockUsage_g ?? "",
          ParentBrewID: draft.ParentBrewID || "",
          RecipeKey: draft.RecipeKey || recipeKey(draft.Variety, draft.Process, draft.RoastProfile),
          WorkspaceID: draft.WorkspaceID || activeWorkspaceId(),
          CloudID: draft.CloudID,
          Source: draft.Source || "Supabase"
        }
      : currentBrewLogBase({
          BrewID: nextId("BL", allBrewLogs(), "BrewID"),
          BeanName: $("qaBeanName").value || $("brewVariety").value,
          ParentBrewID: "",
          ...qaLogFields
        });

    const qa = {
      QA_ID: qaId,
      BrewID: log.BrewID,
      Date: todayISO(),
      Evaluator: $("qaEvaluator").value || currentBrewerName(),
      Aroma: Number($("qaAroma").value),
      Flavor: Number($("qaFlavor").value),
      Aftertaste: Number($("qaAftertaste").value),
      AcidityQuality: Number($("qaAcidityQuality").value),
      Sweetness: Number($("qaSweetness").value),
      Body: Number($("qaBody").value),
      Balance: Number($("qaBalance").value),
      Clarity: Number($("qaClarity").value),
      Finish: Number($("qaFinish").value),
      DefectPenalty: Number($("qaDefect").value),
      Consistency: Number($("qaConsistency").value),
      Final_QA: final,
      Status: final >= APPROVAL_THRESHOLD ? "QA PASS" : "RETEST",
      Approver: approved ? ($("qaEvaluator").value || currentBrewerName()) : "",
      QA_Notes: structuredNotes,
      PrimaryVariableChanged: qaLogFields.PrimaryVariableChanged,
      Hypothesis: qaLogFields.Hypothesis,
      ResultNotes: qaLogFields.ResultNotes,
      WorkspaceID: log.WorkspaceID || activeWorkspaceId(),
      CreatedBy: currentUser?.id || null
    };

    let watchdog;
    let pendingQAMutations = [];
    try {
      qaSaving = true;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Menyimpan QA…";
        btn.setAttribute("aria-busy", "true");
      }
      setQASaveState("saving", "SAVING", "Menyimpan QA lalu memperbarui ringkasan Brew terkait.");
      watchdog = createButtonWatchdog({ key: "qa", button: btn, originalText, label: "Simpan Brew Log + QA" });
      showMessage("Sedang menyimpan Brew Log & QA...", "info");

      let savedLog;
      let savedQA;
      const qaMutation = normalizeSyncMutation({ type: "insert", table: "qa_scores", payload: toSnakeQA(qa) });
      if (draft?.CloudID) {
        const brewMutation = normalizeSyncMutation({
          type: "update",
          table: "brew_logs",
          id: draft.CloudID,
          payload: toSnakeBrewQAUpdate(log)
        });
        pendingQAMutations = [qaMutation, brewMutation];
        const qaResult = await executeSyncMutation(qaMutation, "Simpan qa_scores");
        pendingQAMutations.shift();
        savedQA = fromSnakeQA(qaResult.data);
        state.cloudQA = uniqueByCloudId([savedQA, ...(state.cloudQA || [])]);
        const brewResult = await executeSyncMutation(brewMutation, "Sinkronisasi detail Brew Log");
        pendingQAMutations.shift();
        savedLog = fromSnakeBrew(brewResult.data);
        state.cloudBrewLogs = uniqueByCloudId([savedLog, ...(state.cloudBrewLogs || []).filter(item => item.CloudID !== savedLog.CloudID)]);
      } else {
        const brewMutation = normalizeSyncMutation({ type: "insert", table: "brew_logs", payload: toSnakeBrew(log) });
        pendingQAMutations = [brewMutation, qaMutation];
        const brewResult = await executeSyncMutation(brewMutation, "Simpan brew_logs");
        pendingQAMutations.shift();
        savedLog = fromSnakeBrew(brewResult.data);
        state.cloudBrewLogs.unshift(savedLog);
        const qaResult = await executeSyncMutation(qaMutation, "Simpan qa_scores");
        pendingQAMutations.shift();
        savedQA = fromSnakeQA(qaResult.data);
        state.cloudQA = uniqueByCloudId([savedQA, ...(state.cloudQA || [])]);
      }

      renderBrewLogTable();
      renderQABrewOptions();
      renderBrew();
      renderPublicBrewTable();
      EVENT_BUS.emit("qa:saved", { qa: savedQA, brew: savedLog, final, approved });
      setQASaveState("success", "SUCCESS", `QA ${savedQA?.QA_ID || qaId} tersimpan dan terhubung ke ${savedLog?.BrewID || log.BrewID}.`);

      if (isGuest) {
        showMessage(final >= APPROVAL_THRESHOLD ? "Hasil seduhan publik tersimpan dan tampil di feed publik." : "Hasil seduhan tersimpan, tetapi belum masuk feed publik karena nilai belum mencapai 6.5.", final >= APPROVAL_THRESHOLD ? "success" : "info");
      } else if (approved) {
        showMessage("QA PASS. Brew log terverifikasi dan tampil di Hasil Seduhan Publik.", "success");
      } else {
        showMessage("Brew Log & QA tersimpan. Data belum tampil publik sebelum disetujui QA/admin atau mencapai status approved.", "info");
      }
    } catch (err) {
      console.error(err);
      const detail = err?.message || err?.details || err?.hint || String(err);
      if (pendingQAMutations.length) enqueuePendingSyncBatch("Brew Log & QA", pendingQAMutations);
      setQASaveState("failed", "FAILED / RETRY", "Operasi yang belum selesai aman di antrean sinkronisasi. Coba Sync ulang saat koneksi stabil.");
      showMessage("Brew Log & QA belum tersinkron penuh. Operasi yang belum selesai diamankan dalam antrean sync.", "error");
      if (RUNTIME.warn) RUNTIME.warn("Brew Log & QA save deferred", detail);
    } finally {
      if (watchdog) clearTimeout(watchdog);
      qaSaving = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
        btn.setAttribute("aria-busy", "false");
      }
    }
  }


  function manualScoreIds() {
    return ["manualAroma", "manualFlavor", "manualAftertaste", "manualAcidityQuality", "manualSweetness", "manualBody", "manualBalance", "manualClarity", "manualFinish", "manualConsistency"];
  }

  function computeManualQAFromForm() {
    const ids = manualScoreIds();
    const values = ids.map(id => Number($(id)?.value) || 0);
    if (QA_SERVICE) return QA_SERVICE.score(values, Number($("manualDefect")?.value) || 0);
    const avg = values.reduce((sum, value) => sum + value, 0) / ids.length;
    return round(clamp(avg - (Number($("manualDefect")?.value) || 0), 0, 10), 2);
  }

  function syncManualTotalWater(force = false) {
    const total = $("manualTotalWater");
    if (!total) return;
    if (!force && total.dataset.userEdited === "true") return;
    const dose = Number($("manualDose")?.value || 0);
    const ratio = Number($("manualRatio")?.value || 0);
    if (dose && ratio) total.value = String(Math.round(dose * ratio));
  }

  function manualValidationResult() {
    if (!BREW_SERVICE) return { ok: true, errors: [], warnings: [], targetWater: 0, pourTotal: 0 };
    return BREW_SERVICE.validateManual({
      beanName: $("manualBeanName")?.value,
      dose: $("manualDose")?.value,
      ratio: $("manualRatio")?.value,
      totalWater: $("manualTotalWater")?.value,
      temperature: $("manualTemp")?.value,
      brewTime: $("manualBrewTime")?.value,
      bloom: $("manualBloom")?.value,
      mode: $("manualMode")?.value,
      ice: $("manualIce")?.value,
      pours: [1, 2, 3, 4].map(index => $("manualPour" + index)?.value)
    });
  }

  function setManualSaveState(stateName = "ready", title = "READY", text = "Periksa ringkasan sebelum menyimpan.") {
    const wrap = $("manualSaveState");
    const titleEl = $("manualSaveStateTitle");
    const textEl = $("manualSaveStateText");
    if (wrap) wrap.dataset.state = stateName;
    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text;
  }

  function renderManualInlineValidation() {
    const rules = [
      ["manualBeanName", "manualBeanNameError", value => Boolean(String(value || "").trim())],
      ["manualDose", "manualDoseError", value => Number.isFinite(Number(value)) && Number(value) >= 5 && Number(value) <= 50],
      ["manualRatio", "manualRatioError", value => Number.isFinite(Number(value)) && Number(value) >= 8 && Number(value) <= 25],
      ["manualTotalWater", "manualTotalWaterError", value => Number.isFinite(Number(value)) && Number(value) >= 50 && Number(value) <= 1000],
      ["manualTemp", "manualTempError", value => Number.isFinite(Number(value)) && Number(value) >= 70 && Number(value) <= 100],
      ["manualBrewTime", "manualBrewTimeError", value => Number.isFinite(Number(value)) && Number(value) >= 30 && Number(value) <= 600],
      ["manualBloom", "manualBloomError", value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 200]
    ];
    let valid = true;
    rules.forEach(([inputId, errorId, check]) => {
      const input = $(inputId);
      const error = $(errorId);
      if (!input) return;
      const fieldValid = check(input.value);
      valid = valid && fieldValid;
      input.setAttribute("aria-invalid", fieldValid ? "false" : "true");
      if (error) error.hidden = fieldValid;
    });
    const customInput = $("manualProcessCustom");
    const customError = $("manualProcessCustomError");
    const customSelected = $("manualProcess")?.value === CUSTOM_PROCESS_VALUE;
    const customValid = !customSelected || Boolean(customInput?.value.trim());
    if (customInput) customInput.setAttribute("aria-invalid", customValid ? "false" : "true");
    if (customError) customError.hidden = customValid;
    return valid && customValid;
  }

  function renderManualReview(final, pass) {
    const beanName = $("manualBeanName")?.value.trim() || "Nama kopi belum diisi";
    const coffeeMeta = [
      $("manualOrigin")?.value.trim(),
      selectedProcessValue("manualProcess", "manualProcessCustom"),
      $("manualRoast")?.value
    ].filter(Boolean).join(" · ") || "Lengkapi origin, proses, atau profil sangrai bila tersedia.";
    const method = [$("manualMode")?.value, $("manualDripper")?.value].filter(Boolean).join(" · ") || "Metode belum dipilih";
    const dose = Number($("manualDose")?.value || 0);
    const ratio = Number($("manualRatio")?.value || 0);
    const totalWater = Number($("manualTotalWater")?.value || 0);
    const temperature = Number($("manualTemp")?.value || 0);
    const recipe = `${fmt(dose, 1)} g · ${fmt(totalWater)} ml · 1:${fmt(ratio, 1)} · ${fmt(temperature)}°C`;
    const grinder = selectedManualGrinderName() || "Grinder belum dipilih";
    const grindSetting = $("manualGrindSetting")?.value.trim();
    const time = Number($("manualBrewTime")?.value || 0);
    const ice = /japanese/i.test($("manualMode")?.value || "") ? Number($("manualIce")?.value || 0) : 0;
    const timing = `${fmtTime(time)} · ${manualPourCountValue()} pour${ice ? ` · ${fmt(ice)} g es` : ""}`;
    if ($("manualReviewCoffee")) $("manualReviewCoffee").textContent = beanName;
    if ($("manualReviewCoffeeMeta")) $("manualReviewCoffeeMeta").textContent = coffeeMeta;
    if ($("manualReviewMethod")) $("manualReviewMethod").textContent = method;
    if ($("manualReviewRecipe")) $("manualReviewRecipe").textContent = recipe;
    if ($("manualReviewGrind")) $("manualReviewGrind").textContent = grindSetting ? `${grinder} · ${grindSetting}` : grinder;
    if ($("manualReviewTiming")) $("manualReviewTiming").textContent = timing;
    if ($("manualReviewStock")) $("manualReviewStock").textContent = "Non-stock · tidak dikurangi";
    if ($("manualReviewQA")) $("manualReviewQA").textContent = `${fmt(final, 2)} · ${pass ? "QA PASS" : "RETEST"}`;
  }

  function renderManualBrewPreview() {
    syncManualTotalWater(false);
    renderManualConditionalFields();
    const final = computeManualQAFromForm();
    const pass = final >= APPROVAL_THRESHOLD;
    const finalEl = $("manualFinalPreview");
    const statusEl = $("manualStatusPreview");
    const btn = $("manualSubmitBtn");
    const hint = $("manualGateHint");
    if (finalEl) finalEl.textContent = fmt(final, 2);
    if (statusEl) {
      statusEl.textContent = pass ? "QA PASS" : "RETEST";
      statusEl.className = pass ? "qa-pass" : "qa-retest";
    }
    if (btn) {
      btn.disabled = !pass || manualBrewSaving;
      btn.title = pass ? "Final QA memenuhi batas 6.5" : "Final QA harus minimal 6.5 untuk menyimpan hasil seduhan publik";
    }
    if (hint) {
      hint.textContent = pass
        ? "Tombol simpan aktif karena Final QA memenuhi batas publik 6.5."
        : "Final QA belum mencapai 6.5. Tombol simpan dikunci agar hasil belum masuk feed publik.";
      hint.classList.toggle("locked", !pass);
    }
    const validationResult = manualValidationResult();
    const inlineValid = renderManualInlineValidation();
    renderManualReview(final, pass);
    const summary = $("manualValidationSummary");
    if (summary) {
      const issues = [...(validationResult.errors || []), ...(validationResult.warnings || [])];
      if (!inlineValid && validationResult.ok) issues.unshift("Lengkapi field wajib yang ditandai sebelum menyimpan.");
      summary.dataset.status = validationResult.ok && inlineValid && !issues.length ? "ready" : validationResult.ok && inlineValid ? "warning" : "error";
      summary.innerHTML = issues.length
        ? `<strong>${validationResult.ok && inlineValid ? "Resep siap dengan catatan" : "Lengkapi data sebelum menyimpan"}</strong><ul>${issues.map(item => `<li>${html(item)}</li>`).join("")}</ul>`
        : `<strong>Parameter sudah konsisten</strong><small>Target rasio sekitar ${fmt(validationResult.targetWater)}ml dan detail pour sudah sesuai.</small>`;
    }
    if (hint && pass && !inlineValid) {
      hint.textContent = "Lengkapi field wajib yang ditandai sebelum menyimpan.";
      hint.classList.add("locked");
    }
    if (btn) btn.setAttribute("aria-busy", manualBrewSaving ? "true" : "false");
    const currentSaveState = $("manualSaveState")?.dataset.state || "ready";
    if (!manualBrewSaving && !["failed", "success"].includes(currentSaveState)) {
      setManualSaveState(
        "ready",
        pass && validationResult.ok && inlineValid ? "READY" : "PERLU DIPERIKSA",
        pass && validationResult.ok && inlineValid ? "Periksa ringkasan sebelum menyimpan." : "Lengkapi validasi atau QA sebelum menyimpan."
      );
    }
  }



  const CUSTOM_PROCESS_VALUE = "__custom_process__";

  function addCustomProcessOption(select) {
    if (!select) return;
    const exists = Array.from(select.options || []).some(option => option.value === CUSTOM_PROCESS_VALUE);
    if (!exists) {
      const option = document.createElement("option");
      option.value = CUSTOM_PROCESS_VALUE;
      option.textContent = "Custom / Isi Manual";
      select.appendChild(option);
    }
  }

  function syncCustomProcessFields() {
    [
      ["brewProcess", "brewProcessCustomWrap", "brewProcessCustom"],
      ["manualProcess", "manualProcessCustomWrap", "manualProcessCustom"],
      ["stockProcess", "stockProcessCustomWrap", "stockProcessCustom"]
    ].forEach(([selectId, wrapId, inputId]) => {
      const select = $(selectId);
      const wrap = $(wrapId);
      const input = $(inputId);
      if (!select || !wrap) return;
      addCustomProcessOption(select);
      const custom = select.value === CUSTOM_PROCESS_VALUE;
      wrap.classList.toggle("hidden", !custom);
      if (input) {
        input.disabled = !custom;
        input.required = custom && selectId !== "brewProcess";
      }
    });
  }

  function selectedProcessValue(selectId, customInputId) {
    const select = $(selectId);
    if (!select) return "";
    if (select.value === CUSTOM_PROCESS_VALUE) {
      return ($(customInputId)?.value || "").trim() || "Custom Process";
    }
    return select.value || "";
  }

  function setProcessFieldValue(selectId, customInputId, value) {
    const select = $(selectId);
    const input = $(customInputId);
    if (!select) return;
    addCustomProcessOption(select);
    const safe = String(value || "").trim();
    if (!safe) {
      select.value = select.options?.[0]?.value || "";
      if (input) input.value = "";
      syncCustomProcessFields();
      return;
    }
    const options = Array.from(select.options || []);
    const match = options.find(opt => norm(opt.value) === norm(safe) || norm(opt.textContent) === norm(safe));
    if (match && match.value !== CUSTOM_PROCESS_VALUE) {
      select.value = match.value;
      if (input) input.value = "";
    } else {
      select.value = CUSTOM_PROCESS_VALUE;
      if (input) input.value = safe;
    }
    syncCustomProcessFields();
  }

  function bindCustomProcessInputs() {
    if (document.body?.dataset.customProcessReady === "true") return;
    if (document.body) document.body.dataset.customProcessReady = "true";
    ["brewProcess", "manualProcess", "stockProcess"].forEach(id => {
      $(id)?.addEventListener("change", () => {
        syncCustomProcessFields();
        renderManualBrewPreview?.();
      });
    });
    ["brewProcessCustom", "manualProcessCustom", "stockProcessCustom"].forEach(id => {
      $(id)?.addEventListener("input", () => {
        if (id === "brewProcessCustom") renderBrew();
        renderManualBrewPreview?.();
      });
    });
    syncCustomProcessFields();
  }


  function selectedManualVarieties() {
    const values = ["manualVariety", "manualVariety2", "manualVariety3"]
      .map(id => $(id)?.value || "")
      .map(value => String(value || "").trim())
      .filter(Boolean);
    return uniq(values);
  }

  function manualVarietyLabel() {
    return selectedManualVarieties().join(" / ");
  }

  function splitVarietyLabel(value = "") {
    return uniq(String(value || "")
      .split(/\s*(?:\/|\+|,|;|\band\b|\bdan\b)\s*/i)
      .map(v => v.trim())
      .filter(Boolean));
  }


  function selectedManualGrinderName() {
    const grinder = $("manualGrinder")?.value || "";
    if (norm(grinder) === "custom") return $("manualGrindSetting")?.value ? "Custom" : "Custom";
    return grinder;
  }

  function isManualSwitchDripper() {
    return /switch/i.test($("manualDripper")?.value || "");
  }

  function manualValveMode() {
    if (!isManualSwitchDripper()) return "N/A";
    return $("manualSwitchValveMode")?.value || "Full Open";
  }

  function setManualGroupVisible(selector, visible) {
    document.querySelectorAll(selector).forEach(el => {
      el.classList.toggle("hidden", !visible);
      el.querySelectorAll?.("input, select, textarea").forEach(field => {
        field.disabled = !visible;
      });
    });
  }

  function renderManualConditionalFields() {
    const isSwitchManual = isManualSwitchDripper();
    const valveMode = manualValveMode();
    const isJapanese = /japanese/i.test($("manualMode")?.value || "");
    const modeWrap = $("manualSwitchValveModeWrap");
    if (modeWrap) modeWrap.classList.toggle("hidden", !isSwitchManual);
    if (modeWrap) modeWrap.querySelectorAll("input, select, textarea").forEach(field => { field.disabled = !isSwitchManual; });
    if (!isSwitchManual && $("manualSwitchValveMode")) $("manualSwitchValveMode").value = "N/A";
    if (isSwitchManual && $("manualSwitchValveMode")?.value === "N/A") $("manualSwitchValveMode").value = "Full Open";

    const iceWrap = $("manualIceWrap");
    if (iceWrap) iceWrap.classList.toggle("hidden", !isJapanese);
    if (iceWrap) iceWrap.querySelectorAll("input, select, textarea").forEach(field => { field.disabled = !isJapanese; });

    const fullImmersion = isSwitchManual && /full immersion/i.test(valveMode);
    const hybrid = isSwitchManual && /hybrid/i.test(valveMode);
    const hint = $("manualPourModeHint");
    if (hint) {
      if (fullImmersion) hint.textContent = "Full Immersion: isi Pour 1 saja dan waktu kapan valve dibuka.";
      else if (hybrid) hint.textContent = "Hybrid Switch: isi Pour 1–4, valve open/closed, dan keterangan tiap pour.";
      else if (isSwitchManual) hint.textContent = "Full Open: isi Pour 1–4 seperti dripper biasa, valve tetap open.";
      else hint.textContent = "Isi volume Pour 1 sampai Pour 4 sesuai resep manual.";
    }

    document.querySelectorAll("[data-manual-pour-card]").forEach(card => {
      const n = Number(card.dataset.manualPourCard || 0);
      const visible = fullImmersion ? n === 1 : n >= 1 && n <= 4;
      card.classList.toggle("hidden", !visible);
      card.querySelectorAll("input, select, textarea").forEach(field => { field.disabled = !visible; });
    });

    setManualGroupVisible(".manual-pour-valve", hybrid);
    setManualGroupVisible(".manual-pour-note", hybrid);
    setManualGroupVisible("#manualValveOpenTimeWrap", fullImmersion);
  }

  function manualPourDetails() {
    const valveMode = manualValveMode();
    const fullImmersion = /full immersion/i.test(valveMode);
    const hybrid = /hybrid/i.test(valveMode);
    const maxPour = fullImmersion ? 1 : 4;
    const rows = [];
    for (let i = 1; i <= maxPour; i += 1) {
      const amount = Number($(`manualPour${i}`)?.value || 0);
      const valve = $(`manualPour${i}Valve`)?.value || "Open";
      const note = $(`manualPour${i}Note`)?.value.trim() || "";
      if (!amount && !note) continue;
      let text = `Pour ${i}: ${amount ? `${amount}ml` : "volume tidak diisi"}`;
      if (hybrid) text += ` · valve ${valve.toLowerCase()}`;
      if (note) text += ` · ${note}`;
      rows.push(text);
    }
    return rows;
  }

  function manualPourCountValue() {
    const fullImmersion = /full immersion/i.test(manualValveMode());
    if (fullImmersion) return 1;
    const filled = manualPourDetails().length;
    return filled || 4;
  }

  function manualValvePlanText() {
    if (!isManualSwitchDripper()) return "N/A";
    const valveMode = manualValveMode();
    if (/full immersion/i.test(valveMode)) {
      const openAt = $("manualValveOpenTime")?.value.trim() || "waktu open valve belum diisi";
      return `Full Immersion · valve dibuka: ${openAt}`;
    }
    if (/hybrid/i.test(valveMode)) {
      const rows = [];
      for (let i = 1; i <= 4; i += 1) {
        const valve = $(`manualPour${i}Valve`)?.value || "Open";
        const note = $(`manualPour${i}Note`)?.value.trim() || "";
        rows.push(`Pour ${i}: ${valve}${note ? ` (${note})` : ""}`);
      }
      return `Hybrid · ${rows.join(" | ")}`;
    }
    return "Full Open · valve open sepanjang pour";
  }

  function manualPourPlanText() {
    const structured = manualPourDetails();
    const text = $("manualPourPlan")?.value.trim() || "";
    const bloom = Number($("manualBloom")?.value || 0);
    const total = Number($("manualTotalWater")?.value || 0);
    const time = Number($("manualBrewTime")?.value || 0);
    const ice = Number($("manualIce")?.value || 0);
    const pieces = [];
    if (bloom) pieces.push(`Bloom ${bloom}ml`);
    if (structured.length) pieces.push(...structured);
    else pieces.push(`${manualPourCountValue()}x pour sampai ${total}ml`);
    if (/japanese/i.test($("manualMode")?.value || "") && ice) pieces.push(`Es batu ${ice}g`);
    if (time) pieces.push(`target selesai ${fmtTime(time)}`);
    if (text) pieces.push(`Catatan: ${text}`);
    return pieces.join(" | ");
  }

  function manualBrewPayloadBase(extra = {}) {
    const method = $("manualMode")?.value || "Hot V60";
    const totalWater = Number($("manualTotalWater")?.value || 0);
    const isIced = /japanese/i.test(method);
    const manualIce = Number($("manualIce")?.value || 0);
    const ice = isIced ? manualIce : 0;
    const hotWater = isIced ? Math.max(0, totalWater - ice) : totalWater;
    const waterName = $("manualWater")?.value || "";
    const manualVarieties = selectedManualVarieties();
    const manualVarietyText = manualVarietyLabel();
    const qaId = extra.QA_ID || nextId("QA", allQA(), "QA_ID");
    const brewerName = $("manualEvaluator")?.value.trim() || currentBrewerName();
    const final = extra.QA_Final ?? computeManualQAFromForm();
    return {
      BrewID: extra.BrewID || nextId("BL", allBrewLogs(), "BrewID"),
      Date: todayISO(),
      BrewerName: brewerName,
      BeanName: $("manualBeanName")?.value.trim() || "Manual Brew",
      Origin: $("manualOrigin")?.value.trim() || "",
      StockBeanID: "",
      StockBeanCode: "",
      StockUsage_g: "",
      Variety: manualVarietyText || $("manualVariety")?.value || "",
      Variety1: $("manualVariety")?.value || "",
      Variety2_optional: $("manualVariety2")?.value || "",
      Variety3_optional: $("manualVariety3")?.value || "",
      VarietyList: manualVarieties.join(" / "),
      Process: selectedProcessValue("manualProcess", "manualProcessCustom"),
      RoastProfile: $("manualRoast")?.value || "",
      Dripper: $("manualDripper")?.value || "",
      Method: method,
      Grinder: selectedManualGrinderName(),
      GrindSetting: $("manualGrindSetting")?.value.trim() || "Manual",
      Temp_C: Number($("manualTemp")?.value || 0),
      Ratio: Number($("manualRatio")?.value || 0),
      Dose_g: Number($("manualDose")?.value || 0),
      TotalWater_ml: totalWater,
      HotWater_ml: hotWater,
      Ice_g: ice,
      BrewTime_sec: Number($("manualBrewTime")?.value || 0),
      Bloom_ml: Number($("manualBloom")?.value || 0),
      PourCount: manualPourCountValue(),
      PourPlan: manualPourPlanText(),
      Water: waterName,
      TDS_ppm: getBy(DATA.waters, "Water", waterName).TDS_ppm || "",
      Agitation: "Manual / brewer-defined",
      Filter: "Paper",
      ParentBrewID: "",
      PrimaryVariableChanged: $("manualVariable")?.value.trim() || "Input seduhan manual",
      Hypothesis: $("manualHypothesis")?.value.trim() || "",
      ResultNotes: $("manualNotes")?.value.trim() || "",
      QA_ID: qaId,
      QA_Final: final,
      QA_Status: "QA PASS",
      ManualApproval: "Yes",
      ApprovedForRecipe: "Yes",
      RecipeKey: recipeKey(manualVarietyText || $("manualVariety")?.value, selectedProcessValue("manualProcess", "manualProcessCustom"), $("manualRoast")?.value),
      CurrentMatchScore: "",
      Water_Formula_Note: "Input manual dari menu Input Seduhan.",
      SwitchValveMode: manualValveMode(),
      ValvePlan: manualValvePlanText(),
      WorkspaceID: activeWorkspaceId() || DEFAULT_PUBLIC_WORKSPACE_ID,
      CreatedBy: currentUser?.id || null,
      ModerationStatus: "approved",
      Visibility: "public",
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    };
  }

  function manualQARecord(log) {
    return {
      QA_ID: log.QA_ID,
      BrewID: log.BrewID,
      Date: todayISO(),
      Evaluator: $("manualEvaluator")?.value.trim() || currentBrewerName(),
      Aroma: Number($("manualAroma")?.value),
      Flavor: Number($("manualFlavor")?.value),
      Aftertaste: Number($("manualAftertaste")?.value),
      AcidityQuality: Number($("manualAcidityQuality")?.value),
      Sweetness: Number($("manualSweetness")?.value),
      Body: Number($("manualBody")?.value),
      Balance: Number($("manualBalance")?.value),
      Clarity: Number($("manualClarity")?.value),
      Finish: Number($("manualFinish")?.value),
      DefectPenalty: Number($("manualDefect")?.value),
      Consistency: Number($("manualConsistency")?.value),
      Final_QA: Number(log.QA_Final || 0),
      Status: "QA PASS",
      Approver: $("manualEvaluator")?.value.trim() || currentBrewerName(),
      QA_Notes: $("manualNotes")?.value.trim() || "",
      PrimaryVariableChanged: log.PrimaryVariableChanged,
      Hypothesis: log.Hypothesis,
      ResultNotes: log.ResultNotes,
      WorkspaceID: log.WorkspaceID,
      CreatedBy: currentUser?.id || null,
      ModerationStatus: "approved"
    };
  }


  function isPublicBrewOwner(log) {
    if (!log) return false;
    if (currentUser?.id && log.CreatedBy && String(log.CreatedBy) === String(currentUser.id)) return true;
    return false;
  }

  function findQAForBrew(log) {
    if (!log) return null;
    return (state.cloudQA || []).find(qa =>
      (log.QA_ID && qa.QA_ID === log.QA_ID) ||
      (log.BrewID && qa.BrewID === log.BrewID)
    ) || null;
  }

  function setManualFieldValue(id, value) {
    const el = $(id);
    if (!el) return;
    const safe = value === null || value === undefined ? "" : String(value);
    if (el.tagName === "SELECT") {
      const options = Array.from(el.options || []);
      const match = options.find(opt => norm(opt.value) === norm(safe) || norm(opt.textContent) === norm(safe));
      if (match) el.value = match.value;
      else if (safe && options.length) {
        const option = document.createElement("option");
        option.value = safe;
        option.textContent = safe;
        el.appendChild(option);
        el.value = safe;
      }
      return;
    }
    el.value = safe;
  }

  function resetManualPourFields() {
    for (let i = 1; i <= 4; i += 1) {
      setManualFieldValue(`manualPour${i}`, "");
      setManualFieldValue(`manualPour${i}Valve`, "Open");
      setManualFieldValue(`manualPour${i}Note`, "");
    }
    setManualFieldValue("manualValveOpenTime", "");
  }

  function parseManualPourPlanFromLog(log) {
    resetManualPourFields();
    const pourPlan = String(log?.PourPlan || "");
    const valvePlan = String(log?.ValvePlan || "");
    const combined = `${pourPlan} | ${valvePlan}`;
    let structuredFound = false;
    for (let i = 1; i <= 4; i += 1) {
      const amountMatch = combined.match(new RegExp(`Pour\\s*${i}\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*ml`, "i"));
      const valveMatch = combined.match(new RegExp(`Pour\\s*${i}[^|]*(?:valve\\s+|:\\s*)(Open|Closed)`, "i"));
      if (amountMatch) {
        setManualFieldValue(`manualPour${i}`, amountMatch[1]);
        structuredFound = true;
      }
      if (valveMatch) setManualFieldValue(`manualPour${i}Valve`, valveMatch[1].replace(/^./, ch => ch.toUpperCase()));
      const segmentMatch = combined.match(new RegExp(`Pour\\s*${i}\\s*:[^|]+`, "i"));
      if (segmentMatch) {
        const note = segmentMatch[0]
          .replace(new RegExp(`Pour\\s*${i}\\s*:\\s*`, "i"), "")
          .replace(/\\d+(?:\\.\\d+)?\\s*ml/i, "")
          .replace(/valve\\s+(open|closed)/i, "")
          .replace(/^\\s*[·:-]+\\s*/g, "")
          .trim();
        if (note && !/^(open|closed)$/i.test(note)) setManualFieldValue(`manualPour${i}Note`, note);
      }
    }
    const valveOpenMatch = valvePlan.match(/valve\s+dibuka\s*:\s*([^|]+)/i);
    if (valveOpenMatch) setManualFieldValue("manualValveOpenTime", valveOpenMatch[1].trim());

    const catatanMatch = pourPlan.match(/Catatan:\s*([^|]+)$/i);
    if (catatanMatch) setManualFieldValue("manualPourPlan", catatanMatch[1].trim());
    else if (!structuredFound && pourPlan) setManualFieldValue("manualPourPlan", pourPlan);
    else setManualFieldValue("manualPourPlan", "");
  }

  function setManualEditMode(active, log = null, qa = null) {
    manualEditingOriginalLog = active ? log : null;
    manualEditingOriginalQA = active ? qa : null;
    manualEditingBrewId = active ? log?.CloudID || null : null;
    const banner = $("manualEditBanner");
    const title = $("manualEditTitle");
    const submit = $("manualSubmitBtn");
    const cancel = $("manualCancelEditBtn");
    if (banner) banner.classList.toggle("hidden", !active);
    if (title) title.textContent = active ? `Sedang mengedit: ${log?.BeanName || "Hasil Seduhan"}` : "Mode edit hasil seduhan";
    if (submit) submit.textContent = active ? "Simpan Perubahan Hasil Seduhan" : "Simpan Hasil Seduhan Publik";
    if (cancel) cancel.classList.toggle("hidden", !active);
    setManualSaveState("ready", active ? "READY TO UPDATE" : "READY", active ? "Periksa perubahan sebelum menyimpan." : "Periksa ringkasan sebelum menyimpan.");
  }

  function openPublicBrewEdit(key) {
    const log = findPublicBrewLog(key);
    if (!log) return showMessage("Data seduhan tidak ditemukan. Muat ulang lalu coba lagi.", "error");
    if (!isPublicBrewOwner(log)) return showMessage("Edit hanya tersedia untuk akun yang menginput hasil seduhan ini.", "error");
    const qa = findQAForBrew(log);
    setManualEditMode(true, log, qa);

    setManualFieldValue("manualBeanName", log.BeanName || "");
    setManualFieldValue("manualOrigin", log.Origin || "");
    setManualFieldValue("manualEvaluator", log.BrewerName || qa?.Evaluator || currentBrewerName());
    const editVarieties = uniq([log.Variety, log.Variety2_optional, log.Variety3_optional].flatMap(splitVarietyLabel));
    setManualFieldValue("manualVariety", editVarieties[0] || log.Variety || "");
    setManualFieldValue("manualVariety2", editVarieties[1] || log.Variety2_optional || "");
    setManualFieldValue("manualVariety3", editVarieties[2] || log.Variety3_optional || "");
    setProcessFieldValue("manualProcess", "manualProcessCustom", log.Process || "");
    setManualFieldValue("manualRoast", log.RoastProfile || "");
    setManualFieldValue("manualDripper", log.Dripper || "");
    setManualFieldValue("manualMode", log.Method || "Hot V60");
    setManualFieldValue("manualSwitchValveMode", log.SwitchValveMode || (/switch/i.test(log.Dripper || "") ? "Full Open" : "N/A"));
    setManualFieldValue("manualIce", Number(log.Ice_g || 0));
    setManualFieldValue("manualGrinder", log.Grinder || "");
    setManualFieldValue("manualGrindSetting", log.GrindSetting || "");
    setManualFieldValue("manualWater", log.Water || "");
    setManualFieldValue("manualDose", log.Dose_g || "");
    setManualFieldValue("manualRatio", log.Ratio || "");
    setManualFieldValue("manualTotalWater", log.TotalWater_ml || "");
    setManualFieldValue("manualTemp", log.Temp_C || "");
    setManualFieldValue("manualBrewTime", log.BrewTime_sec || "");
    setManualFieldValue("manualBloom", log.Bloom_ml || "");
    parseManualPourPlanFromLog(log);

    setManualFieldValue("manualVariable", log.PrimaryVariableChanged || qa?.PrimaryVariableChanged || "");
    setManualFieldValue("manualHypothesis", log.Hypothesis || qa?.Hypothesis || "");
    setManualFieldValue("manualNotes", log.ResultNotes || qa?.ResultNotes || qa?.QA_Notes || "");
    const fallback = Number(log.QA_Final || qa?.Final_QA || 8.5);
    setManualFieldValue("manualAroma", qa?.Aroma ?? fallback);
    setManualFieldValue("manualFlavor", qa?.Flavor ?? fallback);
    setManualFieldValue("manualAftertaste", qa?.Aftertaste ?? fallback);
    setManualFieldValue("manualAcidityQuality", qa?.AcidityQuality ?? fallback);
    setManualFieldValue("manualSweetness", qa?.Sweetness ?? fallback);
    setManualFieldValue("manualBody", qa?.Body ?? fallback);
    setManualFieldValue("manualBalance", qa?.Balance ?? fallback);
    setManualFieldValue("manualClarity", qa?.Clarity ?? fallback);
    setManualFieldValue("manualFinish", qa?.Finish ?? fallback);
    setManualFieldValue("manualConsistency", qa?.Consistency ?? fallback);
    setManualFieldValue("manualDefect", qa?.DefectPenalty ?? 0);

    closePublicBrewDetail();
    renderManualBrewPreview();
    showTab("input-seduhan");
    setTimeout(() => $("manualBeanName")?.focus(), 120);
    showMessage("Mode edit aktif. Ubah field seperti Input Seduhan, lalu simpan perubahan.", "info");
  }

  function cancelManualBrewEdit() {
    setManualEditMode(false);
    renderManualBrewPreview();
    showMessage("Mode edit dibatalkan. Form kembali untuk input seduhan baru.", "info");
  }

  async function saveManualBrew(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (manualBrewSaving) return;
    renderManualBrewPreview();
    const final = computeManualQAFromForm();
    if (final < APPROVAL_THRESHOLD) {
      setManualSaveState("failed", "BELUM SIAP", "Final QA harus minimal 6.5 sebelum hasil dapat disimpan.");
      showMessage("Final QA belum mencapai 6.5. Hasil seduhan belum bisa disimpan ke publik.", "error");
      return;
    }
    if (!cloudReady || !supabaseClient) {
      setManualSaveState("failed", "FAILED / RETRY", "Database belum tersambung. Draft form tetap disimpan di browser.");
      showMessage("Database belum tersambung. Hubungkan Supabase terlebih dahulu.", "error");
      return;
    }
    if (currentUser && !canUseWorkspaceModules()) {
      setManualSaveState("failed", "AKSES DIPERLUKAN", "Pilih workspace aktif sebelum menyimpan sebagai pengguna login.");
      showMessage("Akun login perlu workspace aktif untuk menyimpan Input Seduhan. Guest tetap bisa mengirim tanpa login.", "error");
      showTab("admin");
      return;
    }
    const manualValidation = manualValidationResult();
    if (!manualValidation.ok) {
      setManualSaveState("failed", "BELUM SIAP", manualValidation.first || "Periksa kembali parameter seduhan.");
      showMessage(manualValidation.first || "Periksa kembali parameter seduhan.", "error");
      return;
    }

    const btn = $("manualSubmitBtn");
    const originalText = btn?.textContent || "Simpan Hasil Seduhan Publik";
    let watchdog;
    let queuedManualMutations = [];
    try {
      manualBrewSaving = true;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Menyimpan seduhan...";
        btn.setAttribute("aria-busy", "true");
      }
      setManualSaveState("saving", "SAVING", "Menyimpan Brew Log lalu QA terkait. Jangan tutup halaman.");
      watchdog = createButtonWatchdog({ key: "manual-brew", button: btn, originalText, label: "Simpan Input Seduhan" });
      showMessage("Sedang menyimpan hasil seduhan publik...", "info");

      const editing = Boolean(manualEditingBrewId && manualEditingOriginalLog);
      let log = manualBrewPayloadBase({
        BrewID: editing ? manualEditingOriginalLog.BrewID : undefined,
        QA_ID: editing ? (manualEditingOriginalLog.QA_ID || manualEditingOriginalQA?.QA_ID) : undefined,
        QA_Final: final
      });
      if (editing) {
        log = {
          ...log,
          CloudID: manualEditingOriginalLog.CloudID,
          Date: manualEditingOriginalLog.Date || log.Date,
          CreatedBy: manualEditingOriginalLog.CreatedBy || currentUser?.id || null,
          WorkspaceID: manualEditingOriginalLog.WorkspaceID || activeWorkspaceId() || DEFAULT_PUBLIC_WORKSPACE_ID,
          CreatedAt: manualEditingOriginalLog.CreatedAt,
          UpdatedAt: new Date().toISOString()
        };
      }
      const qa = manualQARecord(log);
      if (editing) {
        if (!isPublicBrewOwner(manualEditingOriginalLog)) throw new Error("Edit hanya tersedia untuk akun yang menginput hasil seduhan ini.");
      }

      const qaPayload = toSnakeQA(editing && manualEditingOriginalQA?.CloudID
        ? { ...qa, QA_ID: manualEditingOriginalQA.QA_ID || qa.QA_ID }
        : qa);
      queuedManualMutations = [
        normalizeSyncMutation({
          type: editing ? "update" : "insert",
          table: "brew_logs",
          id: editing ? manualEditingBrewId : undefined,
          payload: toSnakeBrew(log)
        }),
        normalizeSyncMutation({
          type: editing && manualEditingOriginalQA?.CloudID ? "update" : "insert",
          table: "qa_scores",
          id: editing && manualEditingOriginalQA?.CloudID ? manualEditingOriginalQA.CloudID : undefined,
          payload: qaPayload
        })
      ];

      const savedLogResult = await executeSyncMutation(queuedManualMutations[0], editing ? "Perbarui Brew Log" : "Simpan Brew Log");
      const savedLog = fromSnakeBrew(savedLogResult.data);
      queuedManualMutations.shift();
      state.cloudBrewLogs = uniqueByCloudId([savedLog, ...(state.cloudBrewLogs || []).filter(item => item.CloudID !== savedLog.CloudID)]);

      const savedQAResult = await executeSyncMutation(queuedManualMutations[0], editing ? "Perbarui QA" : "Simpan QA");
      const savedQA = fromSnakeQA(savedQAResult.data);
      queuedManualMutations.shift();
      state.cloudQA = uniqueByCloudId([savedQA, ...(state.cloudQA || []).filter(item => item.CloudID !== savedQA.CloudID)]);
      if (editing) setManualEditMode(false);

      renderBrewLogTable();
      renderQABrewOptions();
      renderPublicBrewTable();
      renderRecipeOptions(computeBrew());
      clearAutosaveScope("manualBrew");
      EVENT_BUS.emit("brew:saved", { brew: savedLog, qa: savedQA, source: "manual" });
      const published = norm(savedLog.ModerationStatus) === "approved" && isApprovedRecipeLog(savedLog);
      updateSyncGuardStatus("synced", "Input tersinkron", editing ? "Perubahan hasil seduhan tersimpan." : published ? "Hasil seduhan publik tersimpan." : "Hasil seduhan tersimpan dan menunggu review.");
      setManualSaveState("success", "SUCCESS", editing ? "Perubahan Brew Log dan QA berhasil disimpan." : "Brew Log dan QA terkait berhasil disimpan.");
      showMessage(editing
        ? "Perubahan hasil seduhan berhasil disimpan."
        : published
          ? "Hasil seduhan berhasil disimpan dan masuk ke Hasil Seduhan Publik."
          : "Hasil seduhan berhasil disimpan dan menunggu review QA/Admin.", "success");
      showTab("public-brews");
    } catch (err) {
      console.error("saveManualBrew error", err);
      const detail = err?.message || err?.details || err?.hint || String(err);
      if (queuedManualMutations.length) enqueuePendingSyncBatch("Input Seduhan Publik", queuedManualMutations);
      saveAutosaveScope("manualBrew", $("manualBrewForm"));
      setManualSaveState("failed", "FAILED / RETRY", "Data form aman secara lokal dan sisa penyimpanan masuk antrean sinkronisasi.");
      showMessage(`Gagal menyimpan Input Seduhan: ${detail}. Data sudah diamankan lokal.`, "error");
    } finally {
      if (watchdog) clearTimeout(watchdog);
      manualBrewSaving = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = manualEditingBrewId ? originalText : "Simpan Hasil Seduhan Publik";
        btn.setAttribute("aria-busy", "false");
      }
      renderManualBrewPreview();
    }
  }

  function brewLogQAState(log) {
    if (BREW_LOG_QA_VIEW?.qaState) return BREW_LOG_QA_VIEW.qaState(log, allQA());
    const hasScore = log?.QA_Final !== "" && log?.QA_Final !== null && log?.QA_Final !== undefined;
    if (!hasScore && !log?.QA_ID) return { key: "pending", label: "Pending QA", score: null, qa: null };
    const score = hasScore ? Number(log.QA_Final) : null;
    const pass = /qa pass/i.test(String(log?.QA_Status || "")) || Number(score) >= APPROVAL_THRESHOLD;
    return { key: pass ? "pass" : "retest", label: pass ? "QA PASS" : "RETEST", score, qa: null };
  }

  function brewLogRecipeSummary(log) {
    if (BREW_LOG_QA_VIEW?.recipeSummary) return BREW_LOG_QA_VIEW.recipeSummary(log);
    return [log?.Dose_g ? `${fmt(log.Dose_g)}g` : "", log?.TotalWater_ml ? `${fmt(log.TotalWater_ml)}ml` : "", log?.Ratio ? `1:${fmt(log.Ratio, 1)}` : "", log?.Temp_C ? `${fmt(log.Temp_C, 1)}°C` : ""].filter(Boolean).join(" · ") || "Recipe belum dicatat";
  }

  function brewLogRecordState(log) {
    const key = norm(log?.ModerationStatus || "pending") || "pending";
    return { key, label: statusLabel(key) };
  }

  function brewLogFilterValues() {
    return {
      search: $("brewLogSearch")?.value || "",
      method: $("brewLogMethodFilter")?.value || "all",
      qa: $("brewLogQAFilter")?.value || "all",
      dateFrom: $("brewLogDateFrom")?.value || "",
      dateTo: $("brewLogDateTo")?.value || ""
    };
  }

  function renderBrewLogFilterOptions(rows) {
    const select = $("brewLogMethodFilter");
    if (!select) return;
    const current = select.value || "all";
    const methods = BREW_LOG_QA_VIEW?.options?.(rows)?.methods
      || uniq((rows || []).map(row => row.Method)).sort((a, b) => String(a).localeCompare(String(b)));
    select.innerHTML = `<option value="all">Semua metode</option>${methods.map(method => `<option value="${html(method)}">${html(method)}</option>`).join("")}`;
    select.value = methods.includes(current) ? current : "all";
  }

  function renderBrewLogState(stateName, title = "", detail = "") {
    const target = $("brewLogState");
    if (!target) return;
    if (!stateName) {
      setElementHidden(target, true);
      target.innerHTML = "";
      return;
    }
    target.dataset.state = stateName;
    target.innerHTML = `<strong>${html(title)}</strong>${detail ? `<p>${html(detail)}</p>` : ""}`;
    setElementHidden(target, false);
  }

  function brewLogActionMarkup(log, qaState, adminView) {
    const key = html(log.CloudID || log.BrewID || "");
    const name = html(log.BeanName || log.Variety || log.BrewID || "Brew");
    const review = qaState.key === "pending" && homePermission("qa:create")
      ? `<button class="primary small-action" type="button" data-brew-review="${key}" aria-label="Review QA untuk ${name}">Review QA</button>`
      : "";
    const admin = adminView
      ? `<button class="secondary small-action" type="button" data-brew-edit="${key}" aria-label="Edit ${name}">Edit</button><button class="danger small-action" type="button" data-brew-delete="${key}" aria-label="Hapus ${name}">Hapus</button>`
      : "";
    return `<div class="brew-log-row-actions"><button class="ghost small-action" type="button" data-brew-detail="${key}" aria-label="Lihat detail ${name}">Detail</button>${review}${admin}</div>`;
  }

  function renderBrewLogTable() {
    const table = $("brewLogTable");
    const tbody = table?.querySelector("tbody");
    const thead = table?.querySelector("thead");
    const mobile = $("brewLogMobileList");
    if (!tbody || !thead) return;

    const hasWorkspaceContext = Boolean(currentUser && activeWorkspaceId() && isActiveWorkspaceMember());
    setElementHidden($("brewLogHistoryPanel"), !hasWorkspaceContext);
    if (!hasWorkspaceContext) {
      if (mobile) mobile.innerHTML = "";
      tbody.innerHTML = "";
      return;
    }

    const headers = ["Tanggal", "Kopi", "Metode", "Brewer", "Recipe", "QA", "Record", "Aksi"];
    thead.innerHTML = `<tr>${headers.map(label => `<th scope="col">${html(label)}</th>`).join("")}</tr>`;

    if (cloudBootstrapPending) {
      renderBrewLogState("loading", "Memuat Brew Log", "Mengambil record workspace dan hubungan QA dari Supabase.");
      tbody.innerHTML = "";
      if (mobile) mobile.innerHTML = "";
      if ($("brewLogResultStatus")) $("brewLogResultStatus").textContent = "Sinkronisasi berjalan";
      return;
    }

    if (!cloudReady || !supabaseClient) {
      renderBrewLogState("error", "Brew Log belum dapat dimuat", "Supabase tidak tersedia. Periksa status koneksi tanpa memasukkan ulang data produksi.");
      tbody.innerHTML = "";
      if (mobile) mobile.innerHTML = "";
      if ($("brewLogResultStatus")) $("brewLogResultStatus").textContent = "Koneksi diperlukan";
      return;
    }

    const rows = sortBrewNewest(allBrewLogs());
    const qaRows = allQA();
    renderBrewLogFilterOptions(rows);
    const summary = BREW_LOG_QA_VIEW?.summary?.(rows, qaRows) || {
      total: rows.length,
      pending: rows.filter(row => brewLogQAState(row).key === "pending").length,
      reviewed: rows.filter(row => brewLogQAState(row).key !== "pending").length
    };
    if ($("brewLogTotalCount")) $("brewLogTotalCount").textContent = String(summary.total);
    if ($("brewLogPendingCount")) $("brewLogPendingCount").textContent = String(summary.pending);
    if ($("brewLogReviewedCount")) $("brewLogReviewedCount").textContent = String(summary.reviewed);

    const filters = brewLogFilterValues();
    const filtered = BREW_LOG_QA_VIEW?.filterRows
      ? BREW_LOG_QA_VIEW.filterRows(rows, filters, qaRows)
      : rows;
    if ($("brewLogResultStatus")) $("brewLogResultStatus").textContent = `${filtered.length} dari ${rows.length} Brew ditampilkan`;

    if (!rows.length) {
      renderBrewLogState("empty", "Belum ada Brew", "Buat draft dari Rekomendasi Seduh atau simpan Manual Brew untuk mulai membangun riwayat workspace.");
      tbody.innerHTML = "";
      if (mobile) mobile.innerHTML = "";
      return;
    }
    if (!filtered.length) {
      renderBrewLogState("no-results", "Tidak ada hasil", "Ubah kata kunci, rentang tanggal, metode, atau status QA yang sedang dipakai.");
      tbody.innerHTML = "";
      if (mobile) mobile.innerHTML = "";
      return;
    }
    renderBrewLogState("");

    const adminView = canAdmin();
    tbody.innerHTML = filtered.map(log => {
      const qaState = brewLogQAState(log);
      const record = brewLogRecordState(log);
      const score = qaState.score === null ? "" : ` · ${fmt(qaState.score, 2)}`;
      return `<tr>
        <td><div class="brew-log-primary"><strong>${html(homeDateLabel(log.Date))}</strong><small>${html(log.BrewID || "Tanpa Brew ID")}</small></div></td>
        <td><div class="brew-log-primary"><strong>${html(log.BeanName || log.Variety || "Belum dicatat")}</strong><small>${html([log.Origin, log.Process].filter(Boolean).join(" · ") || "Detail kopi belum dicatat")}</small></div></td>
        <td><strong>${html(log.Method || log.Dripper || "-")}</strong><br><small class="brew-log-cell-meta">${html(log.Dripper && log.Method !== log.Dripper ? log.Dripper : "")}</small></td>
        <td>${html(log.BrewerName || "Belum dicatat")}</td>
        <td><span class="brew-log-cell-meta">${html(brewLogRecipeSummary(log))}</span></td>
        <td><span class="brew-log-qa-badge" data-state="${html(qaState.key)}">${html(qaState.label + score)}</span></td>
        <td><span class="brew-log-record-badge" data-state="${html(record.key)}">${html(record.label)}</span></td>
        <td>${brewLogActionMarkup(log, qaState, adminView)}</td>
      </tr>`;
    }).join("");

    if (mobile) {
      mobile.innerHTML = filtered.map(log => {
        const qaState = brewLogQAState(log);
        const score = qaState.score === null ? "" : ` · ${fmt(qaState.score, 2)}`;
        return `<article class="brew-log-mobile-card" role="listitem">
          <div class="brew-log-mobile-card__header"><div><strong>${html(log.BeanName || log.Variety || "Belum dicatat")}</strong><small>${html(homeDateLabel(log.Date))} · ${html(log.BrewID || "Tanpa Brew ID")}</small></div><span class="brew-log-qa-badge" data-state="${html(qaState.key)}">${html(qaState.label + score)}</span></div>
          <div class="brew-log-mobile-card__meta"><div><span>Metode</span><strong>${html(log.Method || log.Dripper || "-")}</strong></div><div><span>Recipe</span><strong>${html(brewLogRecipeSummary(log))}</strong></div></div>
          <div class="brew-log-mobile-card__footer">${brewLogActionMarkup(log, qaState, adminView)}</div>
        </article>`;
      }).join("");
    }
  }

  function findBrewLogForEdit(key) {
    return allBrewLogs().find(log => String(log.CloudID || "") === String(key) || String(log.BrewID || "") === String(key));
  }

  function brewDetailGrid(items = []) {
    const visible = items.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "" && String(value) !== "0");
    if (!visible.length) return "";
    return `<div class="brew-detail-grid">${visible.map(([label, value]) => `<div><span>${html(label)}</span><strong>${html(value)}</strong></div>`).join("")}</div>`;
  }

  function brewDetailSection(title, content) {
    if (!content) return "";
    return `<section class="brew-detail-section"><h3>${html(title)}</h3>${content}</section>`;
  }

  function openBrewLogDetail(key, trigger = document.activeElement) {
    const log = findBrewLogForEdit(key);
    if (!log) return showMessage("Brew Log tidak ditemukan. Muat ulang data lalu coba lagi.", "error");
    const qaState = brewLogQAState(log);
    const linkedQA = qaState.qa || BREW_LOG_QA_VIEW?.linkedQA?.(log, allQA()) || null;
    const title = log.BeanName || log.Variety || log.BrewID || "Detail Brew";
    if ($("brewLogDetailTitle")) $("brewLogDetailTitle").textContent = title;
    if ($("brewLogDetailMeta")) $("brewLogDetailMeta").textContent = [log.BrewID, homeDateLabel(log.Date), log.Method].filter(Boolean).join(" · ");

    const brew = brewDetailGrid([
      ["Brew ID", log.BrewID], ["Tanggal", homeDateLabel(log.Date)], ["Kopi", log.BeanName || log.Variety],
      ["Origin", log.Origin], ["Metode", log.Method], ["Dripper", log.Dripper], ["Brewer", log.BrewerName],
      ["Parent Brew", log.ParentBrewID]
    ]);
    const recipe = brewDetailGrid([
      ["Dose", Number(log.Dose_g || 0) ? `${fmt(log.Dose_g, 1)} g` : ""],
      ["Total air", Number(log.TotalWater_ml || 0) ? `${fmt(log.TotalWater_ml, 1)} ml` : ""],
      ["Rasio", Number(log.Ratio || 0) ? `1:${fmt(log.Ratio, 1)}` : ""],
      ["Suhu", Number(log.Temp_C || 0) ? `${fmt(log.Temp_C, 1)}°C` : ""],
      ["Grinder", log.Grinder], ["Grind", log.GrindSetting], ["Air", log.Water], ["Filter", log.Filter]
    ]);
    const timing = brewDetailGrid([
      ["Bloom", Number(log.Bloom_ml || 0) ? `${fmt(log.Bloom_ml, 1)} ml` : ""],
      ["Brew time", Number(log.BrewTime_sec || 0) ? `${fmt(log.BrewTime_sec)} detik` : ""],
      ["Jumlah pour", Number(log.PourCount || 0) ? fmt(log.PourCount) : ""], ["Pour plan", log.PourPlan],
      ["Valve plan", log.ValvePlan], ["Agitasi", log.Agitation]
    ]);
    const noteParts = [
      log.PrimaryVariableChanged ? `<p class="brew-detail-copy"><strong>Variabel:</strong> ${html(log.PrimaryVariableChanged)}</p>` : "",
      log.Hypothesis ? `<p class="brew-detail-copy"><strong>Hipotesis:</strong> ${html(log.Hypothesis)}</p>` : "",
      log.ResultNotes ? `<p class="brew-detail-copy"><strong>Hasil:</strong> ${html(log.ResultNotes)}</p>` : ""
    ].filter(Boolean).join("");
    const qa = brewDetailGrid([
      ["Status QA", qaState.label], ["Final QA", qaState.score === null ? "" : fmt(qaState.score, 2)],
      ["QA ID", log.QA_ID || linkedQA?.QA_ID], ["Evaluator", linkedQA?.Evaluator],
      ["Persetujuan", log.ApprovedForRecipe], ["Moderasi", statusLabel(log.ModerationStatus)]
    ]);
    const stock = (log.StockBeanID || log.StockBeanCode || Number(log.StockUsage_g || 0) > 0)
      ? brewDetailGrid([["Stock bean", log.StockBeanCode || log.StockBeanID], ["Pemakaian", Number(log.StockUsage_g || 0) ? `${fmt(log.StockUsage_g, 1)} g` : ""]])
      : "";

    if ($("brewLogDetailBody")) $("brewLogDetailBody").innerHTML = [
      brewDetailSection("Brew", brew), brewDetailSection("Recipe", recipe), brewDetailSection("Pour & Timing", timing),
      brewDetailSection("Notes", noteParts), brewDetailSection("QA", qa), brewDetailSection("Existing Inventory Link", stock)
    ].filter(Boolean).join("");

    if (window.LESTARI_UI?.openModal) window.LESTARI_UI.openModal("brewLogDetailModal", trigger);
    else {
      setElementHidden($("brewLogDetailModal"), false);
      $("brewLogDetailModal")?.setAttribute("aria-hidden", "false");
    }
  }

  function startQAForBrew(key) {
    const log = findBrewLogForEdit(key);
    if (!log) return showMessage("Brew Log tidak ditemukan. Muat ulang data lalu coba lagi.", "error");
    if (brewLogQAState(log).key !== "pending") return showMessage("Brew ini sudah memiliki QA dan tidak dapat dinilai ulang dari form ini.", "info");
    const select = $("qaParent");
    if (!select) return;
    select.value = log.BrewID;
    applySelectedDraftToQA();
    $("qaForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => select.focus({ preventScroll: true }), 80);
  }

  function clearBrewLogFilters() {
    if ($("brewLogSearch")) $("brewLogSearch").value = "";
    if ($("brewLogMethodFilter")) $("brewLogMethodFilter").value = "all";
    if ($("brewLogQAFilter")) $("brewLogQAFilter").value = "all";
    if ($("brewLogDateFrom")) $("brewLogDateFrom").value = "";
    if ($("brewLogDateTo")) $("brewLogDateTo").value = "";
    renderBrewLogTable();
    $("brewLogSearch")?.focus();
  }

  function openBrewLogEdit(key) {
    if (!canAdmin()) return showMessage("Edit Brew Log hanya untuk Admin Workspace.", "error");
    const log = findBrewLogForEdit(key);
    if (!log) return showMessage("Brew Log tidak ditemukan. Muat ulang data lalu coba lagi.", "error");
    if (!log.CloudID) return showMessage("Brew Log ini belum memiliki ID Supabase, sehingga belum bisa diedit dari panel admin.", "error");

    $("editBrewCloudId").value = log.CloudID || "";
    if ($("editBrewHeaderId")) $("editBrewHeaderId").textContent = log.BrewID || "-";
    $("editBrewId").value = log.BrewID || "";
    $("editBrewDate").value = log.Date || todayISO();
    $("editBrewBeanName").value = log.BeanName || "";
    $("editBrewOrigin").value = log.Origin || "";
    $("editBrewVariety").value = log.Variety || "";
    $("editBrewProcess").value = log.Process || "";
    $("editBrewRoast").value = log.RoastProfile || "";
    $("editBrewMethod").value = log.Method || "";
    $("editBrewDripper").value = log.Dripper || "";
    $("editBrewGrinder").value = log.Grinder || "";
    $("editBrewGrind").value = log.GrindSetting || "";
    $("editBrewTemp").value = log.Temp_C || "";
    $("editBrewRatio").value = log.Ratio || "";
    $("editBrewQA").value = log.QA_Final || "";
    $("editBrewApproved").value = log.ApprovedForRecipe || "No";
    $("editBrewVariable").value = log.PrimaryVariableChanged || "";
    $("editBrewHypothesis").value = log.Hypothesis || "";
    $("editBrewResultNotes").value = log.ResultNotes || "";

    setElementHidden($("brewLogEditPanel"), false);
    $("brewLogEditPanel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closeBrewLogEdit() {
    $("brewLogEditForm")?.reset();
    setElementHidden($("brewLogEditPanel"), true);
  }

  async function saveBrewLogEdit(e) {
    e.preventDefault();
    if (!canAdmin()) return showMessage("Edit Brew Log hanya untuk Admin Workspace.", "error");
    if (!cloudReady || !supabaseClient) return showMessage("Supabase belum tersambung.", "error");

    const cloudId = $("editBrewCloudId")?.value;
    const current = findBrewLogForEdit(cloudId);
    if (!cloudId || !current) return showMessage("Data Brew Log yang diedit tidak ditemukan.", "error");

    const qaValue = $("editBrewQA").value;
    const approvedValue = $("editBrewApproved").value;
    const updated = {
      ...current,
      Date: $("editBrewDate").value || current.Date || todayISO(),
      BeanName: $("editBrewBeanName").value.trim() || current.BeanName,
      Origin: $("editBrewOrigin").value.trim(),
      Variety: $("editBrewVariety").value.trim() || current.Variety,
      Process: $("editBrewProcess").value.trim() || current.Process,
      RoastProfile: $("editBrewRoast").value.trim() || current.RoastProfile,
      Method: $("editBrewMethod").value.trim() || current.Method,
      Dripper: $("editBrewDripper").value.trim() || current.Dripper,
      Grinder: $("editBrewGrinder").value.trim() || current.Grinder,
      GrindSetting: $("editBrewGrind").value.trim() || current.GrindSetting,
      Temp_C: $("editBrewTemp").value === "" ? current.Temp_C : Number($("editBrewTemp").value),
      Ratio: $("editBrewRatio").value === "" ? current.Ratio : Number($("editBrewRatio").value),
      QA_Final: qaValue === "" ? "" : Number(qaValue),
      QA_Status: qaValue === "" ? current.QA_Status : (Number(qaValue) >= APPROVAL_THRESHOLD ? "QA PASS" : "RETEST"),
      ApprovedForRecipe: approvedValue,
      ManualApproval: approvedValue === "Yes" ? "Yes" : (current.ManualApproval || "No"),
      PrimaryVariableChanged: $("editBrewVariable").value.trim(),
      Hypothesis: $("editBrewHypothesis").value.trim(),
      ResultNotes: $("editBrewResultNotes").value.trim(),
      RecipeKey: recipeKey($("editBrewVariety").value.trim() || current.Variety, $("editBrewProcess").value.trim() || current.Process, $("editBrewRoast").value.trim() || current.RoastProfile)
    };

    try {
      const saved = await updateCloud("brew_logs", cloudId, toSnakeBrew(updated), fromSnakeBrew);
      state.cloudBrewLogs = state.cloudBrewLogs.map(item => item.CloudID === saved.CloudID ? saved : item);
      closeBrewLogEdit();
      await syncFromCloud(false).catch(console.warn);
      renderBrewLogTable();
      renderQABrewOptions();
      renderRecipeOptions(computeBrew());
      renderPublicBrewTable();
      if (canModerate()) loadModerationRows().catch(console.warn);
      showMessage("Brew Log berhasil diperbarui oleh Admin.", "success");
    } catch (err) {
      console.error(err);
      showMessage(`Gagal edit Brew Log: ${err.message || err}`, "error");
    }
  }

  async function deleteBrewLog(key) {
    if (!canAdmin()) return showMessage("Hapus Brew Log hanya untuk Admin Workspace.", "error");
    if (!cloudReady || !supabaseClient) return showMessage("Supabase belum tersambung.", "error");

    const log = findBrewLogForEdit(key);
    if (!log) return showMessage("Brew Log tidak ditemukan. Muat ulang data lalu coba lagi.", "error");
    if (!log.CloudID) return showMessage("Brew Log ini belum memiliki ID Supabase, sehingga belum bisa dihapus.", "error");

    const stockText = log.StockBeanID && Number(log.StockUsage_g || 0) > 0
      ? ` Stok kopi akan dikembalikan sebesar ${fmt(log.StockUsage_g)}g.`
      : "";
    if (!confirm(`Hapus Brew Log ${log.BrewID || "ini"}?${stockText}`)) return;

    try {
      showMessage("Menghapus Brew Log dan memulihkan stok jika ada...", "info");
      let result = null;
      await prepareCloudWrite("Hapus Brew Log");
      const rpc = supabaseClient.rpc("delete_brew_log_and_restore_stock", { p_brew_id: log.CloudID });
      const { data, error } = await withTimeout(rpc, CLOUD_WRITE_TIMEOUT_MS, "Hapus Brew Log");
      if (error) throw error;
      result = data || {};

      state.cloudBrewLogs = (state.cloudBrewLogs || []).filter(item => item.CloudID !== log.CloudID);
      state.cloudQA = (state.cloudQA || []).filter(item => item.BrewID !== log.BrewID);

      if (log.StockBeanID && Number(result.stock_g ?? NaN) >= 0) {
        state.cloudStock = (state.cloudStock || []).map(bean => String(bean.CloudID) === String(log.StockBeanID)
          ? { ...bean, Stock_g: Number(result.stock_g) }
          : bean);
      }

      await syncFromCloud(false).catch(console.warn);
      renderStockTable();
      renderBeansTable();
      renderBrewLogTable();
      renderQABrewOptions();
      renderRecipeOptions(computeBrew());
      renderPublicBrewTable();
      if (canModerate()) loadModerationRows().catch(console.warn);

      const restored = result?.stock_restored ? ` Stok dikembalikan ${fmt(result.stock_usage_g)}g.` : "";
      showMessage(`Brew Log berhasil dihapus.${restored}`, "success");
    } catch (err) {
      console.error("delete brew log failed", err);
      const detail = err?.message || err?.details || err?.hint || String(err);
      showMessage(`Gagal menghapus Brew Log: ${detail}`, "error");
      alert(`Gagal menghapus Brew Log. Detail: ${detail}`);
    }
  }

  async function saveStock(e) {
    e?.preventDefault?.();
    const form = $("stockForm");
    const submitBtn = $("stockSubmitBtn");
    const originalText = submitBtn?.textContent || (editingStockId ? "Simpan perubahan Coffee & Inventory" : "Simpan record Inventory");

    if (stockSaving) return;
    if (form?.reportValidity && !form.reportValidity()) {
      setStockFormError("Periksa field wajib dan batas nilai sebelum menyimpan.");
      return;
    }

    if (!canUseWorkspaceModules()) {
      showMessage(privateModuleMessage("Stok Kopi"), "error");
      showTab("admin");
      return;
    }

    const bean = {
      BeanID: nextId("B", allStock(), "BeanID"),
      CoffeeName: $("stockName").value.trim(),
      Origin: $("stockOrigin").value.trim(),
      Producer: $("stockProducer").value.trim(),
      Variety: $("stockVariety1").value,
      Variety2_optional: $("stockVariety2").value,
      Process: selectedProcessValue("stockProcess", "stockProcessCustom"),
      RoastProfile: $("stockRoast").value,
      FlavorFamily: $("stockFlavor1").value,
      FlavorFamily2_optional: $("stockFlavor2").value,
      FlavorFamily3_optional: $("stockFlavor3").value,
      Notes: $("stockNotes").value.trim(),
      Sweetness: Number($("stockSweet").value),
      Acidity: Number($("stockAcid").value),
      Body: Number($("stockBody").value),
      Stock_g: Number($("stockQty").value),
      BestBrew: $("stockBestBrew").value,
      Price: Number($("stockPrice").value),
      RoastDate: $("stockRoastDate").value,
      Active: $("stockActive").value
    };
    const stockValidation = STOCK_SERVICE?.validateStock(bean);
    if (stockValidation && !stockValidation.ok) {
      setStockFormError(stockValidation.first);
      showMessage(stockValidation.first, "error");
      return;
    }

    setStockFormError("");

    stockSaving = true;
    let watchdog;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Menyimpan...";
    }
    watchdog = createButtonWatchdog({ key: "stock", button: submitBtn, originalText, label: "Simpan stok kopi" });
    showMessage("Menyimpan stok kopi ke workspace...", "info");

    try {
      let saved;
      if (editingStockId) {
        if (!canAdmin()) throw new Error("Edit stok hanya tersedia untuk Admin Workspace.");
        const current = allStock().find(item => String(item.CloudID || item.BeanID) === String(editingStockId));
        if (!current?.CloudID) throw new Error("Data stok yang diedit tidak ditemukan di Supabase.");
        const payload = toSnakeStock({ ...bean, BeanID: current.BeanID });
        delete payload.created_by;
        delete payload.source_client_id;
        await prepareCloudWrite("Update stok kopi");
        const { data, error } = await withTimeout(
          supabaseClient
            .from("stock_beans")
            .update(payload)
            .eq("id", current.CloudID)
            .eq("workspace_id", currentWorkspace.id)
            .select("*")
            .single(),
          CLOUD_WRITE_TIMEOUT_MS,
          "Update stok kopi"
        );
        if (error || !data) throw error || new Error("Data stok tidak berhasil diperbarui.");
        saved = fromSnakeStock(data);
        state.cloudStock = uniqueByCloudId([saved, ...(state.cloudStock || []).filter(item => item.CloudID !== saved.CloudID)]);
      } else {
        saved = await insertCloud("stock_beans", toSnakeStock(bean), fromSnakeStock);
        state.cloudStock = uniqueByCloudId([saved, ...(state.cloudStock || [])]);
      }
      renderStockTable();
      renderBeansTable();
      renderMetrics();

      const savedId = saved.CloudID;
      const previousStock = state.cloudStock || [];
      const syncError = await syncFromCloud(false).then(() => null).catch(err => err);
      if (syncError) console.warn("Stock refresh failed after save", syncError);
      if (savedId && !(state.cloudStock || []).some(item => item.CloudID === savedId)) {
        state.cloudStock = uniqueByCloudId([saved, ...previousStock, ...(state.cloudStock || [])]);
      }

      renderStockTable();
      renderBeansTable();
      renderMetrics();
      const wasEditing = Boolean(editingStockId);
      resetStockForm();
      EVENT_BUS.emit("stock:saved", { bean: saved, editing: wasEditing });
      showMessage(wasEditing ? "Perubahan Coffee dan kuantitas Inventory berhasil disimpan." : "Coffee dan Inventory berhasil ditambahkan ke workspace.", "success");
    } catch (err) {
      console.error("Stock save failed", err);
      setStockFormError("Data belum tersimpan. Periksa koneksi, izin workspace, lalu coba lagi.");
      showMessage(`Gagal menyimpan stok ke Supabase: ${err.message || err}`, "error");
      alert(`Gagal menyimpan stok ke Supabase. Data belum tersimpan. Detail: ${err.message || err}`);
    } finally {
      if (watchdog) clearTimeout(watchdog);
      stockSaving = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = editingStockId ? "Simpan perubahan Coffee & Inventory" : "Simpan record Inventory";
      }
    }
  }

  function moderationTitle(row, dataset) {
    if (dataset === "stock_beans") return row.coffee_name || "Untitled bean";
    if (dataset === "brew_logs") return row.bean_name || row.brew_code || "Untitled brew";
    if (dataset === "qa_scores") return `${row.qa_code || "QA"} · ${row.brew_code || "brew"}`;
    return row.id;
  }

  function moderationSubtitle(row, dataset) {
    if (dataset === "stock_beans") return [row.variety, row.variety2_optional, row.process, row.roast_profile].filter(Boolean).join(" · ");
    if (dataset === "brew_logs") return [row.variety, row.process, row.roast_profile, row.method, row.dripper].filter(Boolean).join(" · ");
    if (dataset === "qa_scores") return [`Nilai QA Akhir ${row.final_qa ?? "-"}`, row.evaluator].filter(Boolean).join(" · ");
    return "";
  }

  function canWriteModerationDataset(dataset) {
    return dataset === "stock_beans" ? canAdmin() : canModerate();
  }

  async function loadModerationRows() {
    const table = $("moderationDataset")?.value || "brew_logs";
    const status = $("moderationStatus")?.value || "pending";
    if (!supabaseClient || !currentUser || !currentWorkspace) {
      moderationRows = [];
      renderModerationTable();
      return;
    }
    if (!canModerate()) {
      moderationRows = [];
      renderModerationTable("Peran aktif tidak punya akses moderasi. Gunakan peran QA atau Admin.");
      return;
    }
    let q = supabaseClient.from(table).select("*").eq("workspace_id", currentWorkspace.id).order("created_at", { ascending: false }).limit(300);
    if (status !== "all") q = q.eq("moderation_status", status);
    const { data, error } = await q;
    if (error) {
      renderModerationTable(`Gagal membaca data moderation: ${error.message}`);
      return;
    }
    moderationRows = data || [];
    renderModerationTable();
    renderAdminProDashboard();
  }

  function renderModerationTable(message = "") {
    const table = $("moderationTable");
    if (!table) return;
    const dataset = $("moderationDataset")?.value || "brew_logs";
    table.querySelector("thead").innerHTML = `<tr><th>Status</th><th>Data</th><th>Pembuat</th><th>Dibuat</th><th>QA</th><th>Catatan</th><th>Aksi</th></tr>`;
    const tbody = table.querySelector("tbody");
    if (message) {
      tbody.innerHTML = emptyRow(7, "Informasi moderasi", message, "ⓘ");
      return;
    }
    if (!moderationRows.length) {
      tbody.innerHTML = emptyRow(7, "Tidak ada data untuk filter ini", "Coba ubah status, dataset, atau refresh data workspace.", "◇");
      return;
    }
    tbody.innerHTML = moderationRows.map(row => {
      const status = row.moderation_status || row.status || "pending";
      const actions = canWriteModerationDataset(dataset)
        ? `<button class="secondary" data-mod-action="approve" data-id="${html(row.id)}">Setujui</button>
          <button class="danger" data-mod-action="reject" data-id="${html(row.id)}">Tolak</button>
          <button class="danger" data-mod-action="delete" data-id="${html(row.id)}">Hapus</button>`
        : `<small>Perubahan stok memerlukan Admin.</small>`;
      return `<tr>
        <td><span class="status-pill ${html(status)}">${html(statusLabel(status))}</span></td>
        <td><strong>${html(moderationTitle(row, dataset))}</strong><br><small>${html(moderationSubtitle(row, dataset))}</small></td>
        <td><small>${html(row.created_by || row.source_client_id || "-")}</small></td>
        <td>${html((row.created_at || "").slice(0, 10))}</td>
        <td>${html(row.qa_final ?? row.final_qa ?? "-")}</td>
        <td>${html(row.moderation_notes || row.result_notes || row.qa_notes || row.notes || "-")}</td>
        <td><div class="moderation-actions">${actions}</div></td>
      </tr>`;
    }).join("");
  }

  async function deleteModerationRow(id) {
    const table = $("moderationDataset")?.value || "brew_logs";
    if (!supabaseClient || !canModerate()) return showMessage("Hapus data hanya untuk QA/Admin workspace.", "error");
    if (!canWriteModerationDataset(table)) return showMessage("Perubahan stok pada panel moderasi hanya untuk Admin Workspace.", "error");
    const row = moderationRows.find(r => r.id === id);
    if (!row) return showMessage("Row tidak ditemukan di tabel moderasi saat ini.", "error");
    const linkedStock = table === "brew_logs" && Number(row.stock_usage_g || 0) > 0;
    if (linkedStock && !canAdmin()) {
      return showMessage("Brew Log ini memakai stok. Minta Admin menghapusnya agar stok dipulihkan secara aman.", "error");
    }
    const restoreText = linkedStock ? ` Stok ${fmt(row.stock_usage_g)}g akan dipulihkan.` : "";
    if (!confirm(`Hapus data ini permanen dari Supabase?${restoreText}`)) return;

    try {
      await prepareCloudWrite("Hapus data moderasi");
      if (table === "brew_logs" && canAdmin()) {
        const { data: result, error: rpcError } = await withTimeout(
          supabaseClient.rpc("delete_brew_log_and_restore_stock", { p_brew_id: id }),
          CLOUD_WRITE_TIMEOUT_MS,
          "Hapus Brew Log moderasi"
        );
        if (rpcError) throw rpcError;
        state.cloudBrewLogs = state.cloudBrewLogs.filter(item => item.CloudID !== id);
        state.cloudQA = state.cloudQA.filter(item => item.BrewID !== row.brew_code);
        await syncFromCloud(true).catch(console.warn);
        await loadModerationRows();
        const restored = result?.stock_restored ? ` Stok dipulihkan ${fmt(result.stock_usage_g)}g.` : "";
        showMessage(`Brew Log berhasil dihapus melalui transaksi pemulihan stok.${restored}`, "success");
        return;
      }
      if (table === "brew_logs" && row.brew_code) {
        const qaDelete = await withTimeout(
          supabaseClient.from("qa_scores").delete().eq("workspace_id", currentWorkspace.id).eq("brew_code", row.brew_code),
          CLOUD_WRITE_TIMEOUT_MS,
          "Hapus QA terkait"
        );
        if (qaDelete?.error) throw qaDelete.error;
      }
      const { data, error } = await withTimeout(
        supabaseClient
          .from(table)
          .delete()
          .eq("id", id)
          .eq("workspace_id", currentWorkspace.id)
          .select("id")
          .single(),
        CLOUD_WRITE_TIMEOUT_MS,
        "Hapus data moderasi"
      );
      if (error || !data) throw error || new Error("Data tidak terhapus. Kemungkinan policy RLS belum mengizinkan delete untuk QA/Admin workspace.");
      state.cloudBrewLogs = state.cloudBrewLogs.filter(item => item.CloudID !== id);
      state.cloudQA = state.cloudQA.filter(item => item.CloudID !== id);
      state.cloudStock = state.cloudStock.filter(item => item.CloudID !== id);
      await syncFromCloud(true).catch(console.warn);
      await loadModerationRows();
      showMessage("Data berhasil dihapus permanen dari Supabase.", "success");
    } catch (err) {
      console.error(err);
      showMessage(`Gagal menghapus data: ${err.message || err}`, "error");
    }
  }

  async function moderateRow(id, action) {
    const table = $("moderationDataset")?.value || "brew_logs";
    if (!supabaseClient || !canModerate()) return showMessage("Butuh role QA/Admin.", "error");
    if (!canWriteModerationDataset(table)) return showMessage("Perubahan stok pada panel moderasi hanya untuk Admin Workspace.", "error");
    if (action === "delete") return deleteModerationRow(id);
    if (action === "edit") return showMessage("Edit JSON dinonaktifkan dari UI agar data produksi lebih aman.", "info");

    const row = moderationRows.find(r => r.id === id);
    const notes = action === "reject" ? prompt("Alasan reject / catatan perbaikan:", "Data perlu dicek ulang.") : "Disetujui oleh moderator";
    const payload = {
      moderation_status: action === "approve" ? "approved" : "rejected",
      moderation_notes: notes || null,
      moderated_by: currentUser.id,
      moderated_at: new Date().toISOString()
    };
    if (table === "brew_logs") {
      payload.status = action === "approve" ? "published" : "rejected";
      if (action === "approve" && Number(row?.qa_final || 0) >= APPROVAL_THRESHOLD) {
        payload.manual_approval = "Yes";
        payload.approved_for_recipe = "Yes";
        payload.qa_status = "QA PASS";
      }
      if (action === "reject") {
        payload.manual_approval = "No";
        payload.approved_for_recipe = "No";
      }
    }
    if (table === "qa_scores") {
      payload.status = action === "approve" ? (Number(row?.final_qa || 0) >= APPROVAL_THRESHOLD ? "QA PASS" : "APPROVED") : "REJECTED";
    }

    try {
      await prepareCloudWrite("Update moderasi");
      const { data, error } = await withTimeout(
        supabaseClient
          .from(table)
          .update(payload)
          .eq("id", id)
          .eq("workspace_id", currentWorkspace.id)
          .select("id")
          .single(),
        CLOUD_WRITE_TIMEOUT_MS,
        "Update moderasi"
      );
      if (error || !data) throw error || new Error("Tidak ada row yang berubah. Cek RLS policy dan role workspace.");
      await syncFromCloud(true).catch(console.warn);
      await loadModerationRows();
      showMessage(action === "approve" ? "Data disetujui. Jika QA memenuhi threshold, data akan tampil publik." : "Data ditolak.", action === "approve" ? "success" : "info");
    } catch (err) {
      console.error(err);
      showMessage(`Moderation gagal: ${err.message || err}`, "error");
    }
  }

  async function editModerationJson(id) {
    const table = $("moderationDataset")?.value || "brew_logs";
    if (!supabaseClient || !canModerate()) return showMessage("Butuh role QA/Admin.");
    const row = moderationRows.find(r => r.id === id);
    if (!row) return;
    const edited = prompt("Edit JSON row. Hati-hati: gunakan JSON valid.", JSON.stringify(row, null, 2));
    if (!edited) return;
    let payload;
    try { payload = JSON.parse(edited); } catch (err) { return showMessage("JSON tidak valid."); }
    ["id", "created_at", "updated_at"].forEach(k => delete payload[k]);
    payload.moderated_by = currentUser.id;
    payload.moderated_at = new Date().toISOString();
    await prepareCloudWrite("Edit data moderasi");
    const { error } = await withTimeout(supabaseClient.from(table).update(payload).eq("id", id), CLOUD_WRITE_TIMEOUT_MS, "Edit data moderasi");
    if (error) return showMessage(`Edit gagal: ${error.message}`);
    await syncFromCloud(true).catch(console.warn);
    await loadModerationRows();
    showMessage("Data berhasil diedit.");
  }

  async function loadMemberRequests() {
    if (!supabaseClient || !currentUser || !currentWorkspace || !canAdmin()) {
      pendingMemberRows = [];
      renderMemberRequests();
      return;
    }
    const { data, error } = await supabaseClient
      .from("workspace_members")
      .select("workspace_id,user_id,role,status,created_at")
      .eq("workspace_id", currentWorkspace.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) {
      pendingMemberRows = [];
      renderMemberRequests(`Gagal membaca request akses: ${error.message}`);
      return;
    }
    const userIds = (data || []).map(row => row.user_id).filter(Boolean);
    let profiles = [];
    if (userIds.length) {
      const profileRes = await supabaseClient.from("profiles").select("id,email,display_name").in("id", userIds);
      if (!profileRes.error) profiles = profileRes.data || [];
    }
    pendingMemberRows = (data || []).map(row => ({ ...row, profile: profiles.find(p => p.id === row.user_id) || {} }));
    renderMemberRequests();
    renderAdminProDashboard();
    renderSecurityOverview();
  }

  function renderMemberRequests(message = "") {
    const table = $("memberRequestTable");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!canAdmin()) {
      tbody.innerHTML = emptyRow(5, "Panel khusus Admin Workspace", "Masuk dengan role admin untuk melihat request akses.", "🔒");
      return;
    }
    if (message) {
      tbody.innerHTML = emptyRow(5, "Informasi request akses", message, "ⓘ");
      return;
    }
    if (!pendingMemberRows.length) {
      tbody.innerHTML = emptyRow(5, "Tidak ada request pending", "Semua permintaan akses workspace sudah diproses.", "✓");
      return;
    }
    tbody.innerHTML = pendingMemberRows.map(row => {
      const display = row.profile?.display_name || row.profile?.email || row.user_id;
      return `<tr>
        <td><strong>${html(display)}</strong><br><small>${html(row.profile?.email || row.user_id)}</small></td>
        <td>${html(roleDisplayLabel(row.role))}</td>
        <td><span class="status-pill pending">Menunggu persetujuan</span></td>
        <td>${html((row.created_at || "").slice(0, 10))}</td>
        <td><div class="moderation-actions"><button class="secondary" data-member-action="approve" data-user-id="${html(row.user_id)}">Setujui</button><button class="danger" data-member-action="reject" data-user-id="${html(row.user_id)}">Tolak</button></div></td>
      </tr>`;
    }).join("");
  }

  async function updateMemberRequest(userId, action) {
    if (!supabaseClient || !canAdmin() || !currentWorkspace) return showMessage("Butuh role Admin Workspace.", "error");
    const status = action === "approve" ? "active" : "rejected";
    await prepareCloudWrite("Update request akses");
    const { data, error } = await withTimeout(
      supabaseClient
        .from("workspace_members")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("workspace_id", currentWorkspace.id)
        .eq("user_id", userId)
        .eq("status", "pending")
        .select("workspace_id,user_id,status")
        .single(),
      CLOUD_WRITE_TIMEOUT_MS,
      "Update request akses"
    );
    if (error || !data) return showMessage(`Gagal memproses request: ${(error && error.message) || "row tidak ditemukan"}`, "error");
    await loadMemberRequests();
    await loadWorkspaceMembers();
    await loadAuditTrail().catch(console.warn);
    showMessage(action === "approve" ? "Permintaan akses disetujui. Pengguna sekarang dapat mengakses workspace." : "Permintaan akses ditolak.", action === "approve" ? "success" : "info");
  }

  async function loadWorkspaceMembers(message = "") {
    if (!supabaseClient || !currentUser || !currentWorkspace || !canAdmin()) {
      workspaceMemberRows = [];
      renderWorkspaceMembers();
      return;
    }
    const { data, error } = await supabaseClient
      .from("workspace_members")
      .select("workspace_id,user_id,role,status,created_at,updated_at")
      .eq("workspace_id", currentWorkspace.id)
      .in("status", ["active", "disabled"])
      .order("role", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      workspaceMemberRows = [];
      renderWorkspaceMembers(message || `Gagal membaca pengguna workspace: ${error.message}`);
      return;
    }
    const userIds = (data || []).map(row => row.user_id).filter(Boolean);
    let profiles = [];
    if (userIds.length) {
      const profileRes = await supabaseClient.from("profiles").select("id,email,display_name").in("id", userIds);
      if (!profileRes.error) profiles = profileRes.data || [];
    }
    workspaceMemberRows = (data || []).map(row => ({ ...row, profile: profiles.find(p => p.id === row.user_id) || {} }));
    renderWorkspaceMembers();
    renderAdminProDashboard();
    renderSecurityOverview();
  }

  function renderWorkspaceMembers(message = "") {
    const table = $("workspaceUserTable");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!canAdmin()) {
      tbody.innerHTML = emptyRow(6, "Panel khusus Admin Workspace", "Masuk sebagai admin untuk mengelola anggota workspace.", "🔒");
      return;
    }
    if (message) {
      tbody.innerHTML = emptyRow(6, "Informasi pengguna workspace", message, "ⓘ");
      return;
    }
    if (!workspaceMemberRows.length) {
      tbody.innerHTML = emptyRow(6, "Belum ada anggota aktif", "Setujui permintaan akses untuk mulai berkolaborasi.", "👥");
      return;
    }
    const activeAdminCount = workspaceMemberRows.filter(row => row.role === "admin" && row.status === "active").length;
    tbody.innerHTML = workspaceMemberRows.map(row => {
      const display = row.profile?.display_name || row.profile?.email || row.user_id;
      const email = row.profile?.email || row.user_id;
      const statusClass = row.status === "active" ? "approved" : row.status === "disabled" ? "disabled" : row.status === "rejected" ? "rejected" : "pending";
      const isSelf = row.user_id === currentUser?.id;
      const protectLastAdmin = row.role === "admin" && row.status === "active" && activeAdminCount <= 1;
      const disableManagement = isSelf || protectLastAdmin;
      let actions = `<span class="member-self-note">${isSelf ? "Akun yang sedang digunakan" : protectLastAdmin ? "Admin aktif terakhir" : "-"}</span>`;
      if (!disableManagement) {
        const statusAction = row.status === "disabled"
          ? `<button class="secondary" data-workspace-user-action="activate" data-user-id="${html(row.user_id)}">Aktifkan Akses</button>`
          : `<button class="ghost" data-workspace-user-action="suspend" data-user-id="${html(row.user_id)}">Tangguhkan Akses</button>`;
        const roleSelect = `<label class="member-role-control"><span class="sr-only">Peran ${html(display)}</span><select data-workspace-user-role="${html(row.user_id)}" aria-label="Ubah peran ${html(display)}">
          ${["brewer", "qa", "admin"].map(role => `<option value="${role}"${row.role === role ? " selected" : ""}>${html(roleDisplayLabel(role))}</option>`).join("")}
        </select><button class="secondary" data-workspace-user-action="role" data-user-id="${html(row.user_id)}">Ubah Peran</button></label>`;
        actions = `${roleSelect}${statusAction}<button class="danger" data-workspace-user-action="delete" data-user-id="${html(row.user_id)}">Lepas Akses</button>`;
      }
      return `<tr>
        <td><strong>${html(display)}</strong><br><small>${html(email)}</small></td>
        <td>${html(roleDisplayLabel(row.role))}</td>
        <td><span class="status-pill ${html(statusClass)}">${html(memberStatusLabel(row.status))}</span></td>
        <td>${html((row.created_at || "").slice(0, 10))}</td>
        <td>${html((row.updated_at || "").slice(0, 10))}</td>
        <td><div class="moderation-actions member-management-actions">${actions}</div></td>
      </tr>`;
    }).join("");
  }

  function confirmMemberAction({ title, message, confirmLabel = "Lanjutkan", destructive = true } = {}) {
    const dialog = $("memberActionDialog");
    if (!dialog?.showModal) return Promise.resolve(confirm(message || title || "Lanjutkan tindakan ini?"));
    if (dialog.open) dialog.close("cancel");

    const titleTarget = $("memberActionDialogTitle");
    const descriptionTarget = $("memberActionDialogDescription");
    const confirmButton = $("memberActionConfirm");
    const previousFocus = document.activeElement;
    if (titleTarget) titleTarget.textContent = title || "Konfirmasi tindakan anggota";
    if (descriptionTarget) descriptionTarget.textContent = message || "Periksa tindakan sebelum melanjutkan.";
    if (confirmButton) {
      confirmButton.textContent = confirmLabel;
      confirmButton.classList.toggle("danger", destructive);
      confirmButton.classList.toggle("secondary", !destructive);
    }

    return new Promise(resolve => {
      const handleClose = () => {
        const accepted = dialog.returnValue === "confirm";
        const focusTarget = previousFocus && !previousFocus.disabled ? previousFocus : $("workspaceUserTable");
        focusTarget?.focus?.({ preventScroll: true });
        resolve(accepted);
      };
      dialog.addEventListener("close", handleClose, { once: true });
      dialog.returnValue = "cancel";
      dialog.showModal();
      queueMicrotask(() => confirmButton?.focus?.({ preventScroll: true }));
    });
  }

  async function updateWorkspaceMember(userId, action) {
    if (!supabaseClient || !canAdmin() || !currentWorkspace) return showMessage("Aksi ini memerlukan peran Admin Workspace.", "error");
    const row = workspaceMemberRows.find(member => member.user_id === userId);
    if (!row) return showMessage("Data pengguna tidak ditemukan. Muat ulang tabel pengguna.", "error");
    if (userId === currentUser?.id) return showMessage("Peran atau akses akun yang sedang digunakan tidak dapat diubah dari panel ini.", "error");
    const activeAdminCount = workspaceMemberRows.filter(member => member.role === "admin" && member.status === "active").length;

    if (action === "role") {
      const nextRole = document.querySelector(`[data-workspace-user-role="${CSS.escape(userId)}"]`)?.value || row.role;
      if (!["brewer", "qa", "admin"].includes(nextRole)) return showMessage("Peran yang dipilih tidak valid.", "error");
      if (nextRole === row.role) return showMessage("Peran pengguna tidak berubah.", "info");
      if (row.role === "admin" && row.status === "active" && activeAdminCount <= 1 && nextRole !== "admin") {
        return showMessage("Admin aktif terakhir tidak dapat diturunkan perannya.", "error");
      }
      const label = row.profile?.display_name || row.profile?.email || userId;
      const confirmed = await confirmMemberAction({
        title: "Ubah peran anggota",
        message: `Ubah peran ${label} di workspace ${currentWorkspace.name} dari ${roleDisplayLabel(row.role)} menjadi ${roleDisplayLabel(nextRole)}?`,
        confirmLabel: "Ubah Peran",
        destructive: false
      });
      if (!confirmed) return;
      await prepareCloudWrite("Ubah peran pengguna");
      const { data, error } = await withTimeout(
        supabaseClient
          .from("workspace_members")
          .update({ role: nextRole, updated_at: new Date().toISOString() })
          .eq("workspace_id", currentWorkspace.id)
          .eq("user_id", userId)
          .select("workspace_id,user_id,role")
          .single(),
        CLOUD_WRITE_TIMEOUT_MS,
        "Ubah peran pengguna"
      );
      if (error || !data) return showMessage(`Gagal mengubah peran: ${(error && error.message) || "row tidak ditemukan"}`, "error");
      await loadWorkspaceMembers();
      await loadAuditTrail().catch(console.warn);
      showMessage(`Peran pengguna diubah menjadi ${roleDisplayLabel(nextRole)}.`, "success");
      return;
    }

    if (row.role === "admin" && row.status === "active" && activeAdminCount <= 1) {
      return showMessage("Admin aktif terakhir tidak dapat ditangguhkan atau dilepas.", "error");
    }

    if (action === "delete") {
      const label = row.profile?.display_name || row.profile?.email || row.user_id;
      const confirmed = await confirmMemberAction({
        title: "Lepas akses anggota",
        message: `Lepas akses ${label} dari workspace ${currentWorkspace.name}? Keanggotaan workspace akan dihapus, tetapi akun pengguna tetap ada.`,
        confirmLabel: "Lepas Akses",
        destructive: true
      });
      if (!confirmed) return;
      await prepareCloudWrite("Lepas akses pengguna");
      const { data, error } = await withTimeout(
        supabaseClient
          .from("workspace_members")
          .delete()
          .eq("workspace_id", currentWorkspace.id)
          .eq("user_id", userId)
          .select("workspace_id,user_id")
          .single(),
        CLOUD_WRITE_TIMEOUT_MS,
        "Lepas akses pengguna"
      );
      if (error || !data) return showMessage(`Gagal melepas akses: ${(error && error.message) || "row tidak ditemukan"}`, "error");
      await loadWorkspaceMembers();
      await loadAuditTrail().catch(console.warn);
      showMessage("Akses pengguna ke workspace berhasil dilepas.", "success");
      return;
    }

    if (!["activate", "suspend"].includes(action)) return showMessage("Aksi pengguna tidak dikenali.", "error");
    const label = row.profile?.display_name || row.profile?.email || row.user_id;
    const status = action === "activate" ? "active" : "disabled";
    const verb = status === "active" ? "mengaktifkan kembali" : "menangguhkan akses";
    const confirmed = await confirmMemberAction({
      title: status === "active" ? "Aktifkan kembali akses" : "Tangguhkan akses anggota",
      message: status === "active"
        ? `Aktifkan kembali akses ${label} ke workspace ${currentWorkspace.name}?`
        : `Tangguhkan akses ${label} ke workspace ${currentWorkspace.name}? Data akun tidak akan dihapus.`,
      confirmLabel: status === "active" ? "Aktifkan Akses" : "Tangguhkan Akses",
      destructive: status !== "active"
    });
    if (!confirmed) return;
    showMessage(`Sedang ${verb} pengguna...`, "info");
    await prepareCloudWrite("Perbarui akses pengguna");
    const { data, error } = await withTimeout(
      supabaseClient
        .from("workspace_members")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("workspace_id", currentWorkspace.id)
        .eq("user_id", userId)
        .select("workspace_id,user_id,status")
        .single(),
      CLOUD_WRITE_TIMEOUT_MS,
      "Perbarui akses pengguna"
    );
    if (error || !data) return showMessage(`Gagal memperbarui akses: ${(error && error.message) || "row tidak ditemukan"}`, "error");
    await loadWorkspaceMembers();
    await loadAuditTrail().catch(console.warn);
    showMessage(status === "active" ? "Akses pengguna diaktifkan kembali." : "Akses pengguna ditangguhkan sementara.", status === "active" ? "success" : "info");
  }

  async function submitSuggestion(e) {
    e.preventDefault();
    const suggestion = {
      id: `SG-${Date.now()}`,
      created_at: new Date().toISOString(),
      name: $("suggestionName")?.value.trim() || currentBrewerName(),
      email: $("suggestionEmail")?.value.trim() || currentUser?.email || "",
      category: $("suggestionCategory")?.value || "Lainnya",
      priority: $("suggestionPriority")?.value || "Normal",
      message: $("suggestionMessage")?.value.trim() || "",
      workspace_id: activeWorkspaceId() || DEFAULT_PUBLIC_WORKSPACE_ID,
      created_by: currentUser?.id || null
    };
    if (!suggestion.message) return showMessage("Isi saran/masukan terlebih dahulu.", "error");
    try {
      if (supabaseClient) {
        if (currentUser) await prepareCloudWrite("Kirim saran");
        const { error } = await withTimeout(supabaseClient.from("suggestions").insert({
          name: suggestion.name,
          email: suggestion.email || null,
          category: suggestion.category,
          priority: suggestion.priority,
          message: suggestion.message,
          workspace_id: suggestion.workspace_id,
          created_by: suggestion.created_by,
          status: "open"
        }), CLOUD_WRITE_TIMEOUT_MS, "Kirim saran");
        if (error) throw error;
        e.target.reset();
        if (currentUser) {
          $("suggestionName").value = userProfile?.display_name || currentUser.email?.split("@")[0] || "";
          $("suggestionEmail").value = currentUser.email || "";
        }
        if (canAdmin()) loadSuggestionRows().catch(console.warn);
        return showMessage("Terima kasih. Saran berhasil dikirim.", "success");
      }
      throw new Error("Supabase belum aktif");
    } catch (err) {
      state.suggestions.unshift(suggestion);
      persist();
      e.target.reset();
      showMessage("Terima kasih. Saran tersimpan lokal karena tabel Supabase belum tersedia/aktif.", "info");
    }
  }

  async function loadSuggestionRows(message = "") {
    if (!supabaseClient || !currentUser || !canAdmin()) {
      suggestionRows = [];
      renderSuggestionInbox();
      return;
    }

    const workspaceId = activeWorkspaceId() || DEFAULT_PUBLIC_WORKSPACE_ID;
    let query = supabaseClient
      .from("suggestions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (workspaceId) query = query.or(`workspace_id.eq.${workspaceId},workspace_id.eq.${DEFAULT_PUBLIC_WORKSPACE_ID}`);

    const { data, error } = await withTimeout(query, CLOUD_READ_TIMEOUT_MS, "Muat masukan");
    if (error) {
      suggestionRows = [];
      renderSuggestionInbox(message || `Gagal membaca masukan: ${error.message}`);
      return;
    }
    suggestionRows = data || [];
    renderSuggestionInbox(message);
    renderAdminProDashboard();
  }

  function renderSuggestionInbox(message = "") {
    const table = $("suggestionInboxTable");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    if (!canAdmin()) {
      tbody.innerHTML = emptyRow(6, "Panel khusus Admin Workspace", "Masuk sebagai admin untuk melihat masukan dari Kotak Saran.", "i");
      return;
    }
    if (message) {
      tbody.innerHTML = emptyRow(6, "Informasi masukan", message, "i");
      return;
    }

    const localRows = (state.suggestions || []).map(row => ({ ...row, source: "local" }));
    const rows = [...(suggestionRows || []).map(row => ({ ...row, source: "supabase" })), ...localRows];
    if (!rows.length) {
      tbody.innerHTML = emptyRow(6, "Belum ada masukan", "Data dari Kotak Saran akan muncul di sini dan di tabel Supabase suggestions.", "i");
      return;
    }

    tbody.innerHTML = rows.map(row => {
      const isCloud = row.source === "supabase";
      const status = row.status || (isCloud ? "open" : "local");
      const sender = [row.name, row.email].filter(Boolean).join(" / ") || "-";
      const actions = isCloud
        ? `<div class="moderation-actions"><button class="secondary" data-suggestion-action="reviewed" data-id="${html(row.id)}">Review</button><button class="danger" data-suggestion-action="closed" data-id="${html(row.id)}">Tutup</button></div>`
        : `<small class="member-self-note">Tersimpan lokal browser ini</small>`;
      return `<tr>
        <td><span class="status-pill ${html(status)}">${html(status)}</span></td>
        <td>${html(row.category || "-")}<br><small>${html(row.priority || "Normal")}</small></td>
        <td><strong>${html(row.message || "-")}</strong></td>
        <td><small>${html(sender)}</small></td>
        <td>${html((row.created_at || "").slice(0, 10))}</td>
        <td>${actions}</td>
      </tr>`;
    }).join("");
  }

  async function updateSuggestionStatus(id, status) {
    if (!supabaseClient || !canAdmin()) return showMessage("Butuh role Admin Workspace untuk mengubah status masukan.", "error");
    try {
      await prepareCloudWrite("Update status masukan");
      const { data, error } = await withTimeout(
        supabaseClient
          .from("suggestions")
          .update({ status })
          .eq("id", id)
          .select("id")
          .single(),
        CLOUD_WRITE_TIMEOUT_MS,
        "Update status masukan"
      );
      if (error || !data) throw error || new Error("Masukan tidak ditemukan atau tidak bisa diubah.");
      await loadSuggestionRows();
      showMessage(status === "closed" ? "Masukan ditutup." : "Masukan ditandai sudah direview.", "success");
    } catch (err) {
      console.error("update suggestion failed", err);
      showMessage(`Gagal mengubah status masukan: ${err.message || err}`, "error");
    }
  }

  function publicApprovedRows() {
    return (state.cloudBrewLogs || [])
      .filter(log => log.Source === "Supabase")
      .filter(log => norm(log.ModerationStatus) === "approved")
      .filter(log => norm(log.Visibility || "public") === "public")
      .filter(log => isApprovedRecipeLog(log));
  }

  function refreshPublicFilterOptions() {
    const rows = publicApprovedRows();
    const fill = (id, values, label) => {
      const select = $(id);
      if (!select) return;
      const current = select.value || "all";
      const options = uniq(values.filter(Boolean)).sort((a, b) => String(a).localeCompare(String(b)));
      select.innerHTML = `<option value="all">${html(label)}</option>${options.map(v => `<option value="${html(v)}">${html(v)}</option>`).join("")}`;
      if (current === "all" || options.includes(current)) select.value = current;
    };
    fill("publicBrewDripper", rows.map(log => log.Dripper), "Semua dripper");
    fill("publicBrewProcess", rows.map(log => log.Process), "Semua proses");
    fill("publicBrewRoast", rows.map(log => log.RoastProfile), "Semua roast");
  }

  function publicBrewRows() {
    const search = norm($("publicBrewSearch")?.value || "");
    const method = $("publicBrewMethod")?.value || "all";
    const dripper = $("publicBrewDripper")?.value || "all";
    const process = $("publicBrewProcess")?.value || "all";
    const roast = $("publicBrewRoast")?.value || "all";
    const minQA = Number($("publicBrewMinQA")?.value || 0);
    const sortMode = $("publicBrewSort")?.value || "newest";
    const filteredRows = publicApprovedRows()
      .filter(log => method === "all" || norm(log.Method) === norm(method))
      .filter(log => dripper === "all" || norm(log.Dripper) === norm(dripper))
      .filter(log => process === "all" || norm(log.Process) === norm(process))
      .filter(log => roast === "all" || norm(log.RoastProfile) === norm(roast))
      .filter(log => !minQA || Number(log.QA_Final || 0) >= minQA)
      .filter(log => {
        if (!search) return true;
        return [log.BeanName, log.BrewerName, log.Variety, log.Process, log.RoastProfile, log.Method, log.Dripper, log.ResultNotes, log.PrimaryVariableChanged, log.Grinder, log.Water]
          .some(v => norm(v).includes(search));
      });
    if (sortMode === "qa") return filteredRows.sort((a, b) => Number(b.QA_Final || 0) - Number(a.QA_Final || 0));
    if (sortMode === "recipe") return filteredRows.sort((a, b) => {
      const score = log => [log.Dripper, log.Grinder, log.GrindSetting, log.Temp_C, log.Ratio, log.Dose_g, log.TotalWater_ml, log.PourPlan, log.ResultNotes].filter(Boolean).length;
      return score(b) - score(a) || Number(b.QA_Final || 0) - Number(a.QA_Final || 0);
    });
    return sortBrewNewest(filteredRows);
  }

  function publicBrewKey(log) {
    return String(log.CloudID || log.BrewID || "");
  }

  function publicBrewPresentation(log = {}) {
    return {
      CloudID: log.CloudID,
      BrewID: log.BrewID,
      Date: log.Date,
      BeanName: log.BeanName,
      Origin: log.Origin,
      Variety: log.Variety,
      Variety2_optional: log.Variety2_optional,
      Variety3_optional: log.Variety3_optional,
      Process: log.Process,
      RoastProfile: log.RoastProfile,
      BrewerName: log.BrewerName,
      Method: log.Method,
      Dripper: log.Dripper,
      Grinder: log.Grinder,
      GrindSetting: log.GrindSetting,
      Temp_C: log.Temp_C,
      Ratio: log.Ratio,
      Dose_g: log.Dose_g,
      TotalWater_ml: log.TotalWater_ml,
      HotWater_ml: log.HotWater_ml,
      Ice_g: log.Ice_g,
      BrewTime_sec: log.BrewTime_sec,
      Bloom_ml: log.Bloom_ml,
      PourCount: log.PourCount,
      PourPlan: log.PourPlan,
      Water: log.Water,
      SwitchValveMode: log.SwitchValveMode,
      ValvePlan: log.ValvePlan,
      PrimaryVariableChanged: log.PrimaryVariableChanged,
      Hypothesis: log.Hypothesis,
      ResultNotes: log.ResultNotes,
      TastingNotes: log.TastingNotes,
      QA_Final: log.QA_Final
    };
  }

  function findPublicBrewLog(key) {
    return publicApprovedRows().find(log => publicBrewKey(log) === String(key));
  }

  function detailLine(label, value) {
    const text = value === 0 ? "0" : (value || "-");
    return `<div class="detail-line"><span>${html(label)}</span><strong>${html(text)}</strong></div>`;
  }

  function publicBrewDetailHtml(log) {
    const brew = publicBrewPresentation(log);
    const key = html(publicBrewKey(log));
    const varietyText = uniq([brew.Variety, brew.Variety2_optional, brew.Variety3_optional].flatMap(splitVarietyLabel)).join(" / ") || brew.Variety || "";
    const profile = [varietyText, brew.Process, brew.RoastProfile].filter(Boolean).join(" · ") || "-";
    const stepSummary = formatPublicRecipeSteps(brew);
    const waterInfo = [
      brew.TotalWater_ml ? `Total ${brew.TotalWater_ml} ml` : "",
      brew.HotWater_ml ? `Air panas ${brew.HotWater_ml} ml` : "",
      Number(brew.Ice_g) ? `Es ${brew.Ice_g} g` : ""
    ].filter(Boolean).join(" · ") || "-";
    return `
      <div class="public-detail-header">
        <span>Detail seduhan publik</span>
        <h3 id="publicBrewModalTitle">${html(brew.BeanName || "Tanpa nama")}</h3>
        <p>${html(brew.BrewerName || "Brewer")} · ${html(brew.Method || "-")} · QA ${html(brew.QA_Final || "-")} · Ref ${html(brew.BrewID || brew.CloudID || "-")}</p>
      </div>
      <div class="public-detail-grid">
        <section>
          <h4>Coffee</h4>
          ${detailLine("Tanggal", brew.Date)}
          ${detailLine("Kopi", brew.BeanName || "Tanpa nama")}
          ${detailLine("Asal", brew.Origin)}
          ${detailLine("Profil", profile)}
          ${detailLine("Brewer", brew.BrewerName || "Brewer")}
        </section>
        <section>
          <h4>Recipe</h4>
          ${detailLine("Metode", brew.Method)}
          ${detailLine("Dripper", brew.Dripper)}
          ${detailLine("Grinder", brew.Grinder)}
          ${detailLine("Gilingan", brew.GrindSetting)}
          ${detailLine("Suhu", brew.Temp_C ? `${brew.Temp_C}°C` : "-")}
          ${detailLine("Rasio", brew.Ratio ? `1:${brew.Ratio}` : "-")}
          ${detailLine("Dose", brew.Dose_g ? `${brew.Dose_g} g` : "-")}
          ${detailLine("Air", waterInfo)}
          ${detailLine("Brew Time", brew.BrewTime_sec ? fmtTime(brew.BrewTime_sec) : "-")}
        </section>
        <section class="detail-section-wide">
          <h4>Pour plan</h4>
          <p class="detail-text">${html(stepSummary || "Detail tahapan belum tersedia")}</p>
        </section>
        <section class="detail-section-wide">
          <h4>Result / QA</h4>
          ${detailLine("QA", brew.QA_Final || "-")}
          ${detailLine("Variabel", brew.PrimaryVariableChanged || "Tidak ada perubahan variabel")}
          ${detailLine("Hipotesis", brew.Hypothesis || "-")}
          <p class="detail-text"><strong>Catatan publik</strong><br>${html(brew.ResultNotes || brew.TastingNotes || "-")}</p>
        </section>
      </div>
      <div class="public-detail-actions">
        <button class="secondary small-action" type="button" data-public-brew-use="${key}">Gunakan resep</button>
        ${isPublicBrewOwner(log) ? `<button class="ghost small-action public-brew-edit-modal" type="button" data-public-brew-edit="${key}">Edit hasil saya</button>` : ""}
      </div>`;
  }

  function openPublicBrewDetail(key) {
    const modal = $("publicBrewModal");
    const body = $("publicBrewModalBody");
    if (!modal || !body) return;
    const log = findPublicBrewLog(key);
    if (!log) return showMessage("Detail seduhan tidak ditemukan. Muat ulang data lalu coba lagi.", "error");
    body.innerHTML = publicBrewDetailHtml(log);
    if (window.LESTARI_UI?.openModal) window.LESTARI_UI.openModal(modal, document.activeElement);
    else {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      $("publicBrewModalClose")?.focus();
    }
  }

  function closePublicBrewDetail() {
    const modal = $("publicBrewModal");
    if (window.LESTARI_UI?.closeModal) window.LESTARI_UI.closeModal(modal);
    else {
      modal?.classList.add("hidden");
      modal?.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
    }
  }

  function publicExplorerStats(rows) {
    const count = rows.length;
    const qaValues = rows.map(log => Number(log.QA_Final || 0)).filter(Boolean);
    const avgQA = qaValues.length ? qaValues.reduce((sum, value) => sum + value, 0) / qaValues.length : 0;
    const best = rows.slice().sort((a, b) => Number(b.QA_Final || 0) - Number(a.QA_Final || 0))[0];
    const complete = rows.filter(log => [log.Dripper, log.Grinder, log.GrindSetting, log.Temp_C, log.Ratio, log.Dose_g, log.TotalWater_ml].filter(Boolean).length >= 6).length;
    return { count, avgQA, best, complete };
  }

  function renderPublicExplorerSummary(rows) {
    const wrap = $("publicExplorerSummary");
    if (!wrap) return;
    const stats = publicExplorerStats(rows);
    const bestLabel = stats.best ? `${stats.best.BeanName || "Tanpa nama"} · QA ${fmt(stats.best.QA_Final, 2)}` : "-";
    wrap.innerHTML = [
      ["Hasil cocok", stats.count, "Brew publik sesuai filter aktif."],
      ["Rata-rata QA", stats.avgQA ? fmt(stats.avgQA, 2) : "-", "Rata-rata dari hasil yang tampil."],
      ["Best cup", bestLabel, "QA tertinggi di hasil filter."],
      ["Recipe-ready", stats.complete, "Data resep cukup lengkap untuk baseline."]
    ].map(([label, value, desc], idx) => `
      <article class="public-stat-card cinematic-reveal" style="--stagger:${idx}">
        <span>${html(label)}</span>
        <strong>${html(value)}</strong>
        <small>${html(desc)}</small>
      </article>
    `).join("");
  }

  function recipeCompleteness(log) {
    const keys = [log.Dripper, log.Method, log.Grinder, log.GrindSetting, log.Temp_C, log.Ratio, log.Dose_g, log.TotalWater_ml, log.BrewTime_sec, log.Water];
    return Math.round((keys.filter(Boolean).length / keys.length) * 100);
  }

  function publicBrewCardHtml(log, idx) {
    const brew = publicBrewPresentation(log);
    const key = html(publicBrewKey(brew));
    const varietyText = uniq([brew.Variety, brew.Variety2_optional, brew.Variety3_optional].flatMap(splitVarietyLabel)).join(" / ") || brew.Variety || "";
    const profile = [varietyText, brew.Process, brew.RoastProfile].filter(Boolean).join(" · ") || "Profil belum lengkap";
    const completeness = recipeCompleteness(brew);
    const qa = Number(brew.QA_Final || 0);
    const qaClass = qa >= 8 ? "excellent" : qa >= 7 ? "strong" : "standard";
    const notes = String(brew.ResultNotes || brew.TastingNotes || "").trim();
    const shortNotes = notes ? notes.slice(0, 160) + (notes.length > 160 ? "…" : "") : "Catatan rasa belum tersedia.";
    return `<article class="public-brew-card public-catalog-card cinematic-reveal" role="listitem" data-qa="${html(qaClass)}" style="--stagger:${idx}">
      <div class="public-card-topline">
        <span class="score-pill">QA ${html(brew.QA_Final || "-")}</span>
        <em>${html(completeness)}% recipe-ready</em>
      </div>
      <div class="public-catalog-main">
        <div>
          <span class="public-catalog-method">${html(brew.Method || "Metode belum diisi")}</span>
          <h3>${html(brew.BeanName || "Tanpa nama")}</h3>
          <p>${html(profile)}</p>
        </div>
        <div class="public-catalog-badge">
          <small>Brewer</small>
          <strong>${html(brew.BrewerName || "Brewer")}</strong>
        </div>
      </div>
      <div class="public-recipe-strip public-recipe-strip--catalog">
        <span>${html(brew.Dripper || "Dripper -")}</span>
        <span>${html(brew.Temp_C ? `${brew.Temp_C}°C` : "Temp -")}</span>
        <span>${html(brew.Ratio ? `1:${brew.Ratio}` : "Ratio -")}</span>
        <span>${html(brew.GrindSetting || brew.Grinder || "Grind -")}</span>
      </div>
      <p class="public-catalog-notes">${html(shortNotes)}</p>
      <div class="public-card-footer">
        <small>${html(brew.Date || "Tanggal -")} · Ref ${html(brew.BrewID || brew.CloudID || "-")}</small>
        <div>
          <button class="secondary small-action" type="button" data-public-brew-detail="${key}" aria-label="Lihat detail ${html(brew.BeanName || "seduhan")}">Detail</button>
          <button class="ghost small-action" type="button" data-public-brew-use="${key}" aria-label="Gunakan resep ${html(brew.BeanName || "seduhan")}">Gunakan resep</button>
          ${isPublicBrewOwner(log) ? `<button class="ghost small-action" type="button" data-public-brew-edit="${key}" aria-label="Edit hasil ${html(brew.BeanName || "seduhan")}">Edit</button>` : ""}
        </div>
      </div>
    </article>`;
  }

  function renderPublicBrewCards(rows) {
    const wrap = $("publicBrewCards");
    if (!wrap) return;
    if (!rows.length) {
      const hasPublicRows = publicApprovedRows().length > 0;
      wrap.innerHTML = `<article class="public-empty-card" role="status"><strong>${hasPublicRows ? "Tidak ada hasil yang cocok" : "Belum ada hasil publik"}</strong><p>${hasPublicRows ? "Ubah pencarian atau filter untuk memperluas hasil." : "Hasil akan muncul setelah memenuhi QA, recipe approval, dan moderasi publik."}</p></article>`;
      return;
    }
    wrap.classList.remove("is-live");
    wrap.innerHTML = rows.slice(0, 12).map(publicBrewCardHtml).join("");
    requestAnimationFrame(() => wrap.classList.add("is-live"));
  }

  function setSelectIfPossible(id, value) {
    const el = $(id);
    if (!el || !value) return false;
    const found = [...el.options].some(option => norm(option.value) === norm(value));
    if (!found) return false;
    el.value = [...el.options].find(option => norm(option.value) === norm(value))?.value || value;
    return true;
  }

  function usePublicBrewAsBaseline(key) {
    const log = findPublicBrewLog(key);
    if (!log) return showMessage("Resep publik tidak ditemukan.", "error");
    setSelectIfPossible("brewVariety", log.Variety);
    setProcessFieldValue("brewProcess", "brewProcessCustom", log.Process);
    setSelectIfPossible("brewRoast", log.RoastProfile);
    setSelectIfPossible("brewDripper", log.Dripper);
    setSelectIfPossible("brewMode", log.Method);
    setSelectIfPossible("brewWater", log.Water);
    setSelectIfPossible("brewGrinder", log.Grinder);
    setSelectIfPossible("switchValveMode", log.SwitchValveMode);
    if ($("brewDose") && Number(log.Dose_g)) $("brewDose").value = Number(log.Dose_g);
    showTab("brew");
    renderBrew();
    document.querySelector("#tab-brew")?.scrollIntoView({ behavior: "smooth", block: "start" });
    showMessage(`Resep ${log.BeanName || log.BrewID || "publik"} dipakai sebagai baseline rekomendasi.`, "success");
  }

  function renderPublicBrewTable() {
    const table = $("publicBrewTable");
    if (!table) return;
    refreshPublicFilterOptions();
    const rows = publicBrewRows();
    const total = publicApprovedRows().length;
    if ($("publicBrewResultStatus")) {
      const shown = Math.min(rows.length, 12);
      $("publicBrewResultStatus").textContent = rows.length
        ? `${rows.length} hasil cocok · ${shown} kartu ditampilkan`
        : (total ? "0 hasil cocok dengan filter" : "Belum ada hasil publik yang memenuhi syarat");
    }
    $("publicBrewListState")?.classList.add("hidden");
    renderPublicExplorerSummary(rows);
    renderPublicBrewCards(rows);
    const tbody = table.querySelector("tbody");
    if (!rows.length) {
      tbody.innerHTML = emptyRow(5, "Belum ada hasil seduhan publik", "Brew log akan tampil di sini setelah QA ≥ 6.5 dan disetujui.", "◎");
      return;
    }
    tbody.innerHTML = rows.map(log => {
      const brew = publicBrewPresentation(log);
      const key = html(publicBrewKey(brew));
      return `<tr>
        <td data-label="Kopi"><strong>${html(brew.BeanName || "Tanpa nama")}</strong><small>${html([uniq([brew.Variety, brew.Variety2_optional, brew.Variety3_optional].flatMap(splitVarietyLabel)).join(" / ") || brew.Variety, brew.Process, brew.RoastProfile].filter(Boolean).join(" · "))}</small></td>
        <td data-label="Brewer">${html(brew.BrewerName || "Brewer")}</td>
        <td data-label="Metode">${html(brew.Method || "-")}<br><small>${html(brew.Dripper || "")}</small></td>
        <td data-label="QA"><span class="score-pill">${html(brew.QA_Final || "-")}</span></td>
        <td data-label="Aksi"><div class="public-brew-actions"><button class="secondary small-action" type="button" data-public-brew-detail="${key}">Detail</button><button class="ghost small-action" type="button" data-public-brew-use="${key}">Gunakan</button>${isPublicBrewOwner(log) ? `<button class="ghost small-action" type="button" data-public-brew-edit="${key}">Edit</button>` : ""}</div></td>
      </tr>`;
    }).join("");
  }

  function roastColorFromAgtron(value) {
    const text = String(value || "");
    const nums = text.match(/\d+/g)?.map(Number) || [];
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 65;
    const lightness = clamp(18 + avg * 0.45, 22, 62);
    return `hsl(28 44% ${lightness}%)`;
  }

  function roastVisual(row) {
    const color = roastColorFromAgtron(row.AgtronApprox);
    return `<div class="roast-visual" aria-label="${html(row.RoastProfile || "Roast")}">${Array.from({ length: 6 }).map(() => `<span style="background:${color}"></span>`).join("")}</div>`;
  }

  function librarySchema() {
    const columnsByDataset = {
      varieties: ["Variety", "Species", "Genetic_Market_Group", "Typical_Regions", "Acidity_Base", "Sweetness_Base", "Body_Base", "Notes", "Source"],
      drippers: ["DripperName", "Brand", "Material", "BrewFamily", "Geometry", "FlowSpeed_1slow_5fast", "HeatRetention_1low_5high", "RecommendedFor", "Source"],
      processes: ["Process", "Category", "Stage", "FermentRisk_1low_5high", "TempMod_C", "GrindMod_coarser", "RatioMod_ml_per_g", "BrewingCue", "Source"],
      roasts: ["RoastVisual", "RoastProfile", "Level", "AgtronApprox", "EndTempC", "DTR", "Solubility", "BestUse", "Notes", "Source"],
      waters: ["Water", "Type", "TDS_ppm", "pH", "MineralProfile", "BrewImpact", "RecommendedUse", "Source"],
      grinders: ["Grinder", "Type", "Unit", "V60_Min", "V60_Max", "Japanese_Min", "Japanese_Max", "Immersion_Min", "Immersion_Max", "Notes", "Source"],
      filters: ["FilterName", "Brand", "Format", "Size", "Material", "FlowProfile", "CompatibleDrippers", "CupImpact", "PackSize", "Notes", "Source"]
    };
    const labelMap = {
      Variety: "Nama Varietas", Species: "Spesies", Genetic_Market_Group: "Genetik", Typical_Regions: "Wilayah", Acidity_Base: "Acid", Sweetness_Base: "Sweet", Body_Base: "Body", Notes: "Catatan", Source: "Source",
      DripperName: "Dripper", Brand: "Brand", Material: "Material", BrewFamily: "Family", Geometry: "Geometri", FlowSpeed_1slow_5fast: "Flow", HeatRetention_1low_5high: "Heat", RecommendedFor: "Best For",
      Process: "Proses", Category: "Kategori", Stage: "Tahap Proses", FermentRisk_1low_5high: "Risk", TempMod_C: "Temp Δ", GrindMod_coarser: "Grind Δ", RatioMod_ml_per_g: "Ratio Δ", BrewingCue: "Brew Cue",
      RoastVisual: "Visual", RoastProfile: "Roast", Level: "Level", AgtronApprox: "Agtron", EndTempC: "End °C", DTR: "Development Ratio", Solubility: "Solubility", BestUse: "Best Use",
      Water: "Nama Air", Type: "Jenis", TDS_ppm: "TDS", pH: "pH", MineralProfile: "Mineral", BrewImpact: "Impact", RecommendedUse: "Use",
      Grinder: "Nama Grinder", Unit: "Satuan Setting", V60_Min: "V60 Min", V60_Max: "V60 Max", Japanese_Min: "JP Min", Japanese_Max: "JP Max", Immersion_Min: "Imm Min", Immersion_Max: "Imm Max",
      FilterName: "Nama Filter", Format: "Format", Size: "Ukuran", FlowProfile: "Profil Aliran", CompatibleDrippers: "Kompatibilitas", CupImpact: "Dampak Cangkir", PackSize: "Isi Kemasan"
    };
    return { columnsByDataset, labelMap };
  }

  function libraryDatasetLabel(dataset) {
    return {
      varieties: "Varietas",
      drippers: "Dripper",
      processes: "Proses",
      roasts: "Roast Profile",
      waters: "Air",
      grinders: "Grinder",
      filters: "Filter Kertas"
    }[dataset] || "Data";
  }

  function libraryRowTitle(row, dataset = libraryCurrentDataset) {
    return row.Variety || row.DripperName || row.FilterName || row.Process || row.RoastProfile || row.Water || row.Grinder || row.Brand || libraryDatasetLabel(dataset);
  }

  function libraryRowSubtitle(row, dataset = libraryCurrentDataset) {
    if (dataset === "varieties") return [row.Species, row.Genetic_Market_Group, row.Typical_Regions].filter(Boolean).join(" · ");
    if (dataset === "drippers") return [row.Brand, row.Material, row.Geometry, row.BrewFamily].filter(Boolean).join(" · ");
    if (dataset === "processes") return [row.Category, row.Stage].filter(Boolean).join(" · ");
    if (dataset === "roasts") return [row.Level, row.AgtronApprox, row.BestUse].filter(Boolean).join(" · ");
    if (dataset === "waters") return [row.Type, row.TDS_ppm ? `${row.TDS_ppm} ppm` : "", row.MineralProfile].filter(Boolean).join(" · ");
    if (dataset === "grinders") return [row.Type, row.Unit, row.Notes].filter(Boolean).join(" · ");
    if (dataset === "filters") return [row.Brand, row.Format, row.Size, row.Material].filter(Boolean).join(" · ");
    return "";
  }

  function libraryCue(row, dataset = libraryCurrentDataset) {
    if (dataset === "varieties") return row.Notes || `Acid ${row.Acidity_Base || "-"} · Sweet ${row.Sweetness_Base || "-"} · Body ${row.Body_Base || "-"}`;
    if (dataset === "drippers") return row.RecommendedFor || `Flow ${row.FlowSpeed_1slow_5fast || "-"} · Heat ${row.HeatRetention_1low_5high || "-"}`;
    if (dataset === "processes") return row.BrewingCue || `Risk ${row.FermentRisk_1low_5high || "-"} · Temp Δ ${row.TempMod_C || 0}`;
    if (dataset === "roasts") return row.Notes || row.Solubility || row.BestUse || "-";
    if (dataset === "waters") return row.BrewImpact || row.RecommendedUse || row.MineralProfile || "-";
    if (dataset === "grinders") return row.Notes || `V60 ${row.V60_Min || "-"}–${row.V60_Max || "-"}`;
    if (dataset === "filters") return row.CupImpact || row.FlowProfile || row.CompatibleDrippers || "-";
    return "-";
  }


  function libraryFocusMatch(row, dataset, focus) {
    if (!focus || focus === "all") return true;
    const haystack = norm(Object.values(row || {}).join(" "));
    if (focus === "source") return Boolean(sourceUrl(row));
    if (focus === "local-id") return /indonesia|bali|java|sumatra|sulawesi|gayo|kintamani|kerinci|lintong|toraja|flores/.test(haystack);
    if (focus === "new") return /usda|kopyol|mix varietas|mixed cultivar|mixed lot/.test(haystack);
    if (focus === "brew-risk") {
      const risk = Number(row.FermentRisk_1low_5high || row.Fermentation_Tolerance || 0);
      return risk >= 4 || /anaerobic|carbonic|co-ferment|thermal|extended|experimental|ferment/.test(haystack);
    }
    return true;
  }

  function libraryFocusLabel(focus = libraryCurrentFocus) {
    return {
      all: "Semua Data",
      source: "Source Ready",
      "local-id": "Indonesia / Local",
      new: "USDA · Kopyol · Mix",
      "brew-risk": "High Ferment / Risk"
    }[focus] || "Semua Data";
  }

  function renderLibraryFocusToolbar() {
    document.querySelectorAll("[data-library-focus]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.libraryFocus === libraryCurrentFocus);
    });
  }

  function renderLibrarySpotlight(rows, dataset) {
    const wrap = $("librarySpotlightStrip");
    if (!wrap) return;
    const all = DATA[dataset] || [];
    const featuredNames = dataset === "varieties"
      ? ["USDA", "USDA 762", "Kopyol", "Kopyol Bali", "Mix Varietas"]
      : dataset === "processes"
        ? ["Anaerobic Fermentation - Closed Tank", "Carbonic Maceration - CO2 Saturated", "Thermal Shock Washed", "Co-Fermentation / Ingredient Co-Ferment"]
        : [];
    const featured = featuredNames
      .map(name => all.find(row => norm(libraryRowTitle(row, dataset)) === norm(name) || norm(libraryRowTitle(row, dataset)).includes(norm(name))))
      .filter(Boolean);
    const samples = (featured.length ? featured : rows.slice(0, 4)).slice(0, 5);
    if (!samples.length) {
      wrap.innerHTML = "";
      return;
    }
    wrap.innerHTML = samples.map((row, idx) => `
      <button type="button" data-library-spotlight="${idx}" data-library-title="${html(libraryRowTitle(row, dataset))}">
        <span>${html(sourceUrl(row) ? "Source" : libraryDatasetLabel(dataset))}</span>
        <strong>${html(libraryRowTitle(row, dataset))}</strong>
        <small>${html(libraryCue(row, dataset))}</small>
      </button>
    `).join("");
  }


  function libraryFilteredRows(dataset, search) {
    return (DATA[dataset] || []).filter(row => {
      const searchMatch = !search || Object.values(row).some(v => norm(v).includes(search)) || norm(sourceUrl(row)).includes(search);
      return searchMatch && libraryFocusMatch(row, dataset, libraryCurrentFocus);
    });
  }

  function renderLibraryOverview(rows, dataset) {
    const total = DATA[dataset]?.length || 0;
    const shown = rows.length;
    const sourceCount = rows.filter(row => sourceUrl(row)).length;
    const first = rows[0] || {};
    const noSource = Math.max(0, shown - sourceCount);
    const cards = [
      ["Dataset", libraryDatasetLabel(dataset), "Kategori referensi aktif."],
      ["Tampil", `${shown}/${total}`, "Jumlah data sesuai filter & pencarian."],
      ["Source", `${sourceCount}/${shown || 0}`, noSource ? `${noSource} record belum punya source.` : "Semua hasil tampil punya SourceURL."],
      ["Focus", libraryFocusLabel(), "Filter cepat yang sedang aktif."],
      ["Highlight", libraryRowTitle(first, dataset) || "-", "Record pertama dari hasil filter."]
    ];
    const overview = $("libraryOverview");
    if (overview) overview.innerHTML = cards.map(([label, value, desc], idx) => `
      <article class="library-overview-card cinematic-reveal" style="--stagger:${idx}">
        <span>${html(label)}</span>
        <strong>${html(value)}</strong>
        <small>${html(desc)}</small>
      </article>
    `).join("");
    const heroSignal = $("libraryHeroSignal");
    if (heroSignal) heroSignal.innerHTML = `<span>${html(libraryDatasetLabel(dataset))}</span><strong>${html(shown)}</strong><small>hasil aktif</small>`;
  }


  function libraryMiniMetrics(row, dataset) {
    const metric = (label, value) => value !== undefined && value !== "" && value !== null
      ? `<span><b>${html(label)}</b><strong>${html(value)}</strong></span>`
      : "";
    if (dataset === "varieties") {
      return [
        metric("Acid", row.Acidity_Base),
        metric("Sweet", row.Sweetness_Base),
        metric("Body", row.Body_Base)
      ].join("");
    }
    if (dataset === "processes") {
      return [
        metric("Risk", row.FermentRisk_1low_5high),
        metric("Temp", row.TempMod_C !== undefined && row.TempMod_C !== null ? `${row.TempMod_C}°C` : ""),
        metric("Cue", row.BrewingCue)
      ].join("");
    }
    if (dataset === "drippers") {
      return [
        metric("Flow", row.FlowSpeed_1slow_5fast),
        metric("Heat", row.HeatRetention_1low_5high),
        metric("Bypass", row.Bypass)
      ].join("");
    }
    if (dataset === "waters") {
      return [
        metric("TDS", row.TDS_ppm !== undefined && row.TDS_ppm !== null ? `${row.TDS_ppm}` : ""),
        metric("pH", row.pH),
        metric("Jenis", row.Type)
      ].join("");
    }
    if (dataset === "filters") {
      return [
        metric("Ukuran", row.Size),
        metric("Format", row.Format),
        metric("Isi", row.PackSize)
      ].join("");
    }
    return "";
  }


  function renderLibraryCards(rows, dataset) {
    const grid = $("libraryCardGrid");
    if (!grid) return;
    if (!rows.length) {
      grid.innerHTML = `<article class="library-empty-card"><strong>Data tidak ditemukan</strong><p>Coba kata kunci lain atau pilih dataset berbeda.</p></article>`;
      return;
    }
    grid.classList.remove("is-live");
    grid.innerHTML = rows.slice(0, 12).map((row, idx) => {
      const cueMetrics = libraryMiniMetrics(row, dataset);
      return `
      <article class="library-ref-card cinematic-reveal ${idx === 0 ? "active" : ""}" style="--stagger:${idx}" role="button" tabindex="0" aria-label="Buka detail ${html(libraryRowTitle(row, dataset))}" data-library-index="${idx}">
        <div class="library-ref-topline">
          <span>${html(libraryDatasetLabel(dataset))}</span>
          <em class="${sourceUrl(row) ? "is-ready" : "is-missing"}">${sourceUrl(row) ? "Source ready" : "No source"}</em>
        </div>
        <h3>${html(libraryRowTitle(row, dataset))}</h3>
        <p>${html(libraryRowSubtitle(row, dataset) || "Detail referensi tersedia pada panel.")}</p>
        ${cueMetrics ? `<div class="library-mini-metrics">${cueMetrics}</div>` : ""}
        <div class="library-cue-box">${html(libraryCue(row, dataset))}</div>
      </article>`;
    }).join("");
    requestAnimationFrame(() => grid.classList.add("is-live"));
  }

  function renderLibraryDetail(index = 0) {
    const panel = $("libraryDetailPanel");
    if (!panel) return;
    const row = libraryCurrentRows[index] || libraryCurrentRows[0];
    if (!row) {
      panel.innerHTML = `<div class="library-detail-empty"><strong>Pilih data</strong><p>Klik kartu atau baris tabel untuk melihat detail referensi.</p></div>`;
      return;
    }
    const { columnsByDataset, labelMap } = librarySchema();
    const cols = columnsByDataset[libraryCurrentDataset] || Object.keys(row);
    const details = cols.filter(col => col !== "Source" && row[col] !== undefined && row[col] !== "").map(col => `
      <div class="library-detail-line">
        <span>${html(labelMap[col] || col)}</span>
        <strong>${col === "RoastVisual" ? roastVisual(row) : html(row[col])}</strong>
      </div>
    `).join("");
    const sourceReady = Boolean(sourceUrl(row));
    const metricStrip = libraryMiniMetrics(row, libraryCurrentDataset);
    panel.innerHTML = `
      <div class="library-detail-head">
        <span class="mini-label">Detail Referensi</span>
        <em class="${sourceReady ? "is-ready" : "is-missing"}">${sourceReady ? "Source Ready" : "No Source"}</em>
      </div>
      <h3>${html(libraryRowTitle(row, libraryCurrentDataset))}</h3>
      <p>${html(libraryCue(row, libraryCurrentDataset))}</p>
      ${metricStrip ? `<div class="library-mini-metrics library-mini-metrics--detail">${metricStrip}</div>` : ""}
      <div class="library-detail-lines">${details}</div>
      <div class="library-detail-source">${sourceLink(row) || "<span>Source belum tersedia</span>"}</div>
    `;
  }

  function renderLibrary() {
    const dataset = $("libraryDataset").value;
    const search = norm($("librarySearch").value);
    const rows = libraryFilteredRows(dataset, search);
    libraryCurrentDataset = dataset;
    libraryCurrentRows = rows;
    const { columnsByDataset, labelMap } = librarySchema();
    const cols = columnsByDataset[dataset] || [...Object.keys(rows[0] || {}).slice(0, 8), "Source"];
    const cell = (row, c) => {
      if (c === "RoastVisual") return roastVisual(row);
      if (c === "Source") return sourceLink(row);
      return html(row[c]);
    };
    renderLibraryFocusToolbar();
    renderLibraryOverview(rows, dataset);
    renderLibrarySpotlight(rows, dataset);
    renderLibraryCards(rows, dataset);
    renderLibraryDetail(0);
    if ($("libraryResultStatus")) {
      const total = DATA[dataset]?.length || 0;
      $("libraryResultStatus").textContent = rows.length
        ? `${rows.length} dari ${total} referensi ditampilkan`
        : `0 dari ${total} referensi cocok`;
    }
    const table = $("libraryTable");
    table.querySelector("thead").innerHTML = `<tr>${cols.map(c => `<th scope="col"><span>${html(labelMap[c] || c)}</span></th>`).join("")}</tr>`;
    table.querySelector("tbody").innerHTML = rows.length
      ? rows.slice(0, 200).map((row, idx) => `<tr data-library-index="${idx}" tabindex="0" aria-label="Buka detail ${html(libraryRowTitle(row, dataset))}">${cols.map(c => `<td data-col="${html(c)}">${cell(row, c)}</td>`).join("")}</tr>`).join("")
      : emptyRow(cols.length || 1, "Data tidak ditemukan", "Coba kata kunci lain atau pilih dataset berbeda.", "⌕");
  }


  async function exportJson() {
    try {
      const payload = BACKUP_SERVICE
        ? await BACKUP_SERVICE.create(state, {
            workspace: currentWorkspace ? { id: currentWorkspace.id, name: currentWorkspace.name } : null
          })
        : { ...state, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `coffee-brew-os-backup-${todayISO()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showMessage("Backup lokal berhasil dibuat.", "success");
      return true;
    } catch (error) {
      ERROR_SERVICE?.capture?.({ type: "backup-export", error });
      showMessage(`Gagal membuat backup: ${error.message || error}`, "error");
      return false;
    }
  }

  async function inspectBackupFile(file) {
    const preview = $("recoveryPreview");
    const fileName = $("recoveryFileName");
    const restoreBtn = $("restoreBackupBtn");
    pendingRecovery = null;
    if (restoreBtn) restoreBtn.disabled = true;
    if (fileName) fileName.textContent = file?.name || "Belum ada file dipilih.";
    if (!file) return;
    try {
      const parsed = BACKUP_SERVICE
        ? await BACKUP_SERVICE.parse(await file.text())
        : { valid: true, legacy: true, data: JSON.parse(await file.text()), metadata: {} };
      pendingRecovery = parsed;
      const counts = parsed.metadata?.counts || {};
      if (preview) preview.innerHTML = `<strong>Backup valid${parsed.legacy ? " (format lama)" : ""}.</strong><br>Stok: ${counts.stock ?? parsed.data.userStock?.length ?? 0} · Log seduh: ${counts.brewLogs ?? parsed.data.userBrewLogs?.length ?? 0} · QA: ${counts.qaScores ?? parsed.data.userQA?.length ?? 0} · Saran: ${counts.suggestions ?? parsed.data.suggestions?.length ?? 0}<br>Versi aplikasi: ${html(parsed.metadata?.appVersion || "legacy")} · Dibuat: ${html(parsed.metadata?.exportedAt || "tidak tercatat")}`;
      if (restoreBtn) restoreBtn.disabled = false;
    } catch (error) {
      ERROR_SERVICE?.capture?.({ type: "backup-inspection", error });
      if (preview) preview.innerHTML = `<strong>Backup tidak dapat digunakan.</strong><br>${html(error.message || error)}`;
      showMessage(`File backup tidak valid: ${error.message || error}`, "error");
    }
  }

  function restoreInspectedBackup() {
    if (!pendingRecovery?.valid) return showMessage("Pilih dan periksa file backup terlebih dahulu.", "error");
    const counts = pendingRecovery.metadata?.counts || {};
    const message = `Pulihkan ${counts.stock ?? 0} stok, ${counts.brewLogs ?? 0} log seduh, dan ${counts.qaScores ?? 0} nilai QA ke penyimpanan lokal? Data lokal saat ini akan diganti. Data cloud tidak berubah.`;
    if (!confirm(message)) return;
    try {
      if (BACKUP_SERVICE) BACKUP_SERVICE.apply(state, pendingRecovery.data);
      else Object.assign(state, pendingRecovery.data);
      persist();
      renderAll();
      pendingRecovery = null;
      if ($("restoreBackupBtn")) $("restoreBackupBtn").disabled = true;
      if ($("recoveryPreview")) $("recoveryPreview").innerHTML = "Pemulihan selesai. Data lokal sudah dimuat ulang.";
      showMessage("Backup berhasil dipulihkan ke browser. Data cloud tidak diubah.", "success");
    } catch (error) {
      ERROR_SERVICE?.capture?.({ type: "backup-restore", error });
      showMessage(`Pemulihan gagal: ${error.message || error}`, "error");
    }
  }

  function importJson(file) {
    inspectBackupFile(file).then(() => {
      if (pendingRecovery?.valid && confirm("File backup valid. Pulihkan sekarang ke penyimpanan lokal?")) restoreInspectedBackup();
    });
  }

  function renderDiagnosticsSummary() {
    const rows = ERROR_SERVICE?.list?.() || [];
    if ($("diagnosticErrorCount")) $("diagnosticErrorCount").textContent = rows.length;
  }

  function syncMobileTabSelect(name) {
    const select = $("mobileTabSelect");
    if (select && select.value !== name) select.value = name;
  }

  const GUEST_PRIVATE_TABS = ["home", "beans", "stock", "qa", "analytics", "quality", "reports", "admin"];

  function isGuestPrivateTab(name) {
    return !currentUser && GUEST_PRIVATE_TABS.includes(String(name || ""));
  }

  

  const PAGE_REGISTRY = window.COFFEE_PAGES;
  const NAVIGATION = window.COFFEE_NAVIGATION;
  const PAGE_MODULES = window.COFFEE_PAGE_MODULES;
  const PAGE_ROUTES = Object.freeze(Object.fromEntries(
    (PAGE_REGISTRY?.pages || []).map(page => [page.tab, page.route])
  ));
  const ROUTE_TO_TAB = Object.freeze(Object.fromEntries(
    (PAGE_REGISTRY?.pages || []).map(page => [page.route, page.tab])
  ));
  let routeSyncLock = false;

  function currentRouteSlug() {
    if (NAVIGATION?.currentRoute) return NAVIGATION.currentRoute();
    return String(location.hash || "").replace(/^#\/?/, "").replace(/^\/+/, "").trim();
  }

  function tabFromRoute(route = currentRouteSlug()) {
    return ROUTE_TO_TAB[String(route || "").toLowerCase()] || "";
  }

  function routeFromTab(tab) {
    return PAGE_ROUTES[String(tab || "")] || "cara-pakai";
  }

  function writeRoute(tab, replace = false) {
    const route = routeFromTab(tab);
    if (NAVIGATION?.navigate) {
      routeSyncLock = true;
      NAVIGATION.navigate(route, { replace });
      queueMicrotask(() => { routeSyncLock = false; });
      return;
    }
    const nextHash = `#/${route}`;
    if (location.hash === nextHash) return;
    routeSyncLock = true;
    if (replace) history.replaceState(null, "", nextHash);
    else history.pushState(null, "", nextHash);
    setTimeout(() => { routeSyncLock = false; }, 0);
  }

  function syncRouteHint(tab) {
    const route = routeFromTab(tab);
    document.querySelectorAll("[data-route]").forEach(el => {
      const active = el.dataset.route === route;
      el.classList.toggle("route-active", active);
      if (el.classList.contains("tab-btn")) {
        if (active) el.setAttribute("aria-current", "page");
        else el.removeAttribute("aria-current");
      }
    });
  }

  function navigateByRoute(route) {
    const tab = tabFromRoute(route) || (currentUser ? "home" : "guide");
    if (!currentUser && GUEST_PRIVATE_TABS.includes(tab)) {
      if (tab === "admin") {
        document.body.dataset.accessMode = "login";
        document.body.classList.add("experience-entered", "access-login");
        document.body.classList.remove("access-guest");
        showTab("admin", { skipRoute: true });
      } else {
        showTab("guide", { replaceRoute: true });
      }
      return;
    }
    showTab(tab, { skipRoute: true });
  }

  function showRootWelcome() {
    showTab("guide", { skipRoute: true });
    $("welcomeScreen")?.classList.remove("is-hidden");
    document.title = `${PRODUCT_NAME} — Dashboard Seduh Kopi`;
    if (document.body) document.body.dataset.page = "welcome";
  }

  function replaceUrlWithAppRoot() {
    const rootPath = NAVIGATION?.basePath || "/";
    window.history.replaceState({ coffeeRoute: "" }, "", rootPath);
  }

  function safeShowInitialRoute() {
    const route = currentRouteSlug();
    const tab = tabFromRoute(route);
    if (tab) {
      navigateByRoute(route);
      return;
    }
    if (currentUser) {
      showTab("home", { replaceRoute: true });
      return;
    }
    showRootWelcome();
  }

  function initPageRouter() {
    if (document.body?.dataset.pageRouterReady === "true") return;
    if (document.body) document.body.dataset.pageRouterReady = "true";
    NAVIGATION?.migrateLegacyHash?.();
    if (NAVIGATION?.listen) {
      NAVIGATION.listen(() => {
        if (routeSyncLock) return;
        safeShowInitialRoute();
      });
    } else {
      window.addEventListener("hashchange", () => {
        if (routeSyncLock) return;
        safeShowInitialRoute();
      });
    }
    safeShowInitialRoute();
  }


  const NAV_GROUP_LABELS = Object.freeze({
    Dashboard: "Dashboard",
    Brewing: "Seduh",
    Coffee: "Kopi",
    Insights: "Insight",
    Operations: "Operasional",
    Resources: "Referensi",
    Administration: "Administrasi"
  });

  const PAGE_META = Object.freeze(Object.fromEntries(
    (PAGE_REGISTRY?.pages || []).map(page => [page.tab, Object.freeze({
      title: page.title,
      subtitle: page.subtitle,
      navGroup: page.navGroup || "Dashboard",
      navLabel: page.navLabel || page.title
    })])
  ));

  function isWelcomeScreenVisible() {
    const screen = $("welcomeScreen");
    return Boolean(screen && !screen.classList.contains("is-hidden"));
  }

  function updatePageHeading(name) {
    const key = String(name || "home");
    const meta = PAGE_META[key] || PAGE_META.home;
    const welcomeVisible = isWelcomeScreenVisible();
    $("pageTitle") && ($("pageTitle").textContent = meta.title);
    $("pageSubtitle") && ($("pageSubtitle").textContent = meta.subtitle);
    const group = NAV_GROUP_LABELS[meta.navGroup] || meta.navGroup || "Dashboard";
    $("pageBreadcrumb") && ($("pageBreadcrumb").textContent = `${group} / ${meta.navLabel || meta.title}`);
    document.title = welcomeVisible
      ? `${PRODUCT_NAME} — Dashboard Seduh Kopi`
      : `${meta.title} — ${PRODUCT_NAME}`;
    syncRouteHint(key);
    if (document.body) {
      document.body.dataset.page = welcomeVisible ? "welcome" : key;
    }
  }

  function syncAccessChrome() {
    const loggedIn = Boolean(currentUser);
    const mode = document.body?.dataset.accessMode || (loggedIn ? "login" : "guest");
    $("sidebarModeLabel") && ($("sidebarModeLabel").textContent = loggedIn ? (userProfile?.display_name || currentUser.email || "Pengguna") : (mode === "login" ? "Mode Masuk" : "Tamu"));
    $("sidebarModeHint") && ($("sidebarModeHint").textContent = loggedIn ? `Masuk sebagai ${roleDisplayLabel(displayRoleContext().role)}.` : (mode === "login" ? "Silakan login untuk membuka seluruh fitur." : "Akses terbatas hingga kamu login."));
    if (document.body) {
      document.body.classList.toggle("is-authenticated", loggedIn);
      document.body.classList.toggle("is-guest", !loggedIn);
    }
    setElementHidden($("topbarSignupBtn"), loggedIn);
    const topbarBtn = $("topbarAccessBtn");
    if (topbarBtn) {
      topbarBtn.textContent = loggedIn ? "Akun & Peran" : "Masuk";
    }
    const identity = loggedIn ? (userProfile?.display_name || currentUser.email || "Pengguna") : "Tamu";
    const role = loggedIn ? roleDisplayLabel(currentRole) : "Akses publik";
    const workspace = loggedIn ? (currentWorkspace?.name || "Pilih workspace") : "Mode tamu";
    const initial = String(identity).trim().charAt(0).toUpperCase() || "T";
    $("topbarWorkspaceName") && ($("topbarWorkspaceName").textContent = workspace);
    $("topbarProfileName") && ($("topbarProfileName").textContent = identity);
    $("topbarProfileRole") && ($("topbarProfileRole").textContent = role);
    $("topbarMenuName") && ($("topbarMenuName").textContent = identity);
    $("topbarMenuRole") && ($("topbarMenuRole").textContent = role);
    $("topbarAvatar") && ($("topbarAvatar").textContent = initial);
    $("topbarMenuAvatar") && ($("topbarMenuAvatar").textContent = initial);
    setElementHidden($("topbarNotificationBtn"), !loggedIn);
  }

  function enterExperience(mode = "guest") {
    const accessMode = loggedInUser() ? "login" : mode;
    document.body.classList.add("experience-entered");
    document.body.dataset.accessMode = accessMode;
    document.body.classList.toggle("access-login", accessMode === "login");
    document.body.classList.toggle("access-guest", accessMode === "guest");
    $("welcomeScreen")?.classList.add("is-hidden");
    SAFE_STORAGE.set("coffee_experience_mode", accessMode);
    markOnboardingStep("welcome");
    if (accessMode === "login") {
      showTab(loggedInUser() ? "home" : "admin");
    } else {
      showTab("guide");
    }
    syncAccessChrome();
  }

  function loggedInUser() {
    return Boolean(currentUser);
  }

  function bindWelcomeScreen() {
    $("welcomeLoginBtn")?.addEventListener("click", openLoginFlow);
    $("welcomeGuestBtn")?.addEventListener("click", () => enterExperience("guest"));
    $("returnWelcomeBtn")?.addEventListener("click", () => {
      replaceUrlWithAppRoot();
      showRootWelcome();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    $("topbarAccessBtn")?.addEventListener("click", openLoginFlow);
    if (loggedInUser()) {
      $("welcomeScreen")?.classList.add("is-hidden");
      document.body.classList.add("experience-entered", "access-login");
      document.body.dataset.accessMode = "login";
    }
  }


  function updateGuestPrivateNavigation() {
    const isGuest = !currentUser;
    const authIntent = document.body?.dataset.accessMode === "login";
    GUEST_PRIVATE_TABS.forEach(tab => {
      const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
      const allowAuthPanel = tab === "admin" && isGuest && authIntent;
      setElementHidden(btn, isGuest && !allowAuthPanel);
      const opt = document.querySelector(`#mobileTabSelect option[value="${tab}"]`);
      if (opt) {
        opt.hidden = isGuest && !allowAuthPanel;
        opt.disabled = isGuest && !allowAuthPanel;
      }
      const panel = $(`tab-${tab}`);
      panel?.classList.toggle("guest-locked", isGuest && !allowAuthPanel);
    });
    setElementHidden($("guestPrivateNotice"), !isGuest || authIntent);
    const active = document.querySelector(".tab-btn.active")?.dataset.tab || "";
    if (isGuest && GUEST_PRIVATE_TABS.includes(active) && !(active === "admin" && authIntent)) {
      showTab("guide");
    }
    const mobileValue = $("mobileTabSelect")?.value || "";
    if (isGuest && GUEST_PRIVATE_TABS.includes(mobileValue) && !(mobileValue === "admin" && authIntent)) {
      syncMobileTabSelect("guide");
    }
    document.querySelectorAll(".sidebar-nav-group").forEach(group => {
      const visibleItems = Array.from(group.querySelectorAll(".tab-btn"))
        .filter(button => !button.hidden && !button.classList.contains("hidden"));
      setElementHidden(group, visibleItems.length === 0);
    });
    syncAccessChrome();
  }

  function showTab(name, options = {}) {
    const authIntent = document.body?.dataset.accessMode === "login";
    const allowAuthPanel = String(name || "") === "admin" && !currentUser && authIntent;
    if (isGuestPrivateTab(name) && !allowAuthPanel) {
      showMessage("Masuk untuk membuka Beranda, Biji Kopi, Stok, Log Seduh & QA, Analitik Seduhan, Notifikasi, Ekspor & Laporan, serta Akun & Peran.", "info");
      name = "guide";
    }
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === `tab-${name}`));
    syncMobileTabSelect(name);
    updatePageHeading(name);
    if (!options.skipRoute) writeRoute(name, options.replaceRoute === true);
    const onboardingStep = tabToOnboardingStep(name);
    if (onboardingStep) markOnboardingStep(onboardingStep);
    updateGuestPrivateNavigation();
    renderPageModule(name);
    document.dispatchEvent(new CustomEvent("coffee:pagechange", {
      detail: Object.freeze({ tab: name, route: routeFromTab(name), meta: PAGE_META[name] || PAGE_META.home })
    }));
    if (window.matchMedia?.("(max-width: 760px)").matches) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      document.querySelector(".dashboard-main-shell")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }


  function renderSignupRoleUI() {
    const role = $("signupRole")?.value || "admin";
    const needWorkspace = ["brewer", "qa"].includes(role);
    setElementHidden($("signupWorkspaceWrap"), !needWorkspace);
    setElementHidden($("signupApprovalHint"), !needWorkspace);
  }

  function renderWorkspacePanelAccess() {
    const workspacePanel = $("workspacePanel");
    const createArea = $("workspaceCreateArea");
    const memberArea = $("workspaceMemberArea");
    if (!workspacePanel) return;
    const loggedIn = Boolean(currentUser);
    const requestedRole = norm(currentUser?.user_metadata?.requested_role || "admin");
    const hasPendingMembership = (userMemberships || []).some(ws => ws.membershipStatus === "pending");
    const canCreateWorkspace = loggedIn && (currentRole === "admin" || (!currentWorkspace && !hasPendingMembership && requestedRole === "admin"));
    const showForUser = loggedIn && (currentRole === "admin" || canCreateWorkspace);
    setElementHidden(workspacePanel, !showForUser);
    setElementHidden(createArea, !canCreateWorkspace);
    setElementHidden(memberArea, true);
  }

  function renderAccessUI() {
    const privateReady = canUseWorkspaceModules();
    updateGuestPrivateNavigation();
    setElementHidden($("saveCurrentBrew"), !privateReady);
    setElementHidden($("applyBeanToBrew"), !privateReady);
    setElementHidden(document.querySelector('[data-tab="beans"]'), !privateReady);
    const mobileBeansOption = document.querySelector('#mobileTabSelect option[value="beans"]');
    if (mobileBeansOption) {
      mobileBeansOption.hidden = !privateReady;
      mobileBeansOption.disabled = !privateReady;
    }
    const hasBrewLogWorkspaceContext = Boolean(currentUser && activeWorkspaceId() && isActiveWorkspaceMember());
    setElementHidden($("brewLogHistoryPanel"), !hasBrewLogWorkspaceContext);
    setElementHidden($("qaParentWrap"), !currentUser);
    setElementHidden($("qaVariableWrap"), !currentUser);
    renderWorkspacePanelAccess();
    setElementHidden($("memberApprovalPanel"), !canAdmin());
    setElementHidden($("workspaceUserPanel"), !canAdmin());
    setElementHidden($("suggestionInboxPanel"), !canAdmin());
    setElementHidden($("adminPanel"), !canModerate());

    if (!privateReady && document.querySelector(".tab-btn.active")?.dataset.tab === "beans") {
      showTab("brew");
    }
    const activeTab = document.querySelector(".tab-btn.active")?.dataset.tab || "";
    const authIntent = document.body?.dataset.accessMode === "login";
    if (!currentUser && GUEST_PRIVATE_TABS.includes(activeTab) && !(activeTab === "admin" && authIntent)) {
      showTab("guide", { replaceRoute: true });
    }
    if (currentUser && currentRole !== "admin" && document.querySelector(".tab-btn.active")?.dataset.tab === "admin" && $("workspacePanel")?.hidden) {
      return;
    }
  }

  function draftBrewLogsForQA() {
    return allBrewLogs()
      .filter(log => !log.QA_Final)
      .filter(log => !log.QA_ID)
      .sort((a, b) => new Date(b.Date || 0) - new Date(a.Date || 0));
  }

  function renderQABrewOptions() {
    const select = $("qaParent");
    if (!select) return;
    if (!currentUser) {
      select.innerHTML = "";
      select.disabled = true;
      renderQABrewContext();
      return;
    }
    const selected = select.value || "";
    const drafts = draftBrewLogsForQA();
    select.innerHTML = drafts.length
      ? `<option value="">Pilih BrewID dari Data Seduhan</option>` + drafts.map(log => `<option value="${html(log.BrewID)}">${html(log.BrewID)} · ${html(log.BeanName || log.Variety || "Tanpa nama")} · ${html(log.Method || "-")}</option>`).join("")
      : `<option value="">Belum ada draft dari Data Seduhan</option>`;
    select.disabled = !drafts.length;
    if (drafts.some(log => log.BrewID === selected)) select.value = selected;
    renderQABrewContext();
  }

  function selectedDraftLog() {
    const brewId = $("qaParent")?.value || "";
    return allBrewLogs().find(log => log.BrewID === brewId) || null;
  }

  function applySelectedDraftToQA() {
    const draft = selectedDraftLog();
    if (draft && $("qaBeanName")) $("qaBeanName").value = draft.BeanName || draft.Variety || "";
    renderQABrewContext();
    renderQAPreview();
  }

  function bindEvents() {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
    $("mobileTabSelect")?.addEventListener("change", e => showTab(e.target.value));
    document.addEventListener("click", e => {
      const saveBtn = e.target.closest?.("#saveCurrentBrew,[data-action='save-brew-draft']");
      if (saveBtn) {
        saveCurrentBrewDraft(e);
        return;
      }
      const applyBtn = e.target.closest?.("#applyBeanToBrew");
      if (applyBtn) {
        e.preventDefault();
        applyTopBeanToBrew();
        return;
      }
      const qaBtn = e.target.closest?.("#qaSubmitBtn");
      if (qaBtn) {
        saveQA(e);
        return;
      }
      const manualBtn = e.target.closest?.("#manualSubmitBtn");
      if (manualBtn) {
        saveManualBrew(e);
      }
    });
    const brewFieldIds = ["brewVariety", "brewProcess", "brewRoast", "brewDripper", "brewMode", "switchValveMode", "brewGrinder", "brewWater", "brewDose", "pourPattern"];
    brewFieldIds.forEach(id => $(id)?.addEventListener("change", renderBrew));
    $("brewDose")?.addEventListener("input", renderBrew);
    $("brewGenerateRecommendation")?.addEventListener("click", () => {
      const brew = renderBrew();
      const announcer = $("brewResultAnnouncer");
      if (announcer && brew) announcer.textContent = `Rekomendasi diperbarui. Rasio 1 banding ${fmt(brew.ratio, 1)}, total air ${brew.totalWater} mililiter, suhu ${brew.temp} derajat Celsius.`;
    });
    document.addEventListener("change", e => {
      if (brewFieldIds.includes(e.target?.id)) renderBrew();
      if (e.target?.id === "brewStockSelect") { syncBrewStockUI({ apply: true }); renderBrew(); }
      if (e.target?.id === "qaParent") applySelectedDraftToQA();
    });
    $("brewStockSelect")?.addEventListener("change", () => { syncBrewStockUI({ apply: true }); renderBrew(); });
    $("brewBeanName")?.addEventListener("input", () => syncBrewStockUI({ apply: false }));
    ["customGrinderName", "customGrinderSetting"].forEach(id => $(id)?.addEventListener("input", renderBrew));
    $("signupRole")?.addEventListener("change", renderSignupRoleUI);
    $("suggestionForm")?.addEventListener("submit", submitSuggestion);
    document.querySelectorAll("[data-jump-tab]").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.jumpTab)));
    document.querySelectorAll(".guide-role-btn").forEach(btn => btn.addEventListener("click", () => {
      const role = btn.dataset.guideRole;
      document.querySelectorAll(".guide-role-btn").forEach(item => item.classList.toggle("active", item === btn));
      document.querySelectorAll(".guide-role-panel").forEach(panel => panel.classList.toggle("hidden", panel.dataset.guidePanel !== role));
    }));
    ["targetSweet", "targetAcid", "targetBody", "filterFlavor1", "filterFlavor2", "filterFlavor3", "filterVariety1", "filterVariety2", "filterBrew", "minStock"].forEach(id => $(id).addEventListener("change", renderBeansTable));
    ["targetSweet", "targetAcid", "targetBody", "minStock"].forEach(id => $(id).addEventListener("input", renderBeansTable));
    $("beansSearch")?.addEventListener("input", renderBeansTable);
    ["beansOriginFilter", "beansProcessFilter", "beansActiveFilter"].forEach(id => $(id)?.addEventListener("change", renderBeansTable));
    $("beansClearFilters")?.addEventListener("click", () => {
      if ($("beansSearch")) $("beansSearch").value = "";
      ["beansOriginFilter", "beansProcessFilter", "beansActiveFilter"].forEach(id => { if ($(id)) $(id).value = "all"; });
      renderBeansTable();
      $("beansSearch")?.focus();
    });
    const handleCoffeeAction = e => {
      const button = e.target.closest("button[data-coffee-action]");
      if (!button) return;
      if (button.dataset.coffeeAction === "view") return openCoffeeDetail(button.dataset.coffeeId, button);
      if (button.dataset.coffeeAction === "edit") return editCoffeeFromDirectory(button.dataset.coffeeId);
    };
    $("beansTable")?.addEventListener("click", handleCoffeeAction);
    $("beansMobileList")?.addEventListener("click", handleCoffeeAction);
    $("beansAddCoffeeBtn")?.addEventListener("click", () => requestAnimationFrame(() => {
      resetStockForm();
      $("stockEditorPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      $("stockName")?.focus({ preventScroll: true });
    }));
    $("saveCurrentBrew")?.addEventListener("click", saveCurrentBrewDraft);
    $("applyBeanToBrew")?.addEventListener("click", applyTopBeanToBrew);
    $("recipeOptions")?.addEventListener("click", e => {
      const card = e.target.closest(".recipe-option-card[data-recipe-option]");
      if (!card) return;
      document.querySelectorAll(".recipe-option-card").forEach(item => item.classList.toggle("active", item === card));
      const options = recipeOptionsFromBrew(computeBrew());
      const index = Math.max(0, options.findIndex(opt => opt.key === card.dataset.recipeOption));
      renderActiveRecipeSummary(options[index] || options[0], index < 0 ? 0 : index);
      showMessage(`Opsi aktif: ${card.dataset.recipeTitle || "rekomendasi seduh"}. Gunakan sebagai pembanding saat tasting.`, "info");
    });
    $("recipeOptions")?.addEventListener("keydown", e => {
      if (!["Enter", " "].includes(e.key)) return;
      const card = e.target.closest(".recipe-option-card[data-recipe-option]");
      if (!card) return;
      e.preventDefault();
      card.click();
    });
    $("stockForm")?.addEventListener("submit", saveStock);
    $("stockSubmitBtn")?.addEventListener("click", saveStock);
    $("stockCancelEditBtn")?.addEventListener("click", resetStockForm);
    $("stockQty")?.addEventListener("input", updateStockQuantityPreview);
    $("stockSearch")?.addEventListener("input", renderStockTable);
    ["stockStatusFilter", "stockActiveFilter"].forEach(id => $(id)?.addEventListener("change", renderStockTable));
    $("stockClearFilters")?.addEventListener("click", () => {
      if ($("stockSearch")) $("stockSearch").value = "";
      ["stockStatusFilter", "stockActiveFilter"].forEach(id => { if ($(id)) $(id).value = "all"; });
      renderStockTable();
      $("stockSearch")?.focus();
    });
    $("stockAddRecordBtn")?.addEventListener("click", () => {
      resetStockForm();
      $("stockEditorPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      $("stockName")?.focus({ preventScroll: true });
    });
    const handleStockAction = e => {
      const btn = e.target.closest("button[data-stock-action]");
      if (!btn) return;
      if (btn.dataset.stockAction === "view") return openStockDetail(btn.dataset.stockId, btn);
      if (btn.dataset.stockAction === "edit") return editStockBean(btn.dataset.stockId);
      if (btn.dataset.stockAction === "delete") return deleteStockBean(btn.dataset.stockId);
    };
    $("stockTable")?.addEventListener("click", handleStockAction);
    $("stockMobileList")?.addEventListener("click", handleStockAction);
    $("qaForm")?.addEventListener("submit", saveQA);
    $("qaSubmitBtn")?.addEventListener("click", saveQA);
    $("manualBrewForm")?.addEventListener("submit", saveManualBrew);
    $("manualSubmitBtn")?.addEventListener("click", saveManualBrew);
    ["manualDose", "manualRatio"].forEach(id => $(id)?.addEventListener("input", () => { if ($("manualTotalWater")) $("manualTotalWater").dataset.userEdited = "false"; renderManualBrewPreview(); }));
    $("manualTotalWater")?.addEventListener("input", e => { e.target.dataset.userEdited = "true"; renderManualBrewPreview(); });
    ["manualBeanName", "manualOrigin", "manualRoast", "manualGrinder", "manualGrindSetting", "manualTemp"].forEach(id => {
      $(id)?.addEventListener("input", renderManualBrewPreview);
      $(id)?.addEventListener("change", renderManualBrewPreview);
    });
    ["manualMode", "manualDripper", "manualSwitchValveMode", "manualIce", "manualBrewTime", "manualBloom", "manualPourPlan", "manualValveOpenTime"].forEach(id => {
      $(id)?.addEventListener("input", renderManualBrewPreview);
      $(id)?.addEventListener("change", renderManualBrewPreview);
    });
    document.querySelectorAll(".manual-pour-input, .manual-pour-valve-select, .manual-pour-note-input, .manual-qa-score, #manualDefect").forEach(el => el.addEventListener("input", renderManualBrewPreview));
    document.querySelectorAll(".manual-pour-input, .manual-pour-valve-select, .manual-pour-note-input, .manual-qa-score, #manualDefect").forEach(el => el.addEventListener("change", renderManualBrewPreview));
    const handleBrewLogAction = e => {
      const detailBtn = e.target.closest("button[data-brew-detail]");
      if (detailBtn) return openBrewLogDetail(detailBtn.dataset.brewDetail, detailBtn);
      const reviewBtn = e.target.closest("button[data-brew-review]");
      if (reviewBtn) return startQAForBrew(reviewBtn.dataset.brewReview);
      const editBtn = e.target.closest("button[data-brew-edit]");
      if (editBtn) return openBrewLogEdit(editBtn.dataset.brewEdit);
      const deleteBtn = e.target.closest("button[data-brew-delete]");
      if (deleteBtn) return deleteBrewLog(deleteBtn.dataset.brewDelete);
    };
    $("brewLogTable")?.addEventListener("click", handleBrewLogAction);
    $("brewLogMobileList")?.addEventListener("click", handleBrewLogAction);
    $("brewLogSearch")?.addEventListener("input", renderBrewLogTable);
    ["brewLogMethodFilter", "brewLogQAFilter", "brewLogDateFrom", "brewLogDateTo"].forEach(id => $(id)?.addEventListener("change", renderBrewLogTable));
    $("brewLogClearFilters")?.addEventListener("click", clearBrewLogFilters);
    $("brewLogEditForm")?.addEventListener("submit", saveBrewLogEdit);
    $("cancelBrewEdit")?.addEventListener("click", closeBrewLogEdit);
    document.querySelectorAll(".qa-score, #qaDefect, #qaApproval, #qaPrimaryIssue, #qaTargetFocus").forEach(el => el.addEventListener("input", renderQAPreview));
    document.querySelectorAll(".qa-score, #qaDefect, #qaApproval, #qaPrimaryIssue, #qaTargetFocus").forEach(el => el.addEventListener("change", renderQAPreview));
    $("qaParent")?.addEventListener("change", applySelectedDraftToQA);
    $("qaHasVariable")?.addEventListener("change", e => {
      const input = $("qaVariable");
      if (input) {
        input.disabled = !e.target.checked;
        if (!e.target.checked) input.value = "";
      }
    });
    $("libraryDataset").addEventListener("change", () => {
      libraryCurrentFocus = "all";
      renderLibrary();
    });
    $("librarySearch").addEventListener("input", renderLibrary);
    $("libraryFocusToolbar")?.addEventListener("click", e => {
      const btn = e.target.closest("[data-library-focus]");
      if (!btn) return;
      libraryCurrentFocus = btn.dataset.libraryFocus || "all";
      renderLibrary();
    });
    $("librarySpotlightStrip")?.addEventListener("click", e => {
      const btn = e.target.closest("[data-library-spotlight]");
      if (!btn) return;
      const title = btn.dataset.libraryTitle || "";
      if ($("librarySearch")) $("librarySearch").value = title;
      libraryCurrentFocus = "all";
      renderLibrary();
    });
    $("libraryCardGrid")?.addEventListener("click", e => {
      const card = e.target.closest("[data-library-index]");
      if (!card) return;
      document.querySelectorAll("[data-library-index]").forEach(item => item.classList.toggle("active", item === card));
      renderLibraryDetail(Number(card.dataset.libraryIndex || 0));
    });
    $("libraryCardGrid")?.addEventListener("keydown", e => {
      if (!["Enter", " "].includes(e.key)) return;
      const card = e.target.closest("[data-library-index]");
      if (!card) return;
      e.preventDefault();
      card.click();
    });
    $("libraryTable")?.addEventListener("click", e => {
      const row = e.target.closest("tr[data-library-index]");
      if (!row) return;
      renderLibraryDetail(Number(row.dataset.libraryIndex || 0));
      $("libraryDetailPanel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    $("libraryTable")?.addEventListener("keydown", e => {
      if (!["Enter", " "].includes(e.key)) return;
      const row = e.target.closest("tr[data-library-index]");
      if (!row) return;
      e.preventDefault();
      renderLibraryDetail(Number(row.dataset.libraryIndex || 0));
      $("libraryDetailPanel")?.focus?.({ preventScroll: true });
    });
    ["publicBrewSearch", "publicBrewMethod", "publicBrewDripper", "publicBrewProcess", "publicBrewRoast", "publicBrewMinQA", "publicBrewSort"].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener(id === "publicBrewSearch" ? "input" : "change", renderPublicBrewTable);
    });
    const handlePublicBrewAction = e => {
      const editBtn = e.target.closest("button[data-public-brew-edit]");
      if (editBtn) return openPublicBrewEdit(editBtn.dataset.publicBrewEdit);
      const useBtn = e.target.closest("button[data-public-brew-use]");
      if (useBtn) return usePublicBrewAsBaseline(useBtn.dataset.publicBrewUse);
      const btn = e.target.closest("button[data-public-brew-detail]");
      if (!btn) return;
      openPublicBrewDetail(btn.dataset.publicBrewDetail);
    };
    $("publicBrewTable")?.addEventListener("click", handlePublicBrewAction);
    $("publicBrewCards")?.addEventListener("click", handlePublicBrewAction);
    $("publicBrewModalBody")?.addEventListener("click", e => {
      const editBtn = e.target.closest("button[data-public-brew-edit]");
      if (editBtn) return openPublicBrewEdit(editBtn.dataset.publicBrewEdit);
      const useBtn = e.target.closest("button[data-public-brew-use]");
      if (useBtn) {
        closePublicBrewDetail();
        usePublicBrewAsBaseline(useBtn.dataset.publicBrewUse);
      }
    });
    $("manualCancelEditBtn")?.addEventListener("click", cancelManualBrewEdit);
    $("publicBrewModalClose")?.addEventListener("click", closePublicBrewDetail);
    $("publicBrewModal")?.addEventListener("click", e => {
      if (e.target.id === "publicBrewModal") closePublicBrewDetail();
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !$("publicBrewModal")?.classList.contains("hidden")) closePublicBrewDetail();
    });
    $("refreshPublicBrews")?.addEventListener("click", async () => {
      const button = $("refreshPublicBrews");
      const stateTarget = $("publicBrewListState");
      if (button) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
      }
      if (stateTarget) {
        stateTarget.dataset.state = "loading";
        stateTarget.innerHTML = "<strong>Memuat hasil publik…</strong><p>Menyinkronkan hasil yang sudah memenuhi aturan publikasi.</p>";
        stateTarget.classList.remove("hidden");
      }
      try {
        await syncFromCloud(true);
      } catch (err) {
        if (stateTarget) {
          stateTarget.dataset.state = "error";
          stateTarget.innerHTML = `<strong>Hasil publik belum dapat dimuat</strong><p>${html(err.message || err)} Data yang sudah tersinkron tetap tersedia setelah mencoba lagi.</p>`;
          stateTarget.classList.remove("hidden");
        }
        showMessage(`Gagal memuat hasil seduhan publik: ${err.message || err}`, "error");
      } finally {
        if (button) {
          button.disabled = false;
          button.removeAttribute("aria-busy");
        }
      }
    });
    ["analyticsScope", "analyticsPeriod", "analyticsMinQA"].forEach(id => $(id)?.addEventListener("change", renderAnalytics));
    $("refreshAnalitik")?.addEventListener("click", async () => {
      const button = $("refreshAnalitik");
      const stateTarget = $("analyticsListState");
      if (button) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
      }
      if (stateTarget) {
        stateTarget.dataset.state = "loading";
        stateTarget.innerHTML = "<strong>Memperbarui Analytics…</strong><p>Menyinkronkan Brew, QA, dan stok yang diizinkan.</p>";
        stateTarget.classList.remove("hidden");
      }
      try {
        await syncFromCloud(true);
        renderAnalytics();
      } catch (err) {
        if (stateTarget) {
          stateTarget.dataset.state = "error";
          stateTarget.innerHTML = `<strong>Analytics belum dapat diperbarui</strong><p>${html(err.message || err)} Ringkasan terakhir tidak diubah.</p>`;
          stateTarget.classList.remove("hidden");
        }
        showMessage(`Gagal refresh analytics: ${err.message || err}`, "error");
      } finally {
        if (button) {
          button.disabled = false;
          button.removeAttribute("aria-busy");
        }
      }
    });
    ["qualityScope", "qualitySeverity"].forEach(id => $(id)?.addEventListener("change", renderDataQuality));
    $("refreshQuality")?.addEventListener("click", () => {
      const button = $("refreshQuality");
      const stateTarget = $("notificationListState");
      if (button) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
      }
      if (stateTarget) {
        stateTarget.dataset.state = "loading";
        stateTarget.textContent = "Menghitung ulang temuan dari data tersinkron…";
        stateTarget.classList.remove("hidden");
      }
      renderDataQuality();
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
      showMessage("Data Quality Checker diperbarui.", "success");
    });
    ["reportScope", "reportLibraryDataset"].forEach(id => $(id)?.addEventListener("change", () => {
      renderReportPreview();
      setReportGenerationStatus("ready", "Cakupan diperbarui · siap membuat file");
    }));
    $("refreshReports")?.addEventListener("click", () => {
      renderReportPreview();
      setReportGenerationStatus("ready", "Pratinjau diperbarui · siap membuat file");
      showMessage("Preview report diperbarui.", "success");
    });
    document.addEventListener("click", e => {
      const btn = e.target.closest?.("[data-report-action]");
      if (!btn) return;
      handleReportAction(btn.dataset.reportAction);
    });
    $("createSecureBackupBtn")?.addEventListener("click", exportJson);
    $("selectBackupFileBtn")?.addEventListener("click", () => $("restoreBackupInput")?.click());
    $("restoreBackupInput")?.addEventListener("change", event => inspectBackupFile(event.target.files?.[0]));
    $("restoreBackupBtn")?.addEventListener("click", restoreInspectedBackup);
    $("downloadDiagnosticsBtn")?.addEventListener("click", () => ERROR_SERVICE?.download?.({
      user: currentUser ? { id: currentUser.id, email: currentUser.email } : null,
      workspace: currentWorkspace ? { id: currentWorkspace.id, name: currentWorkspace.name } : null,
      role: currentRole
    }));
    $("clearDiagnosticsBtn")?.addEventListener("click", () => {
      if (!confirm("Hapus seluruh riwayat error lokal?")) return;
      ERROR_SERVICE?.clear?.();
      renderDiagnosticsSummary();
      showMessage("Riwayat error lokal sudah dihapus.", "success");
    });
    window.addEventListener("coffee:diagnostic", renderDiagnosticsSummary);
    window.addEventListener("coffee:diagnostic-cleared", renderDiagnosticsSummary);
    $("mobileQuickBrew")?.addEventListener("click", () => {
      showTab("brew");
      document.querySelector("#tab-brew")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("mobileQuickSync")?.addEventListener("click", () => processPendingSyncQueue(true));
    $("mobileQuickTop")?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    $("loginBtn")?.addEventListener("click", handleLogin);
    $("signupBtn")?.addEventListener("click", handleSignup);
    $("authJumpLink")?.addEventListener("click", () => {
      showTab("admin");
      setTimeout(() => {
        $("authEmail")?.focus();
        document.querySelector("#tab-admin")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    });
    $("logoutBtn")?.addEventListener("click", handleLogout);
    $("workspaceForm")?.addEventListener("submit", createWorkspace);
    $("saveWorkspaceVisibilityBtn")?.addEventListener("click", saveWorkspaceVisibility);
    $("joinWorkspaceBtn")?.addEventListener("click", joinWorkspace);
    $("activeWorkspaceSelect")?.addEventListener("change", e => setActiveWorkspace(e.target.value));
    $("adminWorkspaceSelect")?.addEventListener("change", e => setActiveWorkspace(e.target.value));
    $("moderationDataset")?.addEventListener("change", loadModerationRows);
    $("moderationStatus")?.addEventListener("change", loadModerationRows);
    $("refreshModeration")?.addEventListener("click", loadModerationRows);
    $("bulkApproveModeration")?.addEventListener("click", () => bulkModerateVisibleRows("approve"));
    $("bulkRejectModeration")?.addEventListener("click", () => bulkModerateVisibleRows("reject"));
    $("refreshMemberRequests")?.addEventListener("click", loadMemberRequests);
    $("bulkApproveMembers")?.addEventListener("click", bulkApprovePendingMembers);
    $("refreshWorkspaceUsers")?.addEventListener("click", loadWorkspaceMembers);
    $("refreshSuggestions")?.addEventListener("click", loadSuggestionRows);
    $("bulkReviewSuggestions")?.addEventListener("click", () => bulkSuggestionStatus("reviewed"));
    $("bulkCloseSuggestions")?.addEventListener("click", () => bulkSuggestionStatus("closed"));
    $("moderationTable")?.addEventListener("click", e => {
      const btn = e.target.closest("button[data-mod-action]");
      if (!btn) return;
      moderateRow(btn.dataset.id, btn.dataset.modAction);
    });
    $("suggestionInboxTable")?.addEventListener("click", e => {
      const btn = e.target.closest("button[data-suggestion-action]");
      if (!btn) return;
      updateSuggestionStatus(btn.dataset.id, btn.dataset.suggestionAction);
    });
    $("memberRequestTable")?.addEventListener("click", e => {
      const btn = e.target.closest("button[data-member-action]");
      if (!btn) return;
      updateMemberRequest(btn.dataset.userId, btn.dataset.memberAction);
    });
    $("workspaceUserTable")?.addEventListener("click", async e => {
      const btn = e.target.closest("button[data-workspace-user-action]");
      if (!btn) return;
      const oldLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Memproses...";
      try {
        await updateWorkspaceMember(btn.dataset.userId, btn.dataset.workspaceUserAction);
      } catch (err) {
        console.error(err);
        showMessage(`Gagal memproses aksi pengguna: ${err.message || err}`, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = oldLabel;
      }
    });
    $("syncCloud")?.addEventListener("click", async () => {
      try {
        await syncFromCloud(true);
        alert("Sinkronisasi Supabase selesai.");
      } catch (err) {
        alert(`Sinkronisasi gagal: ${err.message || err}`);
      }
    });
    $("exportJson")?.addEventListener("click", exportJson);
    $("importJson")?.addEventListener("change", e => e.target.files[0] && importJson(e.target.files[0]));
    $("resetLocal")?.addEventListener("click", () => {
      if (confirm("Reset semua data lokal? Data bawaan dari dashboard Excel tetap ada.")) {
        SAFE_STORAGE.remove(STORAGE_KEY);
        state.userStock = [];
        state.userBrewLogs = [];
        state.userQA = [];
        persist();
        renderAll();
      }
    });
  }

  function analyticsBaseRows() {
    const workspaceRows = (allBrewLogs() || []).map(log => ({ ...log, AnalyticsSource: "workspace" }));
    const publicRows = (typeof publicApprovedRows === "function" ? publicApprovedRows() : []).map(log => ({ ...log, AnalyticsSource: "public" }));
    const seen = new Set();
    return [...workspaceRows, ...publicRows].filter(log => {
      const key = String(log.CloudID || log.BrewID || `${log.BeanName}|${log.Date}|${log.BrewerName}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function analyticsRows() {
    const scope = $("analyticsScope")?.value || "all";
    const period = Number($("analyticsPeriod")?.value || 0);
    const minQA = Number($("analyticsMinQA")?.value || 0);
    let rows = analyticsBaseRows().filter(log => scope === "all" || log.AnalyticsSource === scope);
    rows = ANALYTICS_SERVICE?.filterPeriod ? ANALYTICS_SERVICE.filterPeriod(rows, period) : rows;
    return rows
      .filter(log => !minQA || Number(log.QA_Final || 0) >= minQA)
      .sort((a, b) => new Date(a.Date || a.CreatedAt || 0) - new Date(b.Date || b.CreatedAt || 0));
  }

  function avg(values) {
    const nums = values.map(Number).filter(Number.isFinite);
    return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : 0;
  }

  function groupAnalytics(rows, field) {
    const map = new Map();
    rows.filter(log => Number(log.QA_Final || 0) > 0).forEach(log => {
      const key = log[field] || "-";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(log);
    });
    return [...map.entries()].map(([key, logs]) => ({
      key,
      count: logs.length,
      avgQA: avg(logs.map(log => Number(log.QA_Final || 0))),
      bestQA: Math.max(...logs.map(log => Number(log.QA_Final || 0))),
      best: logs.slice().sort((a, b) => Number(b.QA_Final || 0) - Number(a.QA_Final || 0))[0]
    })).sort((a, b) => b.avgQA - a.avgQA || b.count - a.count);
  }

  function dateBucket(log) {
    const value = log.Date || log.CreatedAt || "";
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toISOString().slice(0, 10);
  }

  function analyticsTrend(rows) {
    const buckets = new Map();
    rows.filter(log => Number(log.QA_Final || 0) > 0).forEach(log => {
      const key = dateBucket(log);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(Number(log.QA_Final || 0));
    });
    return [...buckets.entries()].map(([date, values]) => ({
      date,
      avgQA: avg(values),
      count: values.filter(Boolean).length
    })).slice(-10);
  }

  function recipeCompletenessScore(log) {
    return [log.Dripper, log.Method, log.Grinder, log.GrindSetting, log.Temp_C, log.Ratio, log.Dose_g, log.TotalWater_ml, log.BrewTime_sec, log.Water, log.ResultNotes]
      .filter(Boolean).length;
  }

  function analyticsSummary(rows) {
    const stock = workspaceStock() || [];
    const history = analyticsBaseRows().filter(log => log.AnalyticsSource === "workspace");
    if (ANALYTICS_SERVICE?.summarize) return ANALYTICS_SERVICE.summarize(rows, stock, history);
    const qaValues = rows.map(log => Number(log.QA_Final || 0)).filter(value => value > 0);
    return {
      enriched: rows.map(log => ({ ...log, AnalyticsUsage_g: Number(log.StockUsage_g || 0), AnalyticsCostKnown: false, AnalyticsCost: 0 })),
      totalBrews: rows.length,
      totalCoffeeG: rows.reduce((sum, log) => sum + Number(log.StockUsage_g || 0), 0),
      totalCost: 0,
      averageCost: 0,
      costCoverage: 0,
      costKnownBrews: 0,
      averageQA: qaValues.length ? avg(qaValues) : 0,
      qaDeviation: 0,
      estimatedStockDays: 0,
      remainingValue: 0
    };
  }

  function renderAnalyticsFinanceNotice(summary) {
    const target = $("analyticsFinanceNotice");
    if (!target) return;
    if (!summary.totalBrews) {
      target.textContent = "Belum ada brew log pada filter aktif. Tambahkan seduhan atau ubah periode untuk melihat analitik.";
      return;
    }
    if (!summary.costKnownBrews) {
      target.textContent = "Biaya belum dapat dihitung. Hubungkan seduhan dengan biji pada menu Stok dan isi Harga Pembelian agar cost per cup dapat terbaca.";
      return;
    }
    target.innerHTML = `Cakupan biaya <strong>${html(Math.round(summary.costCoverage))}%</strong> · ${html(summary.costKnownBrews)} dari ${html(summary.totalBrews)} seduhan memiliki data stok dan harga. Nilai biaya merupakan estimasi dari pemakaian biji yang tercatat.`;
  }

  function renderAnalyticsMetrics(rows, summary = analyticsSummary(rows)) {
    const grid = $("analyticsMetricGrid");
    if (!grid) return;
    const best = rows.filter(log => Number(log.QA_Final || 0) > 0).slice().sort((a, b) => Number(b.QA_Final || 0) - Number(a.QA_Final || 0))[0];
    const metrics = [
      ["Total Seduhan", summary.totalBrews, "Jumlah brew log pada filter aktif."],
      ["Rata-rata QA", summary.averageQA ? fmt(summary.averageQA, 2) : "-", `Sebaran nilai ${fmt(summary.qaDeviation, 2)}.`],
      ["Biaya per Cangkir", summary.averageCost ? fmtCurrency(summary.averageCost) : "-", `Cakupan biaya ${Math.round(summary.costCoverage || 0)}%.`],
      ["Best Cup", best ? `${best.BeanName || best.BrewID || "-"} · ${fmt(best.QA_Final, 2)}` : "-", summary.estimatedStockDays ? `Stok diperkirakan cukup ${Math.max(1, Math.round(summary.estimatedStockDays))} hari.` : "Belum cukup data konsumsi untuk estimasi stok."]
    ];
    grid.innerHTML = metrics.map(([label, value, desc], idx) => `
      <article class="analytics-metric-card cinematic-reveal" style="--stagger:${idx}">
        <span>${html(label)}</span>
        <strong>${html(value)}</strong>
        <small>${html(desc)}</small>
      </article>
    `).join("");
    const context = $("analyticsContextMetrics");
    if (context) {
      const supporting = [
        ["Biji terpakai", summary.totalCoffeeG ? `${fmt(summary.totalCoffeeG)} g` : "-", "Pemakaian stok tercatat"],
        ["Total biaya biji", summary.totalCost ? fmtCurrency(summary.totalCost) : "-", "Estimasi periode aktif"],
        ["Cakupan biaya", `${Math.round(summary.costCoverage || 0)}%`, `${summary.costKnownBrews} dari ${summary.totalBrews} Brew`]
      ];
      context.innerHTML = supporting.map(([label, value, desc]) => `<div class="analytics-context-metric"><span>${html(label)}</span><strong>${html(value)}</strong><small>${html(desc)}</small></div>`).join("");
    }
  }

  function renderAnalyticsTrend(rows) {
    const chart = $("analyticsTrendChart");
    if (!chart) return;
    const equivalent = $("analyticsTrendDescription");
    const trend = analyticsTrend(rows);
    if (!trend.length) {
      chart.innerHTML = `<div class="analytics-empty">Belum ada nilai QA pada periode ini.</div>`;
      if (equivalent) equivalent.innerHTML = "";
      return;
    }
    const values = trend.map(item => Number(item.avgQA || 0)).filter(Number.isFinite);
    let minY = Math.max(0, Math.floor(Math.min(...values, 6) - 0.5));
    let maxY = Math.min(10, Math.ceil(Math.max(...values, 8) + 0.5));
    if (maxY - minY < 2) minY = Math.max(0, maxY - 2);
    const width = 1000;
    const height = 300;
    const pad = { left: 54, right: 28, top: 28, bottom: 54 };
    const spanX = width - pad.left - pad.right;
    const spanY = height - pad.top - pad.bottom;
    const xFor = idx => pad.left + (trend.length === 1 ? spanX / 2 : idx * (spanX / (trend.length - 1)));
    const yFor = value => pad.top + (1 - ((Number(value || 0) - minY) / Math.max(1, maxY - minY))) * spanY;
    const points = trend.map((item, idx) => ({ ...item, x: xFor(idx), y: yFor(item.avgQA) }));
    const line = points.map((p, idx) => `${idx ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = `${line} L ${points.at(-1).x.toFixed(1)} ${height - pad.bottom} L ${points[0].x.toFixed(1)} ${height - pad.bottom} Z`;
    const ticks = [minY, Math.round((minY + maxY) / 2), maxY].filter((v, i, a) => a.indexOf(v) === i);
    chart.innerHTML = `
      <div class="analytics-line-chart">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafik tren nilai QA">
          <defs>
            <linearGradient id="qaTrendArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="rgba(166,112,70,.30)" /><stop offset="100%" stop-color="rgba(166,112,70,0)" /></linearGradient>
            <linearGradient id="qaTrendLine" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="rgba(75,46,43,.95)" /><stop offset="100%" stop-color="rgba(205,146,82,.95)" /></linearGradient>
          </defs>
          ${ticks.map(tick => { const y = yFor(tick); return `<g class="trend-grid-line"><line x1="${pad.left}" x2="${width - pad.right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line><text x="${pad.left - 12}" y="${(y + 4).toFixed(1)}">${html(fmt(tick, 1))}</text></g>`; }).join("")}
          <path class="trend-area-path" d="${area}"></path><path class="trend-line-path" d="${line}"></path>
          ${points.map((p, idx) => `<g class="trend-point" style="--stagger:${idx}"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5"></circle><text class="trend-value" x="${p.x.toFixed(1)}" y="${(p.y - 14).toFixed(1)}">${html(fmt(p.avgQA, 2))}</text><text class="trend-label" x="${p.x.toFixed(1)}" y="${height - 20}">${html(String(p.date || "").slice(5))}</text></g>`).join("")}
        </svg>
      </div>`;
    if (equivalent) {
      equivalent.innerHTML = trend.map(item => `<span><time datetime="${html(item.date)}">${html(item.date)}</time><b>QA ${html(fmt(item.avgQA, 2))}</b><small>${html(item.count)} Brew</small></span>`).join("");
    }
  }

  function renderRankList(id, rows, field) {
    const target = $(id);
    if (!target) return;
    const groups = groupAnalytics(rows, field).filter(item => item.key && item.key !== "-").slice(0, 6);
    if (!groups.length) {
      target.innerHTML = `<div class="analytics-empty">Belum ada data yang cukup.</div>`;
      return;
    }
    const maxAvg = Math.max(...groups.map(item => item.avgQA), 10);
    target.innerHTML = groups.map((item, idx) => `
      <article class="analytics-rank-item cinematic-reveal" style="--stagger:${idx}">
        <div><span>${html(item.key)}</span><strong>Rata-rata QA ${html(fmt(item.avgQA, 2))}</strong><small>${html(item.count)} seduhan · tertinggi ${html(fmt(item.bestQA, 2))}</small></div>
        <i style="--bar:${Math.max(8, Math.round((item.avgQA / maxAvg) * 100))}%"></i>
      </article>
    `).join("");
  }

  function analyticsInsights(rows) {
    const stock = workspaceStock() || [];
    const history = analyticsBaseRows().filter(log => log.AnalyticsSource === "workspace");
    const serviceInsights = ANALYTICS_SERVICE?.insights ? ANALYTICS_SERVICE.insights(rows, stock, history) : [];
    const dripper = groupAnalytics(rows, "Dripper").find(item => item.key !== "-");
    if (dripper && serviceInsights.length < 5) serviceInsights.push({ title: "Dripper dengan hasil terbaik", text: `${dripper.key} mencatat rata-rata QA ${fmt(dripper.avgQA, 2)} dari ${dripper.count} seduhan. Gunakan sebagai baseline pembanding.` });
    return serviceInsights.length ? serviceInsights.slice(0, 5) : [{ title: "Belum ada pola yang bisa dibaca", text: "Tambahkan brew log dan QA untuk mulai melihat insight." }];
  }

  function renderAnalyticsInsights(rows) {
    const list = $("analyticsInsightList");
    if (!list) return;
    list.innerHTML = analyticsInsights(rows).map((item, idx) => `
      <article class="analytics-insight-item cinematic-reveal" style="--stagger:${idx}">
        <span>${idx + 1}</span><div><strong>${html(item.title)}</strong><p>${html(item.text)}</p></div>
      </article>
    `).join("");
  }

  function renderAnalyticsConsumption(summary) {
    const target = $("analyticsConsumptionChart");
    if (!target) return;
    const period = Number($("analyticsPeriod")?.value || 0);
    const trend = ANALYTICS_SERVICE?.consumptionTrend ? ANALYTICS_SERVICE.consumptionTrend(summary.enriched, period) : [];
    if (!trend.length || !trend.some(item => Number(item.coffeeG || 0) > 0)) {
      target.innerHTML = `<div class="analytics-empty">Belum ada pemakaian stok yang tercatat pada periode ini.</div>`;
      return;
    }
    const max = Math.max(...trend.map(item => Number(item.coffeeG || 0)), 1);
    target.innerHTML = trend.map(item => {
      const height = Math.max(4, Math.round((Number(item.coffeeG || 0) / max) * 100));
      const label = period && period <= 45 ? item.key.slice(5) : period && period <= 180 ? `W ${item.key.slice(5)}` : item.key;
      return `<article class="analytics-consumption-bar"><div class="analytics-consumption-bar__plot"><span class="analytics-consumption-bar__value">${html(fmt(item.coffeeG))}g</span><i class="analytics-consumption-bar__fill" style="--height:${height}%"></i></div><small>${html(label)}<br>${html(item.brews)} brew</small></article>`;
    }).join("");
  }

  function renderAnalyticsCostBreakdown(summary) {
    const target = $("analyticsCostBreakdown");
    if (!target) return;
    const groups = ANALYTICS_SERVICE?.costBreakdown ? ANALYTICS_SERVICE.costBreakdown(summary.enriched).slice(0, 6) : [];
    if (!groups.length) {
      target.innerHTML = `<div class="analytics-empty">Isi harga pembelian pada stok dan hubungkan seduhan dengan stok untuk melihat rincian biaya.</div>`;
      return;
    }
    const max = Math.max(...groups.map(item => Number(item.cost || 0)), 1);
    target.innerHTML = groups.map(item => `<article class="analytics-cost-row"><div class="analytics-cost-row__head"><div><strong>${html(item.key)}</strong><small>${html(item.brews)} seduhan · ${html(fmt(item.coffeeG))}g${item.avgQA ? ` · QA ${html(fmt(item.avgQA, 2))}` : ""}</small></div><span>${html(fmtCurrency(item.cost))}</span></div><div class="analytics-cost-row__track"><i style="--width:${Math.max(6, Math.round((item.cost / max) * 100))}%"></i></div></article>`).join("");
  }

  function renderAnalyticsTable(rows, summary = analyticsSummary(rows)) {
    const table = $("analyticsTopTable");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    const costByKey = new Map(summary.enriched.map(log => [String(log.CloudID || log.BrewID || `${log.BeanName}|${log.Date}`), log]));
    const top = rows.filter(log => Number(log.QA_Final || 0) > 0).slice().sort((a, b) => Number(b.QA_Final || 0) - Number(a.QA_Final || 0)).slice(0, 10);
    if (!top.length) {
      tbody.innerHTML = emptyRow(6, "Belum ada data analitik", "Tambahkan brew log dan nilai QA untuk melihat ranking resep.", "◇");
      return;
    }
    tbody.innerHTML = top.map(log => {
      const key = String(log.CloudID || log.BrewID || `${log.BeanName}|${log.Date}`);
      const cost = costByKey.get(key);
      const profile = [log.Variety, log.Process, log.RoastProfile].filter(Boolean).join(" · ") || "-";
      const recipe = [log.Dripper, log.Grinder, log.GrindSetting, log.Temp_C ? `${log.Temp_C}°C` : "", log.Ratio ? `1:${log.Ratio}` : ""].filter(Boolean).join(" · ") || "-";
      return `<tr>
        <td data-label="Kopi"><strong>${html(log.BeanName || log.BrewID || "Tanpa nama")}</strong><small>${html(log.BrewerName || "Brewer")}</small></td>
        <td data-label="Profil">${html(profile)}</td><td data-label="Metode">${html(log.Method || "-")}</td><td data-label="Resep">${html(recipe)}</td>
        <td data-label="Biaya Biji"><span class="analytics-cost-pill ${cost?.AnalyticsCostKnown ? "" : "is-unknown"}">${cost?.AnalyticsCostKnown ? html(fmtCurrency(cost.AnalyticsCost)) : "Belum tersedia"}</span></td>
        <td data-label="QA"><span class="score-pill">${html(fmt(log.QA_Final, 2))}</span></td>
      </tr>`;
    }).join("");
  }

  function renderAnalytics() {
    if (!$("analyticsMetricGrid")) return;
    const rows = analyticsRows();
    const summary = analyticsSummary(rows);
    const qaCount = rows.filter(log => Number(log.QA_Final || 0) > 0).length;
    if ($("analyticsResultStatus")) {
      $("analyticsResultStatus").textContent = rows.length
        ? `${rows.length} Brew · ${qaCount} dengan nilai QA`
        : "0 Brew pada filter aktif";
    }
    $("analyticsListState")?.classList.add("hidden");
    renderAnalyticsFinanceNotice(summary);
    renderAnalyticsMetrics(rows, summary);
    renderAnalyticsTrend(rows);
    renderAnalyticsConsumption(summary);
    renderAnalyticsCostBreakdown(summary);
    renderRankList("analyticsDripperRank", rows, "Dripper");
    renderRankList("analyticsProcessRank", rows, "Process");
    renderAnalyticsInsights(rows);
    renderAnalyticsTable(rows, summary);
  }

  function qualitySources() {
    const brewRows = typeof analyticsBaseRows === "function" ? analyticsBaseRows() : [...(allBrewLogs() || []), ...(typeof publicApprovedRows === "function" ? publicApprovedRows() : [])];
    const seen = new Set();
    const uniqueBrew = brewRows.filter(log => {
      const key = String(log.CloudID || log.BrewID || `${log.BeanName}|${log.Date}|${log.BrewerName}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      brew: uniqueBrew,
      qa: allQA() || [],
      stock: workspaceStock() || [],
      public: typeof publicApprovedRows === "function" ? publicApprovedRows() : [],
      library: ["varieties", "drippers", "filters", "processes", "roasts", "waters", "grinders"].flatMap(key => (DATA[key] || []).map(row => ({ ...row, __dataset: key })))
    };
  }

  function pushQualityIssue(list, { severity = "info", module = "general", item = "-", issue = "-", action = "-", ref = "" }) {
    list.push({ severity, module, item, issue, action, ref });
  }

  function brewCompleteness(log) {
    const fields = ["BeanName", "Variety", "Process", "RoastProfile", "Dripper", "Method", "Grinder", "GrindSetting", "Temp_C", "Ratio", "Dose_g", "TotalWater_ml", "BrewTime_sec", "QA_Final"];
    const filled = fields.filter(field => log[field] !== undefined && log[field] !== null && String(log[field]).trim() !== "").length;
    return Math.round((filled / fields.length) * 100);
  }

  function qualityIssuesRaw() {
    const src = qualitySources();
    const issues = [];

    src.brew.forEach(log => {
      const name = log.BeanName || log.BrewID || "Brew tanpa nama";
      const required = [
        ["BeanName", "nama kopi"],
        ["Variety", "varietas"],
        ["Process", "proses pascapanen"],
        ["RoastProfile", "roast profile"],
        ["Dripper", "dripper"],
        ["Method", "metode"],
        ["Grinder", "grinder"],
        ["GrindSetting", "setting grinder"],
        ["Temp_C", "suhu"],
        ["Ratio", "rasio"],
        ["Dose_g", "dose"],
        ["TotalWater_ml", "total air"]
      ];
      const missing = required.filter(([field]) => log[field] === undefined || log[field] === null || String(log[field]).trim() === "").map(([, label]) => label);
      if (missing.length) pushQualityIssue(issues, {
        severity: missing.length >= 5 ? "critical" : "warning",
        module: "brew",
        item: name,
        issue: `Field kosong: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? "..." : ""}`,
        action: "Lengkapi data di Brew Log atau Input Seduhan."
      });
      if (Number(log.QA_Final || 0) >= APPROVAL_THRESHOLD && brewCompleteness(log) < 75) pushQualityIssue(issues, {
        severity: "warning",
        module: "public",
        item: name,
        issue: `QA tinggi (${fmt(log.QA_Final, 2)}) tetapi kelengkapan resep baru ${brewCompleteness(log)}%.`,
        action: "Lengkapi parameter resep sebelum dijadikan referensi publik."
      });
      if (Number(log.BrewTime_sec || 0) > 360) pushQualityIssue(issues, {
        severity: "info",
        module: "brew",
        item: name,
        issue: "Brew time lebih dari 6 menit.",
        action: "Cek apakah grind terlalu halus, bed tersumbat, atau agitation terlalu tinggi."
      });
      if (Number(log.Temp_C || 0) && (Number(log.Temp_C) < 80 || Number(log.Temp_C) > 100)) pushQualityIssue(issues, {
        severity: "critical",
        module: "brew",
        item: name,
        issue: `Suhu ${log.Temp_C}°C berada di luar rentang wajar.`,
        action: "Validasi input suhu seduh."
      });
      if (Number(log.Ratio || 0) && (Number(log.Ratio) < 8 || Number(log.Ratio) > 25)) pushQualityIssue(issues, {
        severity: "warning",
        module: "brew",
        item: name,
        issue: `Rasio 1:${log.Ratio} terlihat tidak umum untuk filter brew.`,
        action: "Cek apakah rasio atau total air salah input."
      });
    });

    src.qa.forEach(qa => {
      const name = qa.BrewID || qa.QA_ID || "QA tanpa BrewID";
      if (!qa.BrewID) pushQualityIssue(issues, {
        severity: "critical",
        module: "qa",
        item: name,
        issue: "QA score tidak punya BrewID.",
        action: "Hubungkan QA ke Brew Log yang benar."
      });
      if (!Number.isFinite(Number(qa.QA_Final))) pushQualityIssue(issues, {
        severity: "critical",
        module: "qa",
        item: name,
        issue: "Final QA kosong atau bukan angka.",
        action: "Isi ulang skor QA atau hitung ulang preview QA."
      });
      if (Number(qa.QA_Final || 0) >= APPROVAL_THRESHOLD && String(qa.ApprovedForRecipe || "").toLowerCase() !== "yes") pushQualityIssue(issues, {
        severity: "info",
        module: "qa",
        item: name,
        issue: "QA lulus threshold tetapi belum ditandai ApprovedForRecipe.",
        action: "Review apakah resep layak ditampilkan sebagai referensi."
      });
    });

    src.stock.forEach(bean => {
      const name = bean.BeanName || bean.StockBeanID || "Stock tanpa nama";
      if (!bean.BeanName || !bean.Variety || !bean.Process || !bean.RoastProfile) pushQualityIssue(issues, {
        severity: "warning",
        module: "stock",
        item: name,
        issue: "Identitas stok belum lengkap.",
        action: "Lengkapi nama kopi, varietas, proses, dan roast profile."
      });
      if (Number(bean.Remaining_g ?? bean.Stock_g ?? 0) <= 0) pushQualityIssue(issues, {
        severity: "info",
        module: "stock",
        item: name,
        issue: "Stok habis atau remaining 0g.",
        action: "Archive stok lama atau update stok baru."
      });
    });

    src.public.forEach(log => {
      const name = log.BeanName || log.BrewID || "Public brew";
      if (Number(log.QA_Final || 0) < APPROVAL_THRESHOLD) pushQualityIssue(issues, {
        severity: "critical",
        module: "public",
        item: name,
        issue: "Data publik punya QA di bawah threshold.",
        action: "Turunkan visibility atau review moderation policy."
      });
      if (!log.ResultNotes && !log.PrimaryVariableChanged) pushQualityIssue(issues, {
        severity: "info",
        module: "public",
        item: name,
        issue: "Resep publik minim catatan hasil/tasting.",
        action: "Tambahkan result notes agar pengguna lain memahami konteks resep."
      });
    });

    src.library.forEach(row => {
      const title = libraryRowTitle ? libraryRowTitle(row, row.__dataset) : (row.Variety || row.DripperName || row.FilterName || row.Process || row.RoastProfile || row.Water || row.Grinder || "Baris pustaka");
      if (!sourceUrl(row)) pushQualityIssue(issues, {
        severity: "info",
        module: "library",
        item: title,
        issue: "SourceURL belum tersedia.",
        action: "Tambahkan source agar referensi lebih terpercaya."
      });
    });

    return issues;
  }

  function qualityFilteredIssues(sourceIssues = qualityIssuesRaw()) {
    const scope = $("qualityScope")?.value || "all";
    const severity = $("qualitySeverity")?.value || "all";
    return sourceIssues
      .filter(issue => scope === "all" || issue.module === scope)
      .filter(issue => severity === "all" || issue.severity === severity);
  }

  function qualityScore(issues) {
    const critical = issues.filter(i => i.severity === "critical").length;
    const warning = issues.filter(i => i.severity === "warning").length;
    const info = issues.filter(i => i.severity === "info").length;
    return clamp(100 - critical * 12 - warning * 5 - info * 1, 0, 100);
  }

  function severityLabel(severity) {
    return severity === "critical" ? "Critical" : severity === "warning" ? "Warning" : "Info";
  }

  function renderQualityScore(issues) {
    const score = qualityScore(issues);
    const card = $("qualityScoreCard");
    if (!card) return;
    const label = score >= 88 ? "Excellent" : score >= 74 ? "Good" : score >= 55 ? "Needs cleanup" : "Critical cleanup";
    card.innerHTML = `
      <div class="quality-score-ring" style="--score:${score}%"><strong>${html(score)}</strong><span>/100</span></div>
      <div>
        <span class="mini-label">Data Quality Score</span>
        <h3>${html(label)}</h3>
        <p>${html(issues.length ? `${issues.length} issue terdeteksi berdasarkan filter aktif.` : "Tidak ada issue pada filter aktif.")}</p>
      </div>
    `;
  }

  function renderQualityMetrics(issues) {
    const grid = $("qualityMetricGrid");
    if (!grid) return;
    const src = qualitySources();
    const recipeReady = src.brew.filter(log => brewCompleteness(log) >= 80).length;
    const cards = [
      ["Critical", issues.filter(i => i.severity === "critical").length, "Harus dibenahi agar data aman."],
      ["Warning", issues.filter(i => i.severity === "warning").length, "Perlu review agar insight akurat."],
      ["Info", issues.filter(i => i.severity === "info").length, "Penyempurnaan opsional."],
      ["Recipe Ready", `${recipeReady}/${src.brew.length}`, "Brew log yang cukup lengkap untuk analisis."]
    ];
    grid.innerHTML = cards.map(([label, value, desc], idx) => `
      <article class="quality-metric-card cinematic-reveal" style="--stagger:${idx}">
        <span>${html(label)}</span>
        <strong>${html(value)}</strong>
        <small>${html(desc)}</small>
      </article>
    `).join("");
  }

  function renderQualityIssues(issues) {
    const list = $("qualityIssueList");
    if (!list) return;
    if (!issues.length) {
      list.innerHTML = `<article class="quality-empty">Tidak ada issue untuk filter aktif.</article>`;
      return;
    }
    list.innerHTML = issues.slice(0, 8).map((issue, idx) => `
      <article class="quality-issue-item ${html(issue.severity)} cinematic-reveal" style="--stagger:${idx}" role="listitem">
        <span>${html(severityLabel(issue.severity))}</span>
        <div>
          <strong>${html(issue.item)}</strong>
          <p>${html(issue.issue)}</p>
          <small>${html(issue.action)}</small>
        </div>
      </article>
    `).join("");
  }

  function renderQualityChecklist(issues) {
    const target = $("qualityChecklist");
    if (!target) return;
    const src = qualitySources();
    const checks = [
      ["Brew log punya identitas lengkap", !issues.some(i => i.module === "brew" && i.issue.includes("Field kosong"))],
      ["QA terhubung ke BrewID", !issues.some(i => i.module === "qa" && i.issue.includes("BrewID"))],
      ["Resep publik memenuhi threshold", !issues.some(i => i.module === "public" && i.severity === "critical")],
      ["Stok punya profil kopi", !issues.some(i => i.module === "stock" && i.severity === "warning")],
      ["Library punya source", src.library.filter(row => sourceUrl(row)).length >= Math.round(src.library.length * 0.75)]
    ];
    target.innerHTML = checks.map(([label, passed], idx) => `
      <article class="quality-check-item ${passed ? "passed" : "pending"} cinematic-reveal" style="--stagger:${idx}">
        <i>${passed ? "✓" : "!"}</i>
        <span>${html(label)}</span>
      </article>
    `).join("");
  }

  function renderQualityTable(issues) {
    const table = $("qualityIssueTable");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!issues.length) {
      tbody.innerHTML = emptyRow(5, "Tidak ada issue", "Data pada filter aktif sudah bersih.", "✓");
      return;
    }
    tbody.innerHTML = issues.slice(0, 120).map(issue => `
      <tr>
        <td data-label="Severity"><span class="quality-pill ${html(issue.severity)}">${html(severityLabel(issue.severity))}</span></td>
        <td data-label="Modul">${html(issue.module)}</td>
        <td data-label="Item"><strong>${html(issue.item)}</strong></td>
        <td data-label="Masalah">${html(issue.issue)}</td>
        <td data-label="Aksi">${html(issue.action)}</td>
      </tr>
    `).join("");
  }

  function renderDataQuality() {
    if (!$("qualityScoreCard")) return;
    const rawIssues = qualityIssuesRaw();
    const issues = qualityFilteredIssues(rawIssues);
    renderQualityScore(issues);
    renderQualityMetrics(issues);
    renderQualityIssues(issues);
    renderQualityChecklist(issues);
    renderQualityTable(issues);
    updateNotificationSummaryFromIssues(issues, rawIssues);
    syncNotificationQuickFilters();
    if ($("notificationResultStatus")) {
      $("notificationResultStatus").textContent = issues.length
        ? `${issues.length} dari ${rawIssues.length} temuan ditampilkan`
        : rawIssues.length
          ? `0 dari ${rawIssues.length} temuan cocok dengan filter`
          : "Tidak ada temuan aktif";
    }
    if ($("notificationListState")) {
      $("notificationListState").dataset.state = "ready";
      $("notificationListState").classList.add("hidden");
    }
  }

  function adminWorkspaceRows(rows = []) {
    const workspaceId = currentWorkspace?.id || activeWorkspaceId();
    return (rows || []).filter(row => !workspaceId || row.WorkspaceID === workspaceId || row.workspace_id === workspaceId);
  }

  function moderationStatusOf(row) {
    return String(row.ModerationStatus || row.moderation_status || row.status || "pending").toLowerCase();
  }

  function adminModerationCounts() {
    const brewRows = adminWorkspaceRows(state.cloudBrewLogs || []);
    const qaRows = adminWorkspaceRows(state.cloudQA || []);
    const rows = [...brewRows, ...qaRows];
    return {
      total: rows.length,
      pending: rows.filter(row => moderationStatusOf(row) === "pending").length,
      approved: rows.filter(row => ["approved", "published"].includes(moderationStatusOf(row))).length,
      rejected: rows.filter(row => moderationStatusOf(row) === "rejected").length
    };
  }

  function renderAdminProDashboard() {
    const metrics = $("adminProMetricGrid");
    const workflow = $("adminWorkflowGrid");
    if (!metrics || !workflow) return;

    const workspaceName = currentWorkspace?.name || "Belum ada workspace";
    const mod = adminModerationCounts();
    const activeUsers = workspaceMemberRows.filter(row => row.status === "active").length;
    const disabledUsers = workspaceMemberRows.filter(row => row.status === "disabled").length;
    const pendingAccess = pendingMemberRows.length;
    const openSuggestions = (suggestionRows || []).filter(row => ["open", "new", "reviewed"].includes(String(row.status || "open").toLowerCase())).length;
    const warningAudit = (auditRows || []).filter(row => ["warning", "critical"].includes(row.severity)).length;

    const cards = [
      ["Workspace Aktif", workspaceName, `${roleDisplayLabel(currentRole)} · ${canAdmin() ? "kontrol admin aktif" : canModerate() ? "akses moderasi aktif" : "akses terbatas"}`],
      ["Menunggu Persetujuan", pendingAccess, "Permintaan anggota yang belum diputuskan."],
      ["Anggota Aktif", activeUsers, disabledUsers ? `${disabledUsers} akses sedang ditangguhkan.` : "Tidak ada akses yang ditangguhkan."],
      ["Antrean Moderasi", mod.pending, `${mod.approved} disetujui · ${mod.rejected} ditolak.`],
      ["Masukan Terbuka", openSuggestions, "Masukan yang masih perlu ditinjau."],
      ["Peringatan Keamanan", warningAudit, auditCloudAvailable ? "Dihitung dari riwayat aktivitas." : "Aktif setelah migration audit diterapkan."]
    ];

    metrics.innerHTML = cards.map(([label, value, desc], idx) => `
      <article class="admin-pro-card cinematic-reveal" style="--stagger:${idx}">
        <span>${html(label)}</span>
        <strong>${html(value)}</strong>
        <small>${html(desc)}</small>
      </article>
    `).join("");

    const steps = [
      ["1", "Tinjau permintaan anggota", pendingAccess ? `${pendingAccess} permintaan menunggu keputusan.` : "Tidak ada permintaan baru.", canAdmin() ? "Periksa peran sebelum menyetujui." : "Memerlukan peran Admin."],
      ["2", "Periksa anggota dan peran", activeUsers ? `${activeUsers} anggota aktif.` : "Belum ada anggota aktif terbaca.", canAdmin() ? "Pastikan izin sesuai tanggung jawab." : "Panel anggota khusus Admin."],
      ["3", "Selesaikan moderasi", mod.pending ? `${mod.pending} data menunggu tinjauan.` : "Tidak ada data yang menunggu.", canModerate() ? "Setujui atau tolak dengan catatan yang jelas." : "Memerlukan peran QA atau Admin."],
      ["4", "Tinjau riwayat aktivitas", auditRows.length ? `${auditRows.length} aktivitas terbaru tersedia.` : "Belum ada riwayat yang terbaca.", canAdmin() ? "Periksa perubahan akses dan tindakan penting." : "Riwayat workspace khusus Admin."]
    ];

    workflow.innerHTML = steps.map(([num, title, desc, action], idx) => `
      <article class="admin-workflow-card cinematic-reveal" style="--stagger:${idx}">
        <i>${html(num)}</i>
        <div><strong>${html(title)}</strong><p>${html(desc)}</p><small>${html(action)}</small></div>
      </article>
    `).join("");
  }

  async function bulkApprovePendingMembers() {
    if (!supabaseClient || !canAdmin() || !currentWorkspace) return showMessage("Butuh role Admin Workspace.", "error");
    if (!pendingMemberRows.length) return showMessage("Tidak ada request pending untuk disetujui.", "info");
    if (!confirm(`Setujui ${pendingMemberRows.length} request akses pending?`)) return;
    try {
      await prepareCloudWrite("Bulk approve member");
      const userIds = pendingMemberRows.map(row => row.user_id).filter(Boolean);
      const { error } = await withTimeout(
        supabaseClient
          .from("workspace_members")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("workspace_id", currentWorkspace.id)
          .in("user_id", userIds)
          .eq("status", "pending"),
        CLOUD_WRITE_TIMEOUT_MS,
        "Bulk approve member"
      );
      if (error) throw error;
      await loadMemberRequests();
      await loadWorkspaceMembers();
      renderAdminProDashboard();
      showMessage(`${userIds.length} request akses disetujui.`, "success");
    } catch (err) {
      showMessage(`Bulk approve gagal: ${err.message || err}`, "error");
    }
  }

  async function bulkModerateVisibleRows(action) {
    const table = $("moderationDataset")?.value || "brew_logs";
    if (!supabaseClient || !canModerate() || !currentWorkspace) return showMessage("Butuh role QA/Admin.", "error");
    if (!canWriteModerationDataset(table)) return showMessage("Bulk moderation stok hanya untuk Admin Workspace.", "error");
    const rows = moderationRows.filter(row => row.id);
    if (!rows.length) return showMessage("Tidak ada data pada tampilan moderasi saat ini.", "info");
    const label = action === "approve" ? "setujui" : "tolak";
    const notes = action === "reject"
      ? prompt(`Catatan untuk menolak ${rows.length} data:`, "Data perlu dicek ulang.")
      : "Disetujui lewat bulk moderation";
    if (action === "reject" && notes === null) return;
    if (!confirm(`Yakin ${label} ${rows.length} data yang sedang tampil?`)) return;

    try {
      await prepareCloudWrite("Bulk moderation");
      let count = 0;
      for (const row of rows) {
        const payload = {
          moderation_status: action === "approve" ? "approved" : "rejected",
          moderation_notes: notes || null,
          moderated_by: currentUser.id,
          moderated_at: new Date().toISOString()
        };
        if (table === "brew_logs") {
          payload.status = action === "approve" ? "published" : "rejected";
          if (action === "approve" && Number(row?.qa_final || 0) >= APPROVAL_THRESHOLD) {
            payload.manual_approval = "Yes";
            payload.approved_for_recipe = "Yes";
            payload.qa_status = "QA PASS";
          }
          if (action === "reject") {
            payload.manual_approval = "No";
            payload.approved_for_recipe = "No";
          }
        }
        if (table === "qa_scores") {
          payload.status = action === "approve" ? (Number(row?.final_qa || 0) >= APPROVAL_THRESHOLD ? "QA PASS" : "APPROVED") : "REJECTED";
        }
        const { error } = await withTimeout(
          supabaseClient
            .from(table)
            .update(payload)
            .eq("id", row.id)
            .eq("workspace_id", currentWorkspace.id),
          CLOUD_WRITE_TIMEOUT_MS,
          "Bulk moderation"
        );
        if (error) throw error;
        count += 1;
      }
      await syncFromCloud(true).catch(console.warn);
      await loadModerationRows();
      renderAdminProDashboard();
      showMessage(`${count} data berhasil di-${action === "approve" ? "setujui" : "tolak"}.`, "success");
    } catch (err) {
      showMessage(`Bulk moderation gagal: ${err.message || err}`, "error");
    }
  }

  async function bulkSuggestionStatus(status) {
    if (!supabaseClient || !canAdmin()) return showMessage("Butuh role Admin Workspace.", "error");
    const target = (suggestionRows || []).filter(row => {
      const current = String(row.status || "open").toLowerCase();
      return status === "reviewed" ? current === "open" : current === "reviewed";
    });
    if (!target.length) return showMessage("Tidak ada masukan yang cocok untuk aksi ini.", "info");
    if (!confirm(`${status === "closed" ? "Tutup" : "Tandai reviewed"} ${target.length} masukan?`)) return;
    try {
      await prepareCloudWrite("Bulk suggestion update");
      const { error } = await withTimeout(
        supabaseClient
          .from("suggestions")
          .update({ status })
          .in("id", target.map(row => row.id)),
        CLOUD_WRITE_TIMEOUT_MS,
        "Bulk suggestion update"
      );
      if (error) throw error;
      await loadSuggestionRows();
      renderAdminProDashboard();
      showMessage(`${target.length} masukan berhasil diperbarui.`, "success");
    } catch (err) {
      showMessage(`Bulk masukan gagal: ${err.message || err}`, "error");
    }
  }

  function auditActionLabel(action) {
    const labels = {
      "auth.login": "Masuk ke dashboard",
      "auth.logout": "Keluar dari dashboard",
      "security.session_refreshed": "Sesi diperbarui",
      "member.requested": "Permintaan akses dibuat",
      "member.added": "Anggota ditambahkan",
      "member.removed": "Anggota dilepas",
      "member.role_changed": "Peran anggota diubah",
      "member.status_changed": "Status anggota diubah",
      "workspace.created": "Workspace dibuat",
      "workspace.updated": "Workspace diperbarui",
      "workspace.status_changed": "Status workspace diubah",
      "workspace.deleted": "Workspace dihapus",
      "moderation.status_changed": "Status moderasi diubah",
      "stock.created": "Stok ditambahkan",
      "stock.updated": "Stok diperbarui",
      "stock.deleted": "Stok dihapus",
      "stock.consumed": "Stok digunakan",
      "brew.saved": "Log seduhan disimpan",
      "qa.saved": "Evaluasi QA disimpan"
    };
    return labels[String(action || "")] || String(action || "Aktivitas sistem").replaceAll(".", " · ");
  }

  function auditCategoryLabel(category) {
    return ({
      auth: "Autentikasi", access: "Akses", workspace: "Workspace", moderation: "Moderasi",
      stock: "Stok", brew: "Seduhan", qa: "QA", suggestion: "Masukan",
      security: "Keamanan", system: "Sistem"
    }[String(category || "").toLowerCase()] || category || "Sistem");
  }

  function auditOutcomeLabel(outcome) {
    return ({ success: "Berhasil", failure: "Gagal", blocked: "Diblokir", info: "Informasi" }[String(outcome || "").toLowerCase()] || outcome || "-");
  }

  function formatAuditTime(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function filteredAuditRows() {
    const category = $("auditCategoryFilter")?.value || "all";
    const severity = $("auditSeverityFilter")?.value || "all";
    const days = Number($("auditPeriodFilter")?.value || 0);
    const floor = days ? Date.now() - days * 86400000 : 0;
    return (auditRows || []).filter(row => {
      if (category !== "all" && row.category !== category) return false;
      if (severity !== "all" && row.severity !== severity) return false;
      if (floor && new Date(row.created_at || 0).getTime() < floor) return false;
      return true;
    });
  }

  function renderPermissionMatrix() {
    const tbody = $("permissionMatrixTable")?.querySelector("tbody");
    if (!tbody) return;
    const rows = SECURITY_SERVICE?.permissionRows?.() || [];
    if (!rows.length) {
      tbody.innerHTML = emptyRow(5, "Matriks izin belum tersedia", "Service keamanan belum dimuat.", "i");
      return;
    }
    const marker = value => value
      ? '<span class="permission-marker allowed" aria-label="Diizinkan">Ya</span>'
      : '<span class="permission-marker denied" aria-label="Tidak diizinkan">Tidak</span>';
    tbody.innerHTML = rows.map(row => `<tr>
      <td><strong>${html(row.label)}</strong></td>
      <td>${marker(row.guest)}</td>
      <td>${marker(row.brewer)}</td>
      <td>${marker(row.qa)}</td>
      <td>${marker(row.admin)}</td>
    </tr>`).join("");
  }

  function renderSecurityOverview() {
    const session = SECURITY_SERVICE?.sessionSummary?.({
      user: currentUser,
      role: currentRole,
      workspace: currentWorkspace,
      cloudReady,
      lastSync: cloudLastSync
    }) || {};
    const posture = SECURITY_SERVICE?.posture?.({
      role: currentRole,
      workspace: currentWorkspace,
      members: workspaceMemberRows,
      auditAvailable: auditCloudAvailable,
      cloudReady
    }) || { score: 0, checks: [] };

    if ($("securityScoreMetric")) $("securityScoreMetric").textContent = posture.score || 0;
    if ($("securityScoreRing")) $("securityScoreRing").style.setProperty("--security-score", `${posture.score || 0}%`);
    if ($("securityScoreHint")) {
      $("securityScoreHint").textContent = !currentUser
        ? "Masuk untuk memeriksa sesi dan akses workspace."
        : posture.score >= 80
          ? "Kontrol utama aktif. Tetap tinjau riwayat perubahan secara berkala."
          : "Masih ada kontrol yang perlu diselesaikan sebelum workspace siap digunakan bersama tim.";
    }

    const sessionList = $("securitySessionList");
    if (sessionList) {
      const values = [
        ["Akun", session.email || "-"],
        ["Peran", session.roleLabel || roleDisplayLabel(currentRole)],
        ["Workspace", session.workspace || "-"],
        ["Supabase", session.cloudReady ? "Terhubung" : "Belum terhubung"],
        ["Masuk Terakhir", session.lastSignIn ? formatAuditTime(session.lastSignIn) : "-"],
        ["Sinkron Terakhir", session.lastSync ? formatAuditTime(session.lastSync) : "-"]
      ];
      sessionList.innerHTML = values.map(([label, value]) => `<div><dt>${html(label)}</dt><dd>${html(value)}</dd></div>`).join("");
    }

    const checkList = $("securityCheckList");
    if (checkList) {
      checkList.innerHTML = (posture.checks || []).map(item => `<article class="security-check-item ${item.ok ? "is-ok" : "needs-action"}">
        <span aria-hidden="true">${item.ok ? "✓" : "!"}</span>
        <div><strong>${html(item.label)}</strong><small>${html(item.detail)}</small></div>
      </article>`).join("");
    }
  }

  function renderAuditTrail(message = "") {
    const tbody = $("auditTrailTable")?.querySelector("tbody");
    const notice = $("auditAvailabilityNotice");
    if (!tbody) return;
    if (!currentUser || !canAdmin()) {
      tbody.innerHTML = emptyRow(6, "Riwayat khusus Admin Workspace", "Masuk sebagai admin untuk melihat aktivitas workspace.", "🔒");
      if (notice) notice.innerHTML = '<span class="status-pill pending">Akses terbatas</span><p>Riwayat workspace hanya dapat dibaca oleh Admin.</p>';
      return;
    }
    if (auditLoading) {
      tbody.innerHTML = emptyRow(6, "Memuat riwayat aktivitas", "Mengambil catatan terbaru dari Supabase.", "…");
      return;
    }
    if (message) {
      tbody.innerHTML = emptyRow(6, "Riwayat aktivitas", message, "i");
      return;
    }

    const rows = filteredAuditRows();
    if (notice) {
      notice.innerHTML = auditCloudAvailable
        ? '<span class="status-pill approved">Audit Supabase aktif</span><p>Riwayat tersimpan sebagai data append-only dan dilindungi RLS.</p>'
        : `<span class="status-pill pending">Fallback lokal</span><p>${html(auditLastError?.message || "Jalankan migration_v42_security_audit_rls.sql agar riwayat tersimpan di Supabase.")}</p>`;
    }
    if (!rows.length) {
      tbody.innerHTML = emptyRow(6, "Belum ada aktivitas pada filter ini", "Ubah periode atau kategori, lalu perbarui riwayat.", "◇");
      return;
    }
    tbody.innerHTML = rows.map(row => {
      const actor = row.actor_email || (row.actor_id === currentUser?.id ? currentUser.email : row.actor_id) || "Sistem";
      const sourceLabel = row.source === "local" ? "Browser" : "Supabase";
      return `<tr>
        <td><strong>${html(formatAuditTime(row.created_at))}</strong></td>
        <td><small>${html(actor)}</small></td>
        <td><strong>${html(auditActionLabel(row.action))}</strong>${row.message ? `<br><small>${html(row.message)}</small>` : ""}</td>
        <td><span class="audit-category-pill ${html(row.category)}">${html(auditCategoryLabel(row.category))}</span></td>
        <td><span class="audit-outcome-pill ${html(row.outcome)} ${html(row.severity)}">${html(auditOutcomeLabel(row.outcome))}</span></td>
        <td><small>${html(sourceLabel)}</small></td>
      </tr>`;
    }).join("");
  }

  async function loadAuditTrail() {
    if (!AUDIT_SERVICE || !currentUser || !currentWorkspace || !canAdmin()) {
      auditRows = [];
      auditCloudAvailable = false;
      auditLastError = null;
      renderAuditTrail();
      renderSecurityOverview();
      return;
    }
    auditLoading = true;
    renderAuditTrail();
    const result = await AUDIT_SERVICE.list({ client: supabaseClient, workspaceId: currentWorkspace.id, limit: 250 });
    auditRows = result.rows || [];
    auditCloudAvailable = Boolean(result.cloudAvailable);
    auditLoadedWorkspaceId = currentWorkspace.id;
    auditLastError = result.error || null;
    auditLoading = false;
    renderAuditTrail();
    renderSecurityOverview();
  }

  async function refreshSecuritySession() {
    const button = $("refreshSecuritySessionBtn");
    const original = button?.textContent || "Perbarui Sesi";
    if (button) { button.disabled = true; button.textContent = "Memeriksa..."; }
    try {
      if (!currentUser || !supabaseClient) {
        showMessage("Masuk terlebih dahulu untuk memeriksa sesi.", "info");
        return;
      }
      await refreshCurrentSession("Pemeriksaan sesi keamanan");
      await loadWorkspaces().catch(console.warn);
      if (canAdmin()) await loadWorkspaceMembers().catch(console.warn);
      await recordAuditEvent("security.session_refreshed", {
        category: "security", entityType: "session", entityId: currentUser.id,
        message: "Sesi pengguna diperbarui dari panel keamanan."
      });
      await loadAuditTrail();
      renderAuthUI();
      renderSecurityOverview();
      showMessage("Sesi dan akses berhasil diperbarui.", "success");
    } catch (error) {
      showMessage(`Pemeriksaan sesi gagal: ${error.message || error}`, "error");
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  }

  function bindSecurityAuditPolish() {
    if (document.body?.dataset.securityAuditReady === "true") return;
    if (document.body) document.body.dataset.securityAuditReady = "true";
    $("refreshSecuritySessionBtn")?.addEventListener("click", refreshSecuritySession);
    $("refreshAuditTrail")?.addEventListener("click", loadAuditTrail);
    ["auditCategoryFilter", "auditSeverityFilter", "auditPeriodFilter"].forEach(id => $(id)?.addEventListener("change", renderAuditTrail));
    bindAuditEventCapture();
  }

  function renderSecurityAuditModule() {
    renderPermissionMatrix();
    renderSecurityOverview();
    renderAuditTrail();
    if (currentUser && currentWorkspace && canAdmin() && !auditLoading && auditLoadedWorkspaceId !== currentWorkspace.id) loadAuditTrail().catch(console.warn);
  }

  function reportRows(scope = $("reportScope")?.value || "workspace") {
    const publicRows = typeof publicApprovedRows === "function" ? publicApprovedRows() : [];
    const workspaceRows = allBrewLogs() || [];
    const qaRows = allQA() || [];
    const stockRows = workspaceStock() || [];
    if (scope === "public") return { brew: publicRows, qa: [], stock: [], public: publicRows };
    if (scope === "all") {
      const seen = new Set();
      const brew = [...workspaceRows, ...publicRows].filter(row => {
        const key = String(row.CloudID || row.BrewID || `${row.BeanName}|${row.Date}|${row.BrewerName}`);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { brew, qa: qaRows, stock: stockRows, public: publicRows };
    }
    return { brew: workspaceRows, qa: qaRows, stock: stockRows, public: publicRows };
  }

  function csvEscape(value) {
    return DATA_SAFETY?.csvCell ? DATA_SAFETY.csvCell(value) : html(value);
  }

  function rowsToCsv(rows = [], preferredColumns = []) {
    const columns = preferredColumns.length
      ? preferredColumns
      : uniq(rows.flatMap(row => Object.keys(row || {}))).filter(key => !key.startsWith("__"));
    const header = columns.map(csvEscape).join(",");
    const body = rows.map(row => columns.map(col => csvEscape(row?.[col])).join(",")).join("\n");
    return `\uFEFF${header}\n${body}`;
  }

  function downloadTextFile(filename, content, mime = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportRowsCsv(filename, rows, preferredColumns = []) {
    if (!rows?.length) {
      showMessage("Tidak ada data untuk diexport.", "info");
      return false;
    }
    downloadTextFile(filename, rowsToCsv(rows, preferredColumns), "text/csv;charset=utf-8");
    showMessage(`${filename} berhasil dibuat.`, "success");
    return true;
  }

  function libraryExportRows() {
    const dataset = $("reportLibraryDataset")?.value || "varieties";
    return { dataset, rows: DATA[dataset] || [] };
  }

  function reportMetricData() {
    const scope = $("reportScope")?.value || "workspace";
    const rows = reportRows(scope);
    const qaValues = rows.brew.map(row => Number(row.QA_Final || 0)).filter(Boolean);
    const avgQA = qaValues.length ? avg(qaValues) : 0;
    const best = rows.brew.slice().sort((a, b) => Number(b.QA_Final || 0) - Number(a.QA_Final || 0))[0];
    const history = analyticsBaseRows().filter(log => log.AnalyticsSource === "workspace");
    const analytics = ANALYTICS_SERVICE?.summarize
      ? ANALYTICS_SERVICE.summarize(rows.brew, rows.stock, history)
      : analyticsSummary(rows.brew);
    return { scope, rows, avgQA, best, analytics };
  }

  function renderReportPreview() {
    const grid = $("reportPreviewGrid");
    const sample = $("reportSampleCard");
    if (!grid || !sample) return;
    const { scope, rows, avgQA, best, analytics } = reportMetricData();
    const lib = libraryExportRows();
    const cards = [
      ["Scope", scope === "all" ? "Semua data" : scope === "public" ? "Publik" : "Workspace", "Data yang dipakai untuk report."],
      ["Brew Rows", rows.brew.length, "Jumlah brew log yang siap diexport."],
      ["QA Rows", rows.qa.length, "Jumlah QA score di workspace aktif."],
      ["Stock Rows", rows.stock.length, "Jumlah stok kopi workspace aktif."],
      ["Avg QA", avgQA ? fmt(avgQA, 2) : "-", "Rata-rata QA pada scope aktif."],
      ["Cost / Cup", analytics.averageCost ? fmtCurrency(analytics.averageCost) : "-", `Cakupan biaya ${Math.round(analytics.costCoverage || 0)}%.`],
      ["Coffee Used", analytics.totalCoffeeG ? `${fmt(analytics.totalCoffeeG)}g` : "-", "Pemakaian biji yang terhubung stok."],
      ["Library", `${lib.rows.length} rows`, `Dataset: ${libraryDatasetLabel ? libraryDatasetLabel(lib.dataset) : lib.dataset}`]
    ];
    grid.innerHTML = cards.map(([label, value, desc], idx) => `
      <article class="report-preview-card cinematic-reveal" style="--stagger:${idx}">
        <span>${html(label)}</span>
        <strong>${html(value)}</strong>
        <small>${html(desc)}</small>
      </article>
    `).join("");
    sample.innerHTML = `
      <div>
        <span class="mini-label">Report Preview</span>
        <h3>${html(best ? `Best Cup: ${best.BeanName || best.BrewID || "Tanpa nama"}` : "Belum ada best cup")}</h3>
        <p>${html(best ? `QA ${fmt(best.QA_Final, 2)} · ${[uniq([best.Variety, best.Variety2_optional, best.Variety3_optional].flatMap(splitVarietyLabel)).join(" / ") || best.Variety, best.Process, best.RoastProfile].filter(Boolean).join(" · ") || "profil belum lengkap"} · ${best.Method || "-"} · ${best.Dripper || "-"}` : "Tambahkan brew log dan QA untuk membuat report analytics yang lebih lengkap.")}</p>
      </div>
      <button class="secondary" type="button" data-report-action="analytics-html">Download Analytics Report</button>
    `;
  }

  function reportHtmlDocument() {
    const { scope, rows, avgQA, best, analytics } = reportMetricData();
    const top = rows.brew.slice().sort((a, b) => Number(b.QA_Final || 0) - Number(a.QA_Final || 0)).slice(0, 12);
    const costByKey = new Map((analytics.enriched || []).map(log => [String(log.CloudID || log.BrewID || `${log.BeanName}|${log.Date}`), log]));
    const drippers = groupAnalytics ? groupAnalytics(rows.brew, "Dripper").slice(0, 6) : [];
    const processes = groupAnalytics ? groupAnalytics(rows.brew, "Process").slice(0, 6) : [];
    const insightRows = analyticsInsights ? analyticsInsights(rows.brew) : [];
    const escapeReportHtml = DATA_SAFETY?.escapeHtml || html;
    const tr = arr => arr.map(item => `<tr>${item.map(value => `<td>${escapeReportHtml(value)}</td>`).join("")}</tr>`).join("");
    return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Lestari Coffee Dashboard Analytics Report</title>
<style>
body{font-family:Inter,Arial,sans-serif;margin:40px;color:#3d2a24;background:#fffaf4}h1{font-size:44px;margin:0 0 6px}h2{margin-top:34px}.meta{color:#7a655c}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}.card{padding:16px;border:1px solid #eadbd0;border-radius:18px;background:#fff}strong{display:block;font-size:22px}table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden}td,th{padding:10px;border-bottom:1px solid #eee0d5;text-align:left;font-size:13px}th{background:#4b2e2b;color:#fff}.insight{padding:14px;border:1px solid #eadbd0;border-radius:16px;background:#fff;margin:10px 0}@media print{body{margin:20px}.no-print{display:none}}
</style>
</head>
<body>
<h1>Lestari Coffee Dashboard Report</h1>
<p class="meta">Generated ${escapeReportHtml(new Date().toLocaleString())} · Scope: ${escapeReportHtml(scope)}</p>
<div class="cards">
<div class="card"><span>Total Brew</span><strong>${rows.brew.length}</strong></div>
<div class="card"><span>Avg QA</span><strong>${avgQA ? fmt(avgQA,2) : "-"}</strong></div>
<div class="card"><span>Best Cup</span><strong>${escapeReportHtml(best ? (best.BeanName || best.BrewID || "-") : "-")}</strong></div>
<div class="card"><span>Cost / Cup</span><strong>${analytics.averageCost ? fmtCurrency(analytics.averageCost) : "-"}</strong></div>
<div class="card"><span>Coffee Used</span><strong>${analytics.totalCoffeeG ? `${fmt(analytics.totalCoffeeG)}g` : "-"}</strong></div>
<div class="card"><span>Total Bean Cost</span><strong>${analytics.totalCost ? fmtCurrency(analytics.totalCost) : "-"}</strong></div>
</div>
<h2>Insights</h2>
${insightRows.map(i => `<div class="insight"><strong>${escapeReportHtml(i.title)}</strong><p>${escapeReportHtml(i.text)}</p></div>`).join("") || "<p>Belum ada insight.</p>"}
<h2>Top Recipes</h2>
<table><thead><tr><th>Kopi</th><th>Profil</th><th>Metode</th><th>Resep</th><th>Biaya Biji</th><th>QA</th></tr></thead><tbody>${tr(top.map(log => { const cost = costByKey.get(String(log.CloudID || log.BrewID || `${log.BeanName}|${log.Date}`)); return [log.BeanName || log.BrewID || "-", [log.Variety, log.Process, log.RoastProfile].filter(Boolean).join(" · "), log.Method || "-", [log.Dripper, log.Grinder, log.GrindSetting, log.Temp_C ? `${log.Temp_C}°C` : "", log.Ratio ? `1:${log.Ratio}` : ""].filter(Boolean).join(" · "), cost?.AnalyticsCostKnown ? fmtCurrency(cost.AnalyticsCost) : "-", fmt(log.QA_Final,2)]; }))}</tbody></table>
<h2>Top Dripper</h2>
<table><thead><tr><th>Dripper</th><th>Avg QA</th><th>Count</th><th>Best</th></tr></thead><tbody>${tr(drippers.map(g => [g.key, fmt(g.avgQA,2), g.count, fmt(g.bestQA,2)]))}</tbody></table>
<h2>Top Process</h2>
<table><thead><tr><th>Process</th><th>Avg QA</th><th>Count</th><th>Best</th></tr></thead><tbody>${tr(processes.map(g => [g.key, fmt(g.avgQA,2), g.count, fmt(g.bestQA,2)]))}</tbody></table>
</body>
</html>`;
  }

  function printRecipeCard() {
    const brew = computeBrew();
    if (!brew) {
      showMessage("Rekomendasi seduh belum siap.", "error");
      return false;
    }
    const escapeRecipeHtml = DATA_SAFETY?.escapeHtml || html;
    const htmlDoc = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Recipe Card</title><style>
body{font-family:Inter,Arial,sans-serif;background:#f8efe3;color:#3d2a24;margin:0;padding:40px}.card{max-width:720px;margin:auto;padding:34px;border-radius:32px;background:#fffaf4;border:1px solid #e7d5c5;box-shadow:0 22px 60px rgba(61,42,36,.16)}h1{font-size:40px;margin:0 0 8px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}.box{padding:16px;border-radius:18px;background:#f2e5d8}.box span{font-size:11px;text-transform:uppercase;font-weight:900;color:#8a7165}.box strong{display:block;margin-top:8px;font-size:22px}.note{line-height:1.65}@media print{body{background:#fff}.card{box-shadow:none}}</style></head><body><div class="card">
<p><b>Lestari Coffee Dashboard · Recipe Card</b></p><h1>${escapeRecipeHtml(brew.intent?.label || "Recommended Brew")}</h1>
<p>${escapeRecipeHtml(brew.variety?.Variety || $("brewVariety")?.value || "-")} · ${escapeRecipeHtml(brew.process?.Process || $("brewProcess")?.value || "-")} · ${escapeRecipeHtml(brew.roast?.RoastProfile || $("brewRoast")?.value || "-")}</p>
<div class="grid">
<div class="box"><span>Temp</span><strong>${escapeRecipeHtml(brew.temp)}°C</strong></div><div class="box"><span>Ratio</span><strong>1:${escapeRecipeHtml(fmt(brew.ratio,1))}</strong></div><div class="box"><span>Water</span><strong>${escapeRecipeHtml(brew.totalWater)}ml</strong></div>
<div class="box"><span>Grind</span><strong>${escapeRecipeHtml(brew.grindTarget)}µm</strong></div><div class="box"><span>Time</span><strong>${escapeRecipeHtml(fmtTime(brew.brewTime))}</strong></div><div class="box"><span>Dripper</span><strong>${escapeRecipeHtml(brew.dripper?.DripperName || "-")}</strong></div>
</div><p class="note">${brew.risk >= 4 ? "Ferment tinggi: gunakan agitasi rendah dan hindari swirl agresif." : "Gunakan sebagai baseline dan ubah satu variabel per eksperimen."}</p>
</div><script>window.print()</script></body></html>`;
    const win = window.open("", "_blank");
    if (!win) {
      showMessage("Popup diblokir browser. Izinkan popup untuk print recipe card.", "error");
      return false;
    }
    win.document.write(htmlDoc);
    win.document.close();
    return true;
  }

  function setReportGenerationStatus(state = "ready", message = "Siap membuat file") {
    const target = $("reportGenerationStatus");
    if (!target) return;
    target.dataset.state = state;
    target.textContent = message;
  }

  function reportActionLabel(action) {
    return ({
      "brew-csv": "CSV Log Seduh",
      "qa-csv": "CSV QA",
      "stock-csv": "CSV Stok",
      "public-csv": "CSV Publik",
      "library-csv": "CSV Pustaka",
      "analytics-html": "Laporan HTML",
      "recipe-print": "Kartu Resep",
      "json-backup": "Backup JSON"
    })[action] || "file";
  }

  async function handleReportAction(action) {
    const label = reportActionLabel(action);
    const actionButtons = Array.from(document.querySelectorAll(`[data-report-action="${CSS.escape(action)}"]`));
    actionButtons.forEach(button => {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    });
    setReportGenerationStatus("generating", `Membuat ${label}…`);
    try {
      const { rows } = reportMetricData();
      const date = todayISO();
      let created = null;
      if (action === "brew-csv") created = exportRowsCsv(`coffee-brew-log-${date}.csv`, rows.brew);
      else if (action === "qa-csv") created = exportRowsCsv(`coffee-qa-scores-${date}.csv`, rows.qa);
      else if (action === "stock-csv") created = exportRowsCsv(`coffee-stock-beans-${date}.csv`, rows.stock);
      else if (action === "public-csv") created = exportRowsCsv(`coffee-public-brews-${date}.csv`, rows.public);
      else if (action === "library-csv") {
        const lib = libraryExportRows();
        created = exportRowsCsv(`coffee-library-${lib.dataset}-${date}.csv`, lib.rows);
      } else if (action === "analytics-html") {
        downloadTextFile(`coffee-analytics-report-${date}.html`, reportHtmlDocument(), "text/html;charset=utf-8");
        showMessage("Analytics HTML report berhasil dibuat.", "success");
        created = true;
      } else if (action === "recipe-print") created = printRecipeCard();
      else if (action === "json-backup") created = await exportJson();
      else throw new Error("Format laporan tidak dikenal.");

      if (created === false) {
        const emptyCsv = action.endsWith("-csv");
        setReportGenerationStatus(emptyCsv ? "ready" : "failed", emptyCsv
          ? `${label} belum dibuat · data tidak tersedia`
          : `${label} gagal disiapkan`);
        return false;
      }
      setReportGenerationStatus("success", `${label} berhasil disiapkan`);
      return true;
    } catch (error) {
      console.error("report generation failed", error);
      setReportGenerationStatus("failed", `${label} gagal dibuat`);
      showMessage(`Gagal membuat ${label}: ${error.message || error}`, "error");
      return false;
    } finally {
      actionButtons.forEach(button => {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      });
    }
  }

  
  function updateNotificationSummary() {
    const rawIssues = qualityIssuesRaw();
    updateNotificationSummaryFromIssues(qualityFilteredIssues(rawIssues), rawIssues);
  }


  
  function setSidebarOpen(open) {
    if (window.LESTARI_UI?.setDrawerOpen) {
      window.LESTARI_UI.setDrawerOpen(Boolean(open));
      return;
    }
    document.body?.classList.toggle("sidebar-open", Boolean(open));
    const toggle = $("sidebarToggleBtn");
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function bindSidebarDrawer() {
    if (document.body?.dataset.sidebarDrawerReady === "true") return;
    if (document.body) document.body.dataset.sidebarDrawerReady = "true";
    if (!window.LESTARI_UI) {
      $("sidebarToggleBtn")?.addEventListener("click", () => setSidebarOpen(!document.body.classList.contains("sidebar-open")));
      $("sidebarCloseBtn")?.addEventListener("click", () => setSidebarOpen(false));
      $("sidebarBackdrop")?.addEventListener("click", () => setSidebarOpen(false));
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") setSidebarOpen(false);
      });
    }
    document.querySelectorAll(".sidebar-nav .tab-btn, .sidebar-footer-card button").forEach(btn => {
      btn.addEventListener("click", () => {
        if (window.matchMedia?.("(max-width: 1220px)").matches) setSidebarOpen(false);
      });
    });
  }


  
  let deferredInstallPrompt = null;

  function updateSystemStatus() {
    const online = navigator.onLine;
    document.documentElement.classList.toggle("is-offline", !online);
    document.body?.classList.toggle("is-offline", !online);
    if ($("systemOnlineStatus")) {
      $("systemOnlineStatus").textContent = online ? "Online" : "Offline";
      $("systemOnlineStatus").classList.toggle("is-offline", !online);
    }
    if ($("systemCacheStatus")) {
      const supported = "serviceWorker" in navigator;
      $("systemCacheStatus").textContent = supported ? "PWA Ready" : "Browser Cache";
    }
    if ($("systemDataStatus")) {
      const total = (DATA.varieties?.length || 0) + (DATA.processes?.length || 0) + (DATA.drippers?.length || 0) + (DATA.filters?.length || 0) + (DATA.roasts?.length || 0) + (DATA.waters?.length || 0) + (DATA.grinders?.length || 0);
      $("systemDataStatus").textContent = document.body?.classList.contains("demo-mode-active") ? "Demo Active" : `${total} Data`;
    }
  }

  function initPWAExperience() {
    updateSystemStatus();
    window.addEventListener("online", updateSystemStatus);
    window.addEventListener("offline", updateSystemStatus);

    const installBtn = $("installAppBtn");
    window.addEventListener("beforeinstallprompt", event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      installBtn?.classList.remove("hidden");
    });

    installBtn?.addEventListener("click", async () => {
      if (!deferredInstallPrompt) {
        showMessage("Install app tersedia di browser yang mendukung PWA. Gunakan menu browser: Add to Home Screen / Install App.", "info");
        return;
      }
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice.catch(() => null);
      deferredInstallPrompt = null;
      installBtn.classList.add("hidden");
    });

    if (APP_CONFIG.features?.pwa !== false && "serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register(new URL("sw.js", document.baseURI).href)
        .then(registration => {
          if ($("systemCacheStatus")) $("systemCacheStatus").textContent = "Cached";
          registration.update().catch(() => null);
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                showMessage("Pembaruan dashboard sudah siap. Muat ulang halaman untuk memakai versi terbaru.", "info");
              }
            });
          });
        })
        .catch(() => {
          if ($("systemCacheStatus")) $("systemCacheStatus").textContent = "Cache Off";
        });
    }
  }


  
  const ONBOARDING_KEY = "coffee_brew_os_onboarding_v30_7";
  const ONBOARDING_STEPS = ["welcome", "guide", "brew", "input", "public"];

  function readOnboardingState() {
    try {
      const parsed = SAFE_STORAGE.readJSON(ONBOARDING_KEY, {});
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeOnboardingState(next) {
    SAFE_STORAGE.writeJSON(ONBOARDING_KEY, next);
  }

  function markOnboardingStep(step) {
    if (!ONBOARDING_STEPS.includes(step)) return;
    const state = readOnboardingState();
    if (state[step]) return;
    state[step] = true;
    writeOnboardingState(state);
    renderOnboardingCoach();
  }

  function tabToOnboardingStep(tab) {
    if (tab === "guide") return "guide";
    if (tab === "brew") return "brew";
    if (tab === "input-seduhan") return "input";
    if (tab === "public-brews") return "public";
    return "";
  }

  function renderOnboardingCoach() {
    const state = readOnboardingState();
    const done = ONBOARDING_STEPS.filter(step => state[step]).length;
    const pct = Math.round((done / ONBOARDING_STEPS.length) * 100);
    if ($("onboardingProgressText")) $("onboardingProgressText").textContent = `${pct}%`;
    if ($("onboardingProgressBar")) $("onboardingProgressBar").style.width = `${pct}%`;
    document.querySelectorAll(".onboarding-list li").forEach(item => {
      item.classList.toggle("is-done", Boolean(state[item.dataset.step]));
    });
  }

  function setOnboardingOpen(open) {
    const coach = $("onboardingCoach");
    if (!coach) return;
    coach.dataset.open = open ? "true" : "false";
    $("onboardingToggle")?.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function bindOnboardingCoach() {
    if (document.body?.dataset.onboardingReady === "true") return;
    if (document.body) document.body.dataset.onboardingReady = "true";

    $("onboardingToggle")?.addEventListener("click", () => {
      setOnboardingOpen($("onboardingCoach")?.dataset.open !== "true");
    });
    $("onboardingClose")?.addEventListener("click", () => setOnboardingOpen(false));
    $("onboardingReset")?.addEventListener("click", () => {
      SAFE_STORAGE.remove(ONBOARDING_KEY);
      renderOnboardingCoach();
      showMessage("Checklist Quick Start sudah direset.", "info");
    });
    document.querySelectorAll("[data-onboard-action='welcome']").forEach(btn => {
      btn.addEventListener("click", () => {
        $("welcomeScreen")?.classList.remove("is-hidden");
        setOnboardingOpen(false);
      });
    });

    renderOnboardingCoach();
  }


  
  function selectOptionContaining(selectId, terms = []) {
    const select = $(selectId);
    if (!select) return false;
    const normalizedTerms = terms.map(term => String(term).toLowerCase());
    const option = Array.from(select.options || []).find(opt => {
      const text = `${opt.value || ""} ${opt.textContent || ""}`.toLowerCase();
      return normalizedTerms.every(term => text.includes(term));
    }) || Array.from(select.options || []).find(opt => {
      const text = `${opt.value || ""} ${opt.textContent || ""}`.toLowerCase();
      return normalizedTerms.some(term => text.includes(term));
    });
    if (!option) return false;
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function applySoloDemoRecipe() {
    document.body?.classList.add("demo-mode-active");
    SAFE_STORAGE.set("coffee_demo_recipe_v30_8", "solo");

    showTab("brew");
    setTimeout(() => {
      selectOptionContaining("brewDripper", ["solo"]);
      selectOptionContaining("brewMode", ["hot"]);
      selectOptionContaining("brewVariety", ["typica"]);
      selectOptionContaining("brewProcess", ["washed"]);
      selectOptionContaining("brewRoast", ["light"]);
      selectOptionContaining("brewWater", ["cleo"]);
      selectOptionContaining("brewGrinder", ["timemore"]);
      const dose = $("brewDose");
      if (dose) {
        dose.value = "15";
        dose.dispatchEvent(new Event("input", { bubbles: true }));
        dose.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const beanName = $("brewBeanName");
      if (beanName) {
        beanName.value = "SOLO Demo · Clean Washed Baseline";
        beanName.dispatchEvent(new Event("input", { bubbles: true }));
      }
      renderBrew();
      markOnboardingStep("brew");
      showMessage("SOLO Demo aktif. Field rekomendasi sudah diarahkan ke baseline clean fast-flow.", "success");
    }, 120);
  }

  function bindDemoExperience() {
    if (document.body?.dataset.demoExperienceReady === "true") return;
    if (document.body) document.body.dataset.demoExperienceReady = "true";
    ["welcomeDemoBtn", "topbarDemoBtn", "homeDemoRecipeBtn", "brewDemoRecipeBtn", "guideDemoRecipeBtn"].forEach(id => {
      $(id)?.addEventListener("click", () => {
        enterExperience("guest");
        applySoloDemoRecipe();
      });
    });
  }


  
  function openSignupFlow() {
    document.body?.classList.add("experience-entered");
    document.body.dataset.accessMode = "login";
    document.body.classList.add("access-login");
    document.body.classList.remove("access-guest");
    $("welcomeScreen")?.classList.add("is-hidden");
    showTab("admin");

    setTimeout(() => {
      const details = $("signupDetails");
      if (details) details.open = true;
      $("authSignupShortcut")?.classList.remove("hidden");
      $("signupEmail")?.focus?.({ preventScroll: true });
      document.querySelector("#signupDetails")?.scrollIntoView({ block: "center", behavior: "smooth" });
      showMessage("Form daftar sudah dibuka. Isi data akun untuk melanjutkan.", "info");
    }, 160);
  }

  function openLoginFlow() {
    document.body?.classList.add("experience-entered");
    document.body.dataset.accessMode = "login";
    document.body.classList.add("access-login");
    document.body.classList.remove("access-guest");
    $("welcomeScreen")?.classList.add("is-hidden");
    showTab("admin");

    setTimeout(() => {
      $("authEmail")?.focus?.({ preventScroll: true });
      document.querySelector("#loginForm")?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 160);
  }

  function bindSignupLandingFlow() {
    if (document.body?.dataset.signupLandingReady === "true") return;
    if (document.body) document.body.dataset.signupLandingReady = "true";
    $("welcomeSignupBtn")?.addEventListener("click", openSignupFlow);
    $("topbarSignupBtn")?.addEventListener("click", openSignupFlow);
    $("openSignupDetailsBtn")?.addEventListener("click", openSignupFlow);
  }



  function updateNotificationSummaryFromIssues(issues = [], rawIssues = qualityIssuesRaw()) {
    const rawTotal = rawIssues.length;
    const critical = issues.filter(i => i.severity === "critical").length;
    const warning = issues.filter(i => i.severity === "warning").length;
    const info = issues.filter(i => i.severity === "info").length;
    const resolved = Math.max(0, rawTotal - issues.length);
    if ($("notifCriticalCount")) $("notifCriticalCount").textContent = critical;
    if ($("notifWarningCount")) $("notifWarningCount").textContent = warning;
    if ($("notifInfoCount")) $("notifInfoCount").textContent = info;
    if ($("notifResolvedCount")) $("notifResolvedCount").textContent = resolved || "—";
    const actionableCount = rawIssues.filter(issue => issue.severity === "critical" || issue.severity === "warning").length;
    if ($("topbarNotificationCount")) {
      $("topbarNotificationCount").textContent = actionableCount > 99 ? "99+" : String(actionableCount);
      setElementHidden($("topbarNotificationCount"), actionableCount === 0);
    }
    if ($("topbarNotificationBtn")) {
      $("topbarNotificationBtn").setAttribute("aria-label", actionableCount
        ? `Buka notifikasi, ${actionableCount} temuan kritis atau peringatan`
        : "Buka notifikasi, tidak ada temuan kritis atau peringatan");
    }
  }

  function syncNotificationQuickFilters() {
    const scope = $("qualityScope")?.value || "all";
    const severity = $("qualitySeverity")?.value || "all";
    document.querySelectorAll("[data-notif-scope]").forEach(btn => btn.classList.toggle("active", btn.dataset.notifScope === scope));
    document.querySelectorAll("[data-notif-filter]").forEach(btn => btn.classList.toggle("active", btn.dataset.notifFilter === severity));
  }

  function bindNotificationCenter() {
    if (document.body?.dataset.notificationCenterReady === "true") return;
    if (document.body) document.body.dataset.notificationCenterReady = "true";
    document.querySelectorAll("[data-notif-scope]").forEach(btn => {
      btn.addEventListener("click", () => {
        if ($("qualityScope")) $("qualityScope").value = btn.dataset.notifScope || "all";
        renderDataQuality();
      });
    });
    document.querySelectorAll("[data-notif-filter]").forEach(btn => {
      btn.addEventListener("click", () => {
        const filter = btn.dataset.notifFilter || "all";
        if ($("qualitySeverity")) $("qualitySeverity").value = filter;
        renderDataQuality();
      });
    });
  }



  function syncReportShortcutState() {
    const scope = $("reportScope")?.value || "workspace";
    document.querySelectorAll("[data-report-scope-shortcut]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.reportScopeShortcut === scope);
    });
  }

  function bindReportSuitePolish() {
    if (document.body?.dataset.reportSuiteReady === "true") return;
    if (document.body) document.body.dataset.reportSuiteReady = "true";

    document.querySelectorAll("[data-report-scope-shortcut]").forEach(btn => {
      btn.addEventListener("click", () => {
        if ($("reportScope")) $("reportScope").value = btn.dataset.reportScopeShortcut || "workspace";
        renderReportPreview();
        syncReportShortcutState();
        setReportGenerationStatus("ready", "Cakupan diperbarui · siap membuat file");
        showMessage(`Scope report diubah ke ${btn.textContent.trim()}.`, "info");
      });
    });
  }



  function renderAccountRoleStatus() {
    const loggedIn = Boolean(currentUser);
    const roleCtx = displayRoleContext();
    const status = roleCtx.status || (loggedIn ? "active" : "guest");
    const statusText = status === "pending" ? "Menunggu"
      : status === "rejected" ? "Ditolak"
      : status === "disabled" ? "Ditangguhkan"
      : status === "active" ? "Aktif"
      : "Tamu";

    if ($("adminModeMetric")) $("adminModeMetric").textContent = loggedIn ? "Login" : "Tamu";
    if ($("adminModeHint")) $("adminModeHint").textContent = loggedIn ? (currentUser.email || "User aktif") : "Masuk untuk membuka seluruh fitur.";
    if ($("adminRoleMetric")) $("adminRoleMetric").textContent = roleDisplayLabel(roleCtx.role || "guest");
    if ($("adminRoleHint")) $("adminRoleHint").textContent = loggedIn ? "Peran mengikuti workspace aktif." : "Peran tersedia setelah login.";
    if ($("adminWorkspaceMetric")) $("adminWorkspaceMetric").textContent = roleCtx.workspace || "-";
    if ($("adminWorkspaceHint")) $("adminWorkspaceHint").textContent = currentWorkspace?.slug || "Pilih atau buat workspace.";
    if ($("adminStatusMetric")) $("adminStatusMetric").textContent = statusText;
    if ($("adminStatusHint")) $("adminStatusHint").textContent = status === "pending" ? "Menunggu persetujuan admin."
      : status === "rejected" ? "Permintaan akses ditolak."
      : status === "disabled" ? "Akses sedang ditangguhkan."
      : status === "active" ? "Akses workspace aktif."
      : "Mode tamu aktif.";
  }

  function bindAccountRolePolish() {
    if (document.body?.dataset.accountRolePolishReady === "true") return;
    if (document.body) document.body.dataset.accountRolePolishReady = "true";

    $("adminQuickLoginBtn")?.addEventListener("click", () => {
      openLoginFlow();
    });
    $("adminQuickSignupBtn")?.addEventListener("click", () => {
      openSignupFlow();
    });
    $("adminQuickWorkspaceBtn")?.addEventListener("click", () => {
      document.querySelector("#workspacePanel")?.scrollIntoView({ block: "center", behavior: "smooth" });
      showMessage("Panel workspace ditampilkan.", "info");
    });
  }



  function ensureCriticalUiState() {
    document.querySelectorAll(".tab-panel").forEach(panel => {
      const active = panel.classList.contains("active");
      panel.setAttribute("aria-hidden", active ? "false" : "true");
    });
    if (typeof syncCustomProcessFields === "function") syncCustomProcessFields();
    if (typeof syncRouteHint === "function") syncRouteHint(document.querySelector(".tab-btn.active")?.dataset.tab || "guide");
  }


  function bindUxAuditButtonSafety() {
    if (document.body?.dataset.uxAuditButtonSafety === "true") return;
    if (document.body) document.body.dataset.uxAuditButtonSafety = "true";
    document.addEventListener("click", event => {
      const jump = event.target?.closest?.("[data-jump-tab]");
      if (!jump) return;
      const tab = jump.dataset.jumpTab;
      if (!tab) return;
      event.preventDefault();
      showTab(tab);
      if (typeof setSidebarOpen === "function") setSidebarOpen(false);
    }, true);
  }


  function bindMobileExperiencePolish() {
    if (document.body?.dataset.mobileExperiencePolish === "true") return;
    if (document.body) document.body.dataset.mobileExperiencePolish = "true";

    const mq = window.matchMedia?.("(max-width: 760px)");
    const closeCoachOnInput = () => {
      if (!mq?.matches) return;
      const coach = $("onboardingCoach");
      if (coach?.dataset.open === "true") {
        coach.dataset.open = "false";
        $("onboardingToggle")?.setAttribute("aria-expanded", "false");
      }
    };

    document.addEventListener("focusin", event => {
      if (event.target?.matches?.("input, select, textarea")) closeCoachOnInput();
    }, true);

    document.addEventListener("click", event => {
      if (!mq?.matches) return;
      const target = event.target;
      if (target?.closest?.(".dashboard-sidebar")) return;
      if (target?.closest?.("#sidebarToggleBtn")) return;
      if (document.body?.classList.contains("sidebar-open") && target?.closest?.(".dashboard-main-shell")) {
        setSidebarOpen(false);
      }
    }, true);
  }


  const PAGE_RENDERERS = Object.freeze({
    metrics: renderMetrics,
    brew: renderBrew,
    manualBrewPreview: renderManualBrewPreview,
    beansTable: renderBeansTable,
    stockTable: renderStockTable,
    qaPreview: renderQAPreview,
    brewLogTable: renderBrewLogTable,
    qaBrewOptions: renderQABrewOptions,
    publicBrewTable: renderPublicBrewTable,
    analytics: renderAnalytics,
    dataQuality: renderDataQuality,
    notificationSummary: updateNotificationSummary,
    reportPreview: renderReportPreview,
    library: renderLibrary,
    adminWorkspace: renderAdminWorkspaceModule,
    securityAudit: renderSecurityAuditModule
  });

  function renderAdminWorkspaceModule() {
    // Page renderers must not call renderWorkspaceUI(): that routine can change the
    // active tab and re-enter this page module. Workspace UI is refreshed by auth/
    // workspace state changes before this renderer is activated.
    renderAuthUI();
    renderWorkspacePanelAccess();
    renderAdminProDashboard();
    renderSecurityAuditModule();
    if (canModerate()) loadModerationRows().catch(console.warn);
    else renderModerationTable?.();
    if (canAdmin()) {
      loadMemberRequests().catch(console.warn);
      loadWorkspaceMembers().catch(console.warn);
      loadSuggestionRows().catch(console.warn);
    } else {
      renderMemberRequests?.();
      renderWorkspaceMembers?.();
      renderSuggestionInbox?.();
    }
  }

  function renderNamedPagePart(name) {
    const renderer = PAGE_RENDERERS[String(name || "")];
    if (typeof renderer !== "function") {
      RUNTIME.warn("Page renderer tidak ditemukan", name);
      return false;
    }
    renderer();
    return true;
  }

  function activePageTab() {
    return document.querySelector(".tab-btn.active")?.dataset.tab || document.body?.dataset.page || (currentUser ? "home" : "guide");
  }

  function renderPageModule(tab = activePageTab()) {
    const context = Object.freeze({
      tab,
      route: routeFromTab(tab),
      render: renderNamedPagePart,
      currentUser: Boolean(currentUser),
      role: currentRole,
      workspaceId: currentWorkspace?.id || ""
    });
    if (PAGE_MODULES?.activate?.(tab, context)) return;
    const fallback = {
      home: ["metrics"],
      brew: ["brew"],
      "input-seduhan": ["manualBrewPreview"],
      beans: ["beansTable"],
      stock: ["stockTable"],
      qa: ["qaPreview", "brewLogTable", "qaBrewOptions"],
      "public-brews": ["publicBrewTable"],
      analytics: ["analytics"],
      quality: ["dataQuality", "notificationSummary"],
      reports: ["reportPreview"],
      admin: ["adminWorkspace", "securityAudit"],
      library: ["library"]
    };
    (fallback[tab] || []).forEach(renderNamedPagePart);
  }

  function renderAll() {
    renderDiagnosticsSummary();
    if (currentUser) {
      document.body.dataset.accessMode = "login";
      document.body.classList.add("experience-entered", "access-login");
      document.body.classList.remove("access-guest");
    }
    renderAccessUI();
    renderOnboardingCoach();
    renderPageModule(activePageTab());
  }



  function initFloatingMascot() {
    const mascot = $("floatingMascot");
    const launcher = $("floatingMascotLauncher");
    const minimizeBtn = $("floatingMascotMinimize");
    const closeBtn = $("floatingMascotClose");
    if (!mascot || mascot.dataset.ready === "true") return;
    mascot.dataset.ready = "true";

    const stateKey = "coffee_dashboard_mascot_state_v11";
    const readState = () => {
      return SAFE_STORAGE.readJSON(stateKey, {});
    };
    const writeState = next => {
      SAFE_STORAGE.writeJSON(stateKey, next);
    };
    const applyVisibility = state => {
      const minimized = Boolean(state.minimized);
      const closed = Boolean(state.closed);
      mascot.classList.toggle("is-minimized", minimized);
      mascot.classList.toggle("hidden", closed);
      if (launcher) launcher.classList.toggle("hidden", !closed);
    };
    const currentState = () => readState();

    const setVars = (x = 0, y = 0) => {
      mascot.style.setProperty("--fm-x", `${x.toFixed(3)}`);
      mascot.style.setProperty("--fm-y", `${y.toFixed(3)}`);
    };
    const move = event => {
      const rect = mascot.getBoundingClientRect();
      const x = clamp(((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1, -1, 1);
      const y = clamp(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1, -1, 1);
      mascot.classList.add("is-awake");
      setVars(x, y);
    };
    const tap = () => {
      if (mascot.classList.contains("is-minimized")) {
        const next = { ...currentState(), minimized: false, closed: false };
        writeState(next);
        applyVisibility(next);
      } else {
        mascot.classList.toggle("is-open");
      }
      mascot.classList.add("is-pouring");
      setTimeout(() => mascot.classList.remove("is-pouring"), 900);
    };
    mascot.addEventListener("pointermove", move);
    mascot.addEventListener("pointerenter", move);
    mascot.addEventListener("pointerleave", () => { mascot.classList.remove("is-awake"); setVars(0, 0); });
    mascot.addEventListener("click", tap);
    mascot.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); tap(); } });
    minimizeBtn?.addEventListener("click", event => {
      event.stopPropagation();
      const next = { ...currentState(), minimized: !mascot.classList.contains("is-minimized"), closed: false };
      writeState(next);
      applyVisibility(next);
      mascot.classList.remove("is-open");
    });
    closeBtn?.addEventListener("click", event => {
      event.stopPropagation();
      const next = { ...currentState(), closed: true, minimized: false };
      writeState(next);
      applyVisibility(next);
    });
    launcher?.addEventListener("click", () => {
      const next = { ...currentState(), closed: false, minimized: false };
      writeState(next);
      applyVisibility(next);
      mascot.classList.add("is-open");
    });
    applyVisibility(readState());
    setVars(0, 0);
  }

  function initPremiumUIInteractions() {
    if (document.body?.dataset.premiumUiReady === "true") return;
    if (document.body) document.body.dataset.premiumUiReady = "true";

    if (APP_CONFIG.features?.mascot === true) initFloatingMascot();

    const hero = document.querySelector(".hero");
    if (hero) {
      hero.addEventListener("pointermove", event => {
        const rect = hero.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
        const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
        hero.style.setProperty("--hero-mx", `${x.toFixed(1)}%`);
        hero.style.setProperty("--hero-my", `${y.toFixed(1)}%`);
        document.body.style.setProperty("--cursor-x", `${x.toFixed(1)}%`);
        document.body.style.setProperty("--cursor-y", `${Math.min(26, y).toFixed(1)}%`);
      });
    }

    const tableWraps = [...document.querySelectorAll(".table-wrap")];
    const updateTableScrollState = wrap => {
      const canScrollX = wrap.scrollWidth > wrap.clientWidth + 8;
      const isScrolled = wrap.scrollLeft > 8;
      wrap.classList.toggle("can-scroll-x", canScrollX);
      wrap.classList.toggle("is-scrolled", isScrolled);
    };

    tableWraps.forEach(wrap => {
      updateTableScrollState(wrap);
      wrap.addEventListener("scroll", () => updateTableScrollState(wrap), { passive: true });
    });

    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(entries => entries.forEach(entry => updateTableScrollState(entry.target)));
      tableWraps.forEach(wrap => ro.observe(wrap));
    } else {
      window.addEventListener("resize", () => tableWraps.forEach(updateTableScrollState), { passive: true });
    }

    const revealTargets = [...document.querySelectorAll(".panel, .output-card, .recipe-card, .table-wrap, .hero-card, .auth-card")];
    revealTargets.forEach((el, index) => {
      el.classList.add("reveal-up");
      el.style.transitionDelay = `${Math.min(index * 22, 180)}ms`;
    });

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
      revealTargets.forEach(el => observer.observe(el));
    } else {
      revealTargets.forEach(el => el.classList.add("is-visible"));
    }
  }


  if (APP_CONFIG.features?.debugTools === true) {
    window.COFFEE_APP_DEBUG = {
      getState: () => ({
        cloudReady,
        currentUser: currentUser?.email || null,
        currentWorkspace: currentWorkspace?.name || null,
        currentRole,
        stockCount: state.cloudStock?.length || 0,
        brewCount: state.cloudBrewLogs?.length || 0,
        qaCount: state.cloudQA?.length || 0
      }),
      saveDraft: saveCurrentBrewDraft,
      saveManualBrew,
      sync: () => syncFromCloud(true)
    };
  } else {
    try { delete window.COFFEE_APP_DEBUG; } catch (_error) { window.COFFEE_APP_DEBUG = undefined; }
  }

  function applyReleaseMetadata() {
    const version = APP_CONFIG.version || "43.0.0";
    const release = APP_CONFIG.release || "Commercial Readiness";
    document.documentElement.dataset.appVersion = version;
    document.documentElement.dataset.appRelease = release;
    const buildLabel = document.querySelector(".sidebar-build-version");
    if (buildLabel) buildLabel.textContent = `v${version} · ${release}`;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && currentUser && supabaseClient) {
      refreshCurrentSession("Refresh sesi setelah tab aktif").catch(console.warn);
    }
  });

  document.addEventListener("DOMContentLoaded", async () => {
    applyReleaseMetadata();
    hydrateSelects();
    restoreAutosaveDrafts();
    bindEvents();
    bindWelcomeScreen();
    bindSidebarDrawer();
    bindOnboardingCoach();
    if (APP_CONFIG.features?.demoExperience !== false) bindDemoExperience();
    bindSignupLandingFlow();
    bindNotificationCenter();
    bindReportSuitePolish();
    bindAccountRolePolish();
    bindSecurityAuditPolish();
    bindCustomProcessInputs();
    bindUxAuditButtonSafety();
    bindMobileExperiencePolish();
    initPageRouter();
    bindAutosaveDrafts();
    renderAll();
    initPremiumUIInteractions();
    initPWAExperience();
    await initCloud();
    processPendingSyncQueue(false).catch(console.warn);
    renderAll();
    updatePageHeading(document.querySelector(".tab-btn.active")?.dataset.tab || "home");
    syncAccessChrome();
    updateSyncGuardStatus();
  });
})();
