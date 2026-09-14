/* ============================================================
 * App Controller — router, navigasi, modal, toast
 * ============================================================ */

const App = {
  currentView: 'dashboard',

  VIEWS: {
    dashboard: { title: 'Dashboard', render: () => Views.dashboard(), mount: () => Views.dashboardMount() },
    pos: { title: 'Kasir', render: () => Views.pos(), mount: () => Views.posMount() },
    menu: { title: 'Manajemen Menu', render: () => Views.menu(), mount: () => Views.menuMount() },
    orders: { title: 'Riwayat Order', render: () => Views.orders(), mount: () => {} },
    settings: { title: 'Pengaturan', render: () => Views.settings(), mount: () => Views.settingsMount() },
  },

  init() {
    // nama restoran di sidebar
    document.getElementById('brandName').textContent = Store.getSettings().restaurantName;
    // tanggal hari ini
    document.getElementById('todayDate').textContent = new Date().toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    // navigasi
    document.querySelectorAll('.nav-item').forEach((n) =>
      n.addEventListener('click', () => this.render(n.dataset.view))
    );

    // toggle sidebar (mobile)
    const toggle = document.getElementById('menuToggle');
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    document.body.appendChild(scrim);
    toggle.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      scrim.classList.toggle('show');
    });
    scrim.addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      scrim.classList.remove('show');
    });

    // tombol printer di sidebar
    document.getElementById('btnConnectPrinter').addEventListener('click', () => SettingsUI.connectPrinter());

    // tampilkan view default
    this.renderPrinterStatus();
    this.render('dashboard');
  },

  render(view) {
    if (!this.VIEWS[view]) view = 'dashboard';
    this.currentView = view;
    const cfg = this.VIEWS[view];
    document.getElementById('pageTitle').textContent = cfg.title;
    document.getElementById('viewRoot').innerHTML = cfg.render();
    document.querySelectorAll('.nav-item').forEach((n) =>
      n.classList.toggle('active', n.dataset.view === view)
    );
    // tutup sidebar mobile
    document.getElementById('sidebar').classList.remove('open');
    document.querySelector('.scrim')?.classList.remove('show');
    // mount (chart / interaksi)
    if (cfg.mount) setTimeout(() => cfg.mount(), 0);
    window.scrollTo(0, 0);
  },

  renderPrinterStatus() {
    Views.renderPrinterStatus();
  },

  /* ---- MODAL ---- */
  modal(html) {
    const root = document.getElementById('modalRoot');
    root.innerHTML = `<div class="modal-backdrop" onclick="App.closeModal()"></div><div class="modal">${html}</div>`;
    root.classList.add('show');
  },
  closeModal() {
    document.getElementById('modalRoot').classList.remove('show');
    document.getElementById('modalRoot').innerHTML = '';
  },

  /* ---- TOAST ---- */
  toast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + type;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => (el.className = 'toast ' + type), 2600);
  },
};

// boot
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  // init Firebase cloud sync (async, no-op jika belum dikonfigurasi)
  if (typeof Fb !== 'undefined') Fb.init();
});
