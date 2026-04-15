// ── analysis.js ────────────────────────────────────────
// Claude API 스크립트 분석 + 피치 곡선 시각화

// ── 데모 데이터 ─────────────────────────────────────────
function makeDemo() {
  return {
    phrases: [
      {
        words: [
          { text:"Good",      stress:"high", phonetic:"ɡʊd",          syllables:"Good",           liaison:false, pauseAfter:false },
          { text:"morning,",  stress:"high", phonetic:"ˈmɔːrnɪŋ",     syllables:"MOR-ning",       liaison:false, pauseAfter:true  },
          { text:"everyone.", stress:"mid",  phonetic:"ˈɛvriwʌn",     syllables:"EV-ry-one",      liaison:false, pauseAfter:true  },
        ],
        hints: ["끝에서 음 낮추기", "쉼표 구간 여유있게"],
      },
      {
        words: [
          { text:"Today",       stress:"mid",  phonetic:"təˈdeɪ",         syllables:"to-DAY",         liaison:false, pauseAfter:false },
          { text:"I'll",        stress:"low",  phonetic:"aɪl",            syllables:"I'll",            liaison:true,  pauseAfter:false },
          { text:"be",          stress:"low",  phonetic:"biː",            syllables:"be",              liaison:true,  pauseAfter:false },
          { text:"presenting",  stress:"high", phonetic:"prɪˈzɛntɪŋ",    syllables:"pre-ZENT-ing",   liaison:false, pauseAfter:false },
          { text:"our",         stress:"low",  phonetic:"aʊər",           syllables:"our",             liaison:true,  pauseAfter:false },
          { text:"Q3",          stress:"high", phonetic:"kjuːˈθriː",      syllables:"Q-THREE",         liaison:false, pauseAfter:false },
          { text:"performance", stress:"high", phonetic:"pərˈfɔːrməns",   syllables:"per-FOR-mance",  liaison:false, pauseAfter:false },
          { text:"report.",     stress:"high", phonetic:"rɪˈpɔːrt",       syllables:"re-PORT",         liaison:false, pauseAfter:true  },
        ],
        hints: ["강조 단어 천천히", "끝에서 음 낮추기", "쉼표 구간 여유있게"],
      },
      {
        words: [
          { text:"Our",      stress:"low",  phonetic:"aʊər",          syllables:"Our",           liaison:true,  pauseAfter:false },
          { text:"revenue",  stress:"high", phonetic:"ˈrɛvənjuː",    syllables:"REV-e-nue",     liaison:false, pauseAfter:false },
          { text:"grew",     stress:"mid",  phonetic:"ɡruː",          syllables:"grew",          liaison:false, pauseAfter:false },
          { text:"by",       stress:"low",  phonetic:"baɪ",           syllables:"by",            liaison:true,  pauseAfter:false },
          { text:"23%",      stress:"high", phonetic:"ˈtwɛntiˈθriː ˈpɜːrsɛnt", syllables:"twen-ty-THREE per-CENT", liaison:false, pauseAfter:true },
          { text:"compared", stress:"mid",  phonetic:"kəmˈpɛrd",     syllables:"com-PARED",     liaison:false, pauseAfter:false },
          { text:"to",       stress:"low",  phonetic:"tuː",           syllables:"to",            liaison:true,  pauseAfter:false },
          { text:"last",     stress:"mid",  phonetic:"læst",          syllables:"last",          liaison:false, pauseAfter:false },
          { text:"year.",    stress:"mid",  phonetic:"jɪər",          syllables:"year",          liaison:false, pauseAfter:false },
        ],
        hints: ["강조 단어 천천히", "끝에서 음 낮추기"],
      },
    ],
    rules: [
      { type:"liaison", phrase:"I'll be presenting",    desc:"'I'll be'는 끊지 않고 하나의 흐름처럼 연결해서 발음하세요" },
      { type:"stress",  phrase:"Q3 performance report", desc:"세 단어 모두 강세 — 발표의 핵심이므로 천천히 또렷하게" },
      { type:"pause",   phrase:"everyone. ↦ Today",     desc:"문장 끝에서 1초 포즈 후 다음 문장 시작" },
      { type:"stress",  phrase:"23%",                   desc:"수치는 발표의 신뢰도를 높입니다 — 말하기 전 살짝 멈추고 또렷하게" },
    ],
    coaching: [
      { type:"emphasis", title:'"Q3 performance report" 강하게', description:'발표의 핵심 주제입니다. 이 세 단어를 천천히, 또렷하게 말하세요.', target:'"Q3 performance report"', priority:"high" },
      { type:"emphasis", title:'"23%" — 숫자는 무조건 강조',      description:'수치는 발표의 신뢰도를 높입니다. "23%"를 말하기 전 살짝 멈추고 또렷하게 발음하세요.', target:'"grew by 23%"', priority:"high" },
      { type:"pause",    title:'"everyone." 뒤 2초 멈추기',       description:'발표 시작 후 청중의 주의를 집중시키는 가장 강력한 방법은 침묵입니다.', target:'"Good morning, everyone." 직후', priority:"high" },
      { type:"tone",     title:'끝을 자신감 있게 내리기',          description:'문장 끝에서 음이 올라가면 불확실하게 들려요.', target:'각 문장 마지막 단어', priority:"medium" },
      { type:"speed",    title:'발화 속도 약간 줄이기',            description:'120–140 WPM이 발표에 최적입니다.', target:'전반적인 속도', priority:"medium" },
      { type:"gesture",  title:'"share"할 때 손 펼치기',           description:'"share"나 "present"를 말할 때 두 손바닥을 앞으로 펼치세요.', target:'at "share" / "present"', priority:"low" },
    ],
    words: [
      { word:"Good",       type:null },  { word:"morning,",   type:null,      pauseAfter:true },
      { word:"everyone.",  type:null,    pauseAfter:true },
      { word:"Today",      type:null },  { word:"I'll",       type:'liaison' }, { word:"be",          type:'liaison' },
      { word:"presenting", type:'emphasis' }, { word:"our", type:null }, { word:"Q3", type:'emphasis' },
      { word:"performance",type:'emphasis' }, { word:"report.", type:'emphasis', pauseAfter:true },
      { word:"Our",        type:null },  { word:"revenue",    type:'emphasis' }, { word:"grew", type:null }, { word:"by", type:null },
      { word:"23%",        type:'emphasis', pauseAfter:true }, { word:"compared", type:null }, { word:"to", type:null },
      { word:"last",       type:null },  { word:"year.",      type:'tone' },
    ],
    scores: { rhythm:82, clarity:88, flow:75, pace:79 },
    strengths: [
      "필러 워드 없음 — 깔끔하고 명확한 딜리버리입니다.",
      "'Good morning'에서 강한 오프닝 에너지가 느껴집니다.",
      "모든 단어가 명확하게 발음되었습니다.",
    ],
    wpm: 148, pauseCount: 1, fillerWords: 0,
    summaryTip: '"Q3 performance report"와 "23%"를 반드시 강조하세요.',
    estTime: '약 30초',
  };
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
      pts.push({
        x: (wRect.left - cRect.left) + wRect.width / 2,
        y: yOf(w.dataset.stress || 'low'),
      });
    });

    if (pts.length < 2) return;

    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i-1], c = pts[i], mx = (p.x + c.x) / 2;
      d += ` C ${mx} ${p.y} ${mx} ${c.y} ${c.x} ${c.y}`;
    }

    const W   = cRect.width;
    const H   = 56;
    const len = pts.reduce((a, p, i) => {
      if (!i) return 0;
      const pp = pts[i-1];
      return a + Math.hypot(p.x - pp.x, p.y - pp.y);
    }, 0) * 1.3;

    curveBox.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
           style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">
        ${[10, 28, 44].map(y => `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#f3f4f6" stroke-width="1"/>`).join('')}
        <path d="${d}" fill="none" stroke="#9ca3af" stroke-width="1.8" stroke-linecap="round"
              stroke-dasharray="${len}" stroke-dashoffset="${len}"/>
      </svg>`;

    requestAnimationFrame(() => {
      const path = curveBox.querySelector('path');
      if (path) {
        path.style.transition        = 'stroke-dashoffset 1.1s ease';
        path.style.strokeDashoffset  = '0';
      }
    });
  });
}

// ── 스크립트 시각화 렌더링 ──────────────────────────────
function renderScriptViz(phrases) {
  const container = document.getElementById('scriptViz');
  container.innerHTML = '';

  phrases.forEach((phrase, pi) => {
    const block    = document.createElement('div');
    block.className = 'phrase-block';

    // 피치 곡선 박스
    const curveBox    = document.createElement('div');
    curveBox.className = 'curve-box';
    block.appendChild(curveBox);

    // 단어 행
    const wordsRow    = document.createElement('div');
    wordsRow.className = 'words-row';

    phrase.words.forEach(w => {
      const unit             = document.createElement('span');
      unit.className         = `word-unit ${w.stress}${w.liaison ? ' liaison' : ''}`;
      unit.dataset.stress    = w.stress;
      unit.dataset.phonetic  = w.phonetic  || '';
      unit.dataset.syllables = w.syllables || w.text;
      unit.dataset.word      = w.text;

      const txt       = document.createElement('span');
      txt.className   = 'word-text';
      txt.textContent = w.text;
      unit.appendChild(txt);

      unit.addEventListener('mouseenter', e => showWordTip(e, w));
      unit.addEventListener('mouseleave', hideTip);
      unit.addEventListener('click', () => speakWord(w.text));

      wordsRow.appendChild(unit);

      if (w.pauseAfter) {
        const slash       = document.createElement('span');
        slash.className   = 'pause-slash';
        slash.textContent = ' /';
        wordsRow.appendChild(slash);
      }

      wordsRow.appendChild(document.createTextNode(' '));
    });

    block.appendChild(wordsRow);

    // 힌트 칩
    if (phrase.hints?.length) {
      const hintsDiv    = document.createElement('div');
      hintsDiv.className = 'phrase-hints';
      phrase.hints.forEach(h => {
        const chip       = document.createElement('span');
        chip.className   = 'hint-chip';
        chip.textContent = h;
        hintsDiv.appendChild(chip);
      });
      block.appendChild(hintsDiv);
    }

    // 구 사이 구분선
    if (pi < phrases.length - 1) {
      const div      = document.createElement('div');
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

// ── Claude API 분석 실행 ─────────────────────────────────
async function runAnalysis() {
  currentScript = document.getElementById('scriptInput').value.trim() || EXAMPLES[0];
  const btn     = document.getElementById('analyzeBtn');
  btn.classList.add('busy');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role:    'user',
          content: `You are an expert English phonetics and speech coach for Korean learners.
