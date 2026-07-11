/* ══════════════════════════════════════════
   AgriFuture AI — Cost Calculator logic
   ══════════════════════════════════════════ */

/* ── CONFIG ──
   ผลวิเคราะห์จากหน้า result.html ไม่ได้ถูกเก็บใน Firestore collection
   แยกต่างหาก แต่ถูกบันทึกลง localStorage คีย์ 'agrifuture_usage'
   (คีย์เดียวกับที่ profile.js ใช้แสดง "ประวัติการทำงาน") ดังนั้น
   costcalc จึงอ่านจากแหล่งเดียวกันนี้ แทนที่จะ query Firestore ตรง ๆ */

// ★★★ แก้บรรทัดนี้ ★★★
// ใส่ URL public ของ backend app.py (ตัวที่มี /api/analyze-cost) ที่ deploy ไว้จริง
// เช่น 'https://agrifuture-cost-backend.onrender.com'
const PRODUCTION_API_BASE_URL = 'https://agrifuture-cost-backend.onrender.com';

const CONFIG = {
    // ตอน dev บนเครื่องตัวเอง (localhost/127.0.0.1) -> ใช้ localhost:5001 อัตโนมัติ
    // ตอนขึ้นเว็บจริง (เช่น open-html.onrender.com) -> ใช้ PRODUCTION_API_BASE_URL ด้านบน
    apiBaseUrl: (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
    ) ? 'http://localhost:5001' : PRODUCTION_API_BASE_URL
};

const USAGE_KEY = 'agrifuture_usage';

/* ── Default cost-per-rai figures (บาท/ไร่) ──
   These are illustrative starting points only — every field is
   editable in the UI, so treat this as a rough baseline to calibrate
   against real local prices. */
const COST_DEFAULTS = {
    'ข้าว':         { seed: 500,  fertilizer: 1200, labor: 1500, water: 300 },
    'ข้าวโพด':      { seed: 700,  fertilizer: 1400, labor: 1600, water: 250 },
    'มันสำปะหลัง':  { seed: 900,  fertilizer: 1000, labor: 1300, water: 150 },
    'อ้อย':         { seed: 2500, fertilizer: 1800, labor: 2000, water: 400 },
    'ยางพารา':      { seed: 0,    fertilizer: 1500, labor: 2500, water: 100 },
    'ปาล์มน้ำมัน':  { seed: 0,    fertilizer: 2000, labor: 2200, water: 200 },
    default:        { seed: 600,  fertilizer: 1200, labor: 1500, water: 250 }
};

const CATEGORY_META = [
    { key: 'seed',       label: 'ค่าพันธุ์', color: 'var(--green-mid)' },
    { key: 'fertilizer', label: 'ค่าปุ๋ย',   color: 'var(--yellow)' },
    { key: 'labor',      label: 'ค่าแรง',    color: 'var(--green-bright)' },
    { key: 'water',      label: 'ค่าน้ำ',    color: 'var(--yellow-soft)' }
];

let currentEmail = null;
let availableResults = [];   // sessions from localStorage, not yet added
let pickerSelectedIds = new Set();
let selectedEntries = [];    // entries added to the calculator

/* ── DOM refs ── */
const $ = id => document.getElementById(id);
const entryGrid        = $('entryGrid');
const entryEmptyState  = $('entryEmptyState');
const selectedMiniList = $('selectedMiniList');
const entryCountBadge  = $('entryCountBadge');
const calcActionSection = $('calcActionSection');
const resultsSection   = $('resultsSection');
const aiSection        = $('aiSection');
const toast            = $('toast');
const toastMsg         = $('toastMsg');

/* ══════════════════════════════════════════
   AUTH + LOAD RESULTS (จาก localStorage แทน Firestore)
   ══════════════════════════════════════════ */
firebase.auth().onAuthStateChanged(user => {
    if (!user) return;
    currentEmail = user.email;
    loadAvailableResults();
});

function loadAvailableResults() {
    if (!currentEmail) { availableResults = []; return; }

    const all = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    const userData = all[currentEmail] || { sessions: [] };

    // เอาเฉพาะ session ที่มีผลวิเคราะห์จริง (มี selected_crop)
    availableResults = (userData.sessions || [])
        .filter(s => s.result && s.result.selected_crop)
        .map((s, idx) => ({
            id: `${s.time || idx}-${idx}`,      // ไม่มี doc.id เหมือน Firestore เลยประกอบเอง
            title: s.type || s.result.selected_crop.name || 'ผลวิเคราะห์',
            cropType: (s.inputs && s.inputs.interested_crop) || s.result.selected_crop.name || 'ไม่ระบุพืช',
            area: parseAreaToRai(s.inputs && s.inputs.area),
            createdAt: s.time
        }));
}

