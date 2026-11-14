'use strict';
/* Dijalankan PALING AWAL (sebelum stylesheet dimuat) supaya tema & bahasa tersimpan langsung
   terpasang tanpa "kedipan" (FOUC). */
(function () {
  var theme = 'dark', lang = 'id';
  try { theme = (window.api && window.api.getThemeSync && window.api.getThemeSync()) || 'dark'; } catch (_) {}
  try { lang = (window.api && window.api.getLangSync && window.api.getLangSync()) || 'id'; } catch (_) {}
  var html = document.documentElement;
  html.setAttribute('data-theme', theme);
  html.setAttribute('lang', lang);
})();
