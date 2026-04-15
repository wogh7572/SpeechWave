// ── history.js ─────────────────────────────────────────
// 로컬 스토리지 + Supabase 클라우드 히스토리 관리

function getHsKey() {
  return currentUser ? `sw_history_v1_${currentUser.id}` : 'sw_history_v1_guest';
}
let _historyFilter = 'all';

const COACH_COLORS = {
  emphasis: { ib:'#fef3c7', ic:'ri-volume-up-line',    ac:'#d97706' },
  pause:    { ib:'#e0e7ff', ic:'ri-pause-circle-line',  ac:'#4338ca' },
  tone:     { ib:'#ede9fe', ic:'ri-music-2-line',       ac:'#6d28d9' },
  gesture:  { ib:'#d1fae5', ic:'ri-hand-heart-line',    ac:'#059669' },
  speed:    { ib:'#ffe4e6', ic:'ri-speed-line',          ac:'#be123c' },
};

// ── 로컬 스토리지 ──────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(getHsKey()) || '[]'); }
  catch { return []; }
}

function saveHistory(items) {
  localStorage.setItem(getHsKey(), JSON.stringify(items));
  updateHistoryBadge();
}

function addHistoryItem(script, data, score) {
  const items = loadHistory();
  const item  = {
    id:            Date.now(),
    script,
    scriptPreview: script.length > 80 ? script.slice(0, 80) + '…' : script,
    date:          new Date().toISOString(),
    score:         score || null,
    tipCount:      data.coaching?.length || 0,
    coaching:      (data.coaching || []).slice(0, 5),
    rules:         data.rules || [],
    summaryTip:    data.summaryTip || '',
  };
  items.unshift(item);
  saveHistory(items.slice(0, 50));
  if (currentUser) addHistoryItemCloud(script, data, score);
}

async function deleteHistoryItem(id) {
  const items = loadHistory().filter(i => i.id !== id);
  saveHistory(items);
  if (currentUser) await deleteHistoryCloud(id);
  renderHistoryPage();
}

async function clearAllHistory() {
  if (!confirm('모든 히스토리를 삭제할까요?')) return;
  saveHistory([]);
  if (currentUser) await clearAllHistoryCloud();
  renderHistoryPage();
}

function updateHistoryBadge() {
  const items = loadHistory();
  const badge = document.getElementById('historyBadge');
  if (!badge) return;
  if (items.length > 0) {
    badge.style.display  = 'inline-block';
    badge.textContent    = items.length;
  } else {
    badge.style.display  = 'none';
  }
}

// ── Supabase 클라우드 ───────────────────────────────────
async function addHistoryItemCloud(script, data, score) {
  if (!currentUser) return;
  await supa.from('history').insert({
    user_id:        currentUser.id,
    script,
    script_preview: script.length > 80 ? script.slice(0, 80) + '…' : script,
    coaching:       data.coaching   || [],
    rules:          data.rules      || [],
    summary_tip:    data.summaryTip || '',
    score:          score           || null,
    tip_count:      data.coaching?.length || 0,
  });
}

async function loadHistoryCloud() {
  if (!currentUser) return null;
  const { data, error } = await supa
    .from('history').select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return null;
  return (data || []).map(r => ({
    id:            r.id,
    script:        r.script,
    scriptPreview: r.script_preview,
    coaching:      r.coaching    || [],
    rules:         r.rules       || [],
    summaryTip:    r.summary_tip || '',
    score:         r.score,
    tipCount:      r.tip_count   || 0,
    date:          r.created_at,
  }));
}

async function updateScoreCloud(score) {
  if (!currentUser) return;
  const { data } = await supa.from('history').select('id')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false }).limit(1);
  if (data?.[0]) await supa.from('history').update({ score }).eq('id', data[0].id);
}

async function deleteHistoryCloud(id) {
  if (!currentUser) return;
  await supa.from('history').delete().eq('id', id).eq('user_id', currentUser.id);
}

