const firebaseConfig = {
  apiKey: "AIzaSyClThtgfsR00SuM3lgM2HOP9175b6FnkYc",
  authDomain: "agrifuture-ai-5ade9.firebaseapp.com",
  projectId: "agrifuture-ai-5ade9",
  storageBucket: "agrifuture-ai-5ade9.firebasestorage.app",
  messagingSenderId: "634181270751",
  appId: "1:634181270751:web:2a9efbb05bd90839853d6a",
  measurementId: "G-32C33BG9YX"
};
// ─────────────────────────────────────────────────────────────────────────

import { initializeApp }                         from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider,
         signInWithPopup, signOut,
         onAuthStateChanged }                    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc,
         getDocs, getDoc, setDoc, addDoc,
         updateDoc, deleteDoc, query,
         where, orderBy, serverTimestamp,
         onSnapshot }                            from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref, push, onValue,
         set, off }                              from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ─────────────────────────────────────────────────────────────────────────
// INIT
// (หมายเหตุ: ไม่ใช้ Firebase Storage แล้ว — เก็บรูปเป็น base64 ใน Firestore แทน
//  เพื่อไม่ต้องอัปเกรดเป็นแผน Blaze)
// ─────────────────────────────────────────────────────────────────────────
const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const rtdb    = getDatabase(app);
const gProvider = new GoogleAuthProvider();

// ─────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────
let currentUser   = null;   // Firebase User object
let userProfile   = null;   // Firestore /users/{uid}
let shops         = [];     // Firestore /shops
let products      = [];     // Firestore /products
let cartItems     = JSON.parse(localStorage.getItem('agri_cart') || '[]');
let uploadedFiles = [];     // File objects pending upload (จะถูกแปลงเป็น base64)
let uploadedURLs  = [];     // base64 data URLs ที่มีอยู่แล้ว (โหมดแก้ไข) หรือที่แปลงแล้ว
let shopAvatarFile = null;
let shopAvatarURL  = null;  // base64 data URL ของรูปร้าน
let currentChatTarget = null;
let currentView   = 'home';
let prevView      = 'home';
let currentFilterCat = 'ทั้งหมด';
let chatUnsubscribe = null;
let editingProductId = null;

// ─────────────────────────────────────────────────────────────────────────
// CLOCK
// ─────────────────────────────────────────────────────────────────────────
function updateClock() {
  const n = new Date();
  document.getElementById('clock').textContent =
    `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')} น.`;
}
updateClock();
setInterval(updateClock, 1000);

// ─────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    // บันทึก/อัปเดต user profile ใน Firestore
    const uRef = doc(db, 'users', user.uid);
    await setDoc(uRef, {
      uid: user.uid,
      name: user.displayName,
      email: user.email,
      photo: user.photoURL || '',
      lastLogin: serverTimestamp()
    }, { merge: true });
    userProfile = (await getDoc(uRef)).data();
    updateNavForUser(true);
    await loadData();
  } else {
    currentUser = null;
    userProfile = null;
    updateNavForUser(false);
  }
  document.getElementById('pageLoading').style.display = 'none';
  if (!user) showLoginOverlay();
  else renderHome();
});

window.loginWithGoogle = async function() {
  const btn = document.getElementById('googleLoginBtn');
  const txt = document.getElementById('googleBtnText');
  btn.disabled = true;
  txt.innerHTML = '<span class="spinner"></span>กำลังเข้าสู่ระบบ...';
  try {
    await signInWithPopup(auth, gProvider);
    hideLoginOverlay();
  } catch (e) {
    showToast('❌ เข้าสู่ระบบไม่สำเร็จ: ' + e.message, 'error');
    btn.disabled = false;
    txt.textContent = 'เข้าสู่ระบบด้วย Google';
  }
};

window.logout = function() {
  openConfirm('🚪','ออกจากระบบ','ต้องการออกจากระบบใช่ไหม?', async () => {
    if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
    await signOut(auth);
    cartItems = [];
    localStorage.removeItem('agri_cart');
    updateCartBadge();
    goHome();
    showLoginOverlay();
  },'ออกจากระบบ');
};

function showLoginOverlay()  { document.getElementById('loginOverlay').style.display = 'flex'; }
function hideLoginOverlay()  { document.getElementById('loginOverlay').style.display = 'none'; }
window.showLogin = showLoginOverlay;

function updateNavForUser(loggedIn) {
  ['postBtn','chatBtn','myShopBtn','logoutBtn','userChip'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = loggedIn ? '' : 'none';
  });
  const loginNavBtn = document.getElementById('loginNavBtn');
  if (loginNavBtn) loginNavBtn.style.display = loggedIn ? 'none' : '';

  if (loggedIn && currentUser) {
    const av = document.getElementById('userAv');
    av.innerHTML = currentUser.photoURL
      ? `<img src="${currentUser.photoURL}" referrerpolicy="no-referrer"/>`
      : `<div style="width:100%;height:100%;border-radius:50%;background:#388E3C;display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:700">${(currentUser.displayName||'?').charAt(0)}</div>`;
    document.getElementById('userName').textContent = (currentUser.displayName||'').split(' ')[0];
  }
  updateCartBadge();
}

