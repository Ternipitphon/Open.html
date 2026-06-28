// ============================================================
// AgriFuture AI — enhance.js
// ไฟล์เสริม (ไม่แก้ logic เดิมใน profile.js) — อ่านข้อมูลจาก
// localStorage key เดิม (agrifuture_usage) แบบ read-only เท่านั้น
// แล้วเรนเดอร์: Season Ring, Badge/Achievement, Leaderboard (mock),
// และปุ่ม Export ผลวิเคราะห์เป็น PDF / รูปภาพ
// ============================================================

const USAGE_KEY = 'agrifuture_usage';

function getUsageDataReadOnly(email) {
  const all = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
  return all[email] || { sessions: [], daily: {} };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ============================================================
// BADGE / ACHIEVEMENT DEFINITIONS
// อิงจาก "รอบการเพาะปลูก" ของเกษตรกรจริง — ไม่ใช่ XP เกมทั่วไป
// ============================================================
const BADGES = [
  { id: 'first_seed',   name: 'หว่านเมล็ดแรก',         sub: 'วิเคราะห์ครั้งแรก',        icon: '🌱', tier: 'earth',   check: s => s.total >= 1 },
  { id: 'five_fields',  name: 'นักสำรวจแปลง',          sub: 'วิเคราะห์ 5 ครั้ง',         icon: '🧭', tier: 'earth',   check: s => s.total >= 5 },
  { id: 'week_streak',  name: 'ขยันทุกวัน',            sub: 'ใช้งานต่อเนื่อง 7 วัน',     icon: '🔥', tier: 'silver',  check: s => s.streak >= 7 },
  { id: 'twenty_runs',  name: 'ผู้เชี่ยวชาญข้อมูล',      sub: 'วิเคราะห์ 20 ครั้ง',        icon: '📊', tier: 'silver',  check: s => s.total >= 20 },
  { id: 'all_seasons',  name: 'ครบทุกฤดู',             sub: 'ใช้งานครบ 4 สัปดาห์',       icon: '🌾', tier: 'gold',    check: s => s.weeksActive >= 4 },
  { id: 'fifty_runs',   name: 'ปราชญ์แห่งไร่',          sub: 'วิเคราะห์ 50 ครั้ง',        icon: '🏆', tier: 'gold',    check: s => s.total >= 50 },
  { id: 'month_streak', name: 'เกษตรกรไฟแรง',          sub: 'ใช้งานต่อเนื่อง 30 วัน',    icon: '⚡', tier: 'emerald', check: s => s.streak >= 30 },
  { id: 'hundred_runs', name: 'ตำนานผู้พิทักษ์ผืนนา',    sub: 'วิเคราะห์ 100 ครั้ง',       icon: '👑', tier: 'emerald', check: s => s.total >= 100 }
];

// ============================================================
// SEASON RING — 4 ช่วง ต่อรอบ 40 ครั้งของการวิเคราะห์สะสม
// ============================================================
const SEASON_STAGES = [
  { key: 'seed',    icon: '🌱', label: 'ต้นกล้า',    from: 0,  to: 10 },
  { key: 'grow',    icon: '🌿', label: 'เติบโต',     from: 10, to: 20 },
  { key: 'bloom',   icon: '🌾', label: 'ออกผล',      from: 20, to: 30 },
  { key: 'harvest', icon: '🌻', label: 'เก็บเกี่ยว',  from: 30, to: 40 }
];

function seasonDescription(stageKey) {
  switch (stageKey) {
    case 'seed':    return 'เริ่มต้นบันทึกข้อมูลฟาร์ม ให้ AI เรียนรู้พื้นที่ของคุณ';
    case 'grow':    return 'ข้อมูลเริ่มหนาแน่น AI วิเคราะห์แนวโน้มได้แม่นยำขึ้น';
    case 'bloom':   return 'ระบบพร้อมแนะนำพืชและช่วงเวลาปลูกที่เหมาะสมแล้ว';
    case 'harvest': return 'ถึงเวลาตรวจสอบผลลัพธ์และเตรียมวางแผนฤดูถัดไป';
    default: return '';
  }
}

function getSeasonInfo(total) {
  const cyclePos = total % 40;
  const cycleNum = Math.floor(total / 40) + 1;
  let stage = SEASON_STAGES[SEASON_STAGES.length - 1];
  for (const s of SEASON_STAGES) {
    if (cyclePos >= s.from && cyclePos < s.to) { stage = s; break; }
  }
  const overallProgress = cyclePos / 40;
  const remain = stage.to - cyclePos;
  return { stage, cycleNum, overallProgress, remain, cyclePos };
}

// ============================================================
// คำนวณสถิติจาก session จริง (เฉพาะที่มีผลลัพธ์ AI — เกณฑ์เดียวกับ refreshStats เดิม)
// ============================================================
function isSameDay(a, b) { return a.toDateString() === b.toDateString(); }

function computeStreak(sessions) {
  if (!sessions.length) return 0;
  const days = new Set(sessions.map(s => new Date(s.time).toDateString()));
  let streak = 0;
  let cursor = new Date();
  while (days.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function computeWeeksActive(sessions) {
  if (!sessions.length) return 0;
  const weeks = new Set(sessions.map(s => {
    const d = new Date(s.time);
    const firstJan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - firstJan) / 86400000) + firstJan.getDay() + 1) / 7);
    return `${d.getFullYear()}-${week}`;
  }));
  return weeks.size;
}