async function clearAllHistoryCloud() {
  if (!currentUser) return;
  await supa.from('history').delete().eq('user_id', currentUser.id);
}

// ── 필터 / 검색 ────────────────────────────────────────
function setHistoryFilter(f, btn) {
  _historyFilter = f;
  document.querySelectorAll('.hfil').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderHistoryList();
}

function filterItems(items) {
  const q   = document.getElementById('historySearchInput')?.value.trim().toLowerCase() || '';
  const now = new Date();
  return items.filter(item => {
    const matchQ = !q || item.script.toLowerCase().includes(q);
    if (!matchQ) return false;
    if (_historyFilter === 'week') {
      return (now - new Date(item.date)) < 7 * 24 * 60 * 60 * 1000;
    }
    if (_historyFilter === 'month') {
      const d = new Date(item.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
  });
}

function fmtDate(iso) {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)     return '방금 전';
  if (diff < 3600)   return Math.floor(diff / 60)   + '분 전';
  if (diff < 86400)  return Math.floor(diff / 3600)  + '시간 전';
  if (diff < 604800) return Math.floor(diff / 86400) + '일 전';
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

// ── 히스토리 페이지 렌더링 ─────────────────────────────
async function renderHistoryPage() {
  document.getElementById('historyList').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px;color:#9ca3af">
      <div class="load-bar"></div>
      <span style="font-size:13px">${currentUser ? '클라우드에서 불러오는 중...' : '기록 불러오는 중...'}</span>
    </div>`;

  const items    = currentUser ? (await loadHistoryCloud() || loadHistory()) : loadHistory();
  const syncChip = getSyncChip();
  document.querySelector('#page-history .history-top h3').innerHTML = `History ${syncChip}`;

  const filtered  = filterItems(items);
  const withScore = items.filter(i => i.score);
  const avgScore  = withScore.length ? Math.round(withScore.reduce((a, b) => a + b.score, 0) / withScore.length) : '—';
  const best      = withScore.length ? Math.max(...withScore.map(i => i.score)) : '—';
  const now       = new Date();
  const thisWeek  = items.filter(i => (now - new Date(i.date)) < 7 * 24 * 60 * 60 * 1000).length;

  document.getElementById('historyStats').innerHTML = `
    <div class="hstat">
      <div class="hstat-num">${items.length}</div>
      <div class="hstat-lbl">총 연습 횟수</div>
    </div>
    <div class="hstat">
      <div class="hstat-num">${avgScore}${typeof avgScore === 'number' ? '점' : ''}</div>
      <div class="hstat-lbl">평균 점수</div>
      ${best !== '—' ? `<div class="hstat-sub">최고 ${best}점</div>` : ''}
    </div>
    <div class="hstat">
      <div class="hstat-num">${thisWeek}</div>
      <div class="hstat-lbl">이번 주 연습</div>
    </div>`;

  renderHistoryList(filtered, items);
}

function renderHistoryList(items, allItems) {
  const all    = allItems || loadHistory();
  const toShow = items !== undefined ? items : filterItems(all);
  const el     = document.getElementById('historyList');

  if (toShow.length === 0) {
    el.innerHTML = `
      <div class="history-empty">
        <div class="history-empty-icon"><i class="ri-history-line"></i></div>
        <h4>${all.length === 0 ? '아직 연습 기록이 없어요' : '검색 결과가 없어요'}</h4>
        <p>${all.length === 0 ? '스크립트를 입력하고 AI 분석을 시작해보세요!' : '다른 키워드로 검색해보세요.'}</p>
        ${all.length === 0 ? `<button onclick="goHome()" style="display:flex;align-items:center;gap:7px;padding:12px 22px;border-radius:12px;background:#6366f1;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;margin-top:4px"><i class="ri-add-line"></i>첫 연습 시작하기</button>` : ''}
      </div>`;
    return;
  }

  el.innerHTML = toShow.map(item => {
    const gradeColor = !item.score ? '#9ca3af' : item.score >= 80 ? '#10b981' : item.score >= 60 ? '#f59e0b' : '#f43f5e';
    const grade      = !item.score ? '—' : item.score >= 90 ? 'Excellent' : item.score >= 80 ? 'Very Good' : item.score >= 70 ? 'Good' : 'Fair';

    const tipsHtml = (item.coaching || []).map(c => {
      const cfg = COACH_COLORS[c.type] || COACH_COLORS.emphasis;
      return `<div class="hitem-tip">
        <div class="hitem-tip-icon" style="background:${cfg.ib}"><i class="${cfg.ic}" style="color:${cfg.ac}"></i></div>
        <div><div class="hitem-tip-title">${c.title}</div><div class="hitem-tip-desc">${c.description}</div></div>
      </div>`;
    }).join('');

    const rulesHtml = (item.rules || []).slice(0, 2).map(r => `
      <div style="font-size:11px;color:#6b7280;padding:4px 0;border-bottom:1px solid #f3f4f6">
        <span style="font-weight:600;color:#111827">${r.phrase}</span> — ${r.desc}
      </div>`).join('');

    return `
    <div class="hitem" id="hitem-${item.id}">
      <div class="hitem-head" onclick="toggleHitem(${item.id})">
        <div class="hitem-icon"><i class="ri-file-text-line"></i></div>
        <div class="hitem-meta">
          <div class="hitem-script">"${item.scriptPreview}"</div>
          <div class="hitem-date"><i class="ri-time-line" style="font-size:10px"></i> ${fmtDate(item.date)}</div>
          <div class="hitem-tags">
            <span class="htag tip-count"><i class="ri-sparkling-2-line"></i> 코칭 ${item.tipCount}개</span>
            ${item.summaryTip ? `<span class="htag" title="${item.summaryTip}">${item.summaryTip}</span>` : ''}
          </div>
        </div>
        <div class="hitem-score">
          <div class="hitem-score-num" style="color:${gradeColor}">${item.score || '—'}</div>
          <div class="hitem-score-lbl">/ 100</div>
          <div class="hitem-score-grade" style="background:${gradeColor}18;color:${gradeColor}">${grade}</div>
        </div>
      </div>
      <div class="hitem-body" id="hbody-${item.id}">
        ${item.summaryTip ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#92400e;display:flex;align-items:flex-start;gap:8px">
          <i class="ri-lightbulb-line" style="color:#d97706;flex-shrink:0;margin-top:1px"></i>
          <span><strong>핵심 팁:</strong> ${item.summaryTip}</span></div>` : ''}
        ${tipsHtml ? `<div class="hitem-tips-title"><i class="ri-robot-line"></i> AI 코칭 팁</div>${tipsHtml}` : ''}
        ${rulesHtml ? `<div style="margin-top:12px"><div class="hitem-tips-title"><i class="ri-book-2-line"></i> 발음 규칙</div>${rulesHtml}</div>` : ''}
        <div class="hitem-actions">
          <button class="hact-btn hact-primary" onclick="loadFromHistory(${item.id})">
            <i class="ri-play-line"></i> 이 스크립트로 다시 연습
          </button>
          <button class="hact-btn hact-outline" onclick="copyScript(${item.id})">
            <i class="ri-file-copy-line"></i> 복사
          </button>
          <button class="hact-btn hact-danger" onclick="deleteHistoryItem(${item.id})">
            <i class="ri-delete-bin-line"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleHitem(id) {
  document.getElementById('hitem-' + id).classList.toggle('open');
}

function loadFromHistory(id) {
  const item = loadHistory().find(i => i.id === id);
  if (!item) return;
  document.getElementById('scriptInput').value = item.script;
  showPage('home');
  setTimeout(() => document.getElementById('scriptInput').scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
}

function copyScript(id) {
  const item = loadHistory().find(i => i.id === id);
  if (!item) return;
  navigator.clipboard.writeText(item.script).then(() => {
    const btn  = event.currentTarget;
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="ri-check-line"></i> 복사됨';
    setTimeout(() => btn.innerHTML = orig, 1500);
  });
}
