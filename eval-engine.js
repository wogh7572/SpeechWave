/**
 * SpeechWave — 발음 유사도 평가 엔진
 * F0 추출, DTW, STT 비교, 종합 점수 산출
 */

// ═══════════════════════════════════════════════════════
// 1. F0 추출 (자기상관법 · Autocorrelation)
// ═══════════════════════════════════════════════════════

/**
 * 단일 오디오 프레임에서 F0(기본 주파수) 추출
 * @param {Float32Array} frame      - PCM 오디오 프레임
 * @param {number}       sampleRate - 샘플레이트 (보통 44100)
 * @returns {number} Hz 값. 무성음이면 -1
 */
function extractF0(frame, sampleRate) {
  const SIZE = frame.length;

  // ① RMS 에너지 체크 — 너무 조용하면 무성음
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += frame[i] * frame[i];
  if (Math.sqrt(rms / SIZE) < 0.008) return -1;

  // ② 자기상관 계산
  // 인간 음성 범위: 50~500 Hz → offset 범위 계산
  const minOffset = Math.floor(sampleRate / 500); // 최고 피치 한계
  const maxOffset = Math.floor(sampleRate / 50);  // 최저 피치 한계

  let bestOffset      = -1;
  let bestCorrelation = 0;
  let prevCorrelation = 0;

  for (let offset = minOffset; offset <= maxOffset; offset++) {
    let correlation = 0;
    for (let i = 0; i < SIZE - offset; i++) {
      correlation += frame[i] * frame[i + offset];
    }
    correlation /= (SIZE - offset); // 정규화

    // 피크 감지 (이전보다 낮아지기 시작한 시점 = 첫 번째 피크)
    if (prevCorrelation > bestCorrelation && prevCorrelation > correlation) {
      bestCorrelation = prevCorrelation;
      bestOffset      = offset - 1;
    }
    prevCorrelation = correlation;
  }

  // 상관도가 너무 낮으면 무성음
  if (bestOffset === -1 || bestCorrelation < 0.1) return -1;

  // ③ 보간법으로 정밀도 향상 (정수 → 소수 offset)
  if (bestOffset > 0 && bestOffset < maxOffset) {
    const prev = bestOffset > 0 ? getCorrelation(frame, SIZE, bestOffset - 1) : 0;
    const curr =                  getCorrelation(frame, SIZE, bestOffset);
    const next = bestOffset < maxOffset ? getCorrelation(frame, SIZE, bestOffset + 1) : 0;
    const delta = (next - prev) / (2 * (2 * curr - prev - next) || 1);
    bestOffset += delta;
  }

  return sampleRate / bestOffset;
}

function getCorrelation(frame, size, offset) {
  let c = 0;
  for (let i = 0; i < size - offset; i++) c += frame[i] * frame[i + offset];
  return c / (size - offset);
}

/**
 * 오디오 전체에서 시간 축 F0 배열 생성
 * @param {Float32Array} audioData   - 전체 PCM 데이터
 * @param {number}       sampleRate
 * @returns {number[]} F0 배열 — [-1, -1, 185, 192, ...]
 */
function extractF0Array(audioData, sampleRate) {
  const FRAME_SIZE = 2048; // ~46ms @44100Hz
  const HOP_SIZE   = 512;  // ~11ms (프레임 간격)
  const f0Array    = [];

  for (let i = 0; i + FRAME_SIZE < audioData.length; i += HOP_SIZE) {
    const frame = audioData.slice(i, i + FRAME_SIZE);
    f0Array.push(extractF0(frame, sampleRate));
  }

  return medianFilter(f0Array, 3); // 노이즈 제거
}

/**
 * 중앙값 필터 — F0 이상값(스파이크) 제거
 */
function medianFilter(arr, windowSize) {
  const half = Math.floor(windowSize / 2);
  return arr.map((_, i) => {
    const window = arr.slice(
      Math.max(0, i - half),
      Math.min(arr.length, i + half + 1)
    ).filter(v => v > 0); // 유성음만
    if (window.length === 0) return -1;
    window.sort((a, b) => a - b);
    return window[Math.floor(window.length / 2)];
  });
}

/**
 * F0 배열을 0~1로 정규화
 * 화자마다 음역대가 달라도 패턴만 비교할 수 있도록
 */
function normalizeF0(f0Array) {
  const voiced = f0Array.filter(v => v > 0);
  if (voiced.length === 0) return f0Array.map(() => 0);

  const min   = Math.min(...voiced);
  const max   = Math.max(...voiced);
  const range = max - min || 1;

  return f0Array.map(v => v < 0 ? 0 : (v - min) / range);
}

