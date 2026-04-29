/* ===========================
   CatFin-R — Application Logic
   =========================== */

// =================== STATE ===================
let state = {
  produk: [],
  bahan: [],
  operasional: [],
  penjualan: [],
  settings: {
    namaBisnis: 'Catering Saya',
    namaAdmin: 'Admin Catering',
    email: '',
    telp: ''
  }
};

// Try to load from localStorage
function loadState() {
  try {
    const s = localStorage.getItem('catfinr_state');
    if (s) state = { ...state, ...JSON.parse(s) };
  } catch(e) {}
}

function saveState() {
  try {
    localStorage.setItem('catfinr_state', JSON.stringify(state));
  } catch(e) {}
}

// =================== NAVIGATION ===================
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById('page-' + name);
  const navItem = document.querySelector(`.nav-item[data-page="${name}"]`);
  if (page) page.classList.add('active');
  if (navItem) navItem.classList.add('active');

  const titles = {
    dashboard: 'Dashboard',
    produk: 'Stok Produk',
    bahan: 'Stok Bahan Baku',
    operasional: 'Biaya Operasional',
    pengaturan: 'Pengaturan & Laporan'
  };
  document.getElementById('topbarTitle').textContent = titles[name] || name;

  // Close sidebar on mobile
  if (window.innerWidth <= 768) closeSidebar();

  // Refresh page-specific content
  if (name === 'dashboard') refreshDashboard();
  if (name === 'produk') renderProdukTable();
  if (name === 'bahan') renderBahanTable();
  if (name === 'operasional') { renderOpsTable(); renderOpsChart(); }
  if (name === 'pengaturan') { loadSettingsForm(); updateFinancialSummary(); }
}

// =================== SIDEBAR ===================
document.getElementById('menuBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('active');
});
document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
document.getElementById('overlay').addEventListener('click', closeSidebar);

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('active');
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    showPage(item.dataset.page);
  });
});

// =================== NOTIFICATION ===================
document.getElementById('notifBtn').addEventListener('click', () => {
  document.getElementById('notifPanel').classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#notifBtn') && !e.target.closest('#notifPanel')) {
    document.getElementById('notifPanel').classList.add('hidden');
  }
});

// =================== DATE ===================
function updateDate() {
  const now = new Date();
  const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  document.getElementById('topbarDate').textContent = now.toLocaleDateString('id-ID', opts);
}

// =================== HELPERS ===================
function rupiah(n) {
  if (isNaN(n)) return 'Rp 0';
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), duration);
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// =================== DASHBOARD ===================
let cashflowChart = null;

function refreshDashboard() {
  const thisMonth = new Date().toISOString().slice(0, 7);

  // Income from penjualan this month
  const income = state.penjualan
    .filter(p => p.tanggal.startsWith(thisMonth))
    .reduce((s, p) => s + p.total, 0);

  // Expense = operasional this month
  const expense = state.operasional
    .filter(o => o.tanggal.startsWith(thisMonth))
    .reduce((s, o) => s + o.jumlah, 0);

  const profit = income - expense;
  const orders = state.penjualan.filter(p => p.tanggal.startsWith(thisMonth)).reduce((s, p) => s + p.qty, 0);

  document.getElementById('dashIncome').textContent = rupiah(income);
  document.getElementById('dashExpense').textContent = rupiah(expense);
  document.getElementById('dashProfit').textContent = rupiah(profit);
  document.getElementById('dashOrders').textContent = orders + ' item';

  renderStockAlerts();
  renderTopProducts();
  renderCashflowChart();
}

function renderStockAlerts() {
  const container = document.getElementById('stockAlerts');
  const alerts = [];

  state.produk.forEach(p => {
    if (p.stok <= 0) alerts.push(`⚠ ${p.nama} — Stok habis!`);
    else if (p.stok <= (p.stokMin || 5)) alerts.push(`⚠ ${p.nama} — Stok rendah (${p.stok} tersisa)`);
  });
  state.bahan.forEach(b => {
    if (b.stok <= 0) alerts.push(`⚠ Bahan: ${b.nama} — Habis!`);
    else if (b.stok <= (b.stokMin || 3)) alerts.push(`⚠ Bahan: ${b.nama} — Hampir habis (${b.stok} ${b.satuan})`);
  });

  // Update notification badge
  document.getElementById('notifBadge').textContent = alerts.length;
  document.getElementById('notifBadge').style.display = alerts.length ? 'flex' : 'none';

  if (alerts.length === 0) {
    container.innerHTML = '<div class="empty-state">Semua stok aman ✓</div>';
  } else {
    container.innerHTML = alerts.map(a => `<div class="alert-item">${a}</div>`).join('');
  }
}

