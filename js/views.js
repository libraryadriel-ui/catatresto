/* ============================================================
 * Views — render logic untuk tiap halaman POS
 * ============================================================ */

const Views = {
  fmt(n) {
    const s = Store.getSettings();
    return (s.currency || 'Rp') + ' ' + Math.round(n).toLocaleString('id-ID');
  },

  /* ============ DASHBOARD ============ */
  dashboard() {
    const s = Store.salesSummary(7);
    const orders = Store.getOrders().slice(0, 5);
    return `
      <div class="stats">
        ${this._statCard('💰', 'Pendapatan 7 Hari', this.fmt(s.totalRevenue), 'Total transaksi penjualan', 'red')}
        ${this._statCard('🧾', 'Total Order', s.totalOrders + ' order', 'dalam 7 hari terakhir', 'green')}
        ${this._statCard('📊', 'Rata-rata / Order', this.fmt(s.avgOrder), 'nilai transaksi rata-rata', 'amber')}
        ${this._statCard('📅', 'Hari Ini', Store.getOrders().filter(o => o.createdAt.slice(0,10)===new Date().toISOString().slice(0,10)).length + ' order', 'transaksi hari ini', 'blue')}
      </div>
      <div class="dash-grid">
        <div class="card">
          <div class="card-head"><div><h3>Tren Penjualan</h3><div class="sub">7 hari terakhir</div></div></div>
          <div class="card-pad"><div class="chart-wrap"><canvas id="salesChart"></canvas></div></div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Produk Terlaris</h3><div class="sub">7 hari terakhir</div></div></div>
          <ul class="top-list">
            ${s.topProducts.length ? s.topProducts.map((p, i) => `
              <li>
                <span class="top-rank" style="background:${['#ff4d2d','#ff8a3d','#f59e0b','#16a34a','#2563eb'][i]}">${i+1}</span>
                <span class="top-name">${p.name}</span>
                <span class="top-qty">${p.qty}x</span>
              </li>`).join('') : '<div class="empty-state"><span class="em-ic">📭</span>Belum ada data penjualan</div>'}
          </ul>
        </div>
      </div>
      <div class="card" style="margin-top:20px">
        <div class="card-head"><div><h3>Transaksi Terbaru</h3><div class="sub">5 order terakhir</div></div></div>
        ${orders.length ? `<table class="tbl"><thead><tr><th>No. Transaksi</th><th>Waktu</th><th>Meja</th><th>Item</th><th>Total</th></tr></thead><tbody>
          ${orders.map(o => `<tr>
            <td class="order-no">${o.id}</td>
            <td>${new Date(o.createdAt).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
            <td>${o.table || '-'}</td>
            <td>${o.items.length} item</td>
            <td class="order-total">${this.fmt(o.totals.grandTotal)}</td>
          </tr>`).join('')}
        </tbody></table>` : `<div class="empty-state"><span class="em-ic">🧾</span>Belum ada transaksi. Mulai jualan di menu Kasir!</div>`}
      </div>
    `;
  },

  dashboardMount() {
    const s = Store.salesSummary(7);
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: s.byDay.map(d => d.label),
        datasets: [{
          label: 'Pendapatan',
          data: s.byDay.map(d => d.revenue),
          borderColor: '#ff4d2d', backgroundColor: 'rgba(255,77,45,.12)',
          tension: .4, fill: true, borderWidth: 3,
          pointBackgroundColor: '#ff4d2d', pointRadius: 4, pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => Views.fmt(c.parsed.y) } } },
        scales: {
          y: { ticks: { callback: (v) => 'Rp ' + (v/1000).toFixed(0) + 'k' }, grid: { color: '#f0f2f5' } },
          x: { grid: { display: false } },
        },
      },
    });
  },

  _statCard(ic, label, value, foot, color) {
    return `<div class="stat-card">
      <div class="stat-ic bg-${color}"><span class="ic-${color}">${ic}</span></div>
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      <div class="stat-foot">${foot}</div>
    </div>`;
  },

  /* ============ POS (KASIR) ============ */
  pos() {
    return `
      <div class="pos-layout">
        <div class="pos-left">
          <div class="pos-search">
            <span class="ps-ic">🔍</span>
            <input id="posSearch" placeholder="Cari menu..." />
          </div>
          <div class="pos-tabs" id="posTabs"></div>
          <div class="menu-grid" id="menuGrid"></div>
        </div>
        <div class="cart" id="cartPanel"></div>
      </div>
    `;
  },

  posMount() {
    POS.cart = POS.cart || [];
    POS.filter = POS.filter || 'Semua';
    POS.search = '';
    const cats = ['Semua', ...new Set(Store.getMenu().map((m) => m.category))];
    document.getElementById('posTabs').innerHTML = cats
      .map((c) => `<button class="pos-tab ${c === POS.filter ? 'active' : ''}" data-cat="${c}">${c}</button>`)
      .join('');
    document.querySelectorAll('#posTabs .pos-tab').forEach((b) =>
      b.addEventListener('click', () => { POS.filter = b.dataset.cat; Views.posMount(); })
    );
    document.getElementById('posSearch').addEventListener('input', (e) => {
      POS.search = e.target.value.toLowerCase();
      Views._renderMenuGrid();
    });
    this._renderMenuGrid();
    this._renderCart();
  },

  _renderMenuGrid() {
    let list = Store.getMenu();
    if (POS.filter !== 'Semua') list = list.filter((m) => m.category === POS.filter);
    if (POS.search) list = list.filter((m) => m.name.toLowerCase().includes(POS.search));
    const grid = document.getElementById('menuGrid');
    grid.innerHTML = list.length
      ? list.map((m) => `
        <button class="menu-tile" data-id="${m.id}">
          <div class="mt-emoji">${m.emoji || '🍽️'}</div>
          <div class="mt-body">
            <div class="mt-name">${m.name}</div>
            <div class="mt-price">${this.fmt(m.price)}</div>
            <div class="mt-desc">${m.desc || m.category}</div>
          </div>
        </button>`).join('')
      : `<div class="empty-state" style="grid-column:1/-1"><span class="em-ic">🍽️</span>Menu tidak ditemukan</div>`;
    grid.querySelectorAll('.menu-tile').forEach((t) =>
      t.addEventListener('click', () => POS.addToCart(t.dataset.id))
    );
  },

  _renderCart() {
    const panel = document.getElementById('cartPanel');
    if (!panel) return;
    const s = Store.getSettings();
    const subtotal = POS.cart.reduce((a, i) => a + i.price * i.qty, 0);
    const tax = Math.round((subtotal * (s.taxRate || 0)) / 100);
    const service = Math.round((subtotal * (s.serviceCharge || 0)) / 100);
    const grand = subtotal + tax + service;
    if (!POS.cart.length) {
      panel.innerHTML = `
        <div class="cart-head"><h3>🛒 Keranjang</h3></div>
        <div class="cart-empty"><span class="ce-ic">🛒</span>Keranjang kosong<br>Pilih menu di sebelah kiri untuk menambahkan</div>`;
      return;
    }
    panel.innerHTML = `
      <div class="cart-head">
        <h3>🛒 Keranangan <span class="cart-count">${POS.cart.reduce((a,i)=>a+i.qty,0)}</span></h3>
        <button class="cart-clear" onclick="POS.clearCart()">Hapus Semua</button>
      </div>
      <div class="cart-items">
        ${POS.cart.map((it) => `
          <div class="cart-line">
            <span class="cl-emoji">${it.emoji || '🍽️'}</span>
            <div class="cl-info">
              <div class="cl-name">${it.name}</div>
              <div class="cl-price">${this.fmt(it.price)}</div>
            </div>
            <div class="cl-qty">
              <button class="qty-btn" onclick="POS.adj('${it.id}',-1)">−</button>
              <span>${it.qty}</span>
              <button class="qty-btn" onclick="POS.adj('${it.id}',1)">+</button>
            </div>
            <div class="cl-total">${this.fmt(it.price * it.qty)}</div>
            <button class="cl-remove" onclick="POS.remove('${it.id}')">✕</button>
          </div>`).join('')}
      </div>
      <div class="cart-meta">
        <div class="meta-row"><label>Meja</label><input class="meta-input" id="metaTable" placeholder="No. meja" value="${POS.table || ''}" /></div>
        <div class="meta-row"><label>Bayar</label>
          <div class="pay-chips" id="payChips">
            ${['Tunai','Debit','QRIS','GoPay'].map(p => `<div class="pay-chip ${POS.payment===p?'active':''}" data-pay="${p}">${p}</div>`).join('')}
          </div>
        </div>
        <div class="meta-row"><label>Tunai</label><input class="meta-input" id="metaPaid" type="number" placeholder="Uang diterima" value="${POS.paid || ''}" /></div>
      </div>
      <div class="cart-totals">
        <div class="total-row"><span>Subtotal</span><span>${this.fmt(subtotal)}</span></div>
        ${tax ? `<div class="total-row"><span>Pajak (${s.taxRate}%)</span><span>${this.fmt(tax)}</span></div>` : ''}
        ${service ? `<div class="total-row"><span>Layanan (${s.serviceCharge}%)</span><span>${this.fmt(service)}</span></div>` : ''}
        <div class="total-row grand"><span>TOTAL</span><span class="tg-val">${this.fmt(grand)}</span></div>
        ${POS.paid ? `<div class="total-row"><span>Kembalian</span><span>${this.fmt(Math.max(0, POS.paid - grand))}</span></div>` : ''}
      </div>
      <div class="cart-actions">
        <button class="btn btn-ghost btn-sm" onclick="POS.previewReceipt()">👁️ Lihat Struk</button>
        <button class="btn btn-primary" style="flex:1" onclick="POS.checkout()">💳 Bayar & Cetak</button>
      </div>
    `;
    document.getElementById('metaTable').addEventListener('input', (e) => (POS.table = e.target.value));
    document.getElementById('metaPaid').addEventListener('input', (e) => {
      POS.paid = +e.target.value;
      Views._renderCart();
    });
    document.querySelectorAll('#payChips .pay-chip').forEach((c) =>
      c.addEventListener('click', () => { POS.payment = c.dataset.pay; Views._renderCart(); })
    );
  },

  /* ============ MENU MANAGEMENT ============ */
  menu() {
    return `
      <div class="toolbar">
        <div class="search-mini"><span>🔍</span><input id="menuSearch" placeholder="Cari menu..." /></div>
        <button class="btn btn-primary btn-sm" onclick="MenuUI.openForm()">➕ Tambah Menu</button>
      </div>
      <div class="table-wrap" id="menuTable"></div>
    `;
  },

  menuMount() {
    MenuUI.search = '';
    document.getElementById('menuSearch').addEventListener('input', (e) => {
      MenuUI.search = e.target.value.toLowerCase();
      MenuUI.renderTable();
    });
    MenuUI.renderTable();
  },

  /* ============ ORDERS ============ */
  orders() {
    const orders = Store.getOrders();
    return `
      <div class="toolbar">
        <h3 style="font-size:16px;font-weight:700">Riwayat Transaksi (${orders.length})</h3>
        ${orders.length ? '<button class="btn btn-ghost btn-sm" onclick="if(confirm(\'Hapus semua riwayat?\')){localStorage.removeItem(Store.KEYS.orders);App.render(\'orders\');App.toast(\'Riwayat dihapus\',\'success\');}">🗑️ Hapus Semua</button>' : ''}
      </div>
      <div class="table-wrap">
        ${orders.length ? `<table class="tbl"><thead><tr><th>No. Transaksi</th><th>Waktu</th><th>Meja</th><th>Items</th><th>Pembayaran</th><th>Total</th><th>Aksi</th></tr></thead><tbody>
          ${orders.map(o => `<tr>
            <td class="order-no">${o.id}</td>
            <td>${new Date(o.createdAt).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
            <td>${o.table || '-'}</td>
            <td>${o.items.map(i=>`${i.qty}x ${i.name}`).join(', ')}</td>
            <td><span class="tcat tcat-Lainnya">${o.payment||'Tunai'}</span></td>
            <td class="order-total">${this.fmt(o.totals.grandTotal)}</td>
            <td><div class="row-actions">
              <button title="Cetak ulang" onclick="POS.reprint('${o.id}')">🖨️</button>
              <button class="del" title="Hapus" onclick="Store.deleteOrder('${o.id}');App.render('orders');App.toast('Order dihapus','success')">🗑️</button>
            </div></td>
          </tr>`).join('')}
        </tbody></table>` : `<div class="empty-state"><span class="em-ic">📦</span>Belum ada transaksi tersimpan</div>`}
      </div>
    `;
  },

  /* ============ SETTINGS ============ */
  settings() {
    const s = Store.getSettings();
    const supported = Printer.isSupported();
    return `
      <div class="dash-grid">
        <div class="card">
          <div class="card-head"><div><h3>Info Restoran</h3><div class="sub">Akan tampil di struk</div></div></div>
          <div class="card-pad">
            <div class="form-row"><label>Nama Restoran</label><input class="form-control" id="setResto" value="${s.restaurantName}" /></div>
            <div class="form-row"><label>Alamat</label><textarea class="form-control" id="setAddr">${s.address}</textarea></div>
            <div class="form-grid2">
              <div class="form-row"><label>Telepon</label><input class="form-control" id="setPhone" value="${s.phone}" /></div>
              <div class="form-row"><label>Simbol Mata Uang</label><input class="form-control" id="setCur" value="${s.currency}" /></div>
            </div>
            <div class="form-grid2">
              <div class="form-row"><label>Pajak (%)</label><input class="form-control" id="setTax" type="number" value="${s.taxRate}" /></div>
              <div class="form-row"><label>Biaya Layanan (%)</label><input class="form-control" id="setSvc" type="number" value="${s.serviceCharge}" /></div>
            </div>
            <div class="form-row"><label>Catatan Footer Struk</label><input class="form-control" id="setFooter" value="${s.footerNote}" /></div>
            <button class="btn btn-primary btn-block" onclick="SettingsUI.save()">💾 Simpan Pengaturan</button>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>🖨️ Printer Bluetooth</h3><div class="sub">Cetak struk via thermal printer</div></div></div>
          <div class="card-pad">
            <div class="printer-status" style="background:var(--bg);border:1px solid var(--line);margin-bottom:14px" id="setPrinterStatus"></div>
            <div style="display:flex;flex-direction:column;gap:10px">
              <button class="btn btn-primary btn-block" id="btnSetConnect" onclick="SettingsUI.connectPrinter()">🔵 Hubungkan Printer</button>
              <button class="btn btn-ghost btn-block" onclick="SettingsUI.testPrint()">🧾 Cetak Tes</button>
              <button class="btn btn-ghost btn-block" onclick="SettingsUI.disconnect()">⚪ Putuskan</button>
            </div>
            <div style="margin-top:18px;padding:14px;background:var(--primary-soft);border-radius:10px;font-size:12px;color:var(--ink-soft);line-height:1.6">
              <b style="color:var(--primary)">💡 Tips:</b><br>
              ${supported
                ? 'Pastikan printer Bluetooth thermal Anda sudah menyala dan dalam jangkauan. Klik "Hubungkan Printer" lalu pilih perangkat Anda dari daftar (mis. printer 58mm/80mm merek Xprinter, Goojia, dll).'
                : '⚠️ Browser ini tidak mendukung Web Bluetooth API. Gunakan Google Chrome atau Microsoft Edge di Android/Windows untuk fitur cetak Bluetooth.'}
            </div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:20px">
        <div class="card-head"><div><h3>☁️ Sinkronisasi Cloud (Firebase)</h3><div class="sub">Sinkron data antar laptop &amp; HP — real-time</div></div>
          <span id="cloudBadge"></span>
        </div>
        <div class="card-pad">
          <div id="cloudStatusBox" style="margin-bottom:16px"></div>
          <div class="form-row"><label>Tempel Firebase Config</label>
            <textarea class="form-control" id="fbConfig" placeholder='Salin dari Firebase console, contoh:&#10;{&#10;  "apiKey": "AIza...",&#10;  "authDomain": "myapp.firebaseapp.com",&#10;  "projectId": "myapp",&#10;  "storageBucket": "myapp.appspot.com",&#10;  "messagingSenderId": "123456",&#10;  "appId": "1:123:web:abc"&#10;}' style="min-height:130px;font-family:monospace;font-size:12px"></textarea>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="CloudUI.save()">🔗 Hubungkan Cloud</button>
            <button class="btn btn-ghost btn-sm" onclick="CloudUI.disconnect()">⚪ Putuskan</button>
          </div>
          <div style="margin-top:18px;padding:14px;background:#eaf2ff;border-radius:10px;font-size:12px;color:var(--ink-soft);line-height:1.7">
            <b style="color:#2563eb">📋 Cara dapat config:</b><br>
            1. Buka <b>console.firebase.google.com</b> → buat project baru<br>
            2. Tambahkan Web App (ikon <code>&lt;/&gt;</code>) → salin <b>firebaseConfig</b><br>
            3. Aktifkan <b>Firestore Database</b> → mulai dalam <b>mode pengujian/test</b><br>
            4. Tempel config di atas → klik <b>Hubungkan Cloud</b><br>
            Setelah terhubung, data menu/order/pengaturan langsung sinkron ke semua perangkat.
          </div>
        </div>
      </div>
    `;
  },

  settingsMount() {
    this.renderPrinterStatus();
    this.renderCloudStatus();
    // isi textarea dgn config yg tersimpan (tampil saja)
    const ta = document.getElementById('fbConfig');
    const cfg = Fb.getConfig();
    if (ta && cfg) ta.value = JSON.stringify(cfg, null, 2);
  },

  renderCloudStatus() {
    const box = document.getElementById('cloudStatusBox');
    const badge = document.getElementById('cloudBadge');
    const st = Fb.status;
    const map = {
      offline: { dot: 'dot-off', color: 'var(--ink-soft)', label: 'Belum terhubung (mode lokal)' },
      connecting: { dot: 'dot-on', color: '#f59e0b', label: 'Menghubungkan…' },
      connected: { dot: 'dot-on', color: 'var(--green)', label: 'Terhubung & sinkron real-time ✅' },
      error: { dot: 'dot-off', color: 'var(--red)', label: 'Gagal koneksi (cek config)' },
    };
    const m = map[st] || map.offline;
    const html = `<div class="printer-status" style="background:var(--bg);border:1px solid var(--line);margin-bottom:0"><span class="dot ${m.dot}"></span><span class="printer-label" style="color:${m.color};font-weight:600">${m.label}</span></div>`;
    if (box) box.innerHTML = html;
    if (badge) badge.innerHTML = `<span class="dot ${m.dot}"></span><span style="font-size:12px;font-weight:600;color:${m.color}">${st}</span>`;
  },

  renderPrinterStatus() {
    const el = document.getElementById('setPrinterStatus');
    const box = document.getElementById('printerBox');
    const sidebarEl = document.getElementById('printerStatus');
    const btn = document.getElementById('btnConnectPrinter');
    const btnSet = document.getElementById('btnSetConnect');
    const st = Printer.state;
    const html = st.connected
      ? `<span class="dot dot-on"></span><span class="printer-label" style="color:var(--green);font-weight:600">Terhubung: ${st.name}</span>`
      : `<span class="dot dot-off"></span><span class="printer-label" style="color:var(--ink-soft)">${st.error || 'Tidak terhubung'}</span>`;
    if (el) el.innerHTML = html;
    if (sidebarEl) sidebarEl.innerHTML = html;
    if (btn) { btn.textContent = st.connected ? 'Putuskan Printer' : 'Hubungkan Printer'; btn.className = 'btn-printer' + (st.connected ? ' connected' : ''); }
    if (btnSet) { btnSet.textContent = st.connected ? '⚪ Putuskan' : '🔵 Hubungkan Printer'; }
  },
};