// ─────────────────────────────────────────────────────────────────────────
// DATA LAYER — Firestore
// ─────────────────────────────────────────────────────────────────────────
async function loadData() {
  // โหลด shops และ products จาก Firestore พร้อมกัน
  const [shopsSnap, prodsSnap] = await Promise.all([
    getDocs(query(collection(db, 'shops'), orderBy('createdAt', 'desc'))),
    getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc')))
  ]);
  shops    = shopsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  products = prodsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderHome();
}

// ─────────────────────────────────────────────────────────────────────────
// IMAGE HELPER — แปลงไฟล์รูปเป็น base64 data URL พร้อมบีบอัด/ย่อขนาด
// (แทนการอัปโหลดไป Firebase Storage เพื่อให้ใช้แผน Spark (ฟรี) ได้)
// ─────────────────────────────────────────────────────────────────────────
function compressImageToDataURL(file, maxDim = 700, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round(height * (maxDim / width)); width = maxDim;
      } else if (height > maxDim) {
        width = Math.round(width * (maxDim / height)); height = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      // ลองบีบอัดแบบ jpeg ก่อน ถ้ายังใหญ่เกิน ~700KB ให้ลด quality ลงอีก
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length > 700 * 1024 && quality > 0.4) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.4);
      }
      resolve(dataUrl);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadProductImages(files, productId, onProgress) {
  const urls = [];
  for (let i = 0; i < files.length; i++) {
    if (onProgress) onProgress(Math.round((i / files.length) * 90));
    const dataUrl = await compressImageToDataURL(files[i], 700, 0.7);
    urls.push(dataUrl);
  }
  if (onProgress) onProgress(100);
  return urls;
}

// ─────────────────────────────────────────────────────────────────────────
// HOME
// ─────────────────────────────────────────────────────────────────────────
function renderHome() {
  const filtered = currentFilterCat === 'ทั้งหมด'
    ? products
    : products.filter(p => p.cat === currentFilterCat);
  renderShops();
  renderProducts(filtered);
}

