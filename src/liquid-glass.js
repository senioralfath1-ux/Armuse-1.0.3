'use strict';
/*
 * Mode Glass — Zero-Canvas CSS Hardware-Composited Micro-Ripple (0% VRAM / 0% CPU Idle)
 * Menghilangkan penggunaan fullscreen <canvas> dan requestAnimationFrame loop sepenuhnya,
 * digantikan dengan elemen CSS kecil (56x56px) berbasis GPU transform + opacity yang
 * otomatis dihapus setelah 420ms.
 */
(function () {
  const RD = window.RD || (window.RD = {});
  let enabled = false;
  let lastSpawn = 0;

  function syncThemeState() {
    enabled = document.documentElement.getAttribute('data-theme') === 'glass';
    const oldFx = document.getElementById('liquid-fx-canvas');
    if (oldFx) oldFx.remove();
    const oldBg = document.getElementById('liquid-bg-canvas');
    if (oldBg) oldBg.remove();
  }

  function spawnSplash(x, y) {
    if (!enabled) return;
    const now = performance.now();
    if (now - lastSpawn < 110) return;
    lastSpawn = now;
    if (document.body.classList.contains('island-mode')) return;

    const ring = document.createElement('div');
    ring.className = 'lg-click-ripple';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 420);
  }

  function addRipple(x, y) {
    spawnSplash(x, y);
  }

  function init() {
    syncThemeState();
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (!enabled || e.button !== 0) return;
        if (e.target.closest('button, a, .album, .artist, .row, .theme-card, .pill')) {
          spawnSplash(e.clientX, e.clientY);
        }
      },
      { passive: true }
    );
    const obs = new MutationObserver(syncThemeState);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  RD.liquidGlass = {
    spawnSplash,
    addRipple,
    syncThemeState,
  };
})();