function computeStats(email) {
  const data = getUsageDataReadOnly(email);
  const sessions = data.sessions.filter(s => s.result && s.result.selected_crop);
  return {
    total: sessions.length,
    streak: computeStreak(sessions),
    weeksActive: computeWeeksActive(sessions),
    sessions
  };
}

// ============================================================
// SEASON RING — render
// ============================================================
function renderSeasonRing(stats) {
  const wrap = document.getElementById('season-ring-svg');
  if (!wrap) return;

  const info = getSeasonInfo(stats.total);
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - info.overallProgress);

  wrap.innerHTML = `
    <svg class="season-ring-svg" viewBox="0 0 128 128">
      <circle class="season-ring-track" cx="64" cy="64" r="${r}"></circle>
      <circle class="season-ring-fill" cx="64" cy="64" r="${r}"
        stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"></circle>
      <text x="64" y="58" text-anchor="middle" font-size="26">${info.stage.icon}</text>
      <text x="64" y="80" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="Prompt, sans-serif">รอบที่ ${info.cycleNum}</text>
    </svg>`;

  requestAnimationFrame(() => {
    const fillEl = wrap.querySelector('.season-ring-fill');
    if (fillEl) fillEl.style.strokeDashoffset = offset;
  });

  const stageEl = document.getElementById('season-ring-stage');
  const titleEl = document.getElementById('season-ring-title');
  const descEl  = document.getElementById('season-ring-desc');
  const nextEl  = document.getElementById('season-ring-next');
  if (stageEl) stageEl.textContent = `ช่วง: ${info.stage.label.toUpperCase()}`;
  if (titleEl) titleEl.textContent = `ฤดูเพาะปลูกที่ ${info.cycleNum} — ${info.stage.label}`;
  if (descEl)  descEl.textContent  = seasonDescription(info.stage.key);
  if (nextEl) {
    nextEl.textContent = info.remain <= 0
      ? '🎉 ครบรอบฤดู! เริ่มฤดูใหม่แล้ว'
      : `อีก ${info.remain} ครั้งสู่ช่วงถัดไป`;
  }
}

// ============================================================
// BADGES — render + toast แจ้งเตือนเมื่อมีเหรียญใหม่
// ============================================================
function getUnlockedIds(stats) {
  return BADGES.filter(b => b.check(stats)).map(b => b.id);
}

function showAchievementToast(badge) {
  const toast = document.getElementById('achievement-toast');
  if (!toast) return;
  toast.innerHTML = `
    <div class="toast-icon">${badge.icon}</div>
    <div>
      <div class="toast-title">🎉 ปลดล็อกความสำเร็จใหม่</div>
      <div class="toast-name">${escapeHtml(badge.name)}</div>
    </div>`;
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => toast.classList.remove('show'), 4200);
}