Analyze this English script and return coaching data. Script: "${currentScript}"

Return ONLY valid JSON, no markdown:
{
  "phrases": [{"words":[{"text":"Good","stress":"high","phonetic":"ɡʊd","syllables":"Good","liaison":false,"pauseAfter":false}],"hints":["끝에서 음 낮추기"]}],
  "rules": [{"type":"liaison","phrase":"...","desc":"Korean explanation"}],
  "coaching": [{"type":"emphasis","title":"Korean","description":"Korean","target":"Korean","priority":"high"}],
  "words": [{"word":"Good","type":null,"pauseAfter":false}],
  "scores": {"rhythm":80,"clarity":85,"flow":75,"pace":79},
  "strengths": ["Korean strength"],
  "summaryTip": "Korean one-line tip",
  "estTime": "약 30초",
  "wpm":140,"pauseCount":2,"fillerWords":0
}
Rules:
- Split script into natural phrases. Per word: stress=high/mid/low, phonetic=IPA, syllables=CAPS for stressed (e.g. "MOR-ning"), liaison=true if linked, pauseAfter=true at phrase end
- hints: 1-2 Korean delivery hints per phrase
- rules: 3-4 items, type=liaison/stress/pause/drop
- coaching: 4-6 items, type=emphasis/pause/tone/gesture/speed, priority=high/medium/low
- words: type=emphasis/tone/liaison/null
- summaryTip: 1 Korean sentence`,
        }],
      }),
    });
    const raw = (await res.json()).content[0].text.replace(/```json|```/g, '').trim();
    analysisData = JSON.parse(raw);
  } catch (e) {
    analysisData = makeDemo();
  }

  btn.classList.remove('busy');

  // 분석 결과 렌더링
  document.getElementById('analysisSummary').textContent = analysisData.summaryTip || '스크립트 분석이 완료되었습니다.';
  document.getElementById('analysisTime').textContent    = analysisData.estTime || '약 30초';
  renderScriptViz(analysisData.phrases || makeDemo().phrases);
  renderRules(analysisData.rules, 'analysisRules');
  renderCoaching(analysisData.coaching, 'coachCards');
  document.getElementById('recScriptText').textContent = currentScript;

  unlockNav('analysis');
  unlockNav('recording');
  showPage('analysis');

  addHistoryItem(currentScript, analysisData, null);
}
