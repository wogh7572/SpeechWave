// ── recording.js ───────────────────────────────────────
// 마이크 녹음, 평가 진행, 결과 렌더링

// ── 상태 변수 ────────────────────────────────────────────
let isRec     = false;
let timerInt  = null;
let timerSec  = 0;
let waveInt   = null;
let mediaRec  = null;
let chunks    = [];
let _refAudioBlob = null;

// ── 유틸 ─────────────────────────────────────────────────
function fmtT(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── 평가 진행 오버레이 ────────────────────────────────────
function showEvalProgress(pct, step) {
  document.getElementById('evalOverlay').classList.add('show');
  document.getElementById('evalBar').style.width  = pct + '%';
  document.getElementById('evalPct').textContent  = pct + '%';
  document.getElementById('evalStep').textContent = step;
}

function hideEvalProgress() {
  document.getElementById('evalOverlay').classList.remove('show');
}

// ── TTS 기준 오디오 ──────────────────────────────────────
async function fetchRefAudio(script) {
  try {
    const res = await fetch('/api/tts', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: script, voice: 'alloy' }),
    });
    if (!res.ok) throw new Error('TTS 오류');
    return await res.blob();
  } catch (e) {
    console.warn('TTS 실패 (서버 없이 실행 중):', e.message);
    return null;
  }
}