function renderTopProducts() {
  const container = document.getElementById('topProductsList');
  const sales = {};
  state.penjualan.forEach(p => {
    if (!sales[p.produkNama]) sales[p.produkNama] = { qty: 0, total: 0 };
    sales[p.produkNama].qty += p.qty;
    sales[p.produkNama].total += p.total;
  });

  const sorted = Object.entries(sales).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);
  if (sorted.length === 0) {
    container.innerHTML = '<div class="empty-state">Belum ada data penjualan</div>';
  } else {
    container.innerHTML = sorted.map(([nama, d]) =>
      `<div class="top-item">
        <span>${nama}</span>
        <span style="color:var(--income);font-weight:600">${rupiah(d.total)}</span>
      </div>`
    ).join('');
  }
}

function renderCashflowChart() {
  const ctx = document.getElementById('cashflowChart');
  if (!ctx) return;
  if (cashflowChart) { cashflowChart.destroy(); cashflowChart = null; }

  const days = 7;
  const labels = [];
  const incomeData = [];
  const expenseData = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayLabel = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });
    labels.push(dayLabel);

    const dayIncome = state.penjualan.filter(p => p.tanggal === dateStr).reduce((s, p) => s + p.total, 0);
    const dayExpense = state.operasional.filter(o => o.tanggal === dateStr).reduce((s, o) => s + o.jumlah, 0);
    incomeData.push(dayIncome);
    expenseData.push(dayExpense);
  }

  cashflowChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Uang Masuk',
          data: incomeData,
          backgroundColor: '#d8f3dc',
          borderColor: '#2d6a4f',
          borderWidth: 1.5,
          borderRadius: 5,
        },
        {
          label: 'Uang Keluar',
          data: expenseData,
          backgroundColor: '#ffe5e7',
          borderColor: '#c1121f',
          borderWidth: 1.5,
          borderRadius: 5,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 11 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ${rupiah(c.raw)}`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: '#f0ece4' },
          ticks: {
            font: { size: 11 },
            callback: v => v >= 1000 ? (v/1000)+'K' : v
          }
        }
      }
    }
  });
}

// =================== PRODUK ===================
function openAddProductModal() {
  document.getElementById('editProdukIndex').value = '';
  document.getElementById('modalProdukTitle').textContent = 'Tambah Produk Baru';
  ['inputProdukNama','inputProdukHarga','inputProdukStok','inputProdukStokMin','inputProdukDesc'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('inputProdukKategori').value = 'Nasi Box';
  openModal('modalProduk');
}

function saveProduk() {
  const nama = document.getElementById('inputProdukNama').value.trim();
  const kategori = document.getElementById('inputProdukKategori').value;
  const harga = parseFloat(document.getElementById('inputProdukHarga').value);
  const stok = parseInt(document.getElementById('inputProdukStok').value);
  const stokMin = parseInt(document.getElementById('inputProdukStokMin').value) || 5;
  const desc = document.getElementById('inputProdukDesc').value.trim();

  if (!nama || isNaN(harga) || isNaN(stok)) {
    showToast('⚠ Mohon lengkapi field yang wajib diisi');
    return;
  }

  const editIdx = document.getElementById('editProdukIndex').value;
  const item = { nama, kategori, harga, stok, stokMin, desc, terjual: 0 };

  if (editIdx !== '') {
    const existing = state.produk[editIdx];
    item.terjual = existing.terjual || 0;
    state.produk[editIdx] = item;
    showToast('✓ Produk berhasil diperbarui');
  } else {
    state.produk.push(item);
    showToast('✓ Produk berhasil ditambahkan');
  }

  saveState();
  closeModal('modalProduk');
  renderProdukTable();
  updateProdukStats();
}

function editProduk(idx) {
  const p = state.produk[idx];
  document.getElementById('editProdukIndex').value = idx;
  document.getElementById('modalProdukTitle').textContent = 'Edit Produk';
  document.getElementById('inputProdukNama').value = p.nama;
  document.getElementById('inputProdukKategori').value = p.kategori;
  document.getElementById('inputProdukHarga').value = p.harga;
  document.getElementById('inputProdukStok').value = p.stok;
  document.getElementById('inputProdukStokMin').value = p.stokMin || 5;
  document.getElementById('inputProdukDesc').value = p.desc || '';
  openModal('modalProduk');
}

function deleteProduk(idx) {
  if (!confirm('Hapus produk ini?')) return;
  state.produk.splice(idx, 1);
  saveState();
  renderProdukTable();
  updateProdukStats();
  showToast('Produk dihapus');
}

function openJualModal(idx) {
  const p = state.produk[idx];
  document.getElementById('jualProdukIndex').value = idx;
  document.getElementById('jualProdukNama').value = p.nama;
  document.getElementById('jualJumlah').value = 1;
  document.getElementById('jualTanggal').value = today();
  document.getElementById('jualCatatan').value = '';
  openModal('modalJual');
}

function saveJual() {
  const idx = parseInt(document.getElementById('jualProdukIndex').value);
  const qty = parseInt(document.getElementById('jualJumlah').value);
  const tanggal = document.getElementById('jualTanggal').value;
  const catatan = document.getElementById('jualCatatan').value;

  if (isNaN(qty) || qty < 1) { showToast('⚠ Jumlah tidak valid'); return; }
  const p = state.produk[idx];
  if (qty > p.stok) { showToast('⚠ Jumlah melebihi stok tersedia (' + p.stok + ')'); return; }

  p.stok -= qty;
  p.terjual = (p.terjual || 0) + qty;

  state.penjualan.push({
    produkNama: p.nama,
    qty,
    harga: p.harga,
    total: p.harga * qty,
    tanggal,
    catatan
  });

  saveState();
  closeModal('modalJual');
  renderProdukTable();
  updateProdukStats();
  refreshDashboard();
  showToast(`✓ ${qty}x ${p.nama} berhasil dicatat`);
}

function renderProdukTable() {
  const search = (document.getElementById('searchProduk').value || '').toLowerCase();
  const filterKat = document.getElementById('filterKategoriProduk').value;
  const tbody = document.getElementById('produkTableBody');

  const filtered = state.produk.filter((p, i) => {
    const matchSearch = p.nama.toLowerCase().includes(search);
    const matchKat = !filterKat || p.kategori === filterKat;
    return matchSearch && matchKat;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Tidak ada produk ditemukan.</td></tr>';
  } else {
    tbody.innerHTML = filtered.map((p, i) => {
      const realIdx = state.produk.indexOf(p);
      const pendapatan = (p.terjual || 0) * p.harga;
      let status = '<span class="badge badge-ok">Tersedia</span>';
      if (p.stok <= 0) status = '<span class="badge badge-out">Habis</span>';
      else if (p.stok <= (p.stokMin || 5)) status = '<span class="badge badge-low">Rendah</span>';
      return `<tr>
        <td><strong>${p.nama}</strong><br><small style="color:var(--text-muted)">${p.desc || ''}</small></td>
        <td>${p.kategori}</td>
        <td>${rupiah(p.harga)}</td>
        <td><strong>${p.stok}</strong></td>
        <td>${p.terjual || 0}</td>
        <td style="color:var(--income);font-weight:600">${rupiah(pendapatan)}</td>
        <td>${status}</td>
        <td>
          <button class="btn-icon" onclick="openJualModal(${realIdx})" title="Catat Penjualan">💰</button>
          <button class="btn-icon" onclick="editProduk(${realIdx})" title="Edit">✏</button>
          <button class="btn-icon" onclick="deleteProduk(${realIdx})" title="Hapus">🗑</button>
        </td>
      </tr>`;
    }).join('');
  }

  updateProdukStats();
}

function updateProdukStats() {
  const income = state.produk.reduce((s, p) => s + (p.terjual || 0) * p.harga, 0);
  document.getElementById('produkIncome').textContent = rupiah(income);
  document.getElementById('totalProduk').textContent = state.produk.length;
  document.getElementById('lowStockProduk').textContent = state.produk.filter(p => p.stok <= (p.stokMin || 5)).length;
}

document.getElementById('searchProduk').addEventListener('input', renderProdukTable);
document.getElementById('filterKategoriProduk').addEventListener('change', renderProdukTable);

// =================== BAHAN BAKU ===================
function openAddBahanModal() {
  document.getElementById('editBahanIndex').value = '';
  document.getElementById('modalBahanTitle').textContent = 'Tambah Bahan Baku';
  ['inputBahanNama','inputBahanHarga','inputBahanStok','inputBahanStokMin'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('inputBahanKategori').value = 'Bumbu';
  document.getElementById('inputBahanSatuan').value = 'kg';
  openModal('modalBahan');
}

function saveBahan() {
  const nama = document.getElementById('inputBahanNama').value.trim();
  const kategori = document.getElementById('inputBahanKategori').value;
  const satuan = document.getElementById('inputBahanSatuan').value;
  const harga = parseFloat(document.getElementById('inputBahanHarga').value);
  const stok = parseFloat(document.getElementById('inputBahanStok').value);
  const stokMin = parseFloat(document.getElementById('inputBahanStokMin').value) || 3;

  if (!nama || isNaN(harga) || isNaN(stok)) {
    showToast('⚠ Mohon lengkapi semua field wajib');
    return;
  }

  const editIdx = document.getElementById('editBahanIndex').value;
  const item = { nama, kategori, satuan, harga, stok, stokMin };

  if (editIdx !== '') {
    state.bahan[editIdx] = item;
    showToast('✓ Bahan berhasil diperbarui');
  } else {
    state.bahan.push(item);
    showToast('✓ Bahan baku berhasil ditambahkan');
  }

  saveState();
  closeModal('modalBahan');
  renderBahanTable();
}

function editBahan(idx) {
  const b = state.bahan[idx];
  document.getElementById('editBahanIndex').value = idx;
  document.getElementById('modalBahanTitle').textContent = 'Edit Bahan Baku';
  document.getElementById('inputBahanNama').value = b.nama;
  document.getElementById('inputBahanKategori').value = b.kategori;
  document.getElementById('inputBahanSatuan').value = b.satuan;
  document.getElementById('inputBahanHarga').value = b.harga;
  document.getElementById('inputBahanStok').value = b.stok;
  document.getElementById('inputBahanStokMin').value = b.stokMin || 3;
  openModal('modalBahan');
}

function deleteBahan(idx) {
  if (!confirm('Hapus bahan baku ini?')) return;
  state.bahan.splice(idx, 1);
  saveState();
  renderBahanTable();
  showToast('Bahan baku dihapus');
}

function renderBahanTable() {
  const search = (document.getElementById('searchBahan').value || '').toLowerCase();
  const filterKat = document.getElementById('filterKategoriBahan').value;
  const tbody = document.getElementById('bahanTableBody');

  const filtered = state.bahan.filter(b => {
    return b.nama.toLowerCase().includes(search) && (!filterKat || b.kategori === filterKat);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Tidak ada bahan baku ditemukan.</td></tr>';
  } else {
    tbody.innerHTML = filtered.map(b => {
      const realIdx = state.bahan.indexOf(b);
      let status = '<span class="badge badge-ok">Cukup</span>';
      if (b.stok <= 0) status = '<span class="badge badge-out">Habis</span>';
      else if (b.stok <= (b.stokMin || 3)) status = '<span class="badge badge-low">Hampir Habis</span>';
      return `<tr>
        <td><strong>${b.nama}</strong></td>
        <td>${b.kategori}</td>
        <td>${rupiah(b.harga)}</td>
        <td><strong>${b.stok}</strong></td>
        <td>${b.satuan}</td>
        <td>${b.stokMin || 3} ${b.satuan}</td>
        <td>${status}</td>
        <td>
          <button class="btn-icon" onclick="editBahan(${realIdx})" title="Edit">✏</button>
          <button class="btn-icon" onclick="deleteBahan(${realIdx})" title="Hapus">🗑</button>
        </td>
      </tr>`;
    }).join('');
  }

  // Stats
  const totalNilai = state.bahan.reduce((s, b) => s + b.harga * b.stok, 0);
  const low = state.bahan.filter(b => b.stok <= (b.stokMin || 3)).length;
  document.getElementById('bahanTotal').textContent = rupiah(totalNilai);
  document.getElementById('totalBahan').textContent = state.bahan.length;
  document.getElementById('lowBahan').textContent = low;
}

document.getElementById('searchBahan').addEventListener('input', renderBahanTable);
document.getElementById('filterKategoriBahan').addEventListener('change', renderBahanTable);

// =================== OPERASIONAL ===================
let opsChart = null;

function openAddOpsModal() {
  document.getElementById('editOpsIndex').value = '';
  document.getElementById('inputOpsDesc').value = '';
  document.getElementById('inputOpsJumlah').value = '';
  document.getElementById('inputOpsTanggal').value = today();
  document.getElementById('inputOpsKategori').value = 'Transportasi';
  document.getElementById('inputOpsMetode').value = 'Tunai';
  openModal('modalOps');
}

function saveOps() {
  const desc = document.getElementById('inputOpsDesc').value.trim();
  const kategori = document.getElementById('inputOpsKategori').value;
  const jumlah = parseFloat(document.getElementById('inputOpsJumlah').value);
  const tanggal = document.getElementById('inputOpsTanggal').value;
  const metode = document.getElementById('inputOpsMetode').value;

  if (!desc || isNaN(jumlah) || !tanggal) {
    showToast('⚠ Mohon lengkapi semua field wajib');
    return;
  }

  const editIdx = document.getElementById('editOpsIndex').value;
  const item = { desc, kategori, jumlah, tanggal, metode };

  if (editIdx !== '') {
    state.operasional[editIdx] = item;
    showToast('✓ Biaya berhasil diperbarui');
  } else {
    state.operasional.push(item);
    showToast('✓ Biaya operasional dicatat');
  }

  saveState();
  closeModal('modalOps');
  renderOpsTable();
  renderOpsChart();
}

function editOps(idx) {
  const o = state.operasional[idx];
  document.getElementById('editOpsIndex').value = idx;
  document.getElementById('inputOpsDesc').value = o.desc;
  document.getElementById('inputOpsKategori').value = o.kategori;
  document.getElementById('inputOpsJumlah').value = o.jumlah;
  document.getElementById('inputOpsTanggal').value = o.tanggal;
  document.getElementById('inputOpsMetode').value = o.metode;
  openModal('modalOps');
}

function deleteOps(idx) {
  if (!confirm('Hapus catatan biaya ini?')) return;
  state.operasional.splice(idx, 1);
  saveState();
  renderOpsTable();
  renderOpsChart();
  showToast('Catatan biaya dihapus');
}

function filterOps() {
  renderOpsTable();
}

function renderOpsTable() {
  const filterMonth = document.getElementById('filterOpsMonth').value;
  const filterKat = document.getElementById('filterOpsKategori').value;
  const tbody = document.getElementById('opsTableBody');

  const filtered = state.operasional.filter(o => {
    const matchMonth = !filterMonth || o.tanggal.startsWith(filterMonth);
    const matchKat = !filterKat || o.kategori === filterKat;
    return matchMonth && matchKat;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Tidak ada catatan biaya.</td></tr>';
  } else {
    const sorted = [...filtered].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    tbody.innerHTML = sorted.map(o => {
      const realIdx = state.operasional.indexOf(o);
      const d = new Date(o.tanggal);
      const dateStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
      return `<tr>
        <td>${dateStr}</td>
        <td>${o.desc}</td>
        <td><span class="badge badge-ok">${o.kategori}</span></td>
        <td style="color:var(--expense);font-weight:600">${rupiah(o.jumlah)}</td>
        <td>${o.metode}</td>
        <td>
          <button class="btn-icon" onclick="editOps(${realIdx})" title="Edit">✏</button>
          <button class="btn-icon" onclick="deleteOps(${realIdx})" title="Hapus">🗑</button>
        </td>
      </tr>`;
    }).join('');
  }

  // Stats
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTotal = state.operasional.filter(o => o.tanggal.startsWith(thisMonth)).reduce((s, o) => s + o.jumlah, 0);
  document.getElementById('opsTotal').textContent = rupiah(monthTotal);
  document.getElementById('opsTxCount').textContent = state.operasional.length;

  // Biggest category
  const byKat = {};
  state.operasional.forEach(o => { byKat[o.kategori] = (byKat[o.kategori] || 0) + o.jumlah; });
  const biggest = Object.entries(byKat).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('opsTerbesar').textContent = biggest ? biggest[0] : '-';
}

function renderOpsChart() {
  const ctx = document.getElementById('opsChart');
  if (!ctx) return;
  if (opsChart) { opsChart.destroy(); opsChart = null; }

  const cats = ['Transportasi', 'Tenaga Kerja', 'Utilitas', 'Peralatan', 'Lain-lain'];
  const data = cats.map(c => state.operasional.filter(o => o.kategori === c).reduce((s, o) => s + o.jumlah, 0));

  opsChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: cats,
      datasets: [{
        data,
        backgroundColor: ['#2d6a4f','#52b788','#b7e4c7','#e9c46a','#f4a261'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 11 }, boxWidth: 12, padding: 10 } },
        tooltip: { callbacks: { label: (c) => `${c.label}: ${rupiah(c.raw)}` } }
      }
    }
  });
}

// =================== SETTINGS ===================
function loadSettingsForm() {
  document.getElementById('settingNamaBisnis').value = state.settings.namaBisnis || '';
  document.getElementById('settingNamaAdmin').value = state.settings.namaAdmin || '';
  document.getElementById('settingEmail').value = state.settings.email || '';
  document.getElementById('settingTelp').value = state.settings.telp || '';
}

function saveSettings() {
  state.settings.namaBisnis = document.getElementById('settingNamaBisnis').value.trim();
  state.settings.namaAdmin = document.getElementById('settingNamaAdmin').value.trim();
  state.settings.email = document.getElementById('settingEmail').value.trim();
  state.settings.telp = document.getElementById('settingTelp').value.trim();
  saveState();
  showToast('✓ Pengaturan berhasil disimpan');
}

function updateFinancialSummary() {
  const period = document.getElementById('reportPeriod').value;
  const now = new Date();
  let startDate;

  if (period === 'harian') {
    startDate = now.toISOString().split('T')[0];
  } else if (period === 'mingguan') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    startDate = d.toISOString().split('T')[0];
  } else {
    startDate = now.toISOString().slice(0, 7);
  }

  const inFilter = period === 'bulanan'
    ? (d) => d.startsWith(startDate)
    : (d) => d >= startDate;

  const income = state.penjualan.filter(p => inFilter(p.tanggal)).reduce((s, p) => s + p.total, 0);
  const opsTotal = state.operasional.filter(o => inFilter(o.tanggal)).reduce((s, o) => s + o.jumlah, 0);
  const bahanTotal = state.bahan.reduce((s, b) => s + b.harga * b.stok, 0);
  const gross = income - (bahanTotal * 0.3); // estimate
  const net = income - opsTotal;
  const margin = income > 0 ? ((net / income) * 100).toFixed(1) : 0;

  document.getElementById('finIncome').textContent = rupiah(income);
  document.getElementById('finBahan').textContent = rupiah(Math.round(bahanTotal * 0.3));
  document.getElementById('finOps').textContent = rupiah(opsTotal);
  document.getElementById('finGross').textContent = rupiah(gross);
  document.getElementById('finNet').textContent = rupiah(net);
  document.getElementById('finMargin').textContent = margin + '%';
}

function downloadReport(type) {
  showToast(`📄 Menyiapkan laporan ${type}...`);
  setTimeout(() => {
    const content = generateReportContent(type);
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(content);
      win.document.close();
      setTimeout(() => win.print(), 500);
    }
  }, 500);
}

function generateReportContent(type) {
  const now = new Date();
  const bisnis = state.settings.namaBisnis || 'Catering';
  const income = state.penjualan.reduce((s, p) => s + p.total, 0);
  const opsTotal = state.operasional.reduce((s, o) => s + o.jumlah, 0);
  const net = income - opsTotal;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Laporan ${type} — ${bisnis}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 32px; color: #1e1a14; }
    h1 { color: #2d6a4f; font-size: 24px; }
    h2 { font-size: 16px; border-bottom: 2px solid #2d6a4f; padding-bottom: 6px; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
    th { background: #f0ece4; padding: 8px 12px; text-align: left; }
    td { padding: 7px 12px; border-bottom: 1px solid #e2dbd0; }
    .total { font-weight: bold; color: #2d6a4f; }
    .header-info { color: #7a7060; font-size: 13px; margin-bottom: 24px; }
    @media print { body { padding: 16px; } }
  </style></head><body>
  <h1>CatFin-R — Laporan ${type.charAt(0).toUpperCase() + type.slice(1)}</h1>
  <div class="header-info">
    <strong>${bisnis}</strong> · Dicetak: ${now.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
  </div>
  <h2>Ringkasan Keuangan</h2>
  <table>
    <tr><th>Keterangan</th><th>Nominal</th></tr>
    <tr><td>Total Pendapatan Penjualan</td><td class="total">${rupiah(income)}</td></tr>
    <tr><td>Total Biaya Operasional</td><td style="color:#c1121f">${rupiah(opsTotal)}</td></tr>
    <tr><td>Laba Bersih</td><td class="total">${rupiah(net)}</td></tr>
  </table>
  <h2>Detail Penjualan</h2>
  <table>
    <tr><th>Tanggal</th><th>Produk</th><th>Qty</th><th>Total</th></tr>
    ${state.penjualan.length === 0 ? '<tr><td colspan="4">Belum ada data penjualan</td></tr>' :
      state.penjualan.map(p => `<tr><td>${p.tanggal}</td><td>${p.produkNama}</td><td>${p.qty}</td><td>${rupiah(p.total)}</td></tr>`).join('')
    }
  </table>
  <h2>Detail Biaya Operasional</h2>
  <table>
    <tr><th>Tanggal</th><th>Deskripsi</th><th>Kategori</th><th>Jumlah</th></tr>
    ${state.operasional.length === 0 ? '<tr><td colspan="4">Belum ada catatan biaya</td></tr>' :
      state.operasional.map(o => `<tr><td>${o.tanggal}</td><td>${o.desc}</td><td>${o.kategori}</td><td>${rupiah(o.jumlah)}</td></tr>`).join('')
    }
  </table>
  </body></html>`;
}