/**
 * F0 통계 데이터 추출 (Claude AI 판단에 활용)
 */
function getF0Stats(f0Array) {
  const voiced = f0Array.filter(v => v > 0);
  if (voiced.length === 0) return { stdDev: 0, voicedRatio: 0, range: 0, mean: 0 };

  const mean      = voiced.reduce((a, b) => a + b, 0) / voiced.length;
  const variance  = voiced.reduce((a, b) => a + (b - mean) ** 2, 0) / voiced.length;
  const stdDev    = Math.sqrt(variance);
  const range     = Math.max(...voiced) - Math.min(...voiced);
  const voicedRatio = voiced.length / f0Array.length;

  return { stdDev, voicedRatio, range, mean };
}


// ═══════════════════════════════════════════════════════
// 2. DTW (Dynamic Time Warping)
// ═══════════════════════════════════════════════════════

/**
 * DTW로 두 F0 배열의 패턴 유사도 계산
 * 말하는 속도가 달라도 패턴이 같으면 높은 점수
 *
 * @param {number[]} ref  - 기준 F0 배열 (정규화됨)
 * @param {number[]} user - 사용자 F0 배열 (정규화됨)
 * @returns {number} 유사도 0~1
 */
function dtw(ref, user) {
  const N = ref.length;
  const M = user.length;

  if (N === 0 || M === 0) return 0;

  // Sakoe-Chiba Band: 탐색 범위 제한으로 성능 개선 O(N*W)
  const WINDOW = Math.max(Math.floor(Math.max(N, M) * 0.2), 5);

  // DP 테이블 (Infinity로 초기화)
  const dp = Array.from({ length: N }, () => new Float32Array(M).fill(Infinity));
  dp[0][0] = Math.abs(ref[0] - user[0]);

  // 첫 행/열 초기화
  for (let i = 1; i < N; i++) {
    if (Math.abs(i - 0) > WINDOW) continue;
    dp[i][0] = dp[i-1][0] + Math.abs(ref[i] - user[0]);
  }
  for (let j = 1; j < M; j++) {
    if (Math.abs(0 - j) > WINDOW) continue;
    dp[0][j] = dp[0][j-1] + Math.abs(ref[0] - user[j]);
  }

  // DP 채우기
  for (let i = 1; i < N; i++) {
    for (let j = Math.max(1, i - WINDOW); j <= Math.min(M-1, i + WINDOW); j++) {
      const cost = Math.abs(ref[i] - user[j]);
      dp[i][j]   = cost + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }

  // 길이 정규화
  const distance = dp[N-1][M-1] / (N + M);

  // 거리 → 유사도 (0~1)
  return Math.max(0, 1 - distance * 2.5);
}

/**
 * 강세 패턴 점수 계산 (25점)
 */
function calcStressScore(refF0, userF0) {
  const refNorm  = normalizeF0(refF0);
  const userNorm = normalizeF0(userF0);
  const similarity = dtw(refNorm, userNorm);
  return Math.round(similarity * 25);
}


// ═══════════════════════════════════════════════════════
// 3. 발음 정확도 (STT 비교)
// ═══════════════════════════════════════════════════════

/**
 * STT 결과와 원본 스크립트를 비교하여 발음 정확도 점수 계산
 * @param {string} original   - 원본 스크립트
 * @param {string} recognized - STT 변환 결과
 * @returns {{ score: number, wordResults: Array }}
 */
function calcPronunciationScore(original, recognized) {
  const clean = s => s.toLowerCase()
    .replace(/[.,!?;:'"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const origWords = clean(original).split(' ').filter(Boolean);
  const recoWords = clean(recognized).split(' ').filter(Boolean);

  if (origWords.length === 0) return { score: 0, wordResults: [] };

  // 단어별 유사도 계산 (슬라이딩 윈도우로 순서 유연성 제공)
  const wordResults = origWords.map((word, i) => {
    // ±2 범위에서 가장 유사한 단어 찾기
    const candidates = recoWords.slice(
      Math.max(0, i - 2),
      Math.min(recoWords.length, i + 3)
    );
    const sims = candidates.map(r => wordSimilarity(word, r));
    const bestSim = sims.length > 0 ? Math.max(...sims) : 0;

    return {
      word,
      similarity: bestSim,
      correct:    bestSim > 0.75,
    };
  });

  const totalSim = wordResults.reduce((a, b) => a + b.similarity, 0);
  const score    = Math.round((totalSim / origWords.length) * 30);

  return { score: Math.min(30, score), wordResults };
}

/**
 * 두 단어의 유사도 (Levenshtein 기반, 0~1)
 */
function wordSimilarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;

  const dist = levenshtein(a, b);
  return Math.max(0, 1 - dist / Math.max(a.length, b.length, 1));
}

/**
 * Levenshtein 거리
 */
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i || j)
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[a.length][b.length];
}


