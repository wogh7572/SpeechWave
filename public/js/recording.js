// ── recording.js ───────────────────────────────────────
// 마이크 녹음 · 문장 단위 / 전체 레코딩 · STT · WPM 평가

// ── 상태 변수 ────────────────────────────────────────────
let isRec         = false;
let timerInt      = null;
let timerSec      = 0;
let waveInt       = null;
let mediaRec      = null;
let chunks        = [];
let _refAudioBlob = null;
let _recMode      = 'sentence';   // 'sentence' | 'full'

// 문장 단위 녹음 상태 (인덱스별)
const sentenceState = {};  // { idx: { isRec, timerSec, timerInt, waveInt, mediaRec, chunks } }

// ── 유틸 ─────────────────────────────────────────────────
function fmtT(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── 모드 전환 ────────────────────────────────────────────
function switchRecMode(mode) {
  _recMode = mode;
  document.getElementById('modeSentence').style.display = mode === 'sentence' ? '' : 'none';
  document.getElementById('modeFull').style.display     = mode === 'full'     ? '' : 'none';
  document.getElementById('modeTabSentence').classList.toggle('active', mode === 'sentence');
  document.getElementById('modeTabFull').classList.toggle('active',     mode === 'full');
  if (mode === 'sentence') renderSentenceList();
}

// ════════════════════════════════════════════════════════
// 문장 단위 레코딩
// ════════════════════════════════════════════════════════

function renderSentenceList() {
  const base = analysisData || makeDemo();
  const list = document.getElementById('sentenceRecList');
  if (!list) return;

  list.innerHTML = base.phrases.map((phrase, idx) => {
    // 문장 텍스트 구성 (강조 단어 + 슬래쉬)
    const wordHtml = phrase.words.map(w => {
      const stressCls = w.stress === 'high' ? 'srl-word high' : w.stress === 'mid' ? 'srl-word mid' : 'srl-word low';
      const slash     = w.pauseAfter ? ' <span class="srl-slash">/</span>' : '';
      return `<span class="${stressCls}" onclick="speakWord('${w.text.replace(/[.,!?]/g,'')}')" title="${w.phonetic || ''}">${w.text}</span>${slash}`;
    }).join(' ');

    const sentenceText = phrase.words.map(w => w.text).join(' ');

    return `
    <div class="src-card" id="src-card-${idx}">
      <div class="src-head">
        <div class="src-num">${idx + 1}</div>
        <div class="src-body">
          <div class="src-words">${wordHtml}</div>
          ${phrase.hints?.length ? `<div class="src-hints">${phrase.hints.map(h => `<span class="hint-chip">${h}</span>`).join('')}</div>` : ''}
        </div>
        <div class="src-actions">
          <!-- 문장 전체 재생 버튼 -->
          <button class="src-btn-play" onclick="playSentence(${idx})" title="문장 재생">
            <i class="ri-play-circle-line"></i>
          </button>
          <!-- 녹음 버튼 -->
          <button class="src-btn-rec" id="src-btn-rec-${idx}" onclick="toggleSentenceRec(${idx})">
            <i class="ri-mic-line"></i>
          </button>
        </div>
      </div>

      <!-- 녹음 중 UI -->
      <div class="src-rec-ui" id="src-rec-ui-${idx}" style="display:none">
        <div class="src-wave" id="src-wave-${idx}">
          ${Array.from({length:8}, (_,i) => `<div class="src-wbar" id="sw-${idx}-${i}"></div>`).join('')}
        </div>
        <div class="src-timer" id="src-timer-${idx}">0:00</div>
      </div>

      <!-- 결과 UI -->
      <div class="src-result" id="src-result-${idx}" style="display:none">
        <div class="src-result-row">
          <div class="src-stt" id="src-stt-${idx}"></div>
          <div class="src-meta">
            <span class="src-wpm" id="src-wpm-${idx}"></span>
            <button class="src-btn-dl" id="src-btn-dl-${idx}" title="녹음 저장">
              <i class="ri-download-line"></i>
            </button>
            <button class="src-btn-play2" id="src-btn-play2-${idx}" title="녹음 재생">
              <i class="ri-play-line"></i>
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// 문장 전체 TTS 재생
function playSentence(idx) {
  const base = analysisData || makeDemo();
  const phrase = base.phrases[idx];
  if (!phrase) return;
  const text = phrase.words.map(w => w.text.replace(/[.,!?]/g, '')).join(' ');
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u  = new SpeechSynthesisUtterance(text);
  u.lang   = 'en-US';
  u.rate   = 0.85;
  speechSynthesis.speak(u);

  // 버튼 피드백
  const btn = document.getElementById(`src-btn-play`);
}

// 문장 녹음 토글
async function toggleSentenceRec(idx) {
  const st = sentenceState[idx];
  if (st?.isRec) {
    stopSentenceRec(idx);
  } else {
    await startSentenceRec(idx);
  }
}

async function startSentenceRec(idx) {
  // 다른 문장 녹음 중지
  Object.keys(sentenceState).forEach(i => {
    if (sentenceState[i]?.isRec) stopSentenceRec(Number(i));
  });

  sentenceState[idx] = { isRec: false, timerSec: 0, timerInt: null, waveInt: null, mediaRec: null, chunks: [] };
  const st = sentenceState[idx];

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    st.mediaRec  = new MediaRecorder(stream);
    st.chunks    = [];
    st.mediaRec.ondataavailable = e => { if (e.data.size > 0) st.chunks.push(e.data); };
    st.mediaRec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      processSentenceRec(idx);
    };
    st.mediaRec.start();
  } catch (err) {
    // 마이크 권한 없음 → 시뮬레이션
    document.getElementById(`src-result-${idx}`).style.display = '';
    document.getElementById(`src-stt-${idx}`).innerHTML = `<span style="color:#f59e0b;font-size:11px">💡 마이크 권한 없음 — 시뮬레이션 모드</span>`;
    document.getElementById(`src-wpm-${idx}`).textContent = '';
    return;
  }

  st.isRec    = true;
  st.timerSec = 0;

  // UI 전환
  const recUI   = document.getElementById(`src-rec-ui-${idx}`);
  const recBtn  = document.getElementById(`src-btn-rec-${idx}`);
  const card    = document.getElementById(`src-card-${idx}`);
  document.getElementById(`src-result-${idx}`).style.display = 'none';
  recUI.style.display = '';
  recBtn.innerHTML    = '<i class="ri-stop-fill"></i>';
  recBtn.classList.add('recording');
  card.classList.add('recording');

  // 타이머
  st.timerInt = setInterval(() => {
    st.timerSec++;
    const el = document.getElementById(`src-timer-${idx}`);
    if (el) el.textContent = fmtT(st.timerSec);
  }, 1000);

  // 파형
  let wt = 0;
  st.waveInt = setInterval(() => {
    wt++;
    for (let i = 0; i < 8; i++) {
      const b = document.getElementById(`sw-${idx}-${i}`);
      if (b) b.style.height = (4 + Math.abs(Math.sin(wt * .35 + i * .9)) * 22) + 'px';
    }
  }, 80);
}

function stopSentenceRec(idx) {
  const st = sentenceState[idx];
  if (!st?.isRec) return;
  st.isRec = false;
  clearInterval(st.timerInt);
  clearInterval(st.waveInt);

  const recUI  = document.getElementById(`src-rec-ui-${idx}`);
  const recBtn = document.getElementById(`src-btn-rec-${idx}`);
  const card   = document.getElementById(`src-card-${idx}`);
  if (recUI)  recUI.style.display = 'none';
  if (recBtn) { recBtn.innerHTML = '<i class="ri-mic-line"></i>'; recBtn.classList.remove('recording'); }
  if (card)   card.classList.remove('recording');

  // 파형 초기화
  for (let i = 0; i < 8; i++) {
    const b = document.getElementById(`sw-${idx}-${i}`);
    if (b) b.style.height = '4px';
  }

  if (st.mediaRec && st.mediaRec.state !== 'inactive') st.mediaRec.stop();
  else processSentenceRec(idx);
}

async function processSentenceRec(idx) {
  const st     = sentenceState[idx];
  const base   = analysisData || makeDemo();
  const phrase = base.phrases[idx];
  if (!phrase) return;

  const sentenceText = phrase.words.map(w => w.text).join(' ');
  const wordCount    = phrase.words.length;
  const durationMs   = st.timerSec * 1000 || 3000;
  const blob         = st.chunks.length > 0 ? new Blob(st.chunks, { type: 'audio/webm' }) : null;

  // WPM 계산
  const wpm      = Math.round(wordCount / (durationMs / 60000));
  const wpmOk    = wpm >= 100 && wpm <= 180;
  const wpmColor = wpm >= 130 && wpm <= 160 ? '#10b981' : wpm >= 100 && wpm <= 180 ? '#f59e0b' : '#ef4444';
  const wpmLabel = wpm >= 130 && wpm <= 160 ? '적절한 속도' : wpm < 130 ? '천천히' : '빠름';

  // STT
  let sttHtml = '';
  if (blob) {
    sttHtml = '<span style="color:#9ca3af;font-size:11px">STT 인식 중...</span>';
    document.getElementById(`src-result-${idx}`).style.display = '';
    document.getElementById(`src-stt-${idx}`).innerHTML = sttHtml;

    const recognized = await runSTT(blob);
    if (recognized) {
      // 원본과 비교해서 맞은 단어 초록, 틀린 단어 빨간색
      const origWords = sentenceText.toLowerCase().replace(/[.,!?]/g,'').split(/\s+/);
      const recoWords = recognized.toLowerCase().replace(/[.,!?]/g,'').split(/\s+/);
      const highlighted = origWords.map((w, i) => {
        const rw  = recoWords[i] || '';
        const sim = wordSimilaritySimple(w, rw);
        const cls = sim > 0.8 ? 'stt-word ok' : 'stt-word ng';
        return `<span class="${cls}">${recoWords[i] || '?'}</span>`;
      }).join(' ');
      sttHtml = `<div class="stt-label">STT 인식</div><div class="stt-words">${highlighted}</div>`;
    } else {
      sttHtml = '<span style="color:#9ca3af;font-size:11px">STT 인식 실패</span>';
    }
  } else {
    sttHtml = '<span style="color:#9ca3af;font-size:11px">마이크 권한 없음</span>';
  }

  // 결과 렌더링
  const resultEl = document.getElementById(`src-result-${idx}`);
  const sttEl    = document.getElementById(`src-stt-${idx}`);
  const wpmEl    = document.getElementById(`src-wpm-${idx}`);
  const dlBtn    = document.getElementById(`src-btn-dl-${idx}`);
  const playBtn  = document.getElementById(`src-btn-play2-${idx}`);

  resultEl.style.display = '';
  sttEl.innerHTML        = sttHtml;
  wpmEl.innerHTML        = `<span style="color:${wpmColor};font-weight:700">${wpm} WPM</span> <span style="font-size:10px;color:#9ca3af">${wpmLabel}</span>`;

  // 다운로드 / 재생 버튼
  if (blob) {
    const url = URL.createObjectURL(blob);
    dlBtn.onclick   = () => { const a = document.createElement('a'); a.href = url; a.download = `sentence-${idx+1}-${fmtT(st.timerSec).replace(':','-')}.webm`; a.click(); };
    playBtn.onclick = () => { const audio = new Audio(url); audio.play(); };
    dlBtn.style.display   = '';
    playBtn.style.display = '';
  } else {
    dlBtn.style.display   = 'none';
    playBtn.style.display = 'none';
  }

  document.getElementById(`src-card-${idx}`).classList.add('done');
}

// 간단한 단어 유사도
function wordSimilaritySimple(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  let match = 0;
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) { if (a[i] === b[i]) match++; }
  return match / Math.max(a.length, b.length);
}

// STT (Web Speech API)
function runSTT(blob) {
  return new Promise(resolve => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return resolve('');
    const rec          = new SR();
    rec.lang           = 'en-US';
    rec.continuous     = false;
    rec.interimResults = false;
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    rec.onresult = e => finish(e.results[0][0].transcript);
    rec.onerror  = () => finish('');
    rec.onend    = () => finish('');
    setTimeout(() => finish(''), 8000);
    const audio = new Audio(URL.createObjectURL(blob));
    rec.start();
    audio.play().catch(() => {});
    audio.onended = () => setTimeout(() => rec.stop(), 300);
  });
}

// ════════════════════════════════════════════════════════
// 전체 레코딩
// ════════════════════════════════════════════════════════

function showEvalProgress(pct, step) {
  document.getElementById('evalOverlay').classList.add('show');
  document.getElementById('evalBar').style.width  = pct + '%';
  document.getElementById('evalPct').textContent  = pct + '%';
  document.getElementById('evalStep').textContent = step;
}
function hideEvalProgress() {
  document.getElementById('evalOverlay').classList.remove('show');
}

async function fetchRefAudio(script) {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: script, voice: 'alloy' }),
    });
    if (!res.ok) throw new Error('TTS 오류');
    return await res.blob();
  } catch (e) {
    console.warn('TTS 실패:', e.message);
    return null;
  }
}

async function startRec() {
  if (isRec) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRec     = new MediaRecorder(stream);
    chunks       = [];
    mediaRec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRec.onstop = () => { stream.getTracks().forEach(t => t.stop()); processRec(); };
    mediaRec.start();
    beginRecUI();
  } catch (err) {
    document.getElementById('recMsg').textContent = '💡 마이크 권한이 없어 시뮬레이션 모드로 실행됩니다.';
    beginRecUI();
  }
}

function beginRecUI() {
  isRec = true;
  document.getElementById('micRing').classList.add('rec');
  document.getElementById('micI').className        = 'ri-mic-fill mic-i';
  document.getElementById('recStatus').textContent = '녹음 중...';
  document.getElementById('recSub').textContent    = '발표를 시작하세요. 끝나면 중지 버튼을 누르세요.';
  document.getElementById('btnStart').style.display = 'none';
  document.getElementById('btnStop').style.display  = 'flex';
  timerSec = 0;
  timerInt = setInterval(() => {
    timerSec++;
    document.getElementById('timer').textContent = fmtT(timerSec);
  }, 1000);
  let wt = 0;
  waveInt = setInterval(() => {
    wt++;
    for (let i = 0; i < 10; i++) {
      const b = document.getElementById('w' + i);
      if (b) b.style.height = (6 + Math.abs(Math.sin(wt * .3 + i * .8)) * 26) + 'px';
    }
  }, 80);
}

function stopRec() {
  if (!isRec) return;
  isRec = false;
  clearInterval(timerInt);
  clearInterval(waveInt);
  document.getElementById('micRing').classList.remove('rec');
  document.getElementById('micI').className        = 'ri-mic-line mic-i';
  document.getElementById('recStatus').textContent = '녹음 완료';
  document.getElementById('recSub').textContent    = '분석 중입니다...';
  document.getElementById('btnStart').style.display = 'flex';
  document.getElementById('btnStop').style.display  = 'none';
  for (let i = 0; i < 10; i++) {
    const b = document.getElementById('w' + i);
    if (b) b.style.height = '6px';
  }
  if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop();
  else processRec();
}

function toggleRec() { if (isRec) stopRec(); else startRec(); }

// ── 전체 녹음 처리 → 점수 ────────────────────────────────
async function processRec() {
  try {
    const base      = analysisData || makeDemo();
    const script    = currentScript || EXAMPLES[0];
    const wordCount = script.trim().split(/\s+/).length;
    const durationMs = timerSec * 1000 || 5000;

    showEvalProgress(5, '기준 오디오 로딩 중...');

    const refBlob  = _refAudioBlob || await fetchRefAudio(script);
    const userBlob = chunks.length > 0 ? new Blob(chunks, { type: 'audio/webm' }) : null;

    hideEvalProgress();

    const wpm = Math.round(wordCount / (durationMs / 60000));
    const wpmScore = wpm >= 130 && wpm <= 160 ? 15
                   : wpm >= 110 && wpm <= 180 ? 10 : 5;

    const v  = () => Math.floor((Math.random() - .5) * 10);
    const sc = {
      rhythm:  Math.min(100, Math.max(40, (base.scores?.rhythm  || 80) + v())),
      clarity: Math.min(100, Math.max(40, (base.scores?.clarity || 85) + v())),
      flow:    Math.min(100, Math.max(40, (base.scores?.flow    || 75) + v())),
      pace:    Math.min(100, Math.max(40, wpmScore * 5 + v())),
    };
    const avg   = Math.round(Object.values(sc).reduce((a, b) => a + b) / 4);
    const grade = avg >= 90 ? 'Excellent' : avg >= 80 ? 'Very Good' : avg >= 70 ? 'Good' : 'Fair';

    try { drawRing(avg); } catch(e) {}
    try { document.getElementById('scoreNum').textContent  = avg + ' / 100'; } catch(e) {}
    try { document.getElementById('gradeChip').textContent = grade; } catch(e) {}
    try {
      document.getElementById('scoreDesc').textContent =
        `녹음 ${fmtT(timerSec)} · ${wpm} WPM · ${wpm >= 130 && wpm <= 160 ? '적절한 속도 ✓' : wpm < 130 ? '조금 더 빠르게' : '조금 더 천천히'}`;
    } catch(e) {}
    try { renderScoreBars(sc); } catch(e) {}
    try { renderResultAnn(base.words || []); } catch(e) {}
    try { renderRules(base.rules || [], 'resultRules'); } catch(e) {}
    try { renderMetrics({ wpm, pauseCount: base.pauseCount || 1, fillerWords: base.fillerWords || 0 }); } catch(e) {}
    try { renderStrengths(base.strengths || []); } catch(e) {}
    try {
      const items = loadHistory();
      if (items.length > 0) { items[0].score = avg; saveHistory(items); }
      if (currentUser) updateScoreCloud(avg);
    } catch(e) {}

  } catch (err) {
    console.error('processRec 오류:', err);
    hideEvalProgress();
  } finally {
    // ✅ 핵심: 에러 여부와 관계없이 항상 실행
    unlockNav('result');
    showPage('result');
  }
}

// ── 실제 평가 결과 렌더링 ────────────────────────────────
function renderRealResult(result, base) {
  const { total, grade, breakdown, wordResults, feedback, meta } = result;
  drawRing(total);
  document.getElementById('scoreNum').textContent  = total + ' / 100';
  document.getElementById('gradeChip').textContent = grade;
  document.getElementById('scoreDesc').textContent =
    `녹음 ${fmtT(timerSec)} · ${meta?.wpm || '—'} WPM · 원어민 TTS 기준 종합 평가`;

  const labels = { pronunciation:'발음 정확도', stress:'강세 패턴', rhythm:'속도/리듬', liaison:'연음', delivery:'전달력' };
  const colors = { pronunciation:'#10b981', stress:'#6366f1', rhythm:'#f59e0b', liaison:'#d97706', delivery:'#7c3aed' };
  const maxPts = { pronunciation:30, stress:25, rhythm:15, liaison:15, delivery:15 };

  document.getElementById('scoreBars').innerHTML = `
    <div class="score-detail-grid">
      ${Object.entries(breakdown).map(([k, v]) => `
        <div class="score-item">
          <div class="score-item-label">${labels[k] || k}</div>
          <div><span class="score-item-val" style="color:${colors[k]}">${v}</span>
               <span class="score-item-max"> / ${maxPts[k]}</span></div>
          <div class="score-item-bar">
            <div class="score-item-fill" data-w="${Math.round(v/maxPts[k]*100)}" style="background:${colors[k]}"></div>
          </div>
        </div>`).join('')}
    </div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('.score-item-fill[data-w]').forEach(f => f.style.width = f.dataset.w + '%');
  }));

  if (wordResults?.length > 0) {
    document.getElementById('resultAnn').innerHTML = `
      <div class="word-pron-wrap">
        ${wordResults.map(w => {
          const cls = w.similarity >= 0.85 ? 'correct' : w.similarity >= 0.5 ? 'partial' : 'wrong';
          return `<span class="word-pron ${cls}">${w.word}<span class="score-tip">${Math.round(w.similarity*100)}% 일치</span></span> `;
        }).join('')}
      </div>
      <div class="meta-row">
        <div class="meta-chip"><i class="ri-speed-line"></i><strong>${meta.wpm}</strong> WPM</div>
        <div class="meta-chip"><i class="ri-pause-circle-line"></i>포즈 <strong>${meta.pauseCount}</strong>회</div>
        <div class="meta-chip"><i class="ri-music-2-line"></i>피치 변화 <strong>${meta.pitchVariety}</strong>Hz</div>
      </div>`;
  } else {
    renderResultAnn(base.words || []);
  }

  let html = '';
  if (feedback.liaison)  html += `<div class="feedback-card fb-liaison"><div class="fb-label">연음 자연스러움</div><div class="fb-text">${feedback.liaison}</div></div>`;
  if (feedback.delivery) html += `<div class="feedback-card fb-delivery"><div class="fb-label">전달력</div><div class="fb-text">${feedback.delivery}</div>${feedback.tips?.map(t=>`<div class="fb-tips"><div class="fb-tip">${t}</div></div>`).join('')||''}</div>`;
  html += (base.coaching||[]).slice(0,3).map(c => {
    const cfg = CCFG[c.type]||CCFG.emphasis;
    return `<div class="ccard" style="background:${cfg.bg};border-color:${cfg.bd};margin-bottom:8px">
      <div class="ccard-head">
        <div class="ccard-icon" style="background:${cfg.ib}"><i class="${cfg.ic}" style="color:${cfg.ac}"></i></div>
        <div style="flex:1;min-width:0">
          <div class="ccard-tags"><span class="ctag" style="background:${cfg.ib};color:${cfg.it}">${cfg.lb}</span></div>
          <div class="ccard-title">${c.title}</div>
          <div class="ccard-desc">${c.description}</div>
        </div>
        <button class="done-btn" onclick="this.classList.toggle('chk')"><i class="ri-check-line"></i></button>
      </div>
    </div>`;
  }).join('');
  document.getElementById('resultCoach').innerHTML = html;

  renderRules(base.rules||[], 'resultRules');
  renderMetrics({ wpm:meta.wpm, pauseCount:meta.pauseCount, fillerWords:0 });
  renderStrengths(base.strengths||[]);
}
