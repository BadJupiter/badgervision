/* ═══════════════════════════════════════════
   APP INIT
════════════════════════════════════════════ */
const IPS_BIZ_ID   = 'ips';
const IPS_APP_TOKEN = 'ips-dashboard';

function showScreen(name, loadingMsg) {
  document.getElementById('screen-loading').style.display = name === 'loading' ? 'flex' : 'none';
  document.getElementById('screen-login').style.display   = name === 'login'   ? 'flex' : 'none';
  document.getElementById('app-shell').style.display      = name === 'app'     ? 'flex' : 'none';
  if (name === 'loading' && loadingMsg) {
    document.getElementById('loading-label').textContent = loadingMsg;
  }
}

window.addEventListener('load', async () => {
  // Start on loading screen — don't flash login if we have a valid cookie
  showScreen('loading', 'Checking credentials…');

  await j2AuthInit(IPS_BIZ_ID, IPS_APP_TOKEN);

  if (isAuthenticated && hasIPSAccess()) {
    await enterApp();
  } else {
    showScreen('login');
  }
});

/* ═══════════════════════════════════════════
   LOGIN FLOW
════════════════════════════════════════════ */
function formatPhone(input) {
  // Strip everything except digits
  let digits = input.value.replace(/\D/g, '');

  // Drop leading 1 for formatting (we'll add +1 prefix)
  if (digits.startsWith('1')) digits = digits.slice(1);
  digits = digits.slice(0, 10);

  let formatted = '';
  if (digits.length === 0) {
    formatted = '';
  } else if (digits.length <= 3) {
    formatted = `+1 (${digits}`;
  } else if (digits.length <= 6) {
    formatted = `+1 (${digits.slice(0,3)}) ${digits.slice(3)}`;
  } else {
    formatted = `+1 (${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }

  input.value = formatted;
}

function sendOTP() {
  clearLoginError();
  const phone = document.getElementById('phone-input').value.trim();
  if (!phone) { document.getElementById('phone-input').focus(); return; }

  const btn = document.getElementById('btn-send-otp');
  btn.disabled = true;
  btn.textContent = 'SENDING…';

  requestAuthenticationCode(phone, IPS_BIZ_ID).then(code => {
    btn.disabled = false;
    btn.textContent = 'Send Verification Code';
    if (!code) {
      alert('Could not send verification code. Please try again.');
      return;
    }
    document.getElementById('login-step1').style.display = 'none';
    document.getElementById('btn-send-otp').style.display = 'none';
    document.getElementById('login-step2').style.display = 'block';
    document.getElementById('btn-verify-otp').classList.remove('hidden');
    document.getElementById('otp-hint').textContent = `Code sent to ${phone}. Check your texts.`;
    document.getElementById('otp0').focus();
  });
}

function otpNext(idx) {
  const val = document.getElementById('otp' + idx).value;
  if (val.length === 1 && idx < 3) {
    document.getElementById('otp' + (idx + 1)).focus();
  }
  const allFilled = [0,1,2,3].every(i => document.getElementById('otp' + i).value.length === 1);
  if (allFilled) verifyOTP();
}

function otpBack(event, idx) {
  if (event.key === 'Backspace' && !document.getElementById('otp' + idx).value && idx > 0) {
    document.getElementById('otp' + (idx - 1)).focus();
  }
}

async function verifyOTP() {
  const btn = document.getElementById('btn-verify-otp');
  btn.disabled = true;
  btn.textContent = 'VERIFYING…';

  const code = [0,1,2,3].map(i => document.getElementById('otp' + i).value).join('');
  const ok = await verifyAuthenticationCode(code);

  if (!ok) {
    btn.disabled = false;
    btn.textContent = 'Verify & Sign In';
    [0,1,2,3].forEach(i => { document.getElementById('otp' + i).value = ''; });
    document.getElementById('otp0').focus();
    showLoginError('Incorrect code. Please try again.');
    return;
  }

  btn.disabled = false;
  btn.textContent = 'Verify & Sign In';

  if (!hasIPSAccess()) {
    showScreen('login');
    showLoginError('Your account does not have access to Badger Vision. Contact your administrator.');
    return;
  }

  await enterApp();
}

async function enterApp() {
  showScreen('loading', 'Loading fleet data…');
  const ok = await loadFleetData();
  if (!ok) {
    showScreen('login');
    showLoginError('Could not load fleet data. Check your connection and try again.');
    return;
  }

  CUSTOMER_NAMES = {};
  MACHINES.forEach(m => { if (m.customer_id) CUSTOMER_NAMES[m.customer_id] = m.customer_name; });
  populateCustomerPicker();

  // Show display name if available
  const name = userProfile?.user?.name || userProfile?.user?.mobile || '';
  if (name) document.getElementById('topnav-username').textContent = name;

  showScreen('app');
  history.replaceState({ page: 'overview', machineId: null }, '', '?page=overview');
  _applyPage('overview');
}

function hasIPSAccess() {
  const roles = userProfile?.biz_roles || [];
  return roles.includes('admin');
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearLoginError() {
  document.getElementById('login-error').classList.add('hidden');
}

function signOut() {
  // Clear the device cookie
  document.cookie = 'jupiterDeviceID=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  isAuthenticated = false;

  showScreen('login');
  document.getElementById('login-step1').style.display = '';
  document.getElementById('btn-send-otp').style.display = '';
  document.getElementById('login-step2').style.display = 'none';
  document.getElementById('btn-verify-otp').classList.add('hidden');
  document.getElementById('phone-input').value = '';
  [0,1,2,3].forEach(i => document.getElementById('otp' + i).value = '');
  history.replaceState({}, '', '/');
}

/* ═══════════════════════════════════════════
   PAGE ROUTING
════════════════════════════════════════════ */

// Render the active page without touching history (used by popstate).
function _applyPage(page, machineId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.topnav-nav a').forEach(a => a.classList.remove('active'));

  if (page === 'overview') {
    document.getElementById('page-overview').classList.add('active');
    document.getElementById('nav-overview').classList.add('active');
    applyCustomerFilter();
  } else if (page === 'search') {
    document.getElementById('page-search').classList.add('active');
    document.getElementById('nav-search').classList.add('active');
  } else if (page === 'detail') {
    document.getElementById('page-detail').classList.add('active');
    renderMachineDetail(machineId);
  }
}

// Navigate to a page, pushing a history entry so the back button works.
function showPage(page, machineId) {
  const state = { page, machineId: machineId || null };
  const url = machineId ? `?page=${page}&id=${encodeURIComponent(machineId)}` : `?page=${page}`;
  history.pushState(state, '', url);
  _applyPage(page, machineId);
}

// The back-button (and forward) fires popstate — just re-render from state.
window.addEventListener('popstate', (e) => {
  if (e.state) {
    _applyPage(e.state.page, e.state.machineId);
  }
});

function goBack() {
  history.back();
}

/* ═══════════════════════════════════════════
   FLEET TABLE
════════════════════════════════════════════ */

let scopedMachines = MACHINES;
let filteredMachines = MACHINES;
let currentPage = 1;
const PAGE_SIZE = 25;
let CUSTOMER_NAMES = {};

function populateCustomerPicker() {
  const select = document.getElementById('customer-picker');
  while (select.options.length > 1) select.remove(1);
  Object.entries(CUSTOMER_NAMES)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([id, name]) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      select.appendChild(opt);
    });
}

const RECENT_CUTOFF_DAYS = 30;

let statFilter = 'all'; // 'all' | 'activated' | 'reports' | 'recent'

function applyCustomerFilter() {
  const custId = document.getElementById('customer-picker').value;
  scopedMachines = custId ? MACHINES.filter(m => m.customer_id === custId) : MACHINES;

  const activated   = scopedMachines.filter(m => m.activated !== false);
  const total       = scopedMachines.length;
  const activatedCount = activated.length;
  const unactivatedCount = scopedMachines.length - activatedCount;
  const withReports = activated.filter(m => m.service_report_count > 0).length;
  const cutoff      = new Date(); cutoff.setDate(cutoff.getDate() - RECENT_CUTOFF_DAYS);
  const recentIds   = new Set(
    Object.values(SERVICE_REPORTS)
      .flat()
      .filter(r => r.date_str && new Date(r.date_str) >= cutoff)
      .map(r => r.file_id)
  );
  const recent      = recentIds.size;

  document.getElementById('stat-total').textContent      = total;
  document.getElementById('stat-verified').textContent   = activatedCount;
  document.getElementById('stat-reports').textContent    = withReports;
  document.getElementById('stat-recent').textContent     = recent;

  if (custId) {
    document.getElementById('stat-total-meta').textContent    = CUSTOMER_NAMES[custId];
    document.getElementById('stat-verified-meta').textContent = unactivatedCount + ' pending activation';
  } else {
    const custCount = new Set(scopedMachines.map(m => m.customer_id)).size;
    document.getElementById('stat-total-meta').textContent    = 'Across ' + custCount + ' customer accounts';
    document.getElementById('stat-verified-meta').textContent = unactivatedCount + ' pending activation';
  }

  document.getElementById('table-heading').textContent = custId
    ? CUSTOMER_NAMES[custId] + ' — Fleet'
    : 'All Machines';

  document.getElementById('table-filter').value = '';
  filteredMachines = scopedMachines;
  statFilter = 'all';
  currentPage = 1;
  renderFleetTable();
}

function setStatFilter(f) {
  statFilter = statFilter === f ? 'all' : f; // click active tile to clear
  currentPage = 1;
  renderFleetTable();
}

function goToPage(p) {
  currentPage = p;
  renderFleetTable();
}

function renderFleetTable() {
  const tbody = document.getElementById('fleet-tbody');
  const machines = filteredMachines;
  const activated   = machines.filter(m => m.activated !== false);
  const unactivated = machines.filter(m => m.activated === false);

  // Apply stat card filter
  const cutoffStat = new Date(); cutoffStat.setDate(cutoffStat.getDate() - RECENT_CUTOFF_DAYS);
  const recentMachineIds = new Set(
    Object.entries(SERVICE_REPORTS)
      .filter(([, reports]) => reports.some(r => r.date_str && new Date(r.date_str) >= cutoffStat))
      .map(([id]) => id)
  );
  let visibleActivated = activated;
  let visibleUnactivated = statFilter === 'all' ? unactivated : [];
  if (statFilter === 'activated') visibleActivated = activated;
  if (statFilter === 'reports')   visibleActivated = activated.filter(m => m.service_report_count > 0);
  if (statFilter === 'recent')    visibleActivated = activated.filter(m => recentMachineIds.has(m.jp_machine_id));

  // Highlight active stat card
  ['stat-card-all', 'stat-card-activated', 'stat-card-reports', 'stat-card-recent'].forEach(id => {
    document.getElementById(id)?.classList.remove('stat-card-active');
  });
  if (statFilter !== 'all') document.getElementById('stat-card-' + statFilter)?.classList.add('stat-card-active');

  document.getElementById('table-count').textContent = visibleActivated.length +
    (visibleUnactivated.length ? ` + ${visibleUnactivated.length} pending` : '');

  // Build the full ordered list
  const allRows = [...visibleActivated, ...visibleUnactivated];
  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const pageRows = allRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Mobile: page slice
  document.getElementById('fleet-mobile-list').innerHTML = pageRows.map(m => m.activated === false ? `
    <div class="fleet-mobile-item unactivated">
      <div class="fmi-main">
        <div class="fmi-location">${m.location_name || '—'}</div>
        <div class="fmi-meta">${m.city || ''}, ${m.state || ''} · Not yet activated</div>
      </div>
      <div class="fmi-right">
        <span class="machine-id">${m.slug}</span>
        <span class="unactivated-badge">Pending</span>
      </div>
    </div>
  ` : `
    <div class="fleet-mobile-item" onclick="showPage('detail','${m.jp_machine_id}')">
      <div class="fmi-main">
        <div class="fmi-location">${m.location_name}</div>
        <div class="fmi-meta">${m.city}, ${m.state} · ${m.genset_make} ${m.genset_kw} kW</div>
      </div>
      <div class="fmi-right">
        <span class="machine-id">${m.jp_machine_id}</span>
        <span class="fmi-reports">${m.service_report_count} report${m.service_report_count !== 1 ? 's' : ''}</span>
      </div>
    </div>
  `).join('');

  // Desktop: page slice
  tbody.innerHTML = pageRows.map(m => m.activated === false ? `
    <tr class="unactivated-row">
      <td><span class="machine-id unactivated-id">${m.slug}</span></td>
      <td>—</td>
      <td style="font-weight:600;color:var(--gray4)">${m.location_name || '—'}</td>
      <td style="font-size:12px;color:var(--gray4)">${m.city || ''}, ${m.state || ''}</td>
      <td colspan="4" style="color:var(--gray4);font-style:italic;font-size:12px">Not yet activated — awaiting technician scan</td>
      <td><span class="unactivated-badge">Pending</span></td>
      <td></td>
    </tr>
  ` : `
    <tr onclick="showPage('detail','${m.jp_machine_id}')">
      <td><span class="machine-id">${m.jp_machine_id}</span></td>
      <td class="mono" style="font-size:12px;color:var(--gray5)">${m.customer_machine_id || '—'}</td>
      <td style="font-weight:600;color:var(--navy)">${m.location_name}</td>
      <td style="font-size:12px;color:var(--gray5)">${m.city}, ${m.state}</td>
      <td>
        <div style="font-weight:600;font-size:13px">${m.genset_make}</div>
        <div style="font-size:11px;color:var(--gray4);font-family:'IBM Plex Sans',monospace">${m.genset_model}</div>
      </td>
      <td class="mono" style="font-size:13px;color:var(--navy3);font-weight:500">${m.genset_kw} kW</td>
      <td>
        <span class="status-badge ${m.management_status === 'ACTIVE' ? 'active' : 'inactive'}">
          <span class="status-dot"></span>
          ${m.management_status === 'ACTIVE' ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td style="text-align:center">
        ${m.has_verified_specs
          ? '<span style="color:var(--green);font-size:14px" title="Verified">✓</span>'
          : '<span style="color:var(--gray3);font-size:14px" title="Unverified">○</span>'}
      </td>
      <td><span class="report-count">${m.service_report_count}</span></td>
      <td style="color:var(--gray3);font-size:16px">›</td>
    </tr>
  `).join('');

  // Pagination controls
  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end   = Math.min(currentPage * PAGE_SIZE, allRows.length);
  document.getElementById('pagination-label').textContent =
    allRows.length ? `Showing ${start}–${end} of ${allRows.length}` : 'No results';

  const btns = document.getElementById('pagination-btns');
  btns.innerHTML = '';

  const addBtn = (label, page, active, disabled) => {
    const b = document.createElement('button');
    b.className = 'page-btn' + (active ? ' active' : '');
    b.textContent = label;
    b.disabled = disabled;
    if (!disabled) b.onclick = () => goToPage(page);
    btns.appendChild(b);
  };

  addBtn('‹', currentPage - 1, false, currentPage === 1);

  // Show up to 5 page numbers centred on current page
  let lo = Math.max(1, currentPage - 2);
  let hi = Math.min(totalPages, lo + 4);
  lo = Math.max(1, hi - 4);
  for (let p = lo; p <= hi; p++) addBtn(p, p, p === currentPage, false);

  addBtn('›', currentPage + 1, false, currentPage === totalPages);
}

function machineMatchesTerms(m, rawQuery) {
  const fields = [m.jp_machine_id, m.customer_machine_id, m.location_name,
                  m.city, m.state, m.genset_make, m.genset_model];
  const terms = rawQuery.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length >= 1);
  if (terms.length === 0) return true;
  return terms.every(term => fields.some(v => v && v.toLowerCase().includes(term)));
}

function filterTable() {
  const q = document.getElementById('table-filter').value;
  const terms = q.split(',').map(t => t.trim()).filter(t => t.length > 0);
  filteredMachines = terms.length === 0 ? scopedMachines
    : scopedMachines.filter(m => machineMatchesTerms(m, q));
  currentPage = 1;
  renderFleetTable();
}

/* ═══════════════════════════════════════════
   SEARCH
════════════════════════════════════════════ */
let searchTimer = null;

function runSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(_doSearch, 300);
}

function _doSearch() {
  const q = document.getElementById('main-search').value.trim();
  const make = document.getElementById('filter-make').value;
  const kwMin = parseInt(document.getElementById('filter-kw-min').value) || 0;
  const kwMax = parseInt(document.getElementById('filter-kw-max').value) || 99999;
  const state = document.getElementById('filter-state').value;

  const wrap = document.getElementById('search-results-wrap');
  const empty = document.getElementById('search-empty');

  const terms = q.split(',').map(t => t.trim()).filter(t => t.length > 0);
  const hasTextQuery = terms.length > 0;

  if (!hasTextQuery && !make && !state) {
    wrap.classList.add('hidden');
    empty.classList.add('hidden');
    return;
  }

  const results = MACHINES.filter(m => {
    const textMatch = !hasTextQuery || machineMatchesTerms(m, q);
    const makeMatch = !make || m.genset_make === make;
    const kwMatch = parseInt(m.genset_kw) >= kwMin && parseInt(m.genset_kw) <= kwMax;
    const stateMatch = !state || m.state === state;
    return textMatch && makeMatch && kwMatch && stateMatch;
  });

  if (results.length === 0) {
    wrap.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  wrap.classList.remove('hidden');
  document.getElementById('search-results-label').textContent = `${results.length} machine${results.length !== 1 ? 's' : ''} found`;

  document.getElementById('result-cards').innerHTML = results.map(m => `
    <div class="result-card" onclick="showPage('detail','${m.jp_machine_id}')">
      <div class="result-id"><span class="machine-id">${m.jp_machine_id}</span></div>
      <div>
        <div class="result-location-name">${m.location_name}</div>
        <div class="result-address">${m.address_1 || ''}, ${m.city}, ${m.state}</div>
      </div>
      <div class="result-specs">
        <div class="result-make">${m.genset_make} ${m.genset_model}</div>
        <div class="result-kw">${m.genset_kw} kW · ${m.fuel_type}</div>
      </div>
      <div class="result-reports">
        <div style="font-size:16px;font-weight:700;color:var(--navy)">${m.service_report_count}</div>
        <div>reports</div>
      </div>
      <div class="result-arrow">›</div>
    </div>
  `).join('');
}

function toggleFilters() {
  const el = document.getElementById('advanced-filters');
  const toggle = document.getElementById('filters-toggle');
  el.classList.toggle('hidden');
  toggle.classList.toggle('open');
}

/* ═══════════════════════════════════════════
   MACHINE DETAIL
════════════════════════════════════════════ */
function renderMachineDetail(machineId) {
  const m = MACHINES.find(x => x.jp_machine_id === machineId);
  if (!m) return;

  document.getElementById('detail-machine-id').textContent = m.jp_machine_id;
  document.getElementById('detail-location-name').textContent = m.location_name;
  document.getElementById('detail-address').textContent =
    `${m.address_1}, ${m.city}, ${m.state} ${m.zip} · ${m.customer_name}`;

  const verifiedBanner = document.getElementById('detail-verified-banner');
  verifiedBanner.textContent = m.last_verified_at
    ? '✓ Verified ' + fmtDate(m.last_verified_at)
    : '';

  document.getElementById('rows-identity').innerHTML = infoRows([
    ['Machine ID',  `<span class="machine-id">${m.jp_machine_id}</span>`],
    ['Facility ID', m.customer_machine_id || '—'],
    ['Customer',    m.customer_name]
  ]);

  document.getElementById('rows-genset').innerHTML = infoRows([
    ['Make',      m.genset_make],
    ['Model',     m.genset_model],
    ['Serial #',  m.genset_serial || '—'],
    ['Capacity',  m.genset_kw + ' kW'],
    ['Fuel Type', m.fuel_type || '—'],
    ['Tank Size', m.fuel_tank_size ? m.fuel_tank_size + ' gal' : '—']
  ]);

  document.getElementById('rows-engine').innerHTML = infoRows([
    ['Make',     m.engine_make],
    ['Model',    m.engine_model],
    ['Serial #', m.engine_serial || '—']
  ]);

  document.getElementById('rows-battery').innerHTML = infoRows([
    ['Date', m.battery_size || '—']
  ]);

  const c = m.contacts || {};
  document.getElementById('rows-contacts').innerHTML = infoRows([
    ['ATOM Contact', c.atom || '—'],
    ['ATOM Cell',    c.atom_cell ? `<a href="tel:${c.atom_cell}" style="color:var(--navy3);text-decoration:none">${c.atom_cell}</a>` : '—'],
    ['ATOM Email',   c.atom_email ? `<a href="mailto:${c.atom_email}" style="color:var(--navy3);text-decoration:none;font-size:12px">${c.atom_email}</a>` : '—'],
    ['BioMed',       c.biomed || '—'],
    ['BioMed Cell',  c.biomed_cell ? `<a href="tel:${c.biomed_cell}" style="color:var(--navy3);text-decoration:none">${c.biomed_cell}</a>` : '—']
  ]);

  const reports = SERVICE_REPORTS[machineId] || [];
  const reportRows = document.getElementById('report-rows');
  const reportBadge = document.getElementById('report-count-badge');

  reportBadge.textContent = reports.length + ' total';

  if (reports.length === 0) {
    reportRows.innerHTML = `
      <div style="padding:40px 20px;text-align:center;color:var(--gray4)">
        <div style="font-size:32px;margin-bottom:10px;opacity:0.3">📋</div>
        <p style="font-size:13px">No service reports on file for this location.</p>
      </div>`;
    return;
  }

  reportRows.innerHTML = reports.map((r) => `
    <div class="report-row">
      <div class="report-row-summary" style="grid-template-columns: 140px 1fr auto">
        <div class="report-date">
          <span class="date-text">${r.date_str ? fmtDisplayDate(r.date_str) : '—'}</span>
        </div>
        <div class="report-sub">${r.description}</div>
        <button class="view-pdf-btn"
           onclick="event.stopPropagation(); openPDF('${r.file_id}', '${(r.description || '').replace(/'/g, "\\'")}', '${r.date_str || ''}')">
          <span>📄</span> View PDF
        </button>
      </div>
    </div>
  `).join('');
}

function toggleReport(reportId) {
  const row = document.getElementById('row-' + reportId);
  row.classList.toggle('expanded');
}

function infoRows(pairs) {
  return pairs.map(([label, value]) => `
    <div class="info-row">
      <div class="info-row-label">${label}</div>
      <div class="info-row-value">${value}</div>
    </div>
  `).join('');
}

function typeClass(type) {
  const map = {
    'Major PM': 'type-major', 'Minor PM': 'type-minor',
    'Emergency': 'type-emergency', 'Refuel': 'type-refuel',
    'Compliance': 'type-compliance'
  };
  return map[type] || 'type-other';
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDisplayDate(str) {
  if (!str) return '—';
  const [y, mo, d] = str.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[mo-1]} ${d}, ${y}`;
}

/* ═══════════════════════════════════════════
   PDF MODAL
════════════════════════════════════════════ */
function pdfProxyURL(fileId, download = false) {
  const base = `${API_BASE.replace('/ips/dashboard', '')}/ips/report-pdf`;
  const params = new URLSearchParams({ file_id: fileId, user_token: userToken || '' });
  if (download) params.set('download', 'true');
  return `${base}?${params}`;
}

function openPDF(fileId, title, datStr) {
  document.getElementById('pdf-modal-title').textContent = title;
  document.getElementById('pdf-modal-meta').textContent = datStr ? fmtDisplayDate(datStr) : '';

  // Download button — streams file via server proxy, triggers browser download
  const dlBtn = document.getElementById('pdf-download-btn');
  dlBtn.href = pdfProxyURL(fileId, true);

  // Inline embed — same proxy, inline disposition so browser renders it
  const wrap = document.getElementById('pdf-iframe-wrap');
  wrap.innerHTML = `<iframe src="${pdfProxyURL(fileId)}" title="${title}"></iframe>`;

  document.getElementById('pdf-modal').classList.remove('hidden');
  document.addEventListener('keydown', handlePDFKey);
}

function closePDF() {
  document.getElementById('pdf-modal').classList.add('hidden');
  document.getElementById('pdf-iframe-wrap').innerHTML = ''; // stop the iframe loading
  document.removeEventListener('keydown', handlePDFKey);
}

function handlePDFKey(e) {
  if (e.key === 'Escape') closePDF();
}

document.getElementById('pdf-modal').addEventListener('click', function(e) {
  if (e.target === this) closePDF();
});