// ═══════════════════════════════════════════════════════
// 4. 속도 / 리듬 평가
// ═══════════════════════════════════════════════════════

/**
 * WPM 기반 속도 점수 (10점)
 * 원어민 발표 최적 범위: 130~160 WPM
 */
function calcSpeedScore(durationMs, wordCount) {
  if (!durationMs || !wordCount) return 5;

  const wpm       = wordCount / (durationMs / 60000);
  const IDEAL_MIN = 130, IDEAL_MAX = 160;

  if (wpm >= IDEAL_MIN && wpm <= IDEAL_MAX) return 10;

  const diff = wpm < IDEAL_MIN ? IDEAL_MIN - wpm : wpm - IDEAL_MAX;
  return Math.max(0, Math.round(10 - diff / 8));
}

/**
 * F0 배열에서 포즈 위치 추출 (5점)
 */
function extractPauses(f0Array, sampleRate, hopSize = 512) {
  const msPerFrame  = (hopSize / sampleRate) * 1000;
  const MIN_PAUSE   = 150; // 150ms 이상 = 의미있는 포즈
  const pauses      = [];
  let   pauseStart  = -1;

  f0Array.forEach((f0, i) => {
    if (f0 <= 0 && pauseStart < 0) {
      pauseStart = i;
    } else if (f0 > 0 && pauseStart >= 0) {
      const durationMs = (i - pauseStart) * msPerFrame;
      if (durationMs >= MIN_PAUSE) {
        pauses.push({ startFrame: pauseStart, endFrame: i, durationMs });
      }
      pauseStart = -1;
    }
  });

  return pauses;
}

/**
 * 포즈 위치 유사도 점수 (5점)
 */
function calcPauseScore(refPauses, userPauses) {
  if (!refPauses || refPauses.length === 0) return 3;

  let matches = 0;
  refPauses.forEach(ref => {
    // ±45프레임(~500ms) 범위 내에 사용자 포즈가 있으면 일치
    const found = userPauses.some(u =>
      Math.abs(u.startFrame - ref.startFrame) <= 45
    );
    if (found) matches++;
  });

  return Math.round((matches / refPauses.length) * 5);
}


// ═══════════════════════════════════════════════════════
// 5. Web Audio API 유틸리티
// ═══════════════════════════════════════════════════════

/**
 * AudioContext로 오디오 Blob을 디코딩
 * @param {Blob} blob
 * @returns {{ data: Float32Array, sampleRate: number, duration: number }}
 */
async function decodeAudio(blob) {
  const arrayBuffer  = await blob.arrayBuffer();
  const audioCtx     = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer  = await audioCtx.decodeAudioData(arrayBuffer);
  audioCtx.close();

  // 모노로 변환 (채널 평균)
  const channels = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }

  const length = channels[0].length;
  const mono   = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    mono[i] = channels.reduce((sum, ch) => sum + ch[i], 0) / channels.length;
  }

  return {
    data:       mono,
    sampleRate: audioBuffer.sampleRate,
    duration:   audioBuffer.duration * 1000, // ms
  };
}

/**
 * Web Speech API STT
 * @param {Blob} audioBlob
 * @param {string} lang  기본 'en-US'
 * @returns {Promise<string>}
 */
function speechToText(audioBlob, lang = 'en-US') {
  return new Promise((resolve) => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('STT: SpeechRecognition 미지원');
      return resolve('');
    }

    const recognition          = new SpeechRecognition();
    recognition.lang           = lang;
    recognition.continuous     = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let resolved = false;
    const done = (text) => {
      if (!resolved) { resolved = true; resolve(text); }
    };

    recognition.onresult  = e => done(e.results[0][0].transcript);
    recognition.onerror   = () => done('');
    recognition.onend     = () => done('');

    // 녹음 오디오를 재생하면서 STT 실행
    const url   = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);

    recognition.start();
    audio.play().catch(() => {});
    audio.onended = () => {
      setTimeout(() => recognition.stop(), 500);
      URL.revokeObjectURL(url);
    };

    // 타임아웃 (10초)
    setTimeout(() => done(''), 10000);
  });
}


// ═══════════════════════════════════════════════════════
// 6. 종합 평가 실행
// ═══════════════════════════════════════════════════════