function renderBadges(email, stats) {
  const grid = document.getElementById('badge-grid');
  const countPill = document.getElementById('badge-count-pill');
  if (!grid) return;

  const unlockedIds = getUnlockedIds(stats);
  if (countPill) countPill.textContent = `${unlockedIds.length} / ${BADGES.length} ปลดล็อกแล้ว`;

  // เก็บ badge ที่ปลดล็อกแล้วต่อผู้ใช้ (เพื่อรู้ว่าตัวไหน "ใหม่")
  const seenKey = `agrifuture_seen_badges:${email}`;
  const previouslySeen = JSON.parse(localStorage.getItem(seenKey) || '[]');

  grid.innerHTML = BADGES.map(b => {
    const unlocked = unlockedIds.includes(b.id);
    const isNew = unlocked && !previouslySeen.includes(b.id);
    const tierClass = unlocked ? `tier-${b.tier}` : 'tier-locked';
    const newClass = isNew ? 'tier-new' : '';
    return `
      <div class="badge-cell" title="${escapeHtml(b.sub)}">
        <div class="badge-hex ${tierClass} ${newClass}">${unlocked ? b.icon : '🔒'}</div>
        <div class="badge-name ${unlocked ? '' : 'locked'}">${escapeHtml(b.name)}</div>
        <div class="badge-sub">${escapeHtml(b.sub)}</div>
      </div>`;
  }).join('');

  const newlyUnlocked = BADGES.find(b => unlockedIds.includes(b.id) && !previouslySeen.includes(b.id));
  if (newlyUnlocked) showAchievementToast(newlyUnlocked);

  localStorage.setItem(seenKey, JSON.stringify(unlockedIds));
}

// ============================================================
// LEADERBOARD — mock data ผสมอันดับจริงของผู้ใช้ (ยังไม่มี backend กลาง)
// ============================================================
const MOCK_LEADERBOARD = {
  week: [
    { name: 'สมชาย ไร่ทอง',   region: 'นครราชสีมา',  score: 34 },
    { name: 'วิภา เกษตรสุข',   region: 'เชียงใหม่',    score: 29 },
    { name: 'ประยุทธ์ นาดี',    region: 'ขอนแก่น',     score: 22 },
    { name: 'สุนีย์ พืชผล',     region: 'อุบลราชธานี', score: 18 },
    { name: 'อนันต์ ทุ่งกว้าง', region: 'สุรินทร์',     score: 15 }
  ],
  month: [
    { name: 'วิภา เกษตรสุข',   region: 'เชียงใหม่',    score: 102 },
    { name: 'สมชาย ไร่ทอง',   region: 'นครราชสีมา',  score: 96 },
    { name: 'กิตติ ผลเจริญ',   region: 'เพชรบูรณ์',   score: 81 },
    { name: 'ประยุทธ์ นาดี',    region: 'ขอนแก่น',     score: 74 },
    { name: 'สุนีย์ พืชผล',     region: 'อุบลราชธานี', score: 68 }
  ],
  alltime: [
    { name: 'วิภา เกษตรสุข',   region: 'เชียงใหม่',    score: 412 },
    { name: 'กิตติ ผลเจริญ',   region: 'เพชรบูรณ์',   score: 388 },
    { name: 'สมชาย ไร่ทอง',   region: 'นครราชสีมา',  score: 355 },
    { name: 'อนันต์ ทุ่งกว้าง', region: 'สุรินทร์',     score: 290 },
    { name: 'ประยุทธ์ นาดี',    region: 'ขอนแก่น',     score: 247 }
  ]
};

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Ccircle cx='50' cy='40' r='22' fill='%23aaa'/%3E%3Cellipse cx='50' cy='85' rx='32' ry='22' fill='%23aaa'/%3E%3C/svg%3E";

function renderLeaderboard(range, stats, myName, myAvatar) {
  const list = document.getElementById('lb-list');
  const banner = document.getElementById('lb-me-banner');
  if (!list) return;

  const board = [...MOCK_LEADERBOARD[range]];
  const myEntry = { name: myName || 'คุณ', region: 'คุณ', score: stats.total, isMe: true };
  board.push(myEntry);
  board.sort((a, b) => b.score - a.score);

  const myRank = board.findIndex(e => e.isMe) + 1;

  list.innerHTML = board.slice(0, 8).map((entry, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
    const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    return `
      <div class="lb-row ${entry.isMe ? 'is-me' : ''}">
        <div class="lb-rank ${rankClass}">${rankIcon}</div>
        <img class="lb-avatar" src="${entry.isMe ? (myAvatar || DEFAULT_AVATAR) : DEFAULT_AVATAR}" alt="">
        <div class="lb-info">
          <div class="lb-name">${escapeHtml(entry.name)}${entry.isMe ? ' (คุณ)' : ''}</div>
          <div class="lb-region">${escapeHtml(entry.region)}</div>
        </div>
        <div class="lb-score">${entry.score}<span class="lb-score-unit"> ครั้ง</span></div>
      </div>`;
  }).join('');

  if (banner) {
    banner.innerHTML = `<span>อันดับของคุณในตาราง</span><span><strong>#${myRank}</strong> จาก ${board.length} คน</span>`;
  }
}

