(function () {
  // ============================================================
  // nav-auth.js — อัปเดต nav bar ตาม Firebase auth state
  // ใส่ไฟล์นี้ใน form.html (และทุกหน้า) ก่อน </body>
  //
  // ต้องโหลด Firebase ก่อน:
  //   <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  //   <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
  //   <script>
  //     firebase.initializeApp({ ...firebaseConfig... });
  //   </script>
  //   <script src="nav-auth.js"></script>
  // ============================================================

  const USERS_KEY = 'agrifuture_users';

  function getLocalUser(email) {
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
    return users[email] || null;
  }

  function defaultAvatar() {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Ccircle cx='50' cy='40' r='22' fill='%23aaa'/%3E%3Cellipse cx='50' cy='85' rx='32' ry='22' fill='%23aaa'/%3E%3C/svg%3E";
  }

  function applyUI(firebaseUser) {
    const loginBtn  = document.getElementById('login-trigger');
    const navWelcome = document.querySelector('.nav-welcome');

    if (!loginBtn) return;

    if (!firebaseUser) {
      // ยังไม่ได้ login
      loginBtn.innerHTML = '<i class="fa-regular fa-circle-user"></i> Login / เข้าสู่ระบบ';
      loginBtn.href = 'profile.html';
      loginBtn.removeAttribute('style');
      if (navWelcome) navWelcome.textContent = 'Welcome';
      return;
    }

    // Logged in
    const local     = getLocalUser(firebaseUser.email);
    const name      = local?.name || firebaseUser.displayName || 'ผู้ใช้';
    const avatarSrc = local?.avatar || firebaseUser.photoURL || defaultAvatar();
    const firstName = name.split(' ')[0];

    loginBtn.style.cssText = 'display:flex;align-items:center;gap:8px;text-decoration:none;color:inherit;';
    loginBtn.innerHTML = `
      <img src="${avatarSrc}"
           style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid #eaaf11;"
           alt="avatar"
           onerror="this.src='${defaultAvatar()}'">
      <span style="font-size:14px;font-weight:500;color:#eaaf11;">${firstName}</span>
    `;
    loginBtn.href = 'profile.html';

    if (navWelcome) navWelcome.textContent = `สวัสดี, ${name}`;
  }

  function init() {
    // รอ Firebase พร้อม
    if (typeof firebase === 'undefined' || !firebase.auth) {
      setTimeout(init, 100);
      return;
    }
    firebase.auth().onAuthStateChanged(applyUI);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();