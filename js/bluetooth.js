/* ============================================================
 * Bluetooth Printer — Web Bluetooth API + ESC/POS
 * Mendukung printer thermal Bluetooth umum (58mm / 80mm).
 * Menggunakan ESC/POS command set standar.
 * ============================================================ */

const Printer = {
  device: null,
  characteristic: null,
  state: { connected: false, name: '', error: '' },

  /* Cek apakah browser mendukung Web Bluetooth */
  isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  },

  /* ---------- KONEKSI KE PRINTER ---------- */
  async connect() {
    if (!this.isSupported()) {
      this.state.error = 'Browser tidak mendukung Web Bluetooth. Gunakan Chrome/Edge.';
      throw new Error(this.state.error);
    }
    try {
      this.device = await navigator.bluetooth.requestDevice({
        // Terima semua perangkat agar fleksibel terhadap berbagai merek printer
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // service umum printer thermal (GATT 0x18F0)
          '00001101-0000-1000-8000-00805f9b34fb', // SPP-like
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Nordic UART / banyak printer
          '0000fee0-0000-1000-8000-00805f9b34fb',
          '0000fee1-0000-1000-8000-00805f9b34fb',
        ],
      });

      const server = await this.device.gatt.connect();
      // Cari service yang punya characteristic writeable
      const services = await this._discoverWritableChar(server);
      if (!services) {
        throw new Error('Tidak ada karakteristik tulis (write) yang ditemukan pada perangkat ini.');
      }
      this.characteristic = services.char;
      this.device.addEventListener('gattserverdisconnected', () => this._onDisconnect());

      this.state = { connected: true, name: this.device.name || 'Printer Bluetooth', error: '' };
      return this.state;
    } catch (e) {
      this.state = { connected: false, name: '', error: e.message };
      throw e;
    }
  },

  async _discoverWritableChar(server) {
    const services = await server.getPrimaryServices();
    for (const svc of services) {
      try {
        const chars = await svc.getCharacteristics();
        for (const ch of chars) {
          if (ch.properties.write || ch.properties.writeWithoutResponse) {
            return { svc, char: ch };
          }
        }
      } catch (_) {
        /* skip service yang tidak bisa dibaca */
      }
    }
    return null;
  },

  _onDisconnect() {
    this.state = { connected: false, name: '', error: 'Printer terputus.' };
    this.device = null;
    this.characteristic = null;
    if (window.App) window.App.renderPrinterStatus();
  },

  disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this._onDisconnect();
  },

  /* ---------- KIRIM DATA MENTAH ---------- */
  async _write(data) {
    if (!this.characteristic) throw new Error('Printer belum terhubung.');
    // Gunakan writeWithoutResponse bila tersedia (lebih cepat untuk printer thermal)
    const useNoResp = this.characteristic.properties.writeWithoutResponse;
    const chunks = this._chunk(data, 180); // potong agar tidak overload MTU
    for (const c of chunks) {
      if (useNoResp) {
        await this.characteristic.writeValueWithoutResponse(c);
      } else {
        await this.characteristic.writeValueWithResponse(c);
      }
    }
  },

  _chunk(buffer, size) {
    const out = [];
    for (let i = 0; i < buffer.byteLength; i += size) {
      out.push(buffer.slice(i, i + size));
    }
    return out;
  },

  /* ============================================================
   * ESC/POS HELPERS — bangun byte array
   * ============================================================ */
  _enc: new TextEncoder(),

  cmd: {
    INIT: [0x1b, 0x40], // init printer
    ALIGN_LEFT: [0x1b, 0x61, 0x00],
    ALIGN_CENTER: [0x1b, 0x61, 0x01],
    ALIGN_RIGHT: [0x1b, 0x61, 0x02],
    BOLD_ON: [0x1b, 0x45, 0x01],
    BOLD_OFF: [0x1b, 0x45, 0x00],
    SIZE_NORMAL: [0x1d, 0x21, 0x00],
    SIZE_DOUBLE_H: [0x1d, 0x21, 0x01],
    SIZE_DOUBLE: [0x1d, 0x21, 0x11], // double width+height
    CUT: [0x1d, 0x56, 0x42, 0x00], // full cut
    FEED: n => [0x1b, 0x64, n], // feed n lines
  },

  _bytes(...arrs) {
    const flat = arrs.flatMap((a) => (Array.isArray(a) ? a : Array.from(a)));
    return new Uint8Array(flat);
  },

  _text(str) {
    return this._enc.encode(str);
  },

  _line(str = '') {
    return this._text(str + '\n');
  },

  _pad(str, width, align = 'left') {
    str = String(str);
    if (str.length >= width) return str.slice(0, width);
    const space = ' '.repeat(width - str.length);
    return align === 'right' ? space + str : str + space;
  },

  /* ---------- CETAK STRUK ---------- */
  async printReceipt(order, settings) {
    if (!this.state.connected) throw new Error('Printer belum terhubung.');

    const W = 32; // lebar kolom (untuk printer 58mm ~32 char; 80mm ~48)
    const cur = settings.currency || 'Rp';
    const fmt = (n) => cur + ' ' + Math.round(n).toLocaleString('id-ID');

    const parts = [];
    // init
    parts.push(this._bytes(this.cmd.INIT));
    // header — tengah, bold, double
    parts.push(this._bytes(this.cmd.ALIGN_CENTER, this.cmd.SIZE_DOUBLE, this.cmd.BOLD_ON));
    parts.push(this._text(settings.restaurantName + '\n'));
    parts.push(this._bytes(this.cmd.BOLD_OFF, this.cmd.SIZE_NORMAL));
    parts.push(this._text(settings.address + '\n'));
    parts.push(this._text(settings.phone + '\n'));
    parts.push(this._bytes(this.cmd.SIZE_DOUBLE_H));
    parts.push(this._text('================================\n'));
    parts.push(this._bytes(this.cmd.SIZE_NORMAL, this.cmd.ALIGN_LEFT));

    // info transaksi
    const d = new Date(order.createdAt);
    parts.push(this._text(this._pad('No', 10) + ': ' + order.id + '\n'));
    parts.push(this._text(this._pad('Tanggal', 10) + ': ' + d.toLocaleString('id-ID') + '\n'));
    parts.push(this._text(this._pad('Meja', 10) + ': ' + (order.table || '-') + '\n'));
    parts.push(this._text(this._pad('Kasir', 10) + ': ' + (order.cashier || '-') + '\n'));
    parts.push(this._text('-'.repeat(W) + '\n'));

    // items
    parts.push(this._bytes(this.cmd.SIZE_DOUBLE_H));
    order.items.forEach((it) => {
      const left = `${it.qty}x ${it.name}`;
      const right = fmt(it.price * it.qty);
      parts.push(this._text(left + '\n'));
      parts.push(this._text(this._pad('', 4) + this._pad(right, W - 4, 'right') + '\n'));
    });
    parts.push(this._bytes(this.cmd.SIZE_NORMAL, this.cmd.ALIGN_LEFT));
    parts.push(this._text('-'.repeat(W) + '\n'));

    // totals
    parts.push(this._text(this._pad('Subtotal', W - 14, 'left') + this._pad(fmt(order.totals.subtotal), 14, 'right') + '\n'));
    if (order.totals.tax) parts.push(this._text(this._pad('Pajak', W - 14) + this._pad(fmt(order.totals.tax), 14, 'right') + '\n'));
    if (order.totals.service) parts.push(this._text(this._pad('Layanan', W - 14) + this._pad(fmt(order.totals.service), 14, 'right') + '\n'));
    parts.push(this._bytes(this.cmd.BOLD_ON, this.cmd.SIZE_DOUBLE_H));
    parts.push(this._text(this._pad('TOTAL', W - 14) + this._pad(fmt(order.totals.grandTotal), 14, 'right') + '\n'));
    parts.push(this._bytes(this.cmd.BOLD_OFF, this.cmd.SIZE_NORMAL));

    parts.push(this._text(this._pad('Bayar (' + (order.payment || 'Tunai') + ')', W - 14) + this._pad(fmt(order.paid), 14, 'right') + '\n'));
    parts.push(this._text(this._pad('Kembali', W - 14) + this._pad(fmt(order.change), 14, 'right') + '\n'));
    parts.push(this._text('-'.repeat(W) + '\n'));

    // footer
    parts.push(this._bytes(this.cmd.ALIGN_CENTER));
    parts.push(this._text(settings.footerNote + '\n'));
    parts.push(this._text('www.warungberkah.id\n'));
    parts.push(this._bytes(this.cmd.FEED(3), this.cmd.CUT));

    // gabung & kirim
    let merged = new Uint8Array(0);
    parts.forEach((p) => {
      const tmp = new Uint8Array(merged.length + p.length);
      tmp.set(merged, 0);
      tmp.set(p, merged.length);
      merged = tmp;
    });
    await this._write(merged);
    return true;
  },

  /* ---------- TEST PRINT ---------- */
  async testPrint(settings) {
    if (!this.state.connected) throw new Error('Printer belum terhubung.');
    const parts = [];
    parts.push(this._bytes(this.cmd.INIT, this.cmd.ALIGN_CENTER, this.cmd.SIZE_DOUBLE, this.cmd.BOLD_ON));
    parts.push(this._text('TEST PRINT\n'));
    parts.push(this._bytes(this.cmd.BOLD_OFF, this.cmd.SIZE_NORMAL));
    parts.push(this._text('Printer terhubung dengan sukses!\n'));
    parts.push(this._text(new Date().toLocaleString('id-ID') + '\n'));
    parts.push(this._bytes(this.cmd.ALIGN_LEFT));
    parts.push(this._text('--------------------------------\n'));
    parts.push(this._text('Makanan  ................  Rp 0\n'));
    parts.push(this._text('Minuman  ................  Rp 0\n'));
    parts.push(this._bytes(this.cmd.FEED(3), this.cmd.CUT));
    let merged = new Uint8Array(0);
    parts.forEach((p) => {
      const tmp = new Uint8Array(merged.length + p.length);
      tmp.set(merged, 0);
      tmp.set(p, merged.length);
      merged = tmp;
    });
    await this._write(merged);
    return true;
  },
};
