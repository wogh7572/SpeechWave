// ── analysis.js ────────────────────────────────────────
// Claude API 스크립트 분석 + 시각화

// ── 분석 탭 전환 ────────────────────────────────────────
function switchAnalysisTab(tab) {
  ['stress','intonation'].forEach(t => {
    document.getElementById(`atab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`atab-panel-${t}`).style.display = t === tab ? '' : 'none';
  });
  if (tab === 'intonation') setTimeout(drawAllCurves, 80);
}

// ── 강조 단어 단순 뷰 렌더링 (곡선 없음) ────────────────
function renderStressView(phrases, targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.innerHTML = phrases.map(phrase => {
    const wordHtml = phrase.words.map(w => {
      const stressCls = w.stress === 'high' ? 'sv-word high'
                      : w.stress === 'mid'  ? 'sv-word mid'
                      :                       'sv-word low';
      const slash = w.pauseAfter ? `<span class="sv-slash">/</span>` : '';
      const phon  = w.phonetic ? `title="${w.phonetic}"` : '';
      return `<span class="${stressCls}" ${phon} onclick="speakWord('${w.text.replace(/[.,!?]/g,'').replace(/'/g,"\\'")}'">${w.text}</span>${slash}`;
    }).join(' ');

    const hints = phrase.hints?.length
      ? `<div class="sv-hints">${phrase.hints.map(h=>`<span class="hint-chip">${h}</span>`).join('')}</div>`
      : '';

    return `<div class="sv-phrase">${wordHtml}${hints}</div>`;
  }).join('');
}

// ── 피치 곡선 시각화 ────────────────────────────────────
function yOf(stress) { return stress === 'high' ? 10 : stress === 'mid' ? 28 : 44; }