// ── 녹음 시작 ────────────────────────────────────────────
async function startRec() {
  if (isRec) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRec     = new MediaRecorder(stream);
    chunks       = [];
    mediaRec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRec.onstop          = () => { stream.getTracks().forEach(t => t.stop()); processRec(); };
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
  document.getElementById('micI').className     = 'ri-mic-fill mic-i';
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

// ── 녹음 중지 ────────────────────────────────────────────
function stopRec() {
  if (!isRec) return;
  isRec = false;
  clearInterval(timerInt);
  clearInterval(waveInt);

  document.getElementById('micRing').classList.remove('rec');
  document.getElementById('micI').className     = 'ri-mic-line mic-i';
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

// ── 녹음 처리 → 평가 ─────────────────────────────────────
async function processRec() {
  const base   = analysisData || makeDemo();
  const script = currentScript || EXAMPLES[0];

  showEvalProgress(5, '기준 오디오 로딩 중...');

  const refBlob  = _refAudioBlob || await fetchRefAudio(script);
  const userBlob = chunks.length > 0 ? new Blob(chunks, { type: 'audio/webm' }) : null;

  // 실제 평가 엔진 (eval-engine.js + 서버 연결 시)
  if (window.SW_Eval && userBlob && refBlob) {
    try {
      const result = await SW_Eval.evaluateSpeech({
        originalScript: script,
        userAudioBlob:  userBlob,
        refAudioBlob:   refBlob,
        onProgress:     showEvalProgress,
      });
      hideEvalProgress();
      renderRealResult(result, base);
      unlockNav('result');
      addHistoryItem(script, base, result.total);
      if (currentUser) updateScoreCloud(result.total);
      setTimeout(() => showPage('result'), 400);
      return;
    } catch (err) {
      console.warn('정밀 평가 실패, 시뮬레이션으로 폴백:', err);
      hideEvalProgress();
    }
  }

  // 폴백: 시뮬레이션 점수
  hideEvalProgress();
  const v  = () => Math.floor((Math.random() - .5) * 14);
  const sc = {
    rhythm:  Math.min(100, Math.max(40, (base.scores?.rhythm  || 80) + v())),
    clarity: Math.min(100, Math.max(40, (base.scores?.clarity || 85) + v())),
    flow:    Math.min(100, Math.max(40, (base.scores?.flow    || 75) + v())),
    pace:    Math.min(100, Math.max(40, (base.scores?.pace    || 79) + v())),
  };
  const avg   = Math.round(Object.values(sc).reduce((a, b) => a + b) / 4);
  const grade = avg >= 90 ? 'Excellent' : avg >= 80 ? 'Very Good' : avg >= 70 ? 'Good' : 'Fair';

  drawRing(avg);
  document.getElementById('scoreNum').textContent  = avg + ' / 100';
  document.getElementById('gradeChip').textContent = grade;
  document.getElementById('scoreDesc').textContent = `녹음 ${fmtT(timerSec)} · 시뮬레이션 (서버 연결 후 실제 평가 가능)`;

  renderScoreBars(sc);
  renderResultAnn(base.words || []);
  renderRules(base.rules || [], 'resultRules');
  renderMetrics(base);
  renderStrengths(base.strengths || []);

  document.getElementById('resultCoach').innerHTML = (base.coaching || []).map(c => {
    const cfg = CCFG[c.type] || CCFG.emphasis;
    return `
    <div class="ccard" style="background:${cfg.bg};border-color:${cfg.bd}">
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

  unlockNav('result');
  const items = loadHistory();
  if (items.length > 0) { items[0].score = avg; saveHistory(items); }
  if (currentUser) updateScoreCloud(avg);
  setTimeout(() => showPage('result'), 800);
}

// ── 실제 평가 결과 렌더링 ────────────────────────────────
function renderRealResult(result, base) {
  const { total, grade, breakdown, wordResults, feedback, meta } = result;

  drawRing(total);
  document.getElementById('scoreNum').textContent  = total + ' / 100';
  document.getElementById('gradeChip').textContent = grade;
  document.getElementById('scoreDesc').textContent = `녹음 ${fmtT(timerSec)} · 원어민 TTS 기준 종합 평가`;

  // 항목별 점수 그리드
  const labels = { pronunciation:'발음 정확도', stress:'강세 패턴', rhythm:'속도/리듬', liaison:'연음', delivery:'전달력' };
  const colors = { pronunciation:'#10b981', stress:'#6366f1', rhythm:'#f59e0b', liaison:'#d97706', delivery:'#7c3aed' };
  const maxPts = { pronunciation:30, stress:25, rhythm:15, liaison:15, delivery:15 };

  document.getElementById('scoreBars').innerHTML = `
    <div class="score-detail-grid">
      ${Object.entries(breakdown).map(([k, v]) => `
        <div class="score-item">
          <div class="score-item-label">${labels[k] || k}</div>
          <div>
            <span class="score-item-val" style="color:${colors[k]}">${v}</span>
            <span class="score-item-max"> / ${maxPts[k]}</span>
          </div>
          <div class="score-item-bar">
            <div class="score-item-fill" data-w="${Math.round(v / maxPts[k] * 100)}" style="background:${colors[k]}"></div>
          </div>
        </div>`).join('')}
    </div>`;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('.score-item-fill[data-w]').forEach(f => f.style.width = f.dataset.w + '%');
  }));

  // 단어별 발음 정확도
  if (wordResults?.length > 0) {
    document.getElementById('resultAnn').innerHTML = `
      <div class="word-pron-wrap">
        ${wordResults.map(w => {
          const cls = w.similarity >= 0.85 ? 'correct' : w.similarity >= 0.5 ? 'partial' : 'wrong';
          return `<span class="word-pron ${cls}">${w.word}
            <span class="score-tip">${Math.round(w.similarity * 100)}% 일치</span>
          </span> `;
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

  // AI 피드백 + 코칭
  let html = '';
  if (feedback.liaison)  html += `<div class="feedback-card fb-liaison"><div class="fb-label">연음 자연스러움</div><div class="fb-text">${feedback.liaison}</div></div>`;
  if (feedback.delivery) html += `<div class="feedback-card fb-delivery"><div class="fb-label">전달력</div><div class="fb-text">${feedback.delivery}</div>${feedback.tips?.map(t => `<div class="fb-tips"><div class="fb-tip">${t}</div></div>`).join('') || ''}</div>`;
  html += (base.coaching || []).slice(0, 3).map(c => {
    const cfg = CCFG[c.type] || CCFG.emphasis;
    return `
    <div class="ccard" style="background:${cfg.bg};border-color:${cfg.bd};margin-bottom:8px">
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

  renderRules(base.rules || [], 'resultRules');
  renderMetrics({ wpm: meta.wpm, pauseCount: meta.pauseCount, fillerWords: 0 });
  renderStrengths(base.strengths || []);
}
