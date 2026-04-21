// ── ui.js ──────────────────────────────────────────────
// 공통 렌더링 함수 (점수 링, 코칭 카드, 발음 규칙 등)

// ── 툴팁 ───────────────────────────────────────────────
function showWordTip(e, w) {
  const el      = document.getElementById('ttip');
  const stressKo = { high:'강세 음절 (크고 또렷하게)', mid:'중간 강세', low:'약세 / 빠르게' };
  el.innerHTML = `
    <div class="tt-word">${w.text.replace(/[.,]/g, '')}</div>
    <div class="tt-phonetic">${w.phonetic || ''}</div>
    <div class="tt-syl">${w.syllables || w.text}</div>
    <div class="tt-hint">${stressKo[w.stress] || ''}${w.liaison ? '&nbsp;·&nbsp;연음' : ''}
      <br><span style="color:#818cf8">▶ 클릭하면 발음이 재생됩니다</span>
    </div>`;
  el.style.opacity = '1';
  positionTip(e);
}

function hideTip() { document.getElementById('ttip').style.opacity = '0'; }

function positionTip(e) {
  const el   = document.getElementById('ttip');
  let left   = e.clientX + 16;
  let top    = e.clientY - 10;
  if (left + 220 > window.innerWidth) left = e.clientX - 230;
  el.style.left = left + 'px';
  el.style.top  = top  + 'px';
}

document.addEventListener('mousemove', e => {
  if (document.getElementById('ttip').style.opacity === '1') positionTip(e);
});

// ── TTS (단어 클릭 시 발음 재생) ────────────────────────
function speakWord(word) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u  = new SpeechSynthesisUtterance(word.replace(/[.,!?/]/g, ''));
  u.lang   = 'en-US';
  u.rate   = 0.75;
  speechSynthesis.speak(u);
}

// ── 발음 규칙 카드 ──────────────────────────────────────
const RBCLS = { liaison:'b-liaison', stress:'b-stress', pause:'b-pause', drop:'b-drop' };

function renderRules(rules, targetId) {
  document.getElementById(targetId).innerHTML = rules.map(r => `
    <div class="rule-card">
      <span class="rule-badge ${RBCLS[r.type] || 'b-drop'}">${r.type}</span>
      <div>
        <div class="rule-phrase">${r.phrase}</div>
        <div class="rule-desc">${r.desc}</div>
      </div>
    </div>`).join('');
}

// ── 코칭 카드 ───────────────────────────────────────────
let _allCards = [];

function renderCoaching(cards, targetId) {
  _allCards = cards;
  document.getElementById('coachCount').textContent = cards.length;
  const hi = cards.filter(c => c.priority === 'high').length;
  if (hi > 0) {
    document.getElementById('priorityAlert').style.display = 'flex';
    document.getElementById('priorityText').textContent =
      `우선 적용 ${hi}개 — 이것만 먼저 연습해도 발표 품질이 크게 달라집니다.`;
  }
  renderCoachCards(cards, targetId);
}

function renderCoachCards(cards, targetId) {
  const el = document.getElementById(targetId);
  if (!cards.length) {
    el.innerHTML = '<div class="empty-s"><p style="font-size:11px">해당 카테고리에 팁이 없습니다</p></div>';
    return;
  }
  el.innerHTML = cards.map((c, i) => {
    const cfg = CCFG[c.type] || CCFG.emphasis;
    return `
    <div class="ccard anim-s" id="cc${i}" style="background:${cfg.bg};border-color:${cfg.bd};animation-delay:${i * 55}ms">
      <div class="ccard-head">
        <div class="ccard-icon" style="background:${cfg.ib}">
          <i class="${cfg.ic}" style="color:${cfg.ac}"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div class="ccard-tags">
            <span class="ctag" style="background:${cfg.ib};color:${cfg.it}">${cfg.lb}</span>
            <span class="ctag ${{ high:'pri-high', medium:'pri-med', low:'pri-low' }[c.priority] || 'pri-low'}">
              ${c.priority === 'high' ? '우선' : c.priority === 'medium' ? '권장' : '선택'}
            </span>
          </div>
          <div class="ccard-title">${c.title}</div>
          <div class="ccard-desc">${c.description}</div>
          <div class="ccard-target" style="color:${cfg.ac}">
            <i class="ri-focus-3-line"></i> ${c.target}
          </div>
        </div>
        <button class="done-btn" id="db${i}" onclick="toggleDone(${i})">
          <i class="ri-check-line"></i>
        </button>
      </div>
    </div>`;
  }).join('');
}