function renderShops() {
  const grid = document.getElementById('shopGrid');
  if (!shops.length) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🏪</div>
      <div class="empty-title">ยังไม่มีร้านค้าในตลาด</div>
      <div class="empty-sub">เป็นคนแรกที่เปิดร้านได้เลย!</div>
      ${currentUser ? `<button class="empty-btn" onclick="goToSetup()">🏪 เปิดร้านของฉัน</button>` : ''}
    </div>`;
    return;
  }
  grid.innerHTML = `<div class="shop-grid">${shops.map(s => {
    const sp = products.filter(p => p.shopId === s.id);
    return `<div class="shop-card" onclick="openShop('${s.id}')">
      <div class="shop-banner" style="background:linear-gradient(135deg,${s.color||'#1B5E20'},#0a1f0a)">
        <div class="shop-banner-grad"></div>
        <div class="shop-avatar">
          ${s.avatar ? `<img src="${s.avatar}" alt="${s.name}"/>` : s.name.charAt(0)}
        </div>
      </div>
      <div class="shop-info">
        <div class="shop-name">${s.name}</div>
        <div class="shop-meta">
          <span class="shop-rating">★ ${s.rating||'5.0'}</span>
          <span class="shop-tag">${s.cat}</span>
        </div>
        <div style="font-size:.73rem;color:var(--g2);margin-top:5px">📍 ${s.province}</div>
      </div>
      <div class="shop-preview">
        ${sp.slice(0,3).map(p => `<div class="shop-prev-img">
          ${p.images&&p.images[0] ? `<img src="${p.images[0]}" alt="${p.name}"/>` : '📦'}
        </div>`).join('')}
        ${sp.length > 3 ? `<div class="shop-prev-img shop-prev-more">+${sp.length-3}<br>สินค้า</div>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
}

function renderProducts(list) {
  const grid = document.getElementById('productGrid');
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${!products.length ? '🌾' : '🔍'}</div>
      <div class="empty-title">${!products.length ? 'ยังไม่มีสินค้าในตลาด' : 'ไม่พบสินค้าในหมวดนี้'}</div>
      <div class="empty-sub">${!products.length ? 'เริ่มโพสสินค้าแรกของคุณ' : 'ลองเลือกหมวดหมู่อื่น'}</div>
      ${currentUser && !products.length ? `<button class="empty-btn" onclick="showView('post')">+ โพสสินค้าแรก</button>` : ''}
    </div>`;
    return;
  }
  grid.innerHTML = `<div class="product-grid">${list.map(p => {
    const shop = shops.find(s => s.id === p.shopId) || { name: 'ไม่ทราบ', province: '' };
    return `<div class="product-card" onclick="openProduct('${p.id}')">
      ${p.badge==='hot' ? '<div class="badge-hot">🔥 Hot</div>' : '<div class="badge-new">✨ New</div>'}
      <div class="product-img">
        ${p.images&&p.images[0] ? `<img src="${p.images[0]}" alt="${p.name}"/>` : '📦'}
      </div>
      <div class="product-body">
        <div class="product-name">${p.name}</div>
        <div class="product-price">${Number(p.price).toLocaleString()} ฿<span> ${p.unit}</span></div>
        <div class="product-shop-label">🏪 ${shop.name}</div>
        <div class="product-shop-label">📍 ${shop.province}</div>
      </div>
      <div class="chat-float" onclick="event.stopPropagation();openChatWith('${p.shopId}')" title="แชทกับผู้ขาย">💭</div>
    </div>`;
  }).join('')}</div>`;
}

window.filterCat = function(el, cat) {
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  currentFilterCat = cat;
  renderProducts(cat === 'ทั้งหมด' ? products : products.filter(p => p.cat === cat));
};

window.doSearch = function() {
  const q = document.getElementById('searchQ').value.trim().toLowerCase();
  if (!q) { renderProducts(products); return; }
  renderProducts(products.filter(p =>
    p.name.toLowerCase().includes(q) || (p.desc||'').toLowerCase().includes(q)
  ));
};

// ─────────────────────────────────────────────────────────────────────────
// SHOP PAGE
// ─────────────────────────────────────────────────────────────────────────
window.openShop = function(shopId) {
  const s = shops.find(x => x.id === shopId);
  if (!s) return;
  const sp = products.filter(p => p.shopId === shopId);
  const isOwner = currentUser && s.ownerId === currentUser.uid;
  document.getElementById('shopPageContent').innerHTML = `
    <div class="shop-header">
      <div class="shop-header-top">
        <div class="shop-avatar-lg">
          ${s.avatar ? `<img src="${s.avatar}" alt="${s.name}"/>` : s.name.charAt(0)}
        </div>
        <div class="shop-header-info">
          <div class="shop-header-name">${s.name}</div>
          <div class="shop-header-owner">📍 ${s.province}</div>
          <div class="shop-header-desc">${s.desc||''}</div>
          <div class="shop-header-meta">
            <div class="shop-stat"><div class="shop-stat-num">★ ${s.rating||'5.0'}</div><div class="shop-stat-label">คะแนน</div></div>
            <div class="shop-stat"><div class="shop-stat-num">${sp.length}</div><div class="shop-stat-label">สินค้า</div></div>
          </div>
        </div>
      </div>
      <div class="shop-btns">
        ${!isOwner ? `<button class="btn btn-chat" onclick="openChatWith('${s.id}')">💭 แชทกับผู้ขาย</button>` : ''}
        ${isOwner ? `<button class="btn btn-primary" onclick="showView('post')">+ เพิ่มสินค้า</button>
                     <button class="btn btn-outline" onclick="showView('myshop')">⚙️ จัดการร้าน</button>` : ''}
      </div>
    </div>
    ${sp.length ? `<div class="product-grid">${sp.map(p => `
      <div class="product-card" onclick="openProduct('${p.id}')">
        <div class="product-img">${p.images&&p.images[0]?`<img src="${p.images[0]}" alt="${p.name}"/>`:'📦'}</div>
        <div class="product-body">
          <div class="product-name">${p.name}</div>
          <div class="product-price">${Number(p.price).toLocaleString()} ฿<span> ${p.unit}</span></div>
        </div>
        <div class="chat-float" onclick="event.stopPropagation();openChatWith('${s.id}')">💭</div>
      </div>`).join('')}</div>`
    : `<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">ยังไม่มีสินค้า</div>${isOwner?`<button class="empty-btn" onclick="showView('post')">+ เพิ่มสินค้า</button>`:''}</div>`}`;
  showView('shop', true);
};

// ─────────────────────────────────────────────────────────────────────────
// PRODUCT MODAL
// ─────────────────────────────────────────────────────────────────────────
window.openProduct = function(pid) {
  const p = products.find(x => x.id === pid);
  if (!p) return;
  const s = shops.find(x => x.id === p.shopId) || { name: 'ร้านค้า', province: '' };
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-prod-img">
      ${p.images&&p.images[0] ? `<img src="${p.images[0]}" alt="${p.name}"/>` : '📦'}
    </div>
    <div class="modal-name">${p.name}</div>
    <div class="modal-price">${Number(p.price).toLocaleString()} ฿ <span style="font-size:.8rem;color:var(--g2);font-weight:400">${p.unit}</span></div>
    <div class="modal-desc">${p.desc||'ไม่มีรายละเอียด'}</div>
    <div class="modal-row"><span>ร้านค้า</span><span>🏪 ${s.name}</span></div>
    <div class="modal-row"><span>จังหวัด</span><span>📍 ${s.province}</span></div>
    <div class="modal-row"><span>หมวดหมู่</span><span>${p.cat}</span></div>
    <div class="modal-row"><span>สต็อก</span><span>${p.stock||'ไม่ระบุ'}</span></div>
    ${p.images&&p.images.length>1 ? `<div style="display:flex;gap:.5rem;margin-top:1rem;flex-wrap:wrap">
      ${p.images.map(img=>`<div style="width:70px;height:70px;border-radius:10px;overflow:hidden;flex-shrink:0"><img src="${img}" style="width:100%;height:100%;object-fit:cover"/></div>`).join('')}
    </div>` : ''}
    <div class="qty-row">
      <div style="font-size:.83rem;color:var(--g2)">จำนวน</div>
      <button class="qty-btn" onclick="changeQty(-1)">−</button>
      <div class="qty-val" id="qtyVal">1</div>
      <button class="qty-btn" onclick="changeQty(1)">+</button>
      <div style="font-size:.83rem;color:var(--y3);font-weight:700;margin-left:.5rem" id="qtyTotal">= ${Number(p.price).toLocaleString()} ฿</div>
    </div>
    <div class="modal-btns">
      <button class="btn btn-chat" style="flex:none;padding:10px 16px" onclick="closeModal();openChatWith('${p.shopId}')">💭 แชท</button>
      <button class="btn btn-primary" style="flex:1" onclick="addToCart('${p.id}')">🛒 ใส่ตะกร้า</button>
    </div>`;
  window._mProduct = p; window._qty = 1;
  document.getElementById('modalBg').classList.add('open');
};

window.changeQty = function(d) {
  window._qty = Math.max(1, window._qty + d);
  document.getElementById('qtyVal').textContent = window._qty;
  document.getElementById('qtyTotal').textContent = `= ${(window._mProduct.price * window._qty).toLocaleString()} ฿`;
};

window.addToCart = function(pid) {
  if (!currentUser) { closeModal(); showLoginOverlay(); return; }
  const p = products.find(x => x.id === pid);
  const ex = cartItems.find(c => c.pid === pid);
  if (ex) ex.qty += window._qty;
  else cartItems.push({ pid, qty: window._qty, name: p.name, price: p.price });
  localStorage.setItem('agri_cart', JSON.stringify(cartItems));
  updateCartBadge();
  closeModal();
  showToast(`🛒 เพิ่ม "${p.name}" ×${window._qty} แล้ว`);
};

function updateCartBadge() {
  document.getElementById('cartCount').textContent = cartItems.reduce((a,c) => a+c.qty, 0);
}

window.openCart = function() {
  if (!currentUser) { showLoginOverlay(); return; }
  if (!cartItems.length) { showToast('🛒 ตะกร้าว่างเปล่า'); return; }
  const total = cartItems.reduce((a,c) => a + (c.price * c.qty), 0);
  document.getElementById('modalContent').innerHTML = `
    <div style="font-size:1.3rem;font-weight:800;margin-bottom:1rem">🛒 ตะกร้าสินค้า</div>
    ${cartItems.map((c,i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem 0;border-bottom:1px solid rgba(255,255,255,.06)">
        <div style="flex:1"><div style="font-size:.88rem;font-weight:700">${c.name}</div>
          <div style="font-size:.75rem;color:var(--g2)">${Number(c.price).toLocaleString()} ฿ × ${c.qty}</div></div>
        <div style="font-size:.92rem;font-weight:700;color:var(--y4);margin:0 .75rem">${(c.price*c.qty).toLocaleString()} ฿</div>
        <button class="btn-xs del" onclick="removeFromCart(${i})">✕</button>
      </div>`).join('')}
    <div style="display:flex;justify-content:space-between;margin-top:1rem;font-size:1rem;font-weight:800">
      <span>รวม</span><span style="color:var(--y4)">${total.toLocaleString()} ฿</span>
    </div>
    <button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="checkout()">✅ ชำระเงิน</button>`;
  document.getElementById('modalBg').classList.add('open');
};

window.removeFromCart = function(i) {
  cartItems.splice(i,1);
  localStorage.setItem('agri_cart', JSON.stringify(cartItems));
  updateCartBadge();
  closeModal();
  openCart();
  if (!cartItems.length) closeModal();
};

window.checkout = function() {
  cartItems = [];
  localStorage.removeItem('agri_cart');
  updateCartBadge();
  closeModal();
  showToast('✅ สั่งซื้อสำเร็จ! ผู้ขายจะติดต่อกลับเร็วๆ นี้');
};

window.closeModal = function() { document.getElementById('modalBg').classList.remove('open'); };
document.getElementById('modalBg').addEventListener('click', function(e) { if(e.target===this) closeModal(); });

// ─────────────────────────────────────────────────────────────────────────
// IMAGE UPLOAD (ไฟล์จริง — แปลงเป็น base64 ตอน submit ไม่ผ่าน Storage)
// ─────────────────────────────────────────────────────────────────────────
window.handleDrag = function(e,on) { e.preventDefault(); document.getElementById('uploadArea').classList.toggle('drag',on); };
window.handleDrop = function(e) { e.preventDefault(); handleDrag(e,false); handleFiles(e.dataTransfer.files); };

window.handleFiles = function(files) {
  const remaining = 4 - uploadedFiles.length - uploadedURLs.length;
  if (remaining <= 0) { showToast('⚠️ เพิ่มรูปได้สูงสุด 4 รูป','error'); return; }
  Array.from(files).slice(0, remaining).forEach(file => {
    if (!file.type.startsWith('image/')) { showToast('⚠️ รองรับเฉพาะไฟล์รูปภาพ','error'); return; }
    if (file.size > 8*1024*1024) { showToast('⚠️ ไฟล์ใหญ่เกิน 8MB','error'); return; }
    uploadedFiles.push(file);
    renderImgPreview();
  });
};

function renderImgPreview() {
  const grid = document.getElementById('imgPreviewGrid');
  // existing URLs (จาก Firestore, edit mode — เป็น base64 data URL อยู่แล้ว)
  const urlPreviews = uploadedURLs.map((url,i) => `
    <div class="img-prev-wrap">
      <img src="${url}" alt="preview"/>
      <button class="img-prev-del" onclick="removeExistingImg(${i})">✕</button>
    </div>`);
  // new local files
  const filePreviews = uploadedFiles.map((file,i) => {
    const objUrl = URL.createObjectURL(file);
    return `<div class="img-prev-wrap">
      <img src="${objUrl}" alt="preview"/>
      <button class="img-prev-del" onclick="removeNewImg(${i})">✕</button>
    </div>`;
  });
  grid.innerHTML = [...urlPreviews, ...filePreviews].join('');
}

window.removeExistingImg = function(i) { uploadedURLs.splice(i,1); renderImgPreview(); };
window.removeNewImg = function(i) { uploadedFiles.splice(i,1); renderImgPreview(); };

window.previewShopAvatar = function(file) {
  if (!file||!file.type.startsWith('image/')) return;
  shopAvatarFile = file;
  const url = URL.createObjectURL(file);
  const el = document.getElementById('shopAvPrev');
  el.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
};

// ─────────────────────────────────────────────────────────────────────────
// SETUP SHOP
// ─────────────────────────────────────────────────────────────────────────
window.goToSetup = function() {
  shopAvatarFile = null; shopAvatarURL = null;
  document.getElementById('shopAvPrev').innerHTML = '🌿';
  ['sName','sDesc','sProvince'].forEach(id => document.getElementById(id).value = '');
  showView('setup');
};

window.createShop = async function() {
  if (!currentUser) { showLoginOverlay(); return; }
  const name = document.getElementById('sName').value.trim();
  const province = document.getElementById('sProvince').value.trim();
  if (!name||!province) { showToast('⚠️ กรุณากรอกชื่อร้านและจังหวัด','error'); return; }
  if (shops.find(s => s.ownerId === currentUser.uid)) {
    showToast('⚠️ คุณมีร้านค้าแล้ว 1 ร้าน','error'); showView('myshop'); return;
  }
  const btn = document.getElementById('createShopBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>กำลังสร้างร้าน...';

  try {
    // แปลงรูปร้านเป็น base64 (ถ้ามี) — ย่อขนาดเล็กกว่าหน่อยเพราะเป็นแค่ไอคอนร้าน
    let avatarURL = null;
    if (shopAvatarFile) {
      avatarURL = await compressImageToDataURL(shopAvatarFile, 300, 0.7);
    }
    const shopData = {
      ownerId: currentUser.uid,
      ownerName: currentUser.displayName,
      name,
      desc: document.getElementById('sDesc').value.trim(),
      province,
      cat: document.getElementById('sCat').value,
      avatar: avatarURL,
      color: '#388E3C',
      rating: '5.0',
      reviews: 0,
      createdAt: serverTimestamp()
    };
    const shopRef = await addDoc(collection(db, 'shops'), shopData);
    shops.unshift({ id: shopRef.id, ...shopData, createdAt: new Date() });
    showToast(`🏪 เปิดร้าน "${name}" สำเร็จแล้ว!`);
    showView('myshop');
  } catch(e) {
    showToast('❌ สร้างร้านไม่สำเร็จ: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '🏪 เปิดร้านค้า';
  }
};

// ─────────────────────────────────────────────────────────────────────────
// MY SHOP
// ─────────────────────────────────────────────────────────────────────────
window.renderMyShop = function() {
  if (!currentUser) return;
  const myShop = shops.find(s => s.ownerId === currentUser.uid);
  const myProducts = myShop ? products.filter(p => p.shopId === myShop.id) : [];
  const el = document.getElementById('myShopContent');
  if (!myShop) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🏪</div>
      <div class="empty-title">คุณยังไม่มีร้านค้า</div>
      <div class="empty-sub">สร้างร้านค้าเพื่อเริ่มโพสสินค้า</div>
      <button class="empty-btn" onclick="goToSetup()">🏪 สร้างร้านค้า</button>
    </div>`; return;
  }
  el.innerHTML = `
    <div class="my-shop-card">
      <div class="my-shop-av">
        ${myShop.avatar ? `<img src="${myShop.avatar}" alt="${myShop.name}"/>` : myShop.name.charAt(0)}
      </div>
      <div class="my-shop-info">
        <div class="my-shop-name">${myShop.name}</div>
        <div class="my-shop-sub">📍 ${myShop.province} · ${myProducts.length} สินค้า · ★ ${myShop.rating}</div>
      </div>
      <div class="my-shop-actions">
        <button class="btn btn-primary" onclick="showView('post')">+ เพิ่มสินค้า</button>
        <button class="btn btn-outline" onclick="openShop('${myShop.id}')">👁️ ดูร้าน</button>
        <button class="btn btn-danger" onclick="confirmDeleteShop('${myShop.id}')">🗑️ ลบร้าน</button>
      </div>
    </div>
    <div class="sec-title">📦 สินค้าของฉัน (${myProducts.length})</div>
    ${myProducts.length
      ? `<div style="display:flex;flex-direction:column;gap:.75rem">${myProducts.map(p => `
          <div class="my-product-card">
            <div class="my-product-img">${p.images&&p.images[0]?`<img src="${p.images[0]}" alt="${p.name}"/>`:'📦'}</div>
            <div class="my-product-body">
              <div class="my-product-name">${p.name}</div>
              <div class="my-product-price">${Number(p.price).toLocaleString()} ฿ ${p.unit}</div>
              <div style="font-size:.7rem;color:var(--g2);margin-top:2px">${p.cat} · สต็อก ${p.stock||'-'}</div>
              <div class="my-product-actions">
                <button class="btn-xs edit" onclick="editProduct('${p.id}')">✏️ แก้ไข</button>
                <button class="btn-xs del" onclick="confirmDeleteProduct('${p.id}')">🗑️ ลบ</button>
              </div>
            </div>
          </div>`).join('')}</div>`
      : `<div class="empty-state" style="padding:3rem 1rem">
          <div class="empty-icon">📦</div><div class="empty-title">ยังไม่มีสินค้า</div>
          <button class="empty-btn" onclick="showView('post')">+ เพิ่มสินค้า</button>
        </div>`}`;
};