/**
 * 전체 발음 유사도 평가
 *
 * @param {object} params
 * @param {string} params.originalScript  - 원본 스크립트
 * @param {Blob}   params.userAudioBlob   - 사용자 녹음 Blob
 * @param {Blob}   params.refAudioBlob    - OpenAI TTS 기준 Blob
 * @param {Function} params.onProgress    - 진행 콜백 (0~100)
 * @returns {Promise<EvaluationResult>}
 */
async function evaluateSpeech({ originalScript, userAudioBlob, refAudioBlob, onProgress }) {
  const progress = onProgress || (() => {});

  try {
    // ── Step 1: 오디오 디코딩 (10%)
    progress(5, '오디오 분석 준비 중...');
    const [userAudio, refAudio] = await Promise.all([
      decodeAudio(userAudioBlob),
      decodeAudio(refAudioBlob),
    ]);

    // ── Step 2: F0 추출 (30%)
    progress(15, '피치 패턴 추출 중...');
    const userF0 = extractF0Array(userAudio.data, userAudio.sampleRate);
    progress(25, '기준 피치 패턴 추출 중...');
    const refF0  = extractF0Array(refAudio.data, refAudio.sampleRate);

    // ── Step 3: STT (50%)
    progress(35, '발음 인식 중...');
    const sttResult = await speechToText(userAudioBlob);
    progress(55, '발음 정확도 계산 중...');

    // ── Step 4: 점수 계산 (70%)
    progress(60, '점수 계산 중...');

    // ① 발음 정확도 (30점)
    const { score: pronScore, wordResults } = calcPronunciationScore(originalScript, sttResult);

    // ② 강세 패턴 (25점)
    const stressScore = calcStressScore(refF0, userF0);

    // ③ 속도/리듬 (15점)
    const wordCount   = originalScript.trim().split(/\s+/).length;
    const speedScore  = calcSpeedScore(userAudio.duration, wordCount);
    const userPauses  = extractPauses(userF0, userAudio.sampleRate);
    const refPauses   = extractPauses(refF0,  refAudio.sampleRate);
    const pauseScore  = calcPauseScore(refPauses, userPauses);
    const rhythmScore = speedScore + pauseScore;

    // F0 통계 (Claude 판단에 전달)
    const f0Stats = getF0Stats(userF0);

    // ── Step 5: AI 판단 (90%)
    progress(75, 'AI 분석 중...');
    let aiScores = { liaison: { score: 10, feedback: '', examples: [], tips: [] }, delivery: { score: 10, feedback: '', tips: [] } };

    try {
      const aiRes = await fetch('/api/evaluate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          originalScript,
          sttResult:   sttResult || '(인식 실패)',
          f0StdDev:    f0Stats.stdDev,
          voicedRatio: f0Stats.voicedRatio,
          pitchRange:  f0Stats.range,
        }),
      });
      if (aiRes.ok) aiScores = await aiRes.json();
    } catch (e) {
      console.warn('AI 평가 실패, 기본값 사용');
    }

    // ── Step 6: 종합 (100%)
    progress(95, '결과 생성 중...');

    const breakdown = {
      pronunciation: pronScore,
      stress:        stressScore,
      rhythm:        rhythmScore,
      liaison:       aiScores.liaison?.score  ?? 10,
      delivery:      aiScores.delivery?.score ?? 10,
    };

    const total = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0));

    const grade = total >= 90 ? 'Excellent'
                : total >= 80 ? 'Very Good'
                : total >= 70 ? 'Good'
                : total >= 60 ? 'Fair'
                : 'Keep Practicing';

    progress(100, '완료!');

    return {
      total,
      grade,
      breakdown,
      wordResults,
      sttResult,
      feedback: {
        liaison:  aiScores.liaison?.feedback  || '',
        delivery: aiScores.delivery?.feedback || '',
        tips:     [
          ...(aiScores.liaison?.examples || []),
          ...(aiScores.delivery?.tips    || []),
        ],
      },
      meta: {
        wpm:          Math.round(wordCount / (userAudio.duration / 60000)),
        pauseCount:   userPauses.length,
        voicedRatio:  Math.round(f0Stats.voicedRatio * 100),
        pitchVariety: Math.round(f0Stats.stdDev),
      },
    };

  } catch (err) {
    console.error('[evaluateSpeech Error]', err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────
// 브라우저 환경에서 전역으로 내보내기
// ─────────────────────────────────────────────────────────
window.SW_Eval = {
  evaluateSpeech,
  extractF0Array,
  normalizeF0,
  dtw,
  calcPronunciationScore,
  calcStressScore,
  getF0Stats,
  decodeAudio,
  speechToText,
};
