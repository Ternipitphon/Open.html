import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithPopup, GoogleAuthProvider,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { renderGamification } from "./enhance.js"; // เสริม: Season Ring / Badge / Export (อ่านข้อมูลเดิมแบบ read-only)

// คอนฟิกหลักของระบบ Firebase
const firebaseConfig = {
  apiKey: "AIzaSyClThtgfsR00SuM3lgM2HOP9175b6FnkYc",
  authDomain: "agrifuture-ai-5ade9.firebaseapp.com",
  projectId: "agrifuture-ai-5ade9",
  storageBucket: "agrifuture-ai-5ade9.firebasestorage.app",
  messagingSenderId: "634181270751",
  appId: "1:634181270751:web:2a9efbb05bd90839853d6a",
  measurementId: "G-32C33BG9YX"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const USERS_KEY = 'agrifuture_users';
const USAGE_KEY = 'agrifuture_usage';

function getLocalUsers() { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); }
function saveLocalUser(user) {
  const users = getLocalUsers();
  users[user.email] = user;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
function defaultAvatar() {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Ccircle cx='50' cy='40' r='22' fill='%23aaa'/%3E%3Cellipse cx='50' cy='85' rx='32' ry='22' fill='%23aaa'/%3E%3C/svg%3E";
}

// การดึงข้อมูลและจัดการระบบนับจำนวนกราฟ AI
function getUsageData(email) {
  const all = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
  if (!all[email]) all[email] = { sessions: [], daily: {} };
  return all[email];
}
function saveUsageData(email, data) {
  const all = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
  all[email] = data;
  localStorage.setItem(USAGE_KEY, JSON.stringify(all));
}

// อัพเดท: รับ inputs และ result เพื่อเก็บผลลัพธ์ AI ไว้ด้วย
function recordUsage(email, type, inputs, result) {
  const data = getUsageData(email);
  const now = new Date();
  const dateKey = now.toISOString().split('T')[0];
  data.sessions.unshift({
    type,
    time: now.toISOString(),
    inputs: inputs || null,
    result: result || null
  });
  if (data.sessions.length > 50) data.sessions = data.sessions.slice(0, 50);
  data.daily[dateKey] = (data.daily[dateKey] || 0) + 1;
  saveUsageData(email, data);
}

// คืนค่าอาร์เรย์สรุป 7 วันล่าสุดสำหรับพล็อตกราฟ
function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

// ── Helper functions สำหรับ render result ──────────────────────────
function chanceClass(c) {
  if (c === 'สูง') return 'chance-high';
  if (c === 'ต่ำ') return 'chance-low';
  return 'chance-mid';
}
function fillClass(pct) {
  if (pct >= 70) return '';
  if (pct >= 45) return 'mid';
  return 'low';
}
function tagColor(val) {
  if (!val) return 'tag-blue';
  if (val.includes('สูง') || val === 'ง่าย')  return 'tag-green';
  if (val.includes('ปานกลาง'))                return 'tag-yellow';
  if (val === 'ยาก' || val === 'ต่ำ')         return 'tag-red';
  return 'tag-blue';
}

function renderMainCrop(sc, container) {
  if (!container) return;
  const pct  = Number(sc.success_percent) || 0;
  const fc   = fillClass(pct);
  const cc   = chanceClass(sc.success_chance);
  const pros = (sc.pros || []).map(x => `<li>${x}</li>`).join('');
  const cons = (sc.cons || []).map(x => `<li>${x}</li>`).join('');
  const tips = (sc.tips || []).map(x => `<li>${x}</li>`).join('');
  container.innerHTML = `
    <div class="crop-hero-header">
      <div>
        <div class="crop-name-big">${sc.name}
          <small>พืชที่คุณเลือก</small>
        </div>
      </div>
      <div class="chance-badge ${cc}">
        <i class="fa-solid fa-chart-simple"></i>
        โอกาสสำเร็จ: ${sc.success_chance}
      </div>
    </div>
    <div class="prog-label-row">
      <span>ความน่าจะเป็นที่จะสำเร็จ</span>
      <span style="color:#7BCC3A;font-weight:600;">${pct}%</span>
    </div>
    <div class="prog-track">
      <div class="prog-fill ${fc}" style="width:0%" id="modal-main-bar"></div>
    </div>
    <div class="stats-row">
      <div class="stat-card">
        <div class="val">${sc.estimated_income || '-'}</div>
        <div class="lbl">บาท / ไร่ / ปี (ประมาณการ)</div>
      </div>
      <div class="stat-card">
        <div class="val">${sc.roi_months || '-'}</div>
        <div class="lbl">เดือน คืนทุน</div>
      </div>
      <div class="stat-card">
        <div class="val">${pct}%</div>
        <div class="lbl">โอกาสสำเร็จ</div>
      </div>
    </div>
    <div class="section-title" style="margin-top:.25rem;">
      <i class="fa-solid fa-list-check" style="color:#7BCC3A"></i>
      ข้อดี / ความเสี่ยง / เคล็ดลับ
    </div>
    <div class="pct-grid">
      <div class="pct-box pros">
        <h4><i class="fa-solid fa-check"></i> ข้อดี / จุดเด่น</h4>
        <ul>${pros}</ul>
      </div>
      <div class="pct-box cons">
        <h4><i class="fa-solid fa-triangle-exclamation"></i> ความเสี่ยง</h4>
        <ul>${cons}</ul>
      </div>
    </div>
    <div class="pct-box tips" style="margin-top:0;">
      <h4><i class="fa-solid fa-lightbulb"></i> เคล็ดลับสำหรับมือใหม่</h4>
      <ul>${tips}</ul>
    </div>
  `;
  setTimeout(() => {
    const bar = document.getElementById('modal-main-bar');
    if (bar) bar.style.width = pct + '%';
  }, 200);
}

function renderAltsModal(alts, container) {
  if (!container) return;
  container.innerHTML = alts.map(a => {
    const pct = Number(a.success_percent) || 0;
    return `
    <div class="alt-card">
      <h4>🍃 ${a.name}</h4>
      <div class="mini-bar-wrap">
        <div class="mini-bar-track">
          <div class="mini-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="mini-bar-label">
          <span>โอกาสสำเร็จ</span>
          <span style="color:#7BCC3A;font-weight:600;">${pct}%</span>
        </div>
      </div>
      <div class="alt-tags">
        <span class="tag ${tagColor(a.success_chance)}">${a.success_chance}</span>
        <span class="tag ${tagColor(a.difficulty)}">${a.difficulty}</span>
        <span class="tag ${tagColor(a.market_trend)}">${a.market_trend}</span>
      </div>
      <div class="alt-income">
        💵 รายได้ ~<strong style="color:#e8f5e0;">${a.estimated_income}</strong> บ./ไร่/ปี
        &nbsp;|&nbsp; ⏱ คืนทุน <strong style="color:#e8f5e0;">${a.roi_months}</strong> เดือน
      </div>
      <div class="alt-reason">${a.reason}</div>
    </div>`;
  }).join('');
}

function renderMonthlyModal(monthly, container) {
  if (!container) return;
  const months = [
    'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน',
    'พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม',
    'กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
  ];
  container.innerHTML = months.map(m => {
    const data = monthly[m] || {};
    return `
    <div class="month-card">
      <div class="m-label">📅 ${m}</div>
      <div class="m-crop">${data.crop || '-'}</div>
      <div class="m-note">${data.note || ''}</div>
    </div>`;
  }).join('');
}

// ── Modal: แสดงผลลัพธ์ AI จากประวัติ (อัปเดตแก้ไขการล็อคสกรอลล์) ────────────────
function openResultModal(session) {
  const modal = document.getElementById('result-modal');
  if (!modal) return;

  const data   = session.result;
  const inputs = session.inputs || {};

  // render info bar
  const budgetLabel = {
    '5000-10000':  '5,000–10,000 บาท',
    '10000-20000': '10,000–20,000 บาท',
    '20000+':      '20,000 บาทขึ้นไป'
  };
  const areaLabel = { '5': '5 ไร่', '10': '10 ไร่', '20+': '20 ไร่ขึ้นไป' };
  const infoItems = [
    ['📍', inputs.province],
    ['🗺️', inputs.district],
    ['💰', budgetLabel[inputs.budget] || inputs.budget],
    ['📐', areaLabel[inputs.area]     || inputs.area],
    ['💧', inputs.water_source],
    ['📅', inputs.planting_month],
    ['🌱', inputs.interested_crop]
  ];
  
  const infoBar = document.getElementById('modal-info-bar');
  if (infoBar) {
    infoBar.innerHTML = infoItems
      .filter(([, v]) => v)
      .map(([icon, v]) => `<span class="info-chip">${icon} ${v}</span>`)
      .join('');
  }

  // render main crop
  const mainSec = document.getElementById('modal-sec-main');
  if (mainSec && data.selected_crop) renderMainCrop(data.selected_crop, mainSec);

  // render alt crops
  const altGrid = document.getElementById('modal-alt-grid');
  if (altGrid) renderAltsModal(data.alternative_crops || [], altGrid);

  // render monthly
  const monthGrid = document.getElementById('modal-month-grid');
  if (monthGrid) renderMonthlyModal(data.monthly_crops || {}, monthGrid);

  // render advice
  const adviceEl = document.getElementById('modal-general-advice');
  if (adviceEl) adviceEl.textContent = data.general_advice || '';
  
  const warnCard = document.getElementById('modal-warning-card');
  const warnText = document.getElementById('modal-warning-text');
  if (warnCard && warnText) {
    if (data.warning) {
      warnText.textContent = data.warning;
      warnCard.style.display = 'flex';
    } else {
      warnCard.style.display = 'none';
    }
  }

  modal.classList.add('active');
  
  /* [แก้ไข] เอา document.body.style.overflow = 'hidden'; ออก 
    เพื่อเปิดให้หน้าเว็บสามารถสกรอลล์ดูรายละเอียดของ Modal ได้อย่างอิสระ 
  */
  document.body.style.overflow = ''; 
}

function closeResultModal() {
  const modal = document.getElementById('result-modal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
}

// ── เสริม: Export ผลลัพธ์ในโมดัลเป็นรูปภาพ (PNG) ──────────────────────
async function exportModalAsImage() {
  const target = document.querySelector('#result-modal .modal-inner');
  if (!target) return;

  if (typeof html2canvas === 'undefined') {
    console.error('html2canvas ยังไม่ถูกโหลด — ตรวจสอบว่าได้แทรก <script> ของ html2canvas ใน <head> แล้ว');
    return;
  }

  const btnGroup = document.getElementById('export-btn-group');
  if (btnGroup) btnGroup.style.opacity = '0';

  try {
    const canvas = await html2canvas(target, {
      backgroundColor: '#142414',
      scale: 2,
      useCORS: true
    });
    const link = document.createElement('a');
    link.download = `agrifuture-result-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error('Export image error:', err);
  } finally {
    if (btnGroup) btnGroup.style.opacity = '1';
  }
}

// ── เสริม: Export ผลลัพธ์ในโมดัลเป็น PDF (รองรับหลายหน้าอัตโนมัติ) ────────
async function exportModalAsPDF() {
  const target = document.querySelector('#result-modal .modal-inner');
  if (!target) return;

  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    console.error('html2canvas หรือ jsPDF ยังไม่ถูกโหลด — ตรวจสอบว่าได้แทรก <script> ทั้งสองตัวใน <head> แล้ว');
    return;
  }

  const btnGroup = document.getElementById('export-btn-group');
  if (btnGroup) btnGroup.style.opacity = '0';

  try {
    const canvas = await html2canvas(target, {
      backgroundColor: '#142414',
      scale: 2,
      useCORS: true
    });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth  = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth   = pageWidth;
    const imgHeight  = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position   = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`agrifuture-result-${Date.now()}.pdf`);
  } catch (err) {
    console.error('Export PDF error:', err);
  } finally {
    if (btnGroup) btnGroup.style.opacity = '1';
  }
}

// ระบบจัดการ Alert / แจ้งเตือนข้อความบนการ์ด
function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text; el.className = 'msg ' + type; el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3500);
}
function setLoading(show) {
  const loader = document.getElementById('loading-overlay');
  if (loader) loader.style.display = show ? 'flex' : 'none';
}

function previewImage(inputId, imgId) {
  const fileEl = document.getElementById(inputId);
  if (!fileEl) return;
  const file = fileEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => { 
    const previewImg = document.getElementById(imgId);
    if (previewImg) previewImg.src = e.target.result; 
  };
  reader.readAsDataURL(file);
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b,i) =>
    b.classList.toggle('active', tab === 'login' ? i === 0 : i === 1));
  
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');
  if (loginForm) loginForm.classList.toggle('active', tab === 'login');
  if (regForm) regForm.classList.toggle('active', tab === 'register');
}

function showLeftSection(id) {
  document.querySelectorAll('.left-panel .section').forEach(s => s.classList.remove('active'));
  const targetSection = document.getElementById(id);
  if (targetSection) targetSection.classList.add('active');
  
  if (id === 'left-edit') {
    const u = auth.currentUser;
    if (u) {
      const local = getLocalUsers()[u.email] || {};
      const editName = document.getElementById('edit-name');
      const editEmail = document.getElementById('edit-email');
      const editPreview = document.getElementById('edit-preview');
      const editPass = document.getElementById('edit-password');
      
      if (editName) editName.value = local.name || u.displayName || '';
      if (editEmail) editEmail.value = u.email;
      if (editPreview) editPreview.src = local.avatar || u.photoURL || defaultAvatar();
      if (editPass) editPass.value = '';
      
      const isSocial = local.provider === 'google';
      const emailField = document.getElementById('edit-email-field');
      const passField = document.getElementById('edit-password-field');
      if (emailField) emailField.style.display = isSocial ? 'none' : '';
      if (passField) passField.style.display = isSocial ? 'none' : '';
    }
  }
}

// โค้ดเรนเดอร์และสร้างกราฟ Chart.js
let usageChart = null;
let miniUsageChart = null;

function initChart(email) {
  const data = getUsageData(email);
  const days = getLast7Days();
  const labels = days.map(d => {
    const parts = d.split('-');
    return `${parseInt(parts[2])}/${parseInt(parts[1])}`;
  });
  const counts = days.map(d => data.daily[d] || 0);

  const canvasEl = document.getElementById('usageChart');
  if (canvasEl) {
    const ctx = canvasEl.getContext('2d');
    if (usageChart) usageChart.destroy();
    usageChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'จำนวนครั้งที่เรียกใช้ AI',
          data: counts,
          backgroundColor: counts.map((v,i) => i === 6 ? 'rgba(234,175,17,0.9)' : 'rgba(234,175,17,0.35)'),
          borderColor: 'rgba(234,175,17,0.7)',
          borderWidth: 1,
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#8a9e8a', font: { family: 'Prompt', size: 11 } }, grid: { color: 'rgba(234,175,17,0.06)' } },
          y: { beginAtZero: true, ticks: { color: '#8a9e8a', font: { family: 'Prompt', size: 11 }, stepSize: 1 }, grid: { color: 'rgba(234,175,17,0.06)' } }
        }
      }
    });
  }

  const miniCanvasEl = document.getElementById('miniUsageChart');
  if (miniCanvasEl) {
    const miniCtx = miniCanvasEl.getContext('2d');
    if (miniUsageChart) miniUsageChart.destroy();
    miniUsageChart = new Chart(miniCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: counts,
          fill: true,
          backgroundColor: 'rgba(234,175,17,0.08)',
          borderColor: 'rgba(234,175,17,0.85)',
          borderWidth: 2,
          tension: 0.3,
          pointBackgroundColor: 'rgba(234,175,17,1)',
          pointRadius: counts.map((v,i) => i === 6 ? 4 : 2)
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#8a9e8a', font: { family: 'Prompt', size: 9 } }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: '#8a9e8a', font: { family: 'Prompt', size: 9 }, stepSize: 1 }, grid: { color: 'rgba(234,175,17,0.04)' } }
        }
      }
    });
  }
}

// ── สร้าง HTML ของ session item แต่ละแถว ────────────────────────────
function buildSessionItem(s, idx) {
  const d = new Date(s.time);
  const ts = d.toLocaleString('th-TH', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  const hasResult = !!(s.result && s.result.selected_crop);
  return `<div class="session-item ${hasResult ? 'session-clickable' : ''}" data-session-idx="${idx}" style="${hasResult ? 'cursor:pointer;' : ''}">
    <div class="session-left-side">
      <div class="session-dot"></div>
      <div class="session-info">
        <div class="session-type">${s.type}</div>
        <div class="session-time">${ts}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <div class="session-status">สำเร็จ ✨</div>
      ${hasResult ? '<div class="session-view-btn">ดูผล →</div>' : ''}
    </div>
  </div>`;
}

// ── ผูก click event กับ session card ─────────────────────────────────
function bindSessionClicks(list, sessions) {
  if (!list) return;
  list.querySelectorAll('.session-clickable').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.getAttribute('data-session-idx'));
      const session = sessions[idx];
      if (session && session.result) openResultModal(session);
    });
  });
}

// ★ รีเฟรชและคำนวณข้อมูลสถิติภาพรวม
function refreshStats(email) {
  const data = getUsageData(email);

  // กรองเฉพาะ session ที่มีผลลัพธ์ AI จริงๆ เท่านั้น
  const sessions = data.sessions.filter(s => s.result && s.result.selected_crop);

  const total = sessions.length;
  const today = data.daily[new Date().toISOString().split('T')[0]] || 0;
  const days7 = getLast7Days();
  const sum7   = days7.reduce((a,d) => a + (data.daily[d] || 0), 0);
  const avg    = Math.round(sum7 / 7 * 10) / 10;

  const statTotal = document.getElementById('stat-total');
  const statToday = document.getElementById('stat-today');
  const ovTotal = document.getElementById('ov-total');
  const ovAvg = document.getElementById('ov-avg');
  const ovTrend = document.getElementById('ov-trend');

  if (statTotal) statTotal.textContent = total;
  if (statToday) statToday.textContent = today;
  if (ovTotal) ovTotal.textContent = total;
  if (ovAvg) ovAvg.textContent = avg;
  if (ovTrend) ovTrend.textContent = today > 0 ? `↑ ${today} ครั้งวันนี้` : 'เริ่มต้น';

  const list = document.getElementById('session-list');
  if (!list) return;

  if (sessions.length === 0) {
    list.innerHTML = '<div style="color:var(--muted); font-size:13px; text-align:center; padding:20px 0;">ยังไม่มีประวัติการใช้งาน</div>';
  } else {
    const INIT_SHOW = 6;
    const hasMore   = sessions.length > INIT_SHOW;

    list.innerHTML =
      sessions.slice(0, INIT_SHOW).map((s, idx) => buildSessionItem(s, idx)).join('') +
      (hasMore ? `
        <div id="show-more-wrap" style="text-align:center; margin-top:12px;">
          <button id="btn-show-more"
            style="padding:9px 28px; background:transparent; color:var(--gold);
                   border:1px solid rgba(234,175,17,0.45); border-radius:20px;
                   font-family:'Prompt',sans-serif; font-size:13px; font-weight:600;
                   cursor:pointer; transition:background .2s, border-color .2s;"
            onmouseover="this.style.background='rgba(234,175,17,0.1)';this.style.borderColor='var(--gold)'"
            onmouseout="this.style.background='transparent';this.style.borderColor='rgba(234,175,17,0.45)'">
            ▼ แสดงเพิ่มเติม (${sessions.length - INIT_SHOW} รายการ)
          </button>
        </div>` : '');

    bindSessionClicks(list, sessions);

    if (hasMore) {
      document.getElementById('btn-show-more')?.addEventListener('click', () => {
        const extraHTML = sessions
          .slice(INIT_SHOW)
          .map((s, i) => buildSessionItem(s, INIT_SHOW + i))
          .join('');

        const showMoreWrap = document.getElementById('show-more-wrap');
        if (showMoreWrap) {
          showMoreWrap.outerHTML =
            extraHTML +
            `<div id="show-more-wrap" style="text-align:center; margin-top:12px;">
              <button id="btn-show-less"
                style="padding:9px 28px; background:transparent; color:var(--muted);
                       border:1px solid var(--border); border-radius:20px;
                       font-family:'Prompt',sans-serif; font-size:13px; font-weight:500;
                       cursor:pointer; transition:background .2s;"
                onmouseover="this.style.background='rgba(255,255,255,0.04)'"
                onmouseout="this.style.background='transparent'">
                ▲ แสดงน้อยลง
              </button>
            </div>`;
        }

        bindSessionClicks(list, sessions);

        document.getElementById('btn-show-less')?.addEventListener('click', () => {
          refreshStats(email);
        });
      });
    }
  }
  initChart(email);
  renderGamification(email); // เสริม: อัปเดต Season Ring / Badge ให้ตรงกับสถิติล่าสุด
}

// 🛠️ บูตแอนิเมชันเปิดใช้งานหน้าหลักของ Dashboard (เพิ่มเงื่อนไข Safe Navigation เช็ค null เรียบร้อย)
function loadDashboard(firebaseUser, localExtra) {
  const name     = localExtra?.name || firebaseUser.displayName || 'ผู้ใช้';
  const email    = firebaseUser.email || '';
  const avatar   = localExtra?.avatar || firebaseUser.photoURL || defaultAvatar();
  const provider = localExtra?.provider || 'email';

  const viewName = document.getElementById('view-name');
  const viewHandle = document.getElementById('view-handle');
  const viewEmail = document.getElementById('view-email');
  const viewAvatar = document.getElementById('view-avatar');
  const badge = document.getElementById('view-provider');
  const passRow = document.getElementById('password-row');
  const authWrap = document.getElementById('auth-wrap');
  const dashWrap = document.getElementById('dash-wrap');

  if (viewName) viewName.textContent = name;
  if (viewHandle) viewHandle.textContent = email.split('@')[0];
  if (viewEmail) viewEmail.textContent = email;
  if (viewAvatar) viewAvatar.src = avatar;

  if (badge) {
    if (provider === 'google') {
      badge.textContent = '🔗 เชื่อมต่อผ่าน Google';
      badge.style.display = 'block';
      if (passRow) passRow.style.display = 'none';
    } else {
      badge.style.display = 'none';
      if (passRow) passRow.style.display = '';
    }
  }

  if (authWrap) authWrap.style.display = 'none';
  if (dashWrap) dashWrap.classList.add('active');
  
  refreshStats(email);
}

// Event Listeners เมื่อ DOM โหลดเสร็จสิ้น
document.addEventListener('DOMContentLoaded', () => {

  onAuthStateChanged(auth, (firebaseUser) => {
    if (firebaseUser) {
      const local = getLocalUsers()[firebaseUser.email] || null;
      loadDashboard(firebaseUser, local);
    }
  });

  document.getElementById('tab-login-btn')?.addEventListener('click', () => switchTab('login'));
  document.getElementById('tab-register-btn')?.addEventListener('click', () => switchTab('register'));

  document.getElementById('reg-image-input')?.addEventListener('change', () => {
    previewImage('reg-image-input', 'reg-preview');
  });
  document.getElementById('edit-image-input')?.addEventListener('change', () => {
    previewImage('edit-image-input', 'edit-preview');
  });

  document.getElementById('btn-go-edit')?.addEventListener('click', () => showLeftSection('left-edit'));
  document.getElementById('btn-cancel-edit')?.addEventListener('click', () => showLeftSection('left-view'));

  // ── Modal close handlers ──────────────────────────────────────────
  document.getElementById('modal-close-btn')?.addEventListener('click', closeResultModal);
  document.getElementById('result-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('result-modal')) closeResultModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeResultModal();
  });

  // ── เสริม: ปุ่ม Export รูปภาพ / PDF ในผลวิเคราะห์ (modal) ──────────
  document.getElementById('btn-export-image')?.addEventListener('click', exportModalAsImage);
  document.getElementById('btn-export-pdf')?.addEventListener('click', exportModalAsPDF);

  // สมัครสมาชิกด้วยอีเมล
  document.getElementById('btn-execute-register')?.addEventListener('click', async () => {
    const nameEl = document.getElementById('reg-name');
    const emailEl = document.getElementById('reg-email');
    const passEl = document.getElementById('reg-password');
    const previewEl = document.getElementById('reg-preview');
    
    if (!nameEl || !emailEl || !passEl || !previewEl) return;
    
    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    const pass = passEl.value;
    const imgSrc = previewEl.src;
    
    if (!name || !email || !pass) return showMsg('register-msg', 'กรุณากรอกข้อมูลให้ครบ', 'error');
    if (pass.length < 6) return showMsg('register-msg', 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error');
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
      saveLocalUser({ name, email, avatar: imgSrc, provider: 'email', password: null });
      showMsg('register-msg', 'สมัครสมาชิกสำเร็จ!', 'success');
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use' ? 'อีเมลนี้ถูกใช้งานแล้ว' : err.message;
      showMsg('register-msg', msg, 'error');
    } finally { setLoading(false); }
  });

  // เข้าสู่ระบบด้วยอีเมล
  document.getElementById('btn-execute-login')?.addEventListener('click', async () => {
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    if (!emailEl || !passEl) return;

    const email = emailEl.value.trim();
    const pass = passEl.value;
    if (!email || !pass) return showMsg('login-msg', 'กรุณากรอกข้อมูลให้ครบ', 'error');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      const msg = err.code === 'auth/user-not-found' ? 'ไม่พบบัญชีนี้ในระบบ'
                : err.code === 'auth/wrong-password' ? 'รหัสผ่านไม่ถูกต้อง' : err.message;
      showMsg('login-msg', msg, 'error');
    } finally { setLoading(false); }
  });

  // เข้าสู่ระบบด้วย Google
  document.getElementById('btn-google-login')?.addEventListener('click', async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const u = result.user;
      if (!getLocalUsers()[u.email]) {
        saveLocalUser({ name: u.displayName || 'Google User', email: u.email, avatar: u.photoURL || defaultAvatar(), provider: 'google', password: null });
      }
    } catch (err) { showMsg('login-msg', `Google: ${err.message}`, 'error'); }
    finally { setLoading(false); }
  });

  // บันทึกการแก้ไขโปรไฟล์ข้อมูลส่วนตัว
  document.getElementById('btn-save-edit')?.addEventListener('click', async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    
    const nameEl = document.getElementById('edit-name');
    const previewEl = document.getElementById('edit-preview');
    if (!nameEl || !previewEl) return;

    const newName = nameEl.value.trim();
    const newAvatar = previewEl.src;
    if (!newName) return showMsg('edit-msg', 'กรุณากรอกชื่อ', 'error');
    try {
      await updateProfile(firebaseUser, { displayName: newName });
      const users = getLocalUsers();
      const key   = firebaseUser.email;
      users[key]  = { ...users[key], name: newName, avatar: newAvatar };
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      showMsg('edit-msg', 'บันทึกข้อมูลสำเร็จ!', 'success');
      setTimeout(() => { loadDashboard(firebaseUser, users[key]); showLeftSection('left-view'); }, 1000);
    } catch (err) { showMsg('edit-msg', err.message, 'error'); }
  });

  // ออกจากระบบ
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await signOut(auth);
    const authWrap = document.getElementById('auth-wrap');
    const dashWrap = document.getElementById('dash-wrap');
    const loginForm = document.getElementById('login-form');
    
    if (authWrap) authWrap.style.display = '';
    if (dashWrap) dashWrap.classList.remove('active');
    document.querySelectorAll('#auth-area .section').forEach(s => s.classList.remove('active'));
    
    const authArea = document.getElementById('auth-area');
    if (authArea) authArea.classList.add('active');
    if (loginForm) loginForm.classList.add('active');
    switchTab('login');
  });
});

// Export recordUsage เพื่อให้ result.html เรียกใช้งานได้
export { recordUsage };