function drawAllCurves() {
  document.querySelectorAll('.phrase-block').forEach(block => {
    const words    = block.querySelectorAll('.word-unit');
    const curveBox = block.querySelector('.curve-box');
    if (!words.length || !curveBox) return;
    const cRect = curveBox.getBoundingClientRect();
    if (cRect.width === 0) return;
    const pts = [];
    words.forEach(w => {
      const wRect = w.getBoundingClientRect();
      pts.push({ x: (wRect.left - cRect.left) + wRect.width / 2, y: yOf(w.dataset.stress || 'low') });
    });
    if (pts.length < 2) return;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i-1], c = pts[i], mx = (p.x + c.x) / 2;
      d += ` C ${mx} ${p.y} ${mx} ${c.y} ${c.x} ${c.y}`;
    }
    const W = cRect.width, H = 56;
    const len = pts.reduce((a, p, i) => {
      if (!i) return 0;
      const pp = pts[i-1];
      return a + Math.hypot(p.x - pp.x, p.y - pp.y);
    }, 0) * 1.3;
    curveBox.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">
        ${[10,28,44].map(y=>`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#f3f4f6" stroke-width="1"/>`).join('')}
        <path d="${d}" fill="none" stroke="#9ca3af" stroke-width="1.8" stroke-linecap="round"
              stroke-dasharray="${len}" stroke-dashoffset="${len}"/>
      </svg>`;
    requestAnimationFrame(() => {
      const path = curveBox.querySelector('path');
      if (path) { path.style.transition = 'stroke-dashoffset 1.1s ease'; path.style.strokeDashoffset = '0'; }
    });
  });
}

function renderScriptViz(phrases) {
  const container = document.getElementById('scriptViz');
  container.innerHTML = '';
  phrases.forEach((phrase, pi) => {
    const block = document.createElement('div');
    block.className = 'phrase-block';
    const curveBox = document.createElement('div');
    curveBox.className = 'curve-box';
    block.appendChild(curveBox);
    const wordsRow = document.createElement('div');
    wordsRow.className = 'words-row';
    phrase.words.forEach(w => {
      const unit = document.createElement('span');
      unit.className = `word-unit ${w.stress}${w.liaison ? ' liaison' : ''}`;
      unit.dataset.stress    = w.stress;
      unit.dataset.phonetic  = w.phonetic  || '';
      unit.dataset.syllables = w.syllables || w.text;
      unit.dataset.word      = w.text;
      const txt = document.createElement('span');
      txt.className = 'word-text';
      txt.textContent = w.text;
      unit.appendChild(txt);
      unit.addEventListener('mouseenter', e => showWordTip(e, w));
      unit.addEventListener('mouseleave', hideTip);
      unit.addEventListener('click', () => speakWord(w.text));
      wordsRow.appendChild(unit);
      if (w.pauseAfter) {
        const slash = document.createElement('span');
        slash.className = 'pause-slash';
        slash.textContent = ' /';
        wordsRow.appendChild(slash);
      }
      wordsRow.appendChild(document.createTextNode(' '));
    });
    block.appendChild(wordsRow);
    if (phrase.hints?.length) {
      const hintsDiv = document.createElement('div');
      hintsDiv.className = 'phrase-hints';
      phrase.hints.forEach(h => {
        const chip = document.createElement('span');
        chip.className = 'hint-chip';
        chip.textContent = h;
        hintsDiv.appendChild(chip);
      });
      block.appendChild(hintsDiv);
    }
    if (pi < phrases.length - 1) {
      const div = document.createElement('div');
      div.style.cssText = 'height:1px;background:#f3f4f6;margin:20px 0;';
      block.appendChild(div);
    }
    container.appendChild(block);
  });
  requestAnimationFrame(() => requestAnimationFrame(drawAllCurves));
  window.addEventListener('resize', () => {
    clearTimeout(window._curveTimer);
    window._curveTimer = setTimeout(drawAllCurves, 150);
  }, { once: false });
}

// ── Claude API 분석 (백엔드 경유) ────────────────────────
async function runAnalysis() {
  currentScript = document.getElementById('scriptInput').value.trim() || EXAMPLES[0];
  const btn = document.getElementById('analyzeBtn');
  btn.classList.add('busy');

  let data = null;

  try {
    // 백엔드 /api/analyze 호출 (모든 예시에서 동작)
    const res = await fetch('/api/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ script: currentScript }),
    });
    const json = await res.json();
    if (json.ok && json.data) {
      data = json.data;
    } else {
      throw new Error(json.error || '분석 실패');
    }
  } catch (e) {
    console.warn('API 분석 실패, 데모 데이터 사용:', e.message);
    data = makeDemoForScript(currentScript);
  }

  analysisData = data;
  btn.classList.remove('busy');

  // 분석 결과 렌더링
  document.getElementById('analysisSummary').textContent = data.summaryTip || '스크립트 분석이 완료되었습니다.';
  document.getElementById('analysisTime').textContent    = data.estTime    || '약 30초';

  // 탭 1: 강조·연음 뷰
  renderStressView(data.phrases, 'scriptStressView');
  // 탭 2: 인토네이션 곡선
  renderScriptViz(data.phrases);
  // 발음 규칙
  renderRules(data.rules, 'analysisRules');
  // AI 코칭
  renderCoaching(data.coaching, 'coachCards');

  // 전체 녹음 탭의 스크립트 뷰도 업데이트
  renderStressView(data.phrases, 'fullRecScriptViz');

  unlockNav('analysis');
  unlockNav('recording');
  showPage('analysis');

  addHistoryItem(currentScript, data, null);
}

// ── 스크립트에 맞는 데모 데이터 생성 ──────────────────────
function makeDemoForScript(script) {
  // 스크립트를 마침표/느낌표 기준으로 문장 분리
  const sentences = script.split(/(?<=[.!?])\s+/).filter(Boolean);
  const phrases = sentences.map(sentence => {
    const words = sentence.trim().split(/\s+/).map((w, i, arr) => {
      const isLast = i === arr.length - 1;
      // 간단한 강세 규칙: 긴 단어일수록 high, 관사/전치사는 low
      const lowWords = new Set(['a','an','the','to','of','in','on','at','by','for','and','or','but','is','are','was','were','be','been','i','my','our','your','we','it','this','that','with']);
      const stress = lowWords.has(w.toLowerCase().replace(/[.,!?]/g,'')) ? 'low'
                   : w.length > 6 ? 'high' : 'mid';
      return {
        text:       w,
        stress,
        phonetic:   '',
        syllables:  w.replace(/[.,!?]/g,''),
        liaison:    false,
        pauseAfter: isLast,
      };
    });
    return { words, hints: ['또렷하게 발음하세요'] };
  });

  const allWords = phrases.flatMap(p => p.words.map(w => ({ word: w.text, type: w.stress === 'high' ? 'emphasis' : null, pauseAfter: w.pauseAfter })));
  const wordCount = allWords.length;
  const estSecs  = Math.round(wordCount / 2.3);
  const estTime  = estSecs < 60 ? `약 ${estSecs}초` : `약 ${Math.round(estSecs/60)}분`;

  return {
    phrases,
    rules:    [{ type:'stress', phrase:'강조 단어', desc:'중요한 단어는 천천히 또렷하게 발음하세요' }],
    coaching: [
      { type:'emphasis', title:'핵심 단어 강조',    description:'중요한 명사와 동사에 강세를 주세요.', target:'전반적인 강조', priority:'high' },
      { type:'speed',    title:'발화 속도 조절',    description:'130~160 WPM이 발표에 가장 적합합니다.', target:'전반적인 속도', priority:'medium' },
      { type:'pause',    title:'문장 끝 포즈',      description:'마침표 후 잠깐 멈춰 청중이 내용을 소화하게 하세요.', target:'각 문장 끝', priority:'medium' },
      { type:'tone',     title:'자신감 있는 어조',  description:'문장 끝에서 음을 내려 자신감을 표현하세요.', target:'평서문 끝', priority:'low' },
    ],
    words:     allWords,
    scores:    { rhythm:78, clarity:82, flow:75, pace:80 },
    strengths: ['스크립트가 명확하게 구성되어 있습니다.'],
    summaryTip: '핵심 단어에 강세를 주고 문장 끝에서 잠깐 멈추세요.',
    estTime,
    wpm:        140,
    pauseCount: sentences.length,
    fillerWords: 0,
  };
}

// makeDemo는 하위 호환용 (예시 1 기본)
function makeDemo() {
  return makeDemoForScript(EXAMPLES[0]);
}