// =================== INVOICE ===================
function generateInvoice() {
  document.getElementById('invTanggal').value = today();
  document.getElementById('invPelanggan').value = '';
  document.getElementById('invAlamat').value = '';
  renderInvItems();
  openModal('modalInvoice');
}

function renderInvItems() {
  const container = document.getElementById('invItems');
  const opts = state.produk.map((p, i) => `<option value="${i}">${p.nama} - ${rupiah(p.harga)}</option>`).join('');
  container.innerHTML = `<div class="inv-item-row">
    <select class="form-input" onchange="updateInvItem(this)"><option value="">Pilih Produk</option>${opts}</select>
    <input type="number" class="form-input small" placeholder="Qty" min="1" oninput="calcInvTotal()">
    <input type="text" class="form-input" placeholder="Subtotal" disabled>
    <button class="btn-icon-danger" onclick="removeInvRow(this)">✕</button>
  </div>`;
  calcInvTotal();
}

function addInvRow() {
  const opts = state.produk.map((p, i) => `<option value="${i}">${p.nama} - ${rupiah(p.harga)}</option>`).join('');
  const row = document.createElement('div');
  row.className = 'inv-item-row';
  row.innerHTML = `<select class="form-input" onchange="updateInvItem(this)"><option value="">Pilih Produk</option>${opts}</select>
    <input type="number" class="form-input small" placeholder="Qty" min="1" oninput="calcInvTotal()">
    <input type="text" class="form-input" placeholder="Subtotal" disabled>
    <button class="btn-icon-danger" onclick="removeInvRow(this)">✕</button>`;
  document.getElementById('invItems').appendChild(row);
}

