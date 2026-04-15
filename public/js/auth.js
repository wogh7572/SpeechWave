// ── auth.js ────────────────────────────────────────────
// 로그인 / 회원가입 / Google OAuth / Supabase 인증 상태 관리

// ── 모달 열기/닫기 ──────────────────────────────────────
function openAuthModal(tab) {
  document.getElementById('authModal').classList.add('show');
  if (tab) switchAuthTab(tab);
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('show');
  clearAuthForms();
}

document.getElementById('authModal').addEventListener('click', e => {
  if (e.target === document.getElementById('authModal')) closeAuthModal();
});

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
}

function clearAuthForms() {
  ['loginEmail','loginPassword','signupNickname','signupEmail','signupPassword','signupPasswordConfirm']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  clearAuthError('login');
  clearAuthError('signup');
}

function clearAuthError(type) {
  document.getElementById(type + 'Error').classList.remove('show');
}

function showAuthError(type, msg) {
  const el = document.getElementById(type + 'Error');
  document.getElementById(type + 'ErrorMsg').textContent = msg;
  el.classList.add('show');
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.innerHTML = isText ? '<i class="ri-eye-off-line"></i>' : '<i class="ri-eye-line"></i>';
}

// ── 회원가입 유효성 검사 ────────────────────────────────
function validateNickname() {
  const val   = document.getElementById('signupNickname').value.trim();
  const hint  = document.getElementById('nicknameHint');
  const input = document.getElementById('signupNickname');
  if (!val) { hint.className = 'form-hint neutral'; hint.textContent = '2~20자, 한글/영문/숫자 사용 가능'; input.className = 'form-input'; return false; }
  const ok = /^[가-힣a-zA-Z0-9]{2,20}$/.test(val);
  hint.className = ok ? 'form-hint success' : 'form-hint error';
  hint.textContent = ok ? '✓ 사용 가능한 닉네임이에요' : '2~20자, 한글/영문/숫자만 사용 가능해요';
  input.className = ok ? 'form-input success' : 'form-input error';
  return ok;
}

function validateEmail() {
  const val   = document.getElementById('signupEmail').value.trim();
  const hint  = document.getElementById('emailHint');
  const input = document.getElementById('signupEmail');
  if (!val) { hint.textContent = ''; input.className = 'form-input'; return false; }
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  hint.className = ok ? 'form-hint success' : 'form-hint error';
  hint.textContent = ok ? '✓ 올바른 이메일 형식이에요' : '올바른 이메일 형식이 아니에요';
  input.className = ok ? 'form-input success' : 'form-input error';
  return ok;
}

function validatePassword() {
  const val   = document.getElementById('signupPassword').value;
  const hint  = document.getElementById('passwordHint');
  const input = document.getElementById('signupPassword');
  const bars  = [0,1,2,3].map(i => document.getElementById('psb' + i));
  const checks = [val.length >= 8, /[a-zA-Z]/.test(val), /[0-9]/.test(val), /[^a-zA-Z0-9]/.test(val)];
  const score  = checks.filter(Boolean).length;
  const colors = ['#f3f4f6','#ef4444','#f59e0b','#6366f1','#10b981'];
  const labels = ['','너무 짧아요','조금 더 강하게','거의 다 됐어요','강한 비밀번호 ✓'];
  bars.forEach((b, i) => { if (b) b.style.background = i < score ? colors[score] : '#f3f4f6'; });
  hint.className   = score >= 3 ? 'form-hint success' : score > 0 ? 'form-hint error' : 'form-hint neutral';
  hint.textContent = val ? labels[score] : '8자 이상, 영문+숫자 조합';
  input.className  = score >= 3 ? 'form-input success' : val ? 'form-input error' : 'form-input';
  validateConfirm();
  return score >= 3;
}

function validateConfirm() {
  const pw    = document.getElementById('signupPassword').value;
  const pw2   = document.getElementById('signupPasswordConfirm').value;
  const hint  = document.getElementById('confirmHint');
  const input = document.getElementById('signupPasswordConfirm');
  if (!pw2) { hint.textContent = ''; input.className = 'form-input'; return false; }
  const ok = pw === pw2;
  hint.className   = ok ? 'form-hint success' : 'form-hint error';
  hint.textContent = ok ? '✓ 비밀번호가 일치해요' : '비밀번호가 일치하지 않아요';
  input.className  = ok ? 'form-input success' : 'form-input error';
  return ok;
}

