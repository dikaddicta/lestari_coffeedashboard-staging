(function () {
  "use strict";

  const STORAGE_KEY = "lestari-v45-sidebar-state";
  const MOBILE_QUERY = "(max-width: 767px)";
  const TABLET_QUERY = "(min-width: 768px) and (max-width: 1199px)";
  const storage = window.COFFEE_SERVICES?.storage || window.COFFEE_RUNTIME?.storage || null;
  const mobileMedia = window.matchMedia?.(MOBILE_QUERY);
  const tabletMedia = window.matchMedia?.(TABLET_QUERY);
  let drawerReturnFocus = null;
  let modalReturnFocus = null;

  const byId = id => document.getElementById(id);
  const isMobile = () => Boolean(mobileMedia?.matches);
  const isTablet = () => Boolean(tabletMedia?.matches);
  const isVisible = element => Boolean(element && !element.hidden && !element.classList.contains("hidden") && element.getClientRects().length);

  function readStoredSidebarState() {
    if (!storage?.get) return null;
    const value = storage.get(STORAGE_KEY, null);
    return value === "collapsed" || value === "expanded" ? value : null;
  }

  function writeStoredSidebarState(value) {
    if (storage?.set) storage.set(STORAGE_KEY, value);
  }

  function focusableElements(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll([
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(","))).filter(element => isVisible(element) && element.getAttribute("aria-hidden") !== "true");
  }

  function syncSidebarA11y() {
    const body = document.body;
    const sidebar = byId("dashboardSidebar");
    const toggle = byId("sidebarToggleBtn");
    const collapse = byId("sidebarCollapseBtn");
    if (!body || !sidebar) return;

    const drawerOpen = body.classList.contains("sidebar-open") && isMobile();
    const collapsed = body.classList.contains("sidebar-collapsed") && !isMobile();
    toggle?.setAttribute("aria-expanded", drawerOpen ? "true" : "false");
    collapse?.setAttribute("aria-expanded", collapsed ? "false" : "true");
    if (collapse) collapse.setAttribute("aria-label", collapsed ? "Perluas sidebar" : "Ciutkan sidebar");
    sidebar.setAttribute("aria-hidden", isMobile() && !drawerOpen ? "true" : "false");
    if ("inert" in sidebar) sidebar.inert = isMobile() && !drawerOpen;
  }

  function applySidebarState(state, options = {}) {
    if (!document.body) return "expanded";
    const collapsed = state === "collapsed" && !isMobile();
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    if (options.persist !== false && !isMobile()) writeStoredSidebarState(collapsed ? "collapsed" : "expanded");
    syncSidebarA11y();
    return collapsed ? "collapsed" : "expanded";
  }

  function initialSidebarState() {
    if (isMobile()) return "expanded";
    return readStoredSidebarState() || (isTablet() ? "collapsed" : "expanded");
  }

  function setDrawerOpen(open, options = {}) {
    const body = document.body;
    const sidebar = byId("dashboardSidebar");
    if (!body || !sidebar) return false;
    const next = Boolean(open) && isMobile();
    if (next) drawerReturnFocus = options.trigger || document.activeElement;
    body.classList.toggle("sidebar-open", next);
    syncSidebarA11y();
    if (next) {
      const target = focusableElements(sidebar)[0] || sidebar;
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      requestAnimationFrame(() => target.focus({ preventScroll: true }));
    } else if (options.restoreFocus !== false && drawerReturnFocus?.focus) {
      drawerReturnFocus.focus({ preventScroll: true });
      drawerReturnFocus = null;
    }
    return next;
  }

  function closeProfileMenu(options = {}) {
    const button = byId("topbarProfileBtn");
    const menu = byId("topbarProfileMenu");
    if (!button || !menu) return;
    menu.classList.add("hidden");
    button.setAttribute("aria-expanded", "false");
    if (options.restoreFocus) button.focus({ preventScroll: true });
  }

  function toggleProfileMenu(force) {
    const button = byId("topbarProfileBtn");
    const menu = byId("topbarProfileMenu");
    if (!button || !menu) return false;
    const open = typeof force === "boolean" ? force : menu.classList.contains("hidden");
    menu.classList.toggle("hidden", !open);
    button.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) requestAnimationFrame(() => focusableElements(menu)[0]?.focus({ preventScroll: true }));
    return open;
  }

  function openModal(modal, trigger = document.activeElement) {
    const element = typeof modal === "string" ? byId(modal) : modal;
    if (!element) return false;
    modalReturnFocus = trigger;
    element.classList.remove("hidden");
    element.setAttribute("aria-hidden", "false");
    document.body?.classList.add("modal-open");
    requestAnimationFrame(() => (focusableElements(element)[0] || element).focus({ preventScroll: true }));
    return true;
  }

  function closeModal(modal, options = {}) {
    const element = typeof modal === "string" ? byId(modal) : modal;
    if (!element) return false;
    element.classList.add("hidden");
    element.setAttribute("aria-hidden", "true");
    document.body?.classList.remove("modal-open");
    if (options.restoreFocus !== false && modalReturnFocus?.focus) modalReturnFocus.focus({ preventScroll: true });
    modalReturnFocus = null;
    return true;
  }

  function setGenericDrawerOpen(drawer, open, trigger = document.activeElement) {
    const element = typeof drawer === "string" ? byId(drawer) : drawer;
    if (!element) return false;
    element.classList.toggle("is-open", Boolean(open));
    element.setAttribute("aria-hidden", open ? "false" : "true");
    document.body?.classList.toggle("v45-drawer-open", Boolean(open));
    if (open) {
      element.dataset.returnFocusId = trigger?.id || "";
      requestAnimationFrame(() => focusableElements(element)[0]?.focus({ preventScroll: true }));
    } else {
      const returnTarget = element.dataset.returnFocusId ? byId(element.dataset.returnFocusId) : null;
      returnTarget?.focus?.({ preventScroll: true });
    }
    return Boolean(open);
  }

  function activeModal() {
    return Array.from(document.querySelectorAll("[role='dialog']:not(.hidden), .v45-modal:not(.hidden)"))
      .find(element => element.getAttribute("aria-hidden") !== "true") || null;
  }

  function trapFocus(event, container) {
    const items = focusableElements(container);
    if (!items.length) {
      event.preventDefault();
      container.focus?.();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function bindTabs() {
    document.querySelectorAll("[role='tablist']").forEach(tablist => {
      const tabs = Array.from(tablist.querySelectorAll("[role='tab']"));
      tabs.forEach((tab, index) => {
        tab.addEventListener("keydown", event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const nextIndex = event.key === "Home" ? 0
            : event.key === "End" ? tabs.length - 1
              : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          tabs[nextIndex]?.focus();
        });
      });
    });
  }

  function bind() {
    if (!document.body || document.body.dataset.v45FoundationReady === "true") return;
    document.body.dataset.v45FoundationReady = "true";
    applySidebarState(initialSidebarState(), { persist: false });
    syncSidebarA11y();

    byId("sidebarCollapseBtn")?.addEventListener("click", () => {
      applySidebarState(document.body.classList.contains("sidebar-collapsed") ? "expanded" : "collapsed");
    });
    byId("sidebarToggleBtn")?.addEventListener("click", event => {
      setDrawerOpen(!document.body.classList.contains("sidebar-open"), { trigger: event.currentTarget });
    });
    byId("sidebarCloseBtn")?.addEventListener("click", () => setDrawerOpen(false));
    byId("sidebarBackdrop")?.addEventListener("click", () => setDrawerOpen(false));
    byId("topbarProfileBtn")?.addEventListener("click", event => {
      event.stopPropagation();
      toggleProfileMenu();
    });

    document.addEventListener("click", event => {
      if (!event.target.closest(".topbar-profile")) closeProfileMenu();
      const opener = event.target.closest("[data-ui-open]");
      if (opener) {
        const target = byId(opener.dataset.uiOpen);
        if (target?.matches("[role='dialog'], .v45-modal")) openModal(target, opener);
        else setGenericDrawerOpen(target, true, opener);
      }
      const closer = event.target.closest("[data-ui-close]");
      if (closer) {
        const target = closer.closest("[role='dialog'], .v45-modal, .v45-drawer");
        if (target?.matches("[role='dialog'], .v45-modal")) closeModal(target);
        else setGenericDrawerOpen(target, false);
      }
      if (event.target.closest(".sidebar-nav .tab-btn") && isMobile()) {
        setDrawerOpen(false, { restoreFocus: false });
        drawerReturnFocus = null;
        requestAnimationFrame(() => byId("pageTitle")?.focus({ preventScroll: true }));
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        const modal = activeModal();
        if (modal) return void closeModal(modal);
        const drawer = document.querySelector(".v45-drawer.is-open");
        if (drawer) return void setGenericDrawerOpen(drawer, false);
        if (document.body.classList.contains("sidebar-open")) return void setDrawerOpen(false);
        if (!byId("topbarProfileMenu")?.classList.contains("hidden")) closeProfileMenu({ restoreFocus: true });
      }
      if (event.key === "Tab") {
        const modal = activeModal();
        if (modal) trapFocus(event, modal);
        else if (document.body.classList.contains("sidebar-open") && isMobile()) trapFocus(event, byId("dashboardSidebar"));
      }
    });

    document.addEventListener("coffee:pagechange", () => {
      closeProfileMenu();
      if (isMobile()) setDrawerOpen(false, { restoreFocus: false });
    });

    const onViewportChange = () => {
      document.body.classList.remove("sidebar-open");
      applySidebarState(initialSidebarState(), { persist: false });
      syncSidebarA11y();
    };
    mobileMedia?.addEventListener?.("change", onViewportChange);
    tabletMedia?.addEventListener?.("change", onViewportChange);
    bindTabs();
  }

  window.LESTARI_UI = Object.freeze({
    applySidebarState,
    closeModal,
    closeProfileMenu,
    focusableElements,
    isMobile,
    openModal,
    setDrawerOpen,
    setGenericDrawerOpen,
    syncSidebarA11y,
    toggleProfileMenu
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
  document.dispatchEvent(new CustomEvent("lestari:ui-foundation-ready"));
})();
