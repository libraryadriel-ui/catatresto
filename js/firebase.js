/* ============================================================
 * Firebase Cloud Sync — Firestore real-time
 * Sinkronisasi data antar perangkat (menu, order, settings).
 * Jika belum dikonfigurasi → otomatis fallback ke localStorage.
 * ============================================================ */

const Fb = {
  app: null,
  db: null,
  configured: false,
  unsub: [],
  status: 'offline', // offline | connecting | connected | error

  /* ---------- CONFIG ---------- */
  getConfig() {
    try {
      return JSON.parse(localStorage.getItem('pos_fb_config') || 'null');
    } catch {
      return null;
    }
  },
  saveConfig(cfg) {
    localStorage.setItem('pos_fb_config', JSON.stringify(cfg));
  },
  clearConfig() {
    localStorage.removeItem('pos_fb_config');
  },

  /* Parse config dari teks (support JSON atau snippet JS dari Firebase console) */
  parseConfig(text) {
    if (!text) return null;
    // coba JSON dulu
    try {
      const o = JSON.parse(text);
      if (o && o.apiKey) return o;
    } catch {}
    // cari {...} lalu evaluasi sebagai object
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const o = new Function('return ' + m[0])();
        if (o && o.apiKey) return o;
      } catch {}
    }
    return null;
  },

  /* ---------- INIT ---------- */
  async init() {
    const cfg = this.getConfig();
    if (!cfg || !cfg.apiKey) {
      this.configured = false;
      this.status = 'offline';
      return false;
    }
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK belum termuat.');
      this.configured = false;
      this.status = 'offline';
      return false;
    }
    this.status = 'connecting';
    Views.renderCloudStatus();
    try {
      // hindari double-init
      try {
        this.app = firebase.app('pos-resto');
      } catch {
        this.app = firebase.initializeApp(cfg, 'pos-resto');
      }
      this.db = this.app.firestore();
      this.configured = true;
      this._subscribe();
      return true;
    } catch (e) {
      console.error('Firebase init error:', e);
      this.configured = false;
      this.status = 'error';
      Views.renderCloudStatus();
      return false;
    }
  },

  disconnect() {
    this.unsub.forEach((u) => { try { u(); } catch {} });
    this.unsub = [];
    if (this.app) { try { this.app.delete(); } catch {} }
    this.app = null;
    this.db = null;
    this.configured = false;
    this.status = 'offline';
    Views.renderCloudStatus();
  },

  /* ---------- REAL-TIME LISTENERS ---------- */
  _subscribe() {
    this.unsub.forEach((u) => { try { u(); } catch {} });
    this.unsub = [];

    // MENU
    this.unsub.push(
      this.db.collection('menu').onSnapshot(
        (snap) => {
          const arr = [];
          snap.forEach((d) => arr.push(d.data()));
          if (arr.length === 0) {
            // pertama kali: seed menu sampel ke cloud
            this._seedMenu();
            return;
          }
          arr.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
          Store.saveMenuLocal(arr);
          Store._onChange('menu');
          this.status = 'connected';
          Views.renderCloudStatus();
        },
        (e) => { console.error('menu sub err', e); this.status = 'error'; Views.renderCloudStatus(); }
      )
    );

    // ORDERS
    this.unsub.push(
      this.db.collection('orders').orderBy('createdAt', 'desc').limit(500).onSnapshot(
        (snap) => {
          const arr = [];
          snap.forEach((d) => arr.push(d.data()));
          Store.saveOrdersLocal(arr);
          Store._onChange('orders');
          this.status = 'connected';
          Views.renderCloudStatus();
        },
        (e) => { console.error('orders sub err', e); }
      )
    );

    // SETTINGS
    this.unsub.push(
      this.db.collection('config').doc('settings').onSnapshot(
        (d) => {
          if (d.exists) {
            const s = d.data();
            Store.saveSettingsLocal(s);
            Store._onChange('settings');
          }
        },
        (e) => { console.error('settings sub err', e); }
      )
    );
  },

  async _seedMenu() {
    const sample = Store.sampleMenu();
    const batch = this.db.batch();
    sample.forEach((m) => batch.set(this.db.collection('menu').doc(m.id), m));
    await batch.commit();
  },

  /* ---------- WRITE HELPERS (fire-and-forget) ---------- */
  async addItem(item) {
    if (!this.configured) return;
    item.id = item.id || 'm' + Date.now();
    await this.db.collection('menu').doc(item.id).set(item);
    return item;
  },
  async updateItem(id, patch) {
    if (!this.configured) return;
    await this.db.collection('menu').doc(id).set(patch, { merge: true });
  },
  async deleteItem(id) {
    if (!this.configured) return;
    await this.db.collection('menu').doc(id).delete();
  },
  async saveOrder(order) {
    if (!this.configured) return;
    order.id = order.id || 'TRX' + Date.now();
    await this.db.collection('orders').doc(order.id).set(order);
    return order;
  },
  async deleteOrder(id) {
    if (!this.configured) return;
    await this.db.collection('orders').doc(id).delete();
  },
  async saveSettings(obj) {
    if (!this.configured) return;
    await this.db.collection('config').doc('settings').set(obj);
  },
};