function initLeaderboardTabsOnce(stats, myName, myAvatar) {
  const tabs = document.querySelectorAll('.lb-tab');
  if (!tabs.length || tabs[0].dataset.bound === '1') return; // ผูก event แค่ครั้งแรก
  tabs.forEach(tab => {
    tab.dataset.bound = '1';
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderLeaderboard(tab.dataset.range, stats, myName, myAvatar);
    });
  });
}

// ============================================================
// EXPORT — ผลวิเคราะห์เป็น PDF / รูปภาพ (ใช้ html2canvas + jsPDF จาก CDN)
// โหลดสคริปต์แบบ lazy เฉพาะตอนกดปุ่มจริง เพื่อไม่ถ่วงโหลดหน้าแรก
// ============================================================
let exportLibsLoading = null;
function loadExportLibs() {
  if (exportLibsLoading) return exportLibsLoading;
  exportLibsLoading = Promise.all([
    loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
    loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
  ]);
  return exportLibsLoading;
}
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const tag = document.createElement('script');
    tag.src = src;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('โหลดสคริปต์ไม่สำเร็จ: ' + src));
    document.head.appendChild(tag);
  });
}

async function exportModal(format) {
  const target = document.querySelector('#result-modal .modal-inner');
  const btnGroup = document.getElementById('export-btn-group');
  if (!target) return;

  if (btnGroup) btnGroup.style.opacity = '0.5';
  try {
    await loadExportLibs();
    // eslint-disable-next-line no-undef
    const canvas = await html2canvas(target, {
      backgroundColor: '#142414',
      scale: 2,
      useCORS: true
    });

    if (format === 'image') {
      const link = document.createElement('a');
      link.download = `agrifuture-ผลวิเคราะห์-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } else {
      // eslint-disable-next-line no-undef
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'px', format: [canvas.width, canvas.height] });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`agrifuture-ผลวิเคราะห์-${Date.now()}.pdf`);
    }
  } catch (err) {
    console.error('Export failed:', err);
    alert('ไม่สามารถส่งออกไฟล์ได้ในขณะนี้ กรุณาลองใหม่');
  } finally {
    if (btnGroup) btnGroup.style.opacity = '1';
  }
}

function bindExportButtonsOnce() {
  const pdfBtn = document.getElementById('btn-export-pdf');
  const imgBtn = document.getElementById('btn-export-image');
  if (pdfBtn && pdfBtn.dataset.bound !== '1') {
    pdfBtn.dataset.bound = '1';
    pdfBtn.addEventListener('click', () => exportModal('pdf'));
  }
  if (imgBtn && imgBtn.dataset.bound !== '1') {
    imgBtn.dataset.bound = '1';
    imgBtn.addEventListener('click', () => exportModal('image'));
  }
}

// ============================================================
// ENTRY POINT — เรียกจาก profile.js หลัง refreshStats สำเร็จทุกครั้ง
// ============================================================
export function renderGamification(email) {
  if (!email) return;
  if (!document.getElementById('season-ring-svg') && !document.getElementById('badge-grid')) return;

  const stats = computeStats(email);

  // เพื่อความสมูท: ป้อนชื่อ/รูปจากช่อง view ที่ profile.js เติมไว้แล้ว
  const myName = document.getElementById('view-name')?.textContent?.trim();
  const myAvatar = document.getElementById('view-avatar')?.getAttribute('src');

  renderSeasonRing(stats);
  renderBadges(email, stats);
  initLeaderboardTabsOnce(stats, myName, myAvatar);
  renderLeaderboard(document.querySelector('.lb-tab.active')?.dataset.range || 'week', stats, myName, myAvatar);
  bindExportButtonsOnce();
}