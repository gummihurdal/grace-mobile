/* Grace Mobile — Native bridge v2
 * iOS + Android. Safe no-op when running as plain web (PWA).
 *
 * Exposed on window.GraceNative:
 *   isNative                 boolean
 *   localDateKey()           "MM-DD" in user's local timezone
 *   share({title,text,url})  native share sheet
 *   addFavorite/removeFavorite/listFavorites
 *   pref(key[, value])       read/write preference
 *   cacheDevotion(key,obj)   save devotion JSON for offline
 *   getCachedDevotion(key)   load it back, or null
 *   listCachedKeys()         all cached MM-DD keys
 *   notifications            object with enable/disable/status
 *   audio                    object with speak/stop/onState
 */
(function () {
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  // ─── Helpers that work in plain web too ─────────────────────────────────
  function localDateKey(d) {
    d = d || new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}-${dd}`;
  }

  // ─── Audio: native iOS/Android speech synthesis (Web Speech API uses
  //     AVSpeechSynthesizer on iOS, TextToSpeech on Android) ─────────────
  const audio = (function () {
    let listeners = [];
    function emit(state, info) { listeners.forEach(fn => { try { fn(state, info); } catch (_) {} }); }
    function supported() { return typeof window.speechSynthesis !== 'undefined'; }
    function speak(text, opts) {
      if (!supported()) { emit('unsupported'); return false; }
      stop();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = (opts && opts.rate) || 0.95;
      u.pitch = (opts && opts.pitch) || 1.0;
      u.lang = (opts && opts.lang) || 'en-US';
      u.onstart = () => emit('playing', { text });
      u.onend = () => emit('stopped');
      u.onerror = (e) => emit('error', { error: e && e.error });
      window.speechSynthesis.speak(u);
      return true;
    }
    function stop() {
      if (supported()) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }
      emit('stopped');
    }
    function onState(fn) { listeners.push(fn); return () => { listeners = listeners.filter(x => x !== fn); }; }
    return { speak, stop, onState, supported };
  })();

  if (!isNative) {
    // ─── Web / PWA fallback ────────────────────────────────────────────
    window.GraceNative = {
      isNative: false,
      localDateKey,
      audio,
      async share(opts) {
        if (navigator.share) { try { await navigator.share(opts); return true; } catch (_) { return false; } }
        return false;
      },
      async pref(key, value) {
        try {
          if (value === undefined) return localStorage.getItem(key);
          if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, String(value));
          return value;
        } catch (_) { return null; }
      },
      async addFavorite(key, val) {
        const raw = localStorage.getItem('favorites'); const list = raw ? JSON.parse(raw) : [];
        if (!list.find(x => x.key === key)) { list.push({ key, value: val, savedAt: Date.now() }); localStorage.setItem('favorites', JSON.stringify(list)); }
        return true;
      },
      async removeFavorite(key) {
        const raw = localStorage.getItem('favorites'); const list = raw ? JSON.parse(raw) : [];
        localStorage.setItem('favorites', JSON.stringify(list.filter(x => x.key !== key))); return true;
      },
      async listFavorites() {
        const raw = localStorage.getItem('favorites'); return raw ? JSON.parse(raw) : [];
      },
      async cacheDevotion(key, obj) {
        try { localStorage.setItem('dev:' + key, JSON.stringify({ at: Date.now(), data: obj })); return true; } catch (_) { return false; }
      },
      async getCachedDevotion(key) {
        try { const r = localStorage.getItem('dev:' + key); return r ? JSON.parse(r).data : null; } catch (_) { return null; }
      },
      async listCachedKeys() {
        const out = []; for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i); if (k && k.startsWith('dev:')) out.push(k.slice(4));
        } return out;
      },
      notifications: {
        async enable() { return { ok: false, reason: 'web' }; },
        async disable() { return true; },
        async status() { return { enabled: false, supported: false }; }
      }
    };
    return;
  }

  // ─── NATIVE PATH (iOS / Android via Capacitor) ───────────────────────
  const { Plugins } = window.Capacitor;
  const { App, Browser, Share, Preferences, SplashScreen, StatusBar, LocalNotifications } = Plugins;

  document.addEventListener('DOMContentLoaded', async () => {
    try { await SplashScreen?.hide(); } catch (_) {}
    try { await StatusBar?.setBackgroundColor({ color: '#020A1E' }); } catch (_) {}
  });

  // External links → in-app Safari View Controller / Custom Tabs
  const isExternal = (href) => {
    if (!href) return false;
    try { const u = new URL(href, location.href);
      return /^https?:$/.test(u.protocol) && u.host && u.host !== location.host;
    } catch (_) { return false; }
  };
  document.addEventListener('click', async (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (isExternal(href)) {
      e.preventDefault();
      try { await Browser.open({ url: href, presentationStyle: 'popover' }); }
      catch (_) { window.location.href = href; }
    }
  }, true);

  // Hardware back button (Android)
  App?.addListener && App.addListener('backButton', ({ canGoBack }) => {
    if (window.history.length > 1 && canGoBack) window.history.back();
    else App.exitApp();
  });

  // ─── Preferences-backed helpers ─────────────────────────────────────
  async function prefGet(key) {
    try { return (await Preferences.get({ key })).value; } catch (_) { return null; }
  }
  async function prefSet(key, value) {
    try { await Preferences.set({ key, value: String(value) }); return true; } catch (_) { return false; }
  }
  async function prefRemove(key) {
    try { await Preferences.remove({ key }); return true; } catch (_) { return false; }
  }
  async function prefKeys() {
    try { return (await Preferences.keys()).keys || []; } catch (_) { return []; }
  }

  // ─── Notifications ─────────────────────────────────────────────────
  const NOTIF_ID = 1001; // single recurring notification id
  const notifications = {
    async status() {
      try {
        const perm = await LocalNotifications.checkPermissions();
        const pending = (await LocalNotifications.getPending()).notifications || [];
        const our = pending.find(n => n.id === NOTIF_ID);
        const timePref = await prefGet('notif:time');
        return {
          supported: true,
          permission: perm.display, // granted | denied | prompt
          enabled: !!our,
          time: timePref || '07:00'
        };
      } catch (e) { return { supported: false, permission: 'denied', enabled: false }; }
    },
    async enable(time) {
      // time = "HH:MM" string in local timezone
      time = time || (await prefGet('notif:time')) || '07:00';
      const [hh, mm] = time.split(':').map(n => parseInt(n, 10));
      try {
        const perm = await LocalNotifications.requestPermissions();
        if (perm.display !== 'granted') return { ok: false, reason: 'denied' };
        await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] }).catch(()=>{});
        await LocalNotifications.schedule({
          notifications: [{
            id: NOTIF_ID,
            title: 'Grace for Every Day',
            body: 'Today\'s devotion is ready. Pause. Reflect. Walk.',
            schedule: { on: { hour: hh, minute: mm }, allowWhileIdle: true, repeats: true },
            sound: null,
            smallIcon: 'ic_stat_icon',
            largeIcon: 'ic_launcher'
          }]
        });
        await prefSet('notif:time', time);
        await prefSet('notif:enabled', '1');
        return { ok: true, time };
      } catch (e) {
        return { ok: false, reason: (e && e.message) || 'error' };
      }
    },
    async disable() {
      try {
        await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
        await prefSet('notif:enabled', '0');
        return true;
      } catch (_) { return false; }
    }
  };

  // ─── Public API ─────────────────────────────────────────────────────
  window.GraceNative = {
    isNative: true,
    localDateKey,
    audio,

    async share({ title, text, url }) {
      try { await Share.share({ title, text, url, dialogTitle: title || 'Share' }); return true; }
      catch (_) { return false; }
    },

    async pref(key, value) {
      if (value === undefined) return prefGet(key);
      if (value === null) return prefRemove(key);
      return prefSet(key, value);
    },

    async addFavorite(key, value) {
      const raw = await prefGet('favorites');
      const list = raw ? JSON.parse(raw) : [];
      if (!list.find(x => x.key === key)) {
        list.push({ key, value, savedAt: Date.now() });
        await prefSet('favorites', JSON.stringify(list));
      }
      return true;
    },
    async removeFavorite(key) {
      const raw = await prefGet('favorites');
      const list = raw ? JSON.parse(raw) : [];
      await prefSet('favorites', JSON.stringify(list.filter(x => x.key !== key)));
      return true;
    },
    async listFavorites() {
      const raw = await prefGet('favorites');
      return raw ? JSON.parse(raw) : [];
    },

    async cacheDevotion(key, obj) {
      try { await prefSet('dev:' + key, JSON.stringify({ at: Date.now(), data: obj })); return true; }
      catch (_) { return false; }
    },
    async getCachedDevotion(key) {
      try { const r = await prefGet('dev:' + key); return r ? JSON.parse(r).data : null; }
      catch (_) { return null; }
    },
    async listCachedKeys() {
      const ks = await prefKeys();
      return ks.filter(k => k.startsWith('dev:')).map(k => k.slice(4));
    },

    notifications
  };
})();
