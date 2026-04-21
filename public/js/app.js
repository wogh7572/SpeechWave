// ── app.js ─────────────────────────────────────────────
// 페이지 라우팅, 전역 상태, 초기화

// ── 전역 상태 ────────────────────────────────────────────
let currentScript = '';
let analysisData  = null;

// ── 페이지 네비게이션 ────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pg  = document.getElementById('page-' + id);
  const nav = document.getElementById('nav-'  + id);
  if (pg)  pg.classList.add('active');
  if (nav) nav.classList.add('active');

  const [t, s] = PAGE_META[id] || ['', ''];
  document.getElementById('hTitle').textContent = t;
  document.getElementById('hSub').textContent   = s;

  const hr = document.getElementById('hRight');
  hr.innerHTML =
    id === 'result'  ? `<button onclick="showPage('recording')" style="display:flex;align-items:center;gap:7px;padding:8px 16px;border-radius:11px;background:#6366f1;color:#fff;border:none;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit"><i class="ri-refresh-line"></i>다시 녹음</button>` :
    id === 'history' ? `<button onclick="clearAllHistory()" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:10px;border:1px solid #fecaca;background:#fef2f2;color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit"><i class="ri-delete-bin-line"></i>전체 삭제</button>` : '';

  if (id === 'analysis') setTimeout(drawAllCurves, 80);
  if (id === 'history')  renderHistoryPage();
  if (id === 'recording') {
    // 문장 단위 모드 기본, 리스트 렌더
    switchRecMode('sentence');
  }
}

function goHome() { stopRec(); showPage('home'); }

function unlockNav(id) {
  const el = document.getElementById('nav-' + id);
  if (el) {
    el.classList.remove('locked');
    el.querySelector('[class*="nav-step"]')?.classList.add('done');
  }
}

function setEx(i) {
  document.getElementById('scriptInput').value = EXAMPLES[i];
}

// ── 초기화 ───────────────────────────────────────────────
document.getElementById('timer').textContent = '0:00';
updateHistoryBadge();
