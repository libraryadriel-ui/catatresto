/* ============================================================
 * Data Layer — POS Restoran
 * Persistensi: localStorage (cache lokal) + Firebase Firestore (cloud sync)
 * Penyimpanan lokal instan, sinkronisasi cloud real-time.
 * ============================================================ */

const Store = {
  KEYS: {
    menu: 'pos_menu_items',
    orders: 'pos_orders',
    settings: 'pos_settings',
    menuVersion: 'pos_menu_version',
  },
  // Versi menu sampel saat ini. Naikkan nilai ini saat menu default diganti.
  // Saat app load, jika versi tersimpan < ini → menu lama otomatis di-replace
  // dengan sampel terbaru (berlaku lokal + sinkron ke cloud).
  MENU_VERSION: 2,

  /* ---------- DEFAULT SETTINGS ---------- */
  defaultSettings() {
    return {
      restaurantName: 'Waroeng Legend',
      address: 'Jalan Parang Tritis Raya 1AH, Ancol, Pademangan, Jakarta Utara, 14430',
      phone: '0851-3937-9836',
      currency: 'Rp',
      taxRate: 0,
      serviceCharge: 0,
      footerNote: 'Terima kasih atas kunjungan Anda!',
    };
  },

  /* ---------- MIGRASI DATA DEFAULT LAMA → 'Waroeng Legend' ---------- */
  _migrateLegacyName() {
    try {
      const raw = localStorage.getItem(this.KEYS.settings);
      if (!raw) return;
      const s = JSON.parse(raw);
      let changed = false;
      // Nama: rantai default lama ('Warung Berkah' / 'Catat Resto') → 'Waroeng Legend'
      if (s.restaurantName === 'Warung Berkah' || s.restaurantName === 'Catat Resto') {
        s.restaurantName = 'Waroeng Legend';
        changed = true;
      }
      // Alamat default lama
      if (s.address === 'Jl. Merdeka No. 45, Jakarta') {
        s.address = 'Jalan Parang Tritis Raya 1AH, Ancol, Pademangan, Jakarta Utara, 14430';
        changed = true;
      }
      // Telepon default lama
      if (s.phone === '0812-3456-7890') {
        s.phone = '0851-3937-9836';
        changed = true;
      }
      if (changed) localStorage.setItem(this.KEYS.settings, JSON.stringify(s));
    } catch (e) {}
  },

  /* ---------- LOCAL SAVE (untuk sinkronisasi dari cloud) ---------- */
  saveMenuLocal(arr) { localStorage.setItem(this.KEYS.menu, JSON.stringify(arr)); },
  saveOrdersLocal(arr) { localStorage.setItem(this.KEYS.orders, JSON.stringify(arr)); },
  saveSettingsLocal(obj) { localStorage.setItem(this.KEYS.settings, JSON.stringify(obj)); },

  /* ---------- TRIGGER RE-RENDER (dipanggil saat data cloud berubah) ---------- */
  _onChange(what) {
    if (typeof App === 'undefined' || !App.currentView) return;
    const v = App.currentView;
    if (what === 'menu') {
      if (v === 'menu') MenuUI.renderTable();
      if (v === 'pos') { Views.posMount(); }
    }
    if (what === 'orders') {
      if (v === 'orders' || v === 'dashboard') App.render(v);
    }
    if (what === 'settings') {
      const el = document.getElementById('brandName');
      if (el) el.textContent = this.getSettings().restaurantName;
    }
  },

  /* ---------- SETTINGS ---------- */
  getSettings() {
    return { ...this.defaultSettings(), ...JSON.parse(localStorage.getItem(this.KEYS.settings) || '{}') };
  },
  saveSettings(obj) {
    this.saveSettingsLocal(obj);
    Fb.saveSettings(obj); // sync cloud (async, no-op jika belum dikonfigurasi)
  },

  /* ---------- MENU ITEMS ---------- */
  getMenu() {
    const raw = localStorage.getItem(this.KEYS.menu);
    const storedVersion = parseInt(localStorage.getItem(this.KEYS.menuVersion) || '0', 10);
    if (raw) {
      const arr = JSON.parse(raw);
      // Deteksi menu lama: versi lebih rendah ATAU mengandung tanda sampel lama
      const looksStale = arr.some(
        (it) => it.id === 'f1' || it.name === 'Nasi Goreng Spesial'
      );
      if (storedVersion >= this.MENU_VERSION && !looksStale) {
        return arr; // up-to-date → pertahankan (termasuk edit user)
      }
      // menu lama / kedaluwarsa → ganti sampel terbaru
      const sample = this.sampleMenu();
      this.saveMenuLocal(sample);
      localStorage.setItem(this.KEYS.menuVersion, String(this.MENU_VERSION));
      Fb.saveMenu(sample); // sinkron ke cloud (no-op jika belum dikonfigurasi)
      return sample;
    }
    // belum ada menu tersimpan → pakai sampel
    const sample = this.sampleMenu();
    this.saveMenuLocal(sample);
    localStorage.setItem(this.KEYS.menuVersion, String(this.MENU_VERSION));
    return sample;
  },
  saveMenu(arr) {
    this.saveMenuLocal(arr);
  },
  addItem(item) {
    const menu = this.getMenu();
    item.id = item.id || 'm' + Date.now();
    menu.push(item);
    this.saveMenuLocal(menu);
    Fb.addItem(item); // sync cloud
    return item;
  },
  updateItem(id, patch) {
    const menu = this.getMenu().map((m) => (m.id === id ? { ...m, ...patch } : m));
    this.saveMenuLocal(menu);
    Fb.updateItem(id, patch);
  },
  deleteItem(id) {
    this.saveMenuLocal(this.getMenu().filter((m) => m.id !== id));
    Fb.deleteItem(id);
  },

  /* ---------- ORDERS ---------- */
  getOrders() {
    return JSON.parse(localStorage.getItem(this.KEYS.orders) || '[]');
  },
  saveOrder(order) {
    const orders = this.getOrders();
    order.id = order.id || 'TRX' + Date.now();
    order.createdAt = order.createdAt || new Date().toISOString();
    orders.unshift(order);
    this.saveOrdersLocal(orders);
    Fb.saveOrder(order); // sync cloud
    return order;
  },
  deleteOrder(id) {
    this.saveOrdersLocal(this.getOrders().filter((o) => o.id !== id));
    Fb.deleteOrder(id);
  },

  /* ---------- AGGREGATIONS (untuk dashboard) ---------- */
  salesSummary(days = 7) {
    const orders = this.getOrders();
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const range = orders.filter((o) => new Date(o.createdAt) >= since);
    const totalRevenue = range.reduce((s, o) => s + o.totals.grandTotal, 0);
    const totalOrders = range.length;
    const avgOrder = totalOrders ? totalRevenue / totalOrders : 0;

    const byDay = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      byDay[key] = { label: d.toLocaleDateString('id-ID', { weekday: 'short' }), revenue: 0, count: 0 };
    }
    range.forEach((o) => {
      const key = o.createdAt.slice(0, 10);
      if (byDay[key]) {
        byDay[key].revenue += o.totals.grandTotal;
        byDay[key].count += 1;
      }
    });

    const prodMap = {};
    range.forEach((o) =>
      o.items.forEach((it) => {
        prodMap[it.name] = (prodMap[it.name] || 0) + it.qty;
      })
    );
    const topProducts = Object.entries(prodMap)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return { totalRevenue, totalOrders, avgOrder, byDay: Object.values(byDay), topProducts };
  },

  /* ---------- DATA SAMPEL MENU ---------- */
  sampleMenu() {
    return [
      // ===== MENU LEGENDARIS =====
      { id: 'ml1', name: 'Soto Daging/Campur', price: 30000, category: 'Menu Legendaris', emoji: '🍲', desc: 'Soto kuning khas Bogor dengan daging sapi & jeroan.' },
      { id: 'ml2', name: 'Soto Daging/Campur Jumbo', price: 45000, category: 'Menu Legendaris', emoji: '🍲', desc: 'Soto kuning jumbo, porsi lebih banyak.' },
      { id: 'ml3', name: 'Soto Ayam', price: 27000, category: 'Menu Legendaris', emoji: '🍲', desc: 'Soto kuning dengan suwiran ayam.' },
      { id: 'ml4', name: 'Soto Ayam Spesial', price: 35000, category: 'Menu Legendaris', emoji: '🍲', desc: 'Soto ayam dengan tambahan jeroan.' },
      { id: 'ml5', name: 'Ayam Kuning Legend', price: 25000, category: 'Menu Legendaris', emoji: '🍗', desc: 'Ayam pejantan + sambal legend. @25K.' },

      // ===== MENU NUSANTARA =====
      { id: 'mn1', name: 'Pempek Telor Kecil', price: 8000, category: 'Menu Nusantara', emoji: '🥟', desc: 'Pempek asli Palembang isi telor.' },
      { id: 'mn2', name: 'Pempek Lenjer Kecil', price: 8000, category: 'Menu Nusantara', emoji: '🥟', desc: 'Pempek lenjer khas Palembang.' },
      { id: 'mn3', name: 'Pempek Adaan Bulat', price: 8000, category: 'Menu Nusantara', emoji: '🥟', desc: 'Pempek adaan bulat.' },
      { id: 'mn4', name: 'Nasi Timbel Komplit', price: 35000, category: 'Menu Nusantara', emoji: '🍛', desc: 'Ayam goreng kuning legend, nasi putih, tempe-tahu goreng, sambal lalap.' },
      { id: 'mn5', name: 'Nasi Liwet Komplit', price: 20000, category: 'Menu Nusantara', emoji: '🍚', desc: 'Nasi liwet, teri goreng, telor balado, timun, sambal, kerupuk kancing.' },
      { id: 'mn6', name: 'Nasi Liwet Spesial', price: 45000, category: 'Menu Nusantara', emoji: '🍚', desc: 'Nasi liwet komplit + ayam goreng legend + kuah soto kuning.' },

      // ===== MENU LAINNYA =====
      { id: 'mln1', name: 'Nasi Putih', price: 5000, category: 'Menu Lainnya', emoji: '🍚', desc: 'Nasi putih hangat.' },
      { id: 'mln2', name: 'Nasi Liwet', price: 9000, category: 'Menu Lainnya', emoji: '🍚', desc: 'Nasi liwet biasa.' },
      { id: 'mln3', name: 'Nasi Liwet Mini', price: 15000, category: 'Menu Lainnya', emoji: '🍚', desc: 'Nasi liwet porsi mini.' },
      { id: 'mln4', name: 'Tempe / Tahu Goreng', price: 3000, category: 'Menu Lainnya', emoji: '🧈', desc: 'Tempe atau tahu goreng.' },
      { id: 'mln5', name: 'Perkedel', price: 5000, category: 'Menu Lainnya', emoji: '🥔', desc: 'Perkedel kentang.' },
      { id: 'mln6', name: 'Telor Dadar', price: 5000, category: 'Menu Lainnya', emoji: '🍳', desc: 'Telor dadar.' },
      { id: 'mln7', name: '+ Kuah', price: 10000, category: 'Menu Lainnya', emoji: '🍲', desc: 'Tambahan kuah soto.' },
      { id: 'mln8', name: '+ Sambal', price: 5000, category: 'Menu Lainnya', emoji: '🌶️', desc: 'Tambahan sambal.' },

      // ===== MINUMAN =====
      { id: 'mnm1', name: 'Teh Tawar P/D', price: 5000, category: 'Minuman', emoji: '🍵', desc: 'Teh tawar panas/dingin.' },
      { id: 'mnm2', name: 'Teh Manis P/D', price: 8000, category: 'Minuman', emoji: '🍵', desc: 'Teh manis panas/dingin.' },
      { id: 'mnm3', name: 'Es Jeruk Songkit', price: 15000, category: 'Minuman', emoji: '🍊', desc: 'Es jeruk songkit segar.' },
      { id: 'mnm4', name: 'Es Jeruk Nipis', price: 15000, category: 'Minuman', emoji: '🍋', desc: 'Es jeruk nipis segar.' },
      { id: 'mnm5', name: 'Lemonade', price: 15000, category: 'Minuman', emoji: '🍋', desc: 'Lemonade dingin.' },
      { id: 'mnm6', name: 'Es Lemon Tea', price: 15000, category: 'Minuman', emoji: '🍋', desc: 'Es teh lemon.' },
      { id: 'mnm7', name: 'Es Soda Gembira', price: 20000, category: 'Minuman', emoji: '🥤', desc: 'Soda gembira dingin.' },
      { id: 'mnm8', name: 'Es Americano', price: 15000, category: 'Minuman', emoji: '☕', desc: 'Kopi americano dingin.' },
      { id: 'mnm9', name: 'Es Latte', price: 18000, category: 'Minuman', emoji: '☕', desc: 'Kopi latte dingin.' },
      { id: 'mnm10', name: 'Es Teh Tarik', price: 18000, category: 'Minuman', emoji: '🧋', desc: 'Es teh tarik.' },
      { id: 'mnm11', name: 'Hot Americano', price: 15000, category: 'Minuman', emoji: '☕', desc: 'Kopi americano panas.' },
      { id: 'mnm12', name: 'Hot Latte', price: 18000, category: 'Minuman', emoji: '☕', desc: 'Kopi latte panas.' },
      { id: 'mnm13', name: 'Hot Milk Tea', price: 18000, category: 'Minuman', emoji: '🍵', desc: 'Teh susu panas.' },
    ];
  },
};

// Migrasi data default lama → 'Waroeng Legend' (sekali, aman & idempoten)
Store._migrateLegacyName();
