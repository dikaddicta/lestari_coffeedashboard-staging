(function () {
  "use strict";

  const pages = [
  {
    "order": 1,
    "tab": "home",
    "route": "beranda",
    "sectionId": "tab-home",
    "title": "Beranda",
    "subtitle": "Status operasional, prioritas, dan aktivitas terbaru workspace kopi.",
    "access": "private",
    "navGroup": "Dashboard",
    "navLabel": "Dashboard",
    "navIcon": "home",
    "navOrder": 1
  },
  {
    "order": 2,
    "tab": "guide",
    "route": "cara-pakai",
    "sectionId": "tab-guide",
    "title": "Cara Pakai",
    "subtitle": "Panduan menggunakan dashboard dari rekomendasi hingga publikasi hasil seduhan.",
    "access": "public",
    "navGroup": "Resources",
    "navLabel": "Panduan",
    "navIcon": "help",
    "navOrder": 2
  },
  {
    "order": 3,
    "tab": "brew",
    "route": "rekomendasi-seduh",
    "sectionId": "tab-brew",
    "title": "Rekomendasi Seduh",
    "subtitle": "Titik awal resep seduh berbasis data biji, proses, alat, dan target rasa.",
    "access": "public",
    "navGroup": "Brewing",
    "navLabel": "Rekomendasi Seduh",
    "navIcon": "sparkles",
    "navOrder": 1
  },
  {
    "order": 4,
    "tab": "input-seduhan",
    "route": "input-seduhan",
    "sectionId": "tab-input-seduhan",
    "title": "Input Seduhan",
    "subtitle": "Masukkan parameter eksperimen seduh untuk dibandingkan dan disimpan.",
    "access": "public",
    "navGroup": "Brewing",
    "navLabel": "Seduh Manual",
    "navIcon": "edit",
    "navOrder": 2
  },
  {
    "order": 5,
    "tab": "beans",
    "route": "beans",
    "sectionId": "tab-beans",
    "title": "Biji Kopi",
    "subtitle": "Kelola referensi biji, asal, dan atribut pendukung untuk alur kerja internal.",
    "access": "private",
    "navGroup": "Coffee",
    "navLabel": "Biji Kopi",
    "navIcon": "coffee",
    "navOrder": 1
  },
  {
    "order": 6,
    "tab": "stock",
    "route": "stock",
    "sectionId": "tab-stock",
    "title": "Stok",
    "subtitle": "Pantau stok kopi, status bahan, dan ketersediaan untuk eksperimen berikutnya.",
    "access": "private",
    "navGroup": "Coffee",
    "navLabel": "Inventori",
    "navIcon": "inventory",
    "navOrder": 2
  },
  {
    "order": 7,
    "tab": "qa",
    "route": "brew-log-qa",
    "sectionId": "tab-qa",
    "title": "Log Seduh & QA",
    "subtitle": "Catat hasil seduhan, validasi kualitas, dan bangun histori evaluasi internal.",
    "access": "private",
    "navGroup": "Brewing",
    "navLabel": "Log Seduh & QA",
    "navIcon": "clipboard",
    "navOrder": 3
  },
  {
    "order": 8,
    "tab": "public-brews",
    "route": "hasil-seduhan-publik",
    "sectionId": "tab-public-brews",
    "title": "Hasil Seduhan Publik",
    "subtitle": "Lihat hasil seduhan yang telah dipublikasikan dan melewati proses peninjauan.",
    "access": "public",
    "navGroup": "Insights",
    "navLabel": "Hasil Publik",
    "navIcon": "globe",
    "navOrder": 2
  },
  {
    "order": 9,
    "tab": "analytics",
    "route": "data-analytics",
    "sectionId": "tab-analytics",
    "title": "Analitik Seduhan",
    "subtitle": "Lihat perkembangan kualitas, pemakaian biji, biaya per cangkir, dan pola resep yang paling konsisten.",
    "access": "private",
    "navGroup": "Insights",
    "navLabel": "Analitik",
    "navIcon": "chart",
    "navOrder": 1
  },
  {
    "order": 10,
    "tab": "quality",
    "route": "notification",
    "sectionId": "tab-quality",
    "title": "Notifikasi",
    "subtitle": "Pusat peringatan dan tindakan untuk menjaga kualitas data dan alur kerja.",
    "access": "private",
    "navGroup": "Operations",
    "navLabel": "Notifikasi",
    "navIcon": "bell",
    "navOrder": 1
  },
  {
    "order": 11,
    "tab": "reports",
    "route": "export-report",
    "sectionId": "tab-reports",
    "title": "Ekspor & Laporan",
    "subtitle": "Ekspor data dan rangkum hasil seduhan menjadi laporan yang siap dibagikan.",
    "access": "private",
    "navGroup": "Operations",
    "navLabel": "Laporan & Ekspor",
    "navIcon": "download",
    "navOrder": 2
  },
  {
    "order": 12,
    "tab": "suggestion",
    "route": "saran",
    "sectionId": "tab-suggestion",
    "title": "Saran",
    "subtitle": "Kirim masukan untuk membantu pengembangan Lestari Coffee Dashboard.",
    "access": "public",
    "navGroup": "Resources",
    "navLabel": "Saran",
    "navIcon": "message",
    "navOrder": 3
  },
  {
    "order": 13,
    "tab": "admin",
    "route": "akun-role",
    "sectionId": "tab-admin",
    "title": "Akses & Keamanan",
    "subtitle": "Kelola sesi, anggota, pembagian peran, dan riwayat aktivitas workspace.",
    "access": "private",
    "navGroup": "Administration",
    "navLabel": "Akses & Workspace",
    "navIcon": "shield",
    "navOrder": 1
  },
  {
    "order": 14,
    "tab": "library",
    "route": "pustaka-data",
    "sectionId": "tab-library",
    "title": "Pustaka Data",
    "subtitle": "Jelajahi referensi dripper, filter, varietas, proses, profil sangrai, air, dan grinder.",
    "access": "public",
    "navGroup": "Resources",
    "navLabel": "Pustaka Data",
    "navIcon": "book",
    "navOrder": 1
  }
];
  const byTab = Object.fromEntries(pages.map(page => [page.tab, Object.freeze({ ...page })]));
  const byRoute = Object.fromEntries(pages.map(page => [page.route, byTab[page.tab]]));

  window.COFFEE_PAGES = Object.freeze({
    version: "44.0.0-rc.4",
    pages: Object.freeze(pages.map(page => byTab[page.tab])),
    byTab: Object.freeze(byTab),
    byRoute: Object.freeze(byRoute),
    routeFor(tab) {
      return byTab[String(tab || "")]?.route || "cara-pakai";
    },
    tabFor(route) {
      return byRoute[String(route || "").toLowerCase()]?.tab || "";
    },
    metaFor(tab) {
      const page = byTab[String(tab || "")] || byTab.home || pages[0];
      return Object.freeze({ title: page.title, subtitle: page.subtitle });
    }
  });
})();
