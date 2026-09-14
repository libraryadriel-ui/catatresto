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
  },

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
    if (raw) return JSON.parse(raw);
    const sample = this.sampleMenu();
    localStorage.setItem(this.KEYS.menu, JSON.stringify(sample));
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
      { id: 'f1', name: 'Nasi Goreng Spesial', price: 25000, category: 'Makanan', emoji: '🍚', desc: 'Nasi goreng dengan telur, ayam, dan acar.' },
      { id: 'f2', name: 'Mie Goreng Jawa', price: 22000, category: 'Makanan', emoji: '🍜', desc: 'Mie goreng khas Jawa dengan bumbu rempah.' },
      { id: 'f3', name: 'Ayam Bakar Madu', price: 32000, category: 'Makanan', emoji: '🍗', desc: 'Ayam bakar bumbu madu, sambal terasi.' },
      { id: 'f4', name: 'Sate Ayam (10 tusuk)', price: 28000, category: 'Makanan', emoji: '🍢', desc: 'Sate ayam dengan bumbu kacang.' },
      { id: 'f5', name: 'Gado-Gado', price: 20000, category: 'Makanan', emoji: '🥗', desc: 'Sayuran rebus dengan bumbu kacang.' },
      { id: 'f6', name: 'Sop Buntut', price: 45000, category: 'Makanan', emoji: '🍲', desc: 'Sop buntut sapi gurih hangat.' },
      { id: 'd1', name: 'Es Teh Manis', price: 8000, category: 'Minuman', emoji: '🧊', desc: 'Teh manis dingin segar.' },
      { id: 'd2', name: 'Teh Hangat', price: 7000, category: 'Minuman', emoji: '🍵', desc: 'Teh hangat tawar.' },
      { id: 'd3', name: 'Es Jeruk Peras', price: 12000, category: 'Minuman', emoji: '🍊', desc: 'Jeruk peras segar dengan es.' },
      { id: 'd4', name: 'Kopi Susu Gula Aren', price: 18000, category: 'Minuman', emoji: '☕', desc: 'Kopi susu dengan gula aren asli.' },
      { id: 'd5', name: 'Jus Alpukat', price: 22000, category: 'Minuman', emoji: '🥑', desc: 'Jus alpukat dengan susu coklat.' },
      { id: 'd6', name: 'Air Mineral', price: 5000, category: 'Minuman', emoji: '💧', desc: 'Botol 600ml.' },
      { id: 's1', name: 'Pisang Goreng Keju', price: 15000, category: 'Snack', emoji: '🍌', desc: 'Pisang goreng topping keju & coklat.' },
      { id: 's2', name: 'Kentang Goreng', price: 18000, category: 'Snack', emoji: '🍟', desc: 'French fries dengan saus.' },
    ];
  },
};

// Migrasi data default lama → 'Waroeng Legend' (sekali, aman & idempoten)
Store._migrateLegacyName();