function filterCoach(type, btn) {
  document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const filtered = type === 'all' ? _allCards : _allCards.filter(c => c.type === type);
  renderCoachCards(filtered, 'coachCards');
}

function toggleDone(i) {
  document.getElementById('cc' + i)?.classList.toggle('done');
  document.getElementById('db' + i)?.classList.toggle('chk');
}

// ── 결과 점수 링 ────────────────────────────────────────
function drawRing(score) {
  const r    = 38;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#f43f5e';
  document.getElementById('scoreRing').innerHTML = `
    <circle cx="48" cy="48" r="${r}" fill="none" stroke="#f3f4f6" stroke-width="8"/>
    <circle cx="48" cy="48" r="${r}" fill="none" stroke="${color}" stroke-width="8"
            stroke-linecap="round" stroke-dasharray="${dash} ${circ - dash}"
            stroke-dashoffset="${circ / 4}" style="transition:stroke-dasharray 1.2s ease-out"/>
    <text x="48" y="52" text-anchor="middle" font-size="20" font-weight="800"
          fill="#111827" font-family="Plus Jakarta Sans">${score}</text>
    <text x="48" y="64" text-anchor="middle" font-size="9"
          fill="#9ca3af" font-family="Plus Jakarta Sans">/ 100</text>`;
}

// ── 점수 바 ─────────────────────────────────────────────
function renderScoreBars(scores) {
  const labels = { rhythm:'리듬감', clarity:'발음 명확도', flow:'문장 흐름', pace:'발화 속도' };
  const colors = { rhythm:'#f59e0b', clarity:'#10b981', flow:'#6366f1', pace:'#7c3aed' };
  document.getElementById('scoreBars').innerHTML = Object.entries(scores).map(([k, v]) => `
    <div class="sbar-row">
      <div class="sbar-head"><span>${labels[k] || k}</span><span class="sbar-val">${v}</span></div>
      <div class="strack"><div class="sfill" data-w="${v}" style="background:${colors[k] || '#6366f1'}"></div></div>
    </div>`).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('.sfill[data-w]').forEach(f => f.style.width = f.dataset.w + '%');
  }));
}

// ── 어노테이션 스크립트 ─────────────────────────────────
function renderResultAnn(words) {
  const el = document.getElementById('resultAnn');
  el.innerHTML = words.map(w => {
    let cls = '';
    if (w.type === 'emphasis') cls = 'ann-stress';
    else if (w.type === 'tone') cls = 'ann-tone';
    else if (w.type === 'liaison') cls = 'ann-liaison';
    return `<span${cls ? ` class="${cls}"` : ''}>${w.word}</span>${w.pauseAfter ? '<span class="ann-pause">pause</span>' : ''} `;
  }).join('');
}

// ── 발화 지표 ────────────────────────────────────────────
function renderMetrics(data) {
  const items = [
    { ic:'ri-speed-line',          lb:'발화 속도',  val:`${data.wpm || 148} WPM`,    sub:'목표: 120–140 WPM', s:'warn' },
    { ic:'ri-pause-circle-line',   lb:'포즈',       val:`${data.pauseCount || 1}회`, sub:'권장: 3회 이상',    s:'warn' },
    { ic:'ri-checkbox-circle-line',lb:'필러 워드',  val:`${data.fillerWords || 0}개`,sub:'um, uh, like...',   s:'good' },
  ];
  const C = {
    good: { bg:'#ecfdf5', bd:'#a7f3d0', tx:'#059669', ib:'#d1fae5' },
    warn: { bg:'#fffbeb', bd:'#fde68a', tx:'#d97706', ib:'#fef3c7' },
  };
  document.getElementById('resultMetrics').innerHTML = items.map(m => {
    const c = C[m.s];
    return `
    <div class="mpill" style="background:${c.bg};border-color:${c.bd}">
      <div class="mpill-icon" style="background:${c.ib}"><i class="${m.ic}" style="color:${c.tx}"></i></div>
      <div>
        <div class="mpill-lbl" style="color:${c.tx}">${m.lb}</div>
        <div class="mpill-val">${m.val}</div>
        <div class="mpill-sub" style="color:${c.tx}">${m.sub}</div>
      </div>
    </div>`;
  }).join('');
}

// ── 강점 ────────────────────────────────────────────────
function renderStrengths(list) {
  if (!list?.length) return;
  document.getElementById('strengthsWrap').style.display = 'block';
  document.getElementById('strengthsList').innerHTML = list.map(s => `
    <div class="str-row"><i class="ri-checkbox-circle-fill"></i><p>${s}</p></div>`).join('');
}