function removeInvRow(btn) {
  btn.closest('.inv-item-row').remove();
  calcInvTotal();
}

function updateInvItem(sel) {
  calcInvTotal();
}

function calcInvTotal() {
  const rows = document.querySelectorAll('#invItems .inv-item-row');
  let total = 0;
  rows.forEach(row => {
    const sel = row.querySelector('select');
    const qty = parseInt(row.querySelectorAll('input')[0].value) || 0;
    const subInput = row.querySelectorAll('input')[1];
    if (sel.value !== '') {
      const p = state.produk[parseInt(sel.value)];
      if (p) {
        const sub = p.harga * qty;
        subInput.value = rupiah(sub);
        total += sub;
      }
    } else {
      subInput.value = '';
    }
  });
  document.getElementById('invTotal').textContent = rupiah(total);
}

function printInvoice() {
  const pelanggan = document.getElementById('invPelanggan').value.trim();
  if (!pelanggan) { showToast('⚠ Nama pelanggan wajib diisi'); return; }
  const alamat = document.getElementById('invAlamat').value;
  const tanggal = document.getElementById('invTanggal').value;
  const total = document.getElementById('invTotal').textContent;
  const bisnis = state.settings.namaBisnis || 'Catering Saya';
  const invNo = 'INV-' + Date.now().toString().slice(-6);

  const rows = [];
  document.querySelectorAll('#invItems .inv-item-row').forEach(row => {
    const sel = row.querySelector('select');
    const qty = parseInt(row.querySelectorAll('input')[0].value) || 0;
    if (sel.value !== '' && qty > 0) {
      const p = state.produk[parseInt(sel.value)];
      if (p) rows.push({ nama: p.nama, harga: p.harga, qty, sub: p.harga * qty });
    }
  });

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice ${invNo}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 640px; margin: 32px auto; padding: 24px; color: #1e1a14; }
    .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
    h1 { color: #2d6a4f; font-size: 28px; font-style: italic; }
    .inv-no { color: #7a7060; font-size: 13px; }
    .to-info { background: #f7f4ef; padding: 14px 18px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th { background: #1e1a14; color: white; padding: 9px 12px; text-align: left; font-size: 12px; text-transform: uppercase; }
    td { padding: 8px 12px; border-bottom: 1px solid #e2dbd0; font-size: 13px; }
    .total-row { font-size: 18px; font-weight: bold; color: #2d6a4f; text-align: right; padding: 12px 0; border-top: 2px solid #2d6a4f; }
    .footer { color: #7a7060; font-size: 12px; margin-top: 32px; text-align: center; }
    @media print { body { margin: 0; padding: 16px; } }
  </style></head><body>
  <div class="header">
    <div><h1>${bisnis}</h1><div class="inv-no">No. Invoice: ${invNo}</div></div>
    <div style="text-align:right;font-size:13px;color:#7a7060">Tanggal: ${new Date(tanggal).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</div>
  </div>
  <div class="to-info">
    <strong>Kepada:</strong> ${pelanggan}<br>
    ${alamat ? `<strong>Alamat:</strong> ${alamat}` : ''}
  </div>
  <table>
    <tr><th>Produk</th><th>Harga</th><th>Qty</th><th>Subtotal</th></tr>
    ${rows.map(r => `<tr><td>${r.nama}</td><td>${rupiah(r.harga)}</td><td>${r.qty}</td><td>${rupiah(r.sub)}</td></tr>`).join('')}
  </table>
  <div class="total-row">Total: ${total}</div>
  <div class="footer">Terima kasih atas kepercayaan Anda! · ${bisnis}</div>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
  closeModal('modalInvoice');
}

// =================== SEED DATA for demo ===================
function seedDemoData() {
  if (state.produk.length === 0) {
    state.produk = [
      { nama: 'Nasi Box Ayam Geprek', kategori: 'Nasi Box', harga: 35000, stok: 50, stokMin: 10, terjual: 0, desc: 'Nasi + ayam geprek + sayur + kerupuk' },
      { nama: 'Nasi Box Rendang', kategori: 'Nasi Box', harga: 45000, stok: 30, stokMin: 8, terjual: 0, desc: 'Nasi + rendang sapi + sayur' },
      { nama: 'Snack Box Premium', kategori: 'Snack', harga: 25000, stok: 8, stokMin: 10, terjual: 0, desc: 'Kue-kue pilihan premium' },
      { nama: 'Paket Pernikahan (100 pax)', kategori: 'Paket Acara', harga: 3500000, stok: 5, stokMin: 2, terjual: 0, desc: 'Paket lengkap pernikahan' },
    ];
    state.bahan = [
      { nama: 'Beras Premium', kategori: 'Karbohidrat', satuan: 'kg', harga: 15000, stok: 25, stokMin: 10 },
      { nama: 'Ayam Broiler', kategori: 'Daging & Protein', satuan: 'kg', harga: 35000, stok: 3, stokMin: 5 },
      { nama: 'Minyak Goreng', kategori: 'Minyak & Lemak', satuan: 'liter', harga: 18000, stok: 8, stokMin: 3 },
      { nama: 'Bumbu Rendang', kategori: 'Bumbu', satuan: 'pcs', harga: 12000, stok: 10, stokMin: 5 },
      { nama: 'Bawang Merah', kategori: 'Bumbu', satuan: 'kg', harga: 28000, stok: 2, stokMin: 3 },
    ];
    saveState();
  }
}

// =================== INIT ===================
function init() {
  loadState();
  seedDemoData();
  updateDate();
  setInterval(updateDate, 60000);

  // Set default filter month
  document.getElementById('filterOpsMonth').value = new Date().toISOString().slice(0, 7);

  // Set default report dates
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  document.getElementById('reportFrom').value = firstDay;
  document.getElementById('reportTo').value = today();

  showPage('dashboard');
}

init();
