/* Grace Mobile — Native bridge
 * Wires Capacitor plugins to the bundled web pages.
 * Loaded on every page via <script src="native.js" defer></script>.
 * Safely no-ops when running in a regular browser (PWA).
 */
(function () {
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!isNative) return;

  const { Plugins } = window.Capacitor;
  const { App, Browser, Share, Preferences, SplashScreen, StatusBar } = Plugins;

  // Hide splash once content is ready
  document.addEventListener('DOMContentLoaded', async () => {
    try { await SplashScreen?.hide(); } catch (_) {}
    try { await StatusBar?.setBackgroundColor({ color: '#0a0a0a' }); } catch (_) {}
  });

  // Open external links via in-app native browser (Safari View Controller / Custom Tabs)
  const isExternal = (href) => {
    if (!href) return false;
    try {
      const u = new URL(href, location.href);
      // Treat anything not file:// or capacitor:// as external when host differs
      return /^https?:$/.test(u.protocol) && u.host && u.host !== location.host;
    } catch (_) { return false; }
  };

  document.addEventListener('click', async (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (isExternal(href)) {
      e.preventDefault();
      try {
        await Browser.open({ url: href, presentationStyle: 'popover' });
      } catch (_) { window.location.href = href; }
    }
  }, true);

  // Android hardware back button: navigate web history, exit at root
  App?.addListener && App.addListener('backButton', ({ canGoBack }) => {
    if (window.history.length > 1 && canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });

  // Expose native share + favorites on window so HTML pages can call them
  window.GraceNative = {
    isNative: true,

    async share({ title, text, url }) {
      try {
        await Share.share({ title, text, url, dialogTitle: title || 'Share' });
        return true;
      } catch (_) { return false; }
    },

    async addFavorite(key, value) {
      try {
        const raw = (await Preferences.get({ key: 'favorites' })).value;
        const list = raw ? JSON.parse(raw) : [];
        if (!list.find(x => x.key === key)) {
          list.push({ key, value, savedAt: Date.now() });
          await Preferences.set({ key: 'favorites', value: JSON.stringify(list) });
        }
        return true;
      } catch (_) { return false; }
    },

    async removeFavorite(key) {
      try {
        const raw = (await Preferences.get({ key: 'favorites' })).value;
        const list = raw ? JSON.parse(raw) : [];
        const next = list.filter(x => x.key !== key);
        await Preferences.set({ key: 'favorites', value: JSON.stringify(next) });
        return true;
      } catch (_) { return false; }
    },

    async listFavorites() {
      try {
        const raw = (await Preferences.get({ key: 'favorites' })).value;
        return raw ? JSON.parse(raw) : [];
      } catch (_) { return []; }
    },

    async pref(key, value) {
      try {
        if (value === undefined) {
          return (await Preferences.get({ key })).value;
        }
        await Preferences.set({ key, value: String(value) });
        return value;
      } catch (_) { return null; }
    }
  };
})();