// แปลงข้อความพื้นที่แบบ "5 ไร่" / "20+ ไร่" ที่ form.html ส่งมา ให้เป็นตัวเลขไร่
function parseAreaToRai(areaText) {
    if (!areaText) return 1;
    const match = String(areaText).match(/[\d.]+/);
    return match ? Number(match[0]) : 1;
}

function renderPicker() {
    const pickerBody = $('pickerBody');
    if (!availableResults.length) {
        pickerBody.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-inbox"></i>
                <p>ยังไม่มีผลวิเคราะห์จากหน้า result</p>
            </div>`;
        updatePickerCount();
        return;
    }

    pickerBody.innerHTML = '';
    availableResults.forEach(doc => {
        const title = doc.title;
        const crop  = doc.cropType;
        const area  = doc.area;
        const date  = formatDate(doc.createdAt);
        const isSelected = pickerSelectedIds.has(doc.id);

        const item = document.createElement('label');
        item.className = 'picker-item' + (isSelected ? ' selected' : '');
        item.innerHTML = `
            <input type="checkbox" data-id="${doc.id}" ${isSelected ? 'checked' : ''}>
            <div class="picker-item-info">
                <div class="picker-item-title">${escapeHtml(title)}</div>
                <div class="picker-item-meta">
                    <span><i class="fa-solid fa-seedling"></i> ${escapeHtml(crop)}</span>
                    <span><i class="fa-solid fa-ruler-combined"></i> ${escapeHtml(String(area))} ไร่</span>
                    <span><i class="fa-regular fa-clock"></i> ${date}</span>
                </div>
            </div>`;
        item.querySelector('input').addEventListener('change', e => {
            if (e.target.checked) pickerSelectedIds.add(doc.id);
            else pickerSelectedIds.delete(doc.id);
            item.classList.toggle('selected', e.target.checked);
            updatePickerCount();
        });
        pickerBody.appendChild(item);
    });
    updatePickerCount();
}

function updatePickerCount() {
    $('pickerCount').textContent = `เลือกแล้ว ${pickerSelectedIds.size} รายการ`;
}

function formatDate(ts) {
    try {
        const d = ts ? new Date(ts) : null;
        if (!d || isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
    } catch { return '-'; }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/* ══════════════════════════════════════════
   MODAL open/close
   ══════════════════════════════════════════ */
const pickerOverlay = $('pickerOverlay');

$('openPickerBtn').addEventListener('click', () => {
    pickerSelectedIds = new Set(selectedEntries.map(e => e.id));
    if (currentEmail) loadAvailableResults();
    renderPicker();
    pickerOverlay.classList.add('open');
});
$('closePickerBtn').addEventListener('click', () => pickerOverlay.classList.remove('open'));
pickerOverlay.addEventListener('click', e => {
    if (e.target === pickerOverlay) pickerOverlay.classList.remove('open');
});

$('confirmAddBtn').addEventListener('click', () => {
    pickerSelectedIds.forEach(id => {
        if (selectedEntries.find(e => e.id === id)) return; // already added
        const doc = availableResults.find(d => d.id === id);
        if (!doc) return;
        const cropType = doc.cropType;
        const defaults = COST_DEFAULTS[cropType] || COST_DEFAULTS.default;
        selectedEntries.push({
            id: doc.id,
            title: doc.title,
            cropType,
            area: Number(doc.area) || 1,
            createdAt: doc.createdAt,
            seedPerRai: defaults.seed,
            fertilizerPerRai: defaults.fertilizer,
            laborPerRai: defaults.labor,
            waterPerRai: defaults.water
        });
    });
    pickerOverlay.classList.remove('open');
    renderEntries();
    showToast(`เพิ่มข้อมูลแล้ว ${pickerSelectedIds.size} รายการ`);
});

/* ══════════════════════════════════════════
   ENTRY CARDS
   ══════════════════════════════════════════ */
function renderEntries() {
    entryGrid.innerHTML = '';
    if (!selectedEntries.length) {
        entryGrid.appendChild(entryEmptyState);
        entryEmptyState.style.display = 'flex';
        calcActionSection.style.display = 'none';
        resultsSection.style.display = 'none';
        aiSection.style.display = 'none';
    } else {
        entryEmptyState.style.display = 'none';
        calcActionSection.style.display = 'flex';
        selectedEntries.forEach(entry => entryGrid.appendChild(buildEntryCard(entry)));
    }
    renderSidebarMini();
    entryCountBadge.innerHTML = `<span class="badge-dot"></span> ${selectedEntries.length} รายการ`;
}

function buildEntryCard(entry) {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.innerHTML = `
        <button class="remove-entry" title="ลบรายการ"><i class="fa-solid fa-xmark"></i></button>
        <div class="entry-card-title">${escapeHtml(entry.title)}</div>
        <div class="entry-card-meta"><i class="fa-solid fa-seedling"></i> ${escapeHtml(entry.cropType)}</div>
        <div class="entry-field-row">
            <div class="entry-field area-field">
                <label>พื้นที่ (ไร่)</label>
                <input type="number" min="0" step="0.1" data-key="area" value="${entry.area}">
            </div>
            <div class="entry-field">
                <label>ค่าพันธุ์ (บาท/ไร่)</label>
                <input type="number" min="0" step="1" data-key="seedPerRai" value="${entry.seedPerRai}">
            </div>
        </div>
        <div class="entry-field-row">
            <div class="entry-field">
                <label>ค่าปุ๋ย (บาท/ไร่)</label>
                <input type="number" min="0" step="1" data-key="fertilizerPerRai" value="${entry.fertilizerPerRai}">
            </div>
            <div class="entry-field">
                <label>ค่าแรง (บาท/ไร่)</label>
                <input type="number" min="0" step="1" data-key="laborPerRai" value="${entry.laborPerRai}">
            </div>
        </div>
        <div class="entry-field-row">
            <div class="entry-field">
                <label>ค่าน้ำ (บาท/ไร่)</label>
                <input type="number" min="0" step="1" data-key="waterPerRai" value="${entry.waterPerRai}">
            </div>
        </div>`;

    card.querySelector('.remove-entry').addEventListener('click', () => {
        selectedEntries = selectedEntries.filter(e => e.id !== entry.id);
        renderEntries();
    });
    card.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => {
            entry[input.dataset.key] = Number(input.value) || 0;
        });
    });
    return card;
}

function renderSidebarMini() {
    if (!selectedEntries.length) {
        selectedMiniList.innerHTML = `
            <div class="history-empty">
                <i class="fa-regular fa-folder-open"></i>
                ยังไม่ได้เลือกข้อมูล
            </div>`;
        return;
    }
    selectedMiniList.innerHTML = selectedEntries.map(e => `
        <div class="selected-mini-item">
            <i class="fa-solid fa-seedling"></i>
            <span>${escapeHtml(e.title)} · ${e.area} ไร่</span>
        </div>`).join('');
}

/* ══════════════════════════════════════════
   CALCULATE
   ══════════════════════════════════════════ */
$('calculateBtn').addEventListener('click', () => {
    if (!selectedEntries.length) return;

    const computed = selectedEntries.map(e => {
        const seedCost       = e.area * e.seedPerRai;
        const fertilizerCost = e.area * e.fertilizerPerRai;
        const laborCost      = e.area * e.laborPerRai;
        const waterCost      = e.area * e.waterPerRai;
        const totalCost      = seedCost + fertilizerCost + laborCost + waterCost;
        return { ...e, seedCost, fertilizerCost, laborCost, waterCost, totalCost };
    });

    const totals = computed.reduce((acc, e) => {
        acc.area += e.area;
        acc.seed += e.seedCost;
        acc.fertilizer += e.fertilizerCost;
        acc.labor += e.laborCost;
        acc.water += e.waterCost;
        acc.grandTotal += e.totalCost;
        return acc;
    }, { area: 0, seed: 0, fertilizer: 0, labor: 0, water: 0, grandTotal: 0 });
    totals.perRai = totals.area > 0 ? totals.grandTotal / totals.area : 0;

    renderResults(computed, totals);
    fetchAiRecommendation(computed, totals);
});

function renderResults(computed, totals) {
    resultsSection.style.display = 'block';

    // Totals grid
    $('totalsGrid').innerHTML = `
        <div class="total-card">
            <div class="total-label"><i class="fa-solid fa-ruler-combined"></i> พื้นที่รวม</div>
            <div class="total-value">${fmt(totals.area)} ไร่</div>
        </div>
        <div class="total-card">
            <div class="total-label"><i class="fa-solid fa-seedling"></i> ค่าพันธุ์</div>
            <div class="total-value">${fmt(totals.seed)}</div>
        </div>
        <div class="total-card">
            <div class="total-label"><i class="fa-solid fa-flask"></i> ค่าปุ๋ย</div>
            <div class="total-value">${fmt(totals.fertilizer)}</div>
        </div>
        <div class="total-card">
            <div class="total-label"><i class="fa-solid fa-user-group"></i> ค่าแรง</div>
            <div class="total-value">${fmt(totals.labor)}</div>
        </div>
        <div class="total-card">
            <div class="total-label"><i class="fa-solid fa-droplet"></i> ค่าน้ำ</div>
            <div class="total-value">${fmt(totals.water)}</div>
        </div>
        <div class="total-card grand">
            <div class="total-label"><i class="fa-solid fa-coins"></i> ต้นทุนรวมทั้งหมด</div>
            <div class="total-value">${fmt(totals.grandTotal)} บาท</div>
        </div>`;

    // Breakdown bar
    const bar = $('breakdownBar');
    const legend = $('breakdownLegend');
    bar.innerHTML = '';
    legend.innerHTML = '';
    CATEGORY_META.forEach(cat => {
        const value = totals[cat.key];
        const pct = totals.grandTotal > 0 ? (value / totals.grandTotal) * 100 : 0;
        const seg = document.createElement('div');
        seg.className = 'seg';
        seg.style.width = pct + '%';
        seg.style.background = cat.color;
        seg.title = `${cat.label}: ${fmt(value)} บาท (${pct.toFixed(1)}%)`;
        bar.appendChild(seg);

        const li = document.createElement('div');
        li.className = 'legend-item';
        li.innerHTML = `<span class="legend-dot" style="background:${cat.color}"></span>
            ${cat.label} ${pct.toFixed(1)}%`;
        legend.appendChild(li);
    });

    // Table
    const tbody = $('costTableBody');
    tbody.innerHTML = computed.map(e => `
        <tr>
            <td>${escapeHtml(e.title)}</td>
            <td>${fmt(e.area)}</td>
            <td>${fmt(e.seedCost)}</td>
            <td>${fmt(e.fertilizerCost)}</td>
            <td>${fmt(e.laborCost)}</td>
            <td>${fmt(e.waterCost)}</td>
            <td>${fmt(e.totalCost)}</td>
        </tr>`).join('') + `
        <tr class="table-total">
            <td>รวมทั้งหมด</td>
            <td>${fmt(totals.area)}</td>
            <td>${fmt(totals.seed)}</td>
            <td>${fmt(totals.fertilizer)}</td>
            <td>${fmt(totals.labor)}</td>
            <td>${fmt(totals.water)}</td>
            <td>${fmt(totals.grandTotal)}</td>
        </tr>`;

    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fmt(n) {
    return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

/* ══════════════════════════════════════════
   AI RECOMMENDATION — calls the Python backend
   ══════════════════════════════════════════ */
async function fetchAiRecommendation(computed, totals) {
    aiSection.style.display = 'block';
    $('aiLoading').style.display = 'flex';
    $('aiContent').innerHTML = '';

    const payload = {
        entries: computed.map(e => ({
            title: e.title,
            cropType: e.cropType,
            area: e.area,
            seedCost: e.seedCost,
            fertilizerCost: e.fertilizerCost,
            laborCost: e.laborCost,
            waterCost: e.waterCost,
            totalCost: e.totalCost
        })),
        totals
    };

    try {
        const res = await fetch(`${CONFIG.apiBaseUrl}/api/analyze-cost`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'เรียก AI ไม่สำเร็จ');

        $('aiContent').innerHTML = renderMarkdown(data.recommendation || '');
    } catch (err) {
        console.error(err);
        $('aiContent').innerHTML = `
            <p style="color:var(--danger);">
                <i class="fa-solid fa-triangle-exclamation"></i>
                ไม่สามารถเรียก AI ได้ในขณะนี้ (ตรวจสอบว่า backend Python (app.py) กำลังทำงานอยู่ที่ ${CONFIG.apiBaseUrl})
            </p>`;
    } finally {
        $('aiLoading').style.display = 'none';
    }
}

/* Minimal markdown renderer: headings (###), bold (**), bullet lists (-) */
function renderMarkdown(md) {
    const escaped = escapeHtml(md);
    const lines = escaped.split('\n');
    let html = '';
    let inList = false;
    lines.forEach(line => {
        const trimmed = line.trim();
        if (/^###\s+/.test(trimmed)) {
            if (inList) { html += '</ul>'; inList = false; }
            html += `<h3>${trimmed.replace(/^###\s+/, '')}</h3>`;
        } else if (/^-\s+/.test(trimmed)) {
            if (!inList) { html += '<ul>'; inList = true; }
            html += `<li>${trimmed.replace(/^-\s+/, '')}</li>`;
        } else if (trimmed === '') {
            if (inList) { html += '</ul>'; inList = false; }
        } else {
            if (inList) { html += '</ul>'; inList = false; }
            html += `<p>${trimmed}</p>`;
        }
    });
    if (inList) html += '</ul>';
    return html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/* ══════════════════════════════════════════
   MISC UI — toast, sidebar toggle, theme
   ══════════════════════════════════════════ */
function showToast(msg) {
    toastMsg.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
}

$('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

const themeToggle = $('themeToggle');
const themeIcon = $('themeIcon');
function applyTheme(mode) {
    document.body.classList.toggle('light-mode', mode === 'light');
    themeIcon.className = mode === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}
const savedTheme = localStorage.getItem('agrifuture-theme') || 'dark';
applyTheme(savedTheme);
themeToggle?.addEventListener('click', () => {
    const next = document.body.classList.contains('light-mode') ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem('agrifuture-theme', next);
});

/* Initial render */
renderEntries();