// ── 로그인 ──────────────────────────────────────────────
async function doLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { showAuthError('login', '이메일과 비밀번호를 모두 입력해주세요'); return; }

  const btn = document.getElementById('loginBtn');
  btn.textContent = '로그인 중...'; btn.disabled = true;

  const { error } = await supa.auth.signInWithPassword({ email, password });
  btn.textContent = '로그인'; btn.disabled = false;

  if (error) {
    const msg = error.message.includes('Invalid')   ? '이메일 또는 비밀번호가 올바르지 않아요'
              : error.message.includes('confirmed') ? '이메일 인증이 필요해요. 받은 편지함을 확인하세요'
              : error.message;
    showAuthError('login', msg);
  } else {
    closeAuthModal();
  }
}

// ── 회원가입 ────────────────────────────────────────────
async function doSignup() {
  const ok1 = validateNickname(), ok2 = validateEmail(), ok3 = validatePassword(), ok4 = validateConfirm();
  if (!ok1 || !ok2 || !ok3 || !ok4) { showAuthError('signup', '입력값을 다시 확인해주세요'); return; }

  const nickname = document.getElementById('signupNickname').value.trim();
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const btn      = document.getElementById('signupBtn');
  btn.textContent = '가입 중...'; btn.disabled = true;

  const { error } = await supa.auth.signUp({
    email, password,
    options: { data: { full_name: nickname, nickname } },
  });
  btn.textContent = '회원가입'; btn.disabled = false;

  if (error) {
    showAuthError('signup', error.message.includes('already') ? '이미 사용 중인 이메일이에요' : error.message);
  } else {
    document.getElementById('panel-signup').innerHTML = `
      <div style="text-align:center;padding:20px 0">
        <div style="width:56px;height:56px;background:#ecfdf5;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px">✅</div>
        <div style="font-size:18px;font-weight:800;color:#111827;margin-bottom:8px">가입 완료!</div>
        <div style="font-size:13px;color:#6b7280;line-height:1.6;margin-bottom:20px">
          <strong>${email}</strong>로 인증 메일을 보냈어요.<br>
          받은 편지함을 확인하고 링크를 클릭하면 로그인할 수 있어요.
        </div>
        <button onclick="switchAuthTab('login');document.getElementById('loginEmail').value='${email}'"
          style="padding:12px 28px;background:#6366f1;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">
          로그인하러 가기
        </button>
      </div>`;
  }
}

// ── Google OAuth ────────────────────────────────────────
async function loginWithGoogle() {
  const { error } = await supa.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href },
  });
  if (error) showAuthError('login', 'Google 로그인 오류: ' + error.message);
}

async function logout() {
  await supa.auth.signOut();
  currentUser = null;
  renderAuthArea(null);
  updateHistoryBadge();
}

function continueAsGuest() { closeAuthModal(); }

// ── 사이드바 유저 영역 렌더링 ───────────────────────────
function renderAuthArea(user) {
  const area = document.getElementById('sidebarAuthArea');
  if (user) {
    const name      = user.user_metadata?.full_name || user.user_metadata?.nickname || user.email?.split('@')[0] || '사용자';
    const initials  = name.slice(0, 2).toUpperCase();
    const avatarUrl = user.user_metadata?.avatar_url;
    area.innerHTML = `
      <div class="sidebar-user">
        <div class="user-avatar">
          ${avatarUrl ? `<img src="${avatarUrl}" alt="">` : initials}
        </div>
        <div style="flex:1;min-width:0">
          <div class="user-name">${name}</div>
          <div class="user-email">${user.email || ''}</div>
        </div>
        <button class="user-logout" onclick="logout()" title="로그아웃">
          <i class="ri-logout-box-line"></i>
        </button>
      </div>`;
  } else {
    area.innerHTML = `
      <div class="sidebar-login-cta">
        <button class="sidebar-login-btn" onclick="openAuthModal('login')">
          <i class="ri-login-circle-line"></i> 로그인 / 회원가입
        </button>
        <div class="sidebar-login-note">기록을 클라우드에 저장하려면 로그인하세요</div>
      </div>`;
  }
}

function getSyncChip() {
  return currentUser
    ? '<span class="sync-chip sync-cloud"><i class="ri-cloud-line"></i> 클라우드</span>'
    : '<span class="sync-chip sync-local"><i class="ri-hard-drive-2-line"></i> 로컬</span>';
}

// ── Supabase 인증 상태 감지 ─────────────────────────────
supa.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user || null;
  renderAuthArea(currentUser);
  updateHistoryBadge();
  if (event === 'SIGNED_IN') {
    closeAuthModal();
    if (document.getElementById('page-history').classList.contains('active')) {
      renderHistoryPage();
    }
  }
});

// URL에 access_token이 있으면 세션 복원
(async () => {
  const { data: { session } } = await supa.auth.getSession();
  if (session) {
    currentUser = session.user;
    renderAuthArea(currentUser);
    updateHistoryBadge();
    // URL 정리
    history.replaceState(null, '', window.location.pathname);
  }
})();