/* ============================================================
 * Menu UI — CRUD form & table
 * ============================================================ */
const MenuUI = {
  EMOJIS: ['🍚','🍜','🍗','🍢','🥗','🍲','🧊','🍵','🍊','☕','🥑','💧','🍌','🍟','🍰','🍦','🥤','🍺','🍞','🥪','🍤','🍛','🥘','🧁','🍪'],

  renderTable() {
    let list = Store.getMenu();
    if (this.search) list = list.filter((m) => m.name.toLowerCase().includes(this.search) || m.category.toLowerCase().includes(this.search));
    const wrap = document.getElementById('menuTable');
    wrap.innerHTML = `<table class="tbl"><thead><tr><th>Menu</th><th>Kategori</th><th>Deskripsi</th><th>Harga</th><th>Aksi</th></tr></thead><tbody>
      ${list.map((m) => `<tr>
        <td><b>${m.emoji || '🍽️'} ${m.name}</b></td>
        <td><span class="tcat tcat-${m.category}">${m.category}</span></td>
        <td style="color:var(--ink-soft)">${m.desc || '-'}</td>
        <td class="tprice">${Views.fmt(m.price)}</td>
        <td><div class="row-actions">
          <button onclick="MenuUI.openForm('${m.id}')">✏️</button>
          <button class="del" onclick="MenuUI.del('${m.id}')">🗑️</button>
        </div></td>
      </tr>`).join('')}
    </tbody></table>` + (!list.length ? `<div class="empty-state"><span class="em-ic">🍽️</span>Belum ada menu. Tambahkan sekarang!</div>` : '');
  },

  openForm(id) {
    const m = id ? Store.getMenu().find((x) => x.id === id) : { emoji: '🍽️', category: 'Makanan' };
    App.modal(`
      <div class="modal-head"><h3>${id ? 'Edit Menu' : 'Tambah Menu'}</h3><button class="modal-close" onclick="App.closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="form-row"><label>Nama Menu</label><input class="form-control" id="mfName" value="${m.name || ''}" placeholder="cth. Nasi Goreng Spesial" /></div>
        <div class="form-grid2">
          <div class="form-row"><label>Kategori</label>
            <select class="form-control" id="mfCat">
              ${['Makanan','Minuman','Snack','Lainnya'].map((c) => `<option ${m.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-row"><label>Harga (Rp)</label><input class="form-control" id="mfPrice" type="number" value="${m.price || ''}" placeholder="25000" /></div>
        </div>
        <div class="form-row"><label>Deskripsi (opsional)</label><textarea class="form-control" id="mfDesc" placeholder="Keterangan singkat menu...">${m.desc || ''}</textarea></div>
        <div class="form-row"><label>Ikon</label><div class="emoji-picker" id="mfEmoji"></div></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Batal</button>
        <button class="btn btn-primary btn-sm" onclick="MenuUI.save('${m.id || ''}')">💾 Simpan</button>
      </div>
    `);
    const ep = document.getElementById('mfEmoji');
    let chosen = m.emoji || '🍽️';
    ep.innerHTML = this.EMOJIS.map((e) => `<div class="emoji-opt ${e === chosen ? 'active' : ''}" data-e="${e}">${e}</div>`).join('');
    ep.querySelectorAll('.emoji-opt').forEach((o) => o.addEventListener('click', () => {
      chosen = o.dataset.e; ep.querySelectorAll('.emoji-opt').forEach((x) => x.classList.remove('active')); o.classList.add('active');
    }));
    this._chosenEmoji = () => chosen;
  },

  save(id) {
    const name = document.getElementById('mfName').value.trim();
    const price = +document.getElementById('mfPrice').value;
    if (!name) return App.toast('Nama menu wajib diisi', 'error');
    if (!price || price < 0) return App.toast('Harga tidak valid', 'error');
    const obj = {
      name, price,
      category: document.getElementById('mfCat').value,
      desc: document.getElementById('mfDesc').value.trim(),
      emoji: this._chosenEmoji(),
    };
    if (id) { Store.updateItem(id, obj); App.toast('Menu diperbarui', 'success'); }
    else { Store.addItem(obj); App.toast('Menu ditambahkan', 'success'); }
    App.closeModal();
    this.renderTable();
    if (App.currentView === 'pos') Views.posMount();
  },

  del(id) {
    const m = Store.getMenu().find((x) => x.id === id);
    if (confirm(`Hapus menu "${m.name}"?`)) { Store.deleteItem(id); this.renderTable(); App.toast('Menu dihapus', 'success'); }
  },
};

/* ============================================================
 * POS Logic — cart & checkout
 * ============================================================ */
const POS = {
  cart: [], filter: 'Semua', search: '', table: '', payment: 'Tunai', paid: 0,

  addToCart(id) {
    const m = Store.getMenu().find((x) => x.id === id);
    if (!m) return;
    const ex = this.cart.find((x) => x.id === id);
    if (ex) ex.qty++;
    else this.cart.push({ ...m, qty: 1 });
    Views._renderCart();
  },

  adj(id, d) {
    const it = this.cart.find((x) => x.id === id);
    if (!it) return;
    it.qty += d;
    if (it.qty <= 0) this.cart = this.cart.filter((x) => x.id !== id);
    Views._renderCart();
  },

  remove(id) { this.cart = this.cart.filter((x) => x.id !== id); Views._renderCart(); },
  clearCart() { if (this.cart.length && confirm('Kosongkan keranjang?')) { this.cart = []; Views._renderCart(); } },

  _calc() {
    const s = Store.getSettings();
    const subtotal = this.cart.reduce((a, i) => a + i.price * i.qty, 0);
    const tax = Math.round((subtotal * (s.taxRate || 0)) / 100);
    const service = Math.round((subtotal * (s.serviceCharge || 0)) / 100);
    const grandTotal = subtotal + tax + service;
    return { subtotal, tax, service, grandTotal };
  },

  checkout() {
    if (!this.cart.length) return App.toast('Keranjang masih kosong', 'error');
    const totals = this._calc();
    if (this.paid && this.paid < totals.grandTotal) return App.toast('Uang diterima kurang dari total', 'error');
    const order = {
      id: 'TRX' + Date.now(),
      items: this.cart.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, emoji: i.emoji })),
      totals,
      table: this.table,
      payment: this.payment,
      paid: this.paid || totals.grandTotal,
      change: (this.paid || totals.grandTotal) - totals.grandTotal,
      cashier: 'Kasir',
      createdAt: new Date().toISOString(),
    };
    Store.saveOrder(order);
    App.toast('Transaksi tersimpan! Mencetak struk...', 'success');

    // Cetak struk
    const s = Store.getSettings();
    if (Printer.state.connected) {
      Printer.printReceipt(order, s).then(
        () => App.toast('Struk berhasil dicetak 🖨️', 'success'),
        (e) => { App.toast('Gagal cetak Bluetooth: ' + e.message, 'error'); this._showReceiptPreview(order); }
      );
    } else {
      this._showReceiptPreview(order);
    }

    // reset
    this.cart = []; this.table = ''; this.paid = 0; this.payment = 'Tunai';
    Views._renderCart();
    setTimeout(() => { if (App.currentView === 'dashboard') App.render('dashboard'); }, 400);
  },

  previewReceipt() {
    if (!this.cart.length) return App.toast('Keranjang kosong', 'error');
    const totals = this._calc();
    const order = {
      id: 'TRX' + Date.now(), items: this.cart, totals,
      table: this.table, payment: this.payment,
      paid: this.paid || totals.grandTotal, change: (this.paid || totals.grandTotal) - totals.grandTotal,
      createdAt: new Date().toISOString(),
    };
    this._showReceiptPreview(order, true);
  },

  reprint(id) {
    const order = Store.getOrders().find((o) => o.id === id);
    if (!order) return;
    const s = Store.getSettings();
    if (Printer.state.connected) {
      Printer.printReceipt(order, s).then(() => App.toast('Struk dicetak ulang', 'success'), (e) => { App.toast('Gagal: ' + e.message, 'error'); this._showReceiptPreview(order); });
    } else { this._showReceiptPreview(order); }
  },

  _showReceiptPreview(order, isPreview = false) {
    const s = Store.getSettings();
    App.modal(`
      <div class="modal-head"><h3>🧾 Struk Transaksi</h3><button class="modal-close" onclick="App.closeModal()">✕</button></div>
      <div class="modal-body"><div class="receipt">${this._receiptText(order, s)}</div></div>
      <div class="modal-foot">
        <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️ Cetak (Browser)</button>
        ${Printer.state.connected ? `<button class="btn btn-primary btn-sm" onclick="Printer.printReceipt(${JSON.stringify(order).replace(/"/g,'&quot;')}, ${JSON.stringify(s).replace(/"/g,'&quot;')});App.toast('Struk dikirim ke printer','success')">🔵 Cetak Bluetooth</button>` : ''}
        <button class="btn btn-primary btn-sm" onclick="App.closeModal()">Tutup</button>
      </div>
    `);
  },

  _receiptText(order, s) {
    const fmt = (n) => (s.currency || 'Rp') + ' ' + Math.round(n).toLocaleString('id-ID');
    const line = '-'.repeat(30);
    let t = '';
    t += `      ${s.restaurantName}\n`;
    t += `      ${s.address}\n`;
    t += `          ${s.phone}\n`;
    t += line + '\n';
    t += `No    : ${order.id}\n`;
    t += `Tgl   : ${new Date(order.createdAt).toLocaleString('id-ID')}\n`;
    t += `Meja  : ${order.table || '-'}\n`;
    t += `Kasir : ${order.cashier || 'Kasir'}\n`;
    t += line + '\n';
    order.items.forEach((it) => {
      t += `${it.qty}x ${it.name}\n`;
      t += `    ${fmt(it.price * it.qty)}\n`;
    });
    t += line + '\n';
    t += `Subtotal        ${fmt(order.totals.subtotal)}\n`;
    if (order.totals.tax) t += `Pajak           ${fmt(order.totals.tax)}\n`;
    if (order.totals.service) t += `Layanan         ${fmt(order.totals.service)}\n`;
    t += `TOTAL           ${fmt(order.totals.grandTotal)}\n`;
    t += `Bayar(${order.payment})  ${fmt(order.paid)}\n`;
    t += `Kembali         ${fmt(order.change)}\n`;
    t += line + '\n';
    t += `   ${s.footerNote}\n`;
    return t;
  },
};

/* ============================================================
 * Settings UI
 * ============================================================ */
const SettingsUI = {
  save() {
    const obj = {
      restaurantName: document.getElementById('setResto').value.trim() || 'Restoran',
      address: document.getElementById('setAddr').value.trim(),
      phone: document.getElementById('setPhone').value.trim(),
      currency: document.getElementById('setCur').value.trim() || 'Rp',
      taxRate: +document.getElementById('setTax').value || 0,
      serviceCharge: +document.getElementById('setSvc').value || 0,
      footerNote: document.getElementById('setFooter').value.trim(),
    };
    Store.saveSettings(obj);
    App.toast('Pengaturan disimpan', 'success');
    document.getElementById('brandName').textContent = obj.restaurantName;
  },

  async connectPrinter() {
    if (Printer.state.connected) { Printer.disconnect(); Views.renderPrinterStatus(); App.toast('Printer diputuskan', 'success'); return; }
    App.toast('Menghubungkan ke printer...', 'success');
    try {
      await Printer.connect();
      Views.renderPrinterStatus();
      App.toast('Printer terhubung: ' + Printer.state.name, 'success');
    } catch (e) {
      Views.renderPrinterStatus();
      App.toast('Gagal: ' + e.message, 'error');
    }
  },

  async testPrint() {
    if (!Printer.state.connected) return App.toast('Hubungkan printer dulu', 'error');
    try { await Printer.testPrint(Store.getSettings()); App.toast('Tes cetak berhasil 🖨️', 'success'); }
    catch (e) { App.toast('Gagal cetak: ' + e.message, 'error'); }
  },

  disconnect() {
    if (!Printer.state.connected) return App.toast('Printer belum terhubung', 'error');
    Printer.disconnect();
    Views.renderPrinterStatus();
    App.toast('Printer diputuskan', 'success');
  },
};

/* ============================================================
 * Cloud UI — Firebase connect/disconnect
 * ============================================================ */
const CloudUI = {
  save() {
    const text = document.getElementById('fbConfig').value;
    const cfg = Fb.parseConfig(text);
    if (!cfg || !cfg.apiKey) {
      App.toast('Config tidak valid. Pastikan ada apiKey.', 'error');
      return;
    }
    Fb.saveConfig(cfg);
    App.toast('Config disimpan, menghubungkan...', 'success');
    Fb.disconnect();
    Fb.init().then((ok) => {
      if (ok) {
        App.toast('Terhubung ke cloud! Data mulai sinkron ☁️', 'success');
        Views.renderCloudStatus();
      } else {
        App.toast('Gagal koneksi. Cek config & aturan Firestore.', 'error');
        Views.renderCloudStatus();
      }
    });
  },
  disconnect() {
    if (!Fb.getConfig()) return App.toast('Belum ada config', 'error');
    Fb.disconnect();
    App.toast('Cloud diputuskan, kembali mode lokal', 'success');
  },
};