// ─────────────────────────────────────────────────────────────────────────
// POST / EDIT PRODUCT
// ─────────────────────────────────────────────────────────────────────────
function resetPostForm() {
  uploadedFiles = []; uploadedURLs = [];
  editingProductId = null;
  document.getElementById('postFormTitle').textContent = 'โพสสินค้าใหม่';
  document.getElementById('submitProductBtn').textContent = '✅ โพสสินค้า';
  document.getElementById('editProductId').value = '';
  ['pName','pDesc','pPrice','pStock'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('imgPreviewGrid').innerHTML = '';
}

window.editProduct = function(pid) {
  const p = products.find(x => x.id === pid);
  if (!p) return;
  editingProductId = pid;
  uploadedFiles = [];
  uploadedURLs = [...(p.images||[])];
  document.getElementById('postFormTitle').textContent = 'แก้ไขสินค้า';
  document.getElementById('submitProductBtn').textContent = '💾 บันทึกการแก้ไข';
  document.getElementById('editProductId').value = pid;
  document.getElementById('pName').value = p.name;
  document.getElementById('pDesc').value = p.desc||'';
  document.getElementById('pPrice').value = p.price;
  document.getElementById('pStock').value = p.stock||'';
  document.getElementById('pCat').value = p.cat;
  document.getElementById('pUnit').value = p.unit;
  renderImgPreview();
  showView('post');
};

window.submitProduct = async function() {
  if (!currentUser) { showLoginOverlay(); return; }
  const myShop = shops.find(s => s.ownerId === currentUser.uid);
  if (!myShop) { showToast('⚠️ กรุณาสร้างร้านค้าก่อน','error'); goToSetup(); return; }
  const name = document.getElementById('pName').value.trim();
  const price = parseFloat(document.getElementById('pPrice').value);
  if (!name||!price||price<=0) { showToast('⚠️ กรุณากรอกชื่อสินค้าและราคา','error'); return; }
  if (!uploadedFiles.length && !uploadedURLs.length) { showToast('⚠️ กรุณาอัปโหลดรูปสินค้า','error'); return; }

  const btn = document.getElementById('submitProductBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>กำลังบันทึก...';
  const bar = document.getElementById('uploadProgressBar');
  const prog = document.getElementById('uploadProgress');

  try {
    const editId = document.getElementById('editProductId').value;
    const productId = editId || `prod_${Date.now()}`;

    // แปลงรูปใหม่ (ถ้ามี) เป็น base64 data URL
    let newURLs = [];
    if (uploadedFiles.length) {
      prog.style.display = 'block';
      newURLs = await uploadProductImages(uploadedFiles, productId, (pct) => { bar.style.width = pct + '%'; });
      setTimeout(() => { prog.style.display = 'none'; bar.style.width = '0%'; }, 500);
    }
    const allImages = [...uploadedURLs, ...newURLs];

    const productData = {
      shopId: myShop.id,
      ownerId: currentUser.uid,
      name,
      desc: document.getElementById('pDesc').value.trim(),
      price,
      unit: document.getElementById('pUnit').value,
      cat: document.getElementById('pCat').value,
      stock: document.getElementById('pStock').value || null,
      images: allImages,
      badge: 'new',
      updatedAt: serverTimestamp()
    };

    if (editId) {
      await updateDoc(doc(db, 'products', editId), productData);
      const idx = products.findIndex(p => p.id === editId);
      if (idx >= 0) products[idx] = { ...products[idx], ...productData };
      showToast(`✅ แก้ไขสินค้า "${name}" สำเร็จ`);
    } else {
      productData.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, 'products'), productData);
      products.unshift({ id: ref.id, ...productData, createdAt: new Date() });
      showToast(`✅ โพสสินค้า "${name}" สำเร็จแล้ว!`);
    }

    renderHome();
    resetPostForm();
    showView('myshop');
  } catch(e) {
    showToast('❌ บันทึกไม่สำเร็จ: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = editingProductId ? '💾 บันทึกการแก้ไข' : '✅ โพสสินค้า';
  }
};

// ─────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────
window.confirmDeleteProduct = function(pid) {
  const p = products.find(x => x.id === pid);
  openConfirm('🗑️', `ลบ "${p?.name}"?`, 'สินค้าและรูปภาพจะถูกลบถาวร', async () => {
    try {
      await deleteDoc(doc(db, 'products', pid));
      products = products.filter(x => x.id !== pid);
      renderMyShop();
      showToast('🗑️ ลบสินค้าแล้ว');
    } catch(e) { showToast('❌ ลบไม่สำเร็จ: ' + e.message, 'error'); }
  }, 'ลบสินค้า');
};

window.confirmDeleteShop = function(sid) {
  openConfirm('⚠️','ลบร้านค้า?','ร้านและสินค้าทั้งหมดจะถูกลบถาวร', async () => {
    try {
      // ลบ products ทั้งหมดของร้านนี้
      const pDocs = await getDocs(query(collection(db,'products'), where('shopId','==',sid)));
      await Promise.all(pDocs.docs.map(d => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'shops', sid));
      shops = shops.filter(s => s.id !== sid);
      products = products.filter(p => p.shopId !== sid);
      renderHome();
      showToast('🗑️ ลบร้านค้าแล้ว');
      showView('home', true);
    } catch(e) { showToast('❌ ลบร้านไม่สำเร็จ: ' + e.message, 'error'); }
  }, 'ลบร้านค้า');
};

// ─────────────────────────────────────────────────────────────────────────
// CHAT — Realtime Database
// path: chats/{convId}/messages/{msgId}
// convId = sorted([buyerUid, shopId]).join('_')
// ─────────────────────────────────────────────────────────────────────────
function convId(shopId) {
  return [currentUser.uid, shopId].sort().join('_');
}

window.openChatWith = function(shopId) {
  if (!currentUser) { showLoginOverlay(); return; }
  const s = shops.find(x => x.id === shopId);
  if (!s) return;
  if (s.ownerId === currentUser.uid) { showToast('💬 คุณเป็นเจ้าของร้านนี้'); return; }
  currentChatTarget = shopId;
  showView('chat');
};

window.renderChat = function() {
  if (!currentUser) return;
  // render sidebar: ทุก conv ที่ user มีส่วนร่วม
  // สำหรับ demo: แสดงร้านที่ user เคยแชท (ดูจาก RTDB path ไม่ได้โดยตรงในฝั่ง client แบบ scan)
  // ใช้วิธีเก็บ list ใน Firestore /users/{uid}/chats
  const chatListEl = document.getElementById('chatList');
  chatListEl.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--g2);font-size:.83rem">
    กดปุ่ม 💭 ในสินค้าหรือร้านค้าเพื่อเริ่มแชท
  </div>`;
  if (currentChatTarget) openConversation(currentChatTarget);
};

function openConversation(shopId) {
  const s = shops.find(x => x.id === shopId);
  if (!s) return;
  document.getElementById('chatHeader').innerHTML = `
    <div class="chat-header-av">${s.avatar?`<img src="${s.avatar}" alt="${s.name}"/>`:`${s.name.charAt(0)}`}</div>
    <div>
      <div class="chat-header-name">${s.name}</div>
      <div class="chat-header-status"><span class="dot-online"></span>ออนไลน์</div>
    </div>
    <div style="margin-left:auto"><button class="nav-btn" onclick="openShop('${shopId}')">🏪 ดูร้าน</button></div>`;

  // ยกเลิก listener เดิม (ถ้ามี)
  if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }

  const cid = convId(shopId);
  const msgsRef = ref(rtdb, `chats/${cid}/messages`);
  const msgsEl = document.getElementById('chatMsgs');
  msgsEl.innerHTML = '';

  chatUnsubscribe = onValue(msgsRef, (snap) => {
    const data = snap.val() || {};
    const msgs = Object.values(data).sort((a,b) => a.ts - b.ts);
    if (!msgs.length) {
      msgsEl.innerHTML = `<div class="chat-empty"><div>💬</div><div>ส่งข้อความเพื่อเริ่มสนทนากับ ${s.name}</div></div>`;
      return;
    }
    msgsEl.innerHTML = msgs.map(m => {
      const isSent = m.senderId === currentUser.uid;
      const t = new Date(m.ts).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
      return `<div class="msg ${isSent?'sent':'recv'}">
        <div class="msg-bubble">${m.text}</div>
        <div class="msg-time">${t}</div>
      </div>`;
    }).join('');
    msgsEl.scrollTop = msgsEl.scrollHeight;
  });
}

window.chatKey = function(e) { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendMsg(); } };

window.sendMsg = async function() {
  if (!currentUser||!currentChatTarget) return;
  const inp = document.getElementById('chatInput');
  const text = inp.value.trim();
  if (!text) return;
  const cid = convId(currentChatTarget);
  inp.value = '';
  try {
    await push(ref(rtdb, `chats/${cid}/messages`), {
      senderId: currentUser.uid,
      senderName: currentUser.displayName,
      text,
      ts: Date.now()
    });
    // Auto-reply (จำลองการตอบกลับจากร้าน)
    const s = shops.find(x => x.id === currentChatTarget);
    if (s) {
      const replies = [
        `สวัสดีค่ะ ขอบคุณที่สนใจสินค้าจาก ${s.name} นะคะ 😊`,
        'สินค้ามีพร้อมส่งค่ะ สั่งได้เลย!',
        'ราคานี้รวมค่าส่งแล้วนะคะ 🚚',
        'ยินดีให้บริการเสมอค่ะ มีอะไรสอบถามได้เลย',
      ];
      setTimeout(async () => {
        await push(ref(rtdb, `chats/${cid}/messages`), {
          senderId: s.id,
          senderName: s.name,
          text: replies[Math.floor(Math.random()*replies.length)],
          ts: Date.now()
        });
      }, 900 + Math.random()*600);
    }
  } catch(e) { showToast('❌ ส่งข้อความไม่สำเร็จ','error'); }
};

// ─────────────────────────────────────────────────────────────────────────
// NAV / VIEW
// ─────────────────────────────────────────────────────────────────────────
window.showView = function(v, skipCheck) {
  if (!skipCheck && !currentUser && v !== 'home') { showLoginOverlay(); return; }
  prevView = currentView;
  currentView = v;
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  window.scrollTo({ top:0, behavior:'smooth' });
  if (v === 'home') renderHome();
  if (v === 'chat') renderChat();
  if (v === 'myshop') renderMyShop();
  if (v === 'post') resetPostForm();
};

window.goHome = function() { showView('home', true); };
window.goBack = function() { showView(prevView, true); };
window.openUserMenu = function() {};

// ─────────────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────────────
let _toastTimer = null;
window.showToast = function(msg, type) {
  const el = document.getElementById('toast');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  document.getElementById('toastMsg').textContent = msg;
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
};
function showToast(msg, type) { window.showToast(msg, type); }

// ─────────────────────────────────────────────────────────────────────────
// CONFIRM
// ─────────────────────────────────────────────────────────────────────────
let _confirmCb = null;
window.openConfirm = function(icon, title, sub, cb, okLabel) {
  _confirmCb = cb;
  document.getElementById('confirmIcon').textContent = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmSub').textContent = sub;
  document.getElementById('confirmOkBtn').textContent = okLabel||'ยืนยัน';
  document.getElementById('confirmBg').classList.add('open');
};
function openConfirm(...args) { window.openConfirm(...args); }
window.closeConfirm = function() { document.getElementById('confirmBg').classList.remove('open'); _confirmCb=null; };
document.getElementById('confirmOkBtn').addEventListener('click', () => { if(_confirmCb)_confirmCb(); closeConfirm(); });
document.getElementById('confirmBg').addEventListener('click', function(e) { if(e.target===this) closeConfirm(); });

// cart badge init
updateCartBadge();