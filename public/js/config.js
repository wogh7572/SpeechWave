// ── config.js ──────────────────────────────────────────
// Supabase 설정 및 전역 상수

const SUPA_URL = 'https://igqlbtaiddigqasakfgy.supabase.co';
const SUPA_KEY = 'sb_publishable_4LlbWw1F_yOoJe8MorLZvw_0n_NwzW4';

// Supabase 클라이언트 (supabase-js CDN 로드 후 사용 가능)
const supa = supabase.createClient(SUPA_URL, SUPA_KEY);

// 예시 스크립트
const EXAMPLES = [
  "Good morning, everyone. Today I'll be presenting our Q3 performance report. Our revenue grew by 23% compared to last year, and I'm proud to share the details with you.",
  "Thank you for having me. I'd like to walk you through our new product roadmap. We have three major initiatives planned for the next two quarters.",
  "Welcome, everyone. My name is Alex, and today I'll be covering our market analysis and what it means for our strategy going forward.",
];

// 페이지 메타 정보
const PAGE_META = {
  home:     ['Practice',        '스크립트를 입력하고 최고의 발표를 준비하세요'],
  analysis: ['Script Analysis', 'AI 분석 — 단어를 클릭하면 발음이 재생됩니다'],
  recording:['Recording',       '스크립트를 보며 자연스럽게 발표해보세요'],
  result:   ['Results',         'AI가 녹음을 분석해 점수와 피드백을 드립니다'],
  history:  ['History',         '이전 연습 기록을 확인하고 다시 불러올 수 있어요'],
};

// 코칭 카드 스타일 설정
const CCFG = {
  emphasis:{ bg:'#fffbeb', bd:'#fde68a', ac:'#d97706', ib:'#fef3c7', it:'#92400e', ic:'ri-volume-up-line',     lb:'강조'   },
  pause:   { bg:'#eef2ff', bd:'#c7d2fe', ac:'#4338ca', ib:'#e0e7ff', it:'#3730a3', ic:'ri-pause-circle-line',  lb:'포즈'   },
  tone:    { bg:'#f5f3ff', bd:'#ddd6fe', ac:'#6d28d9', ib:'#ede9fe', it:'#4c1d95', ic:'ri-music-2-line',       lb:'톤'     },
  gesture: { bg:'#ecfdf5', bd:'#a7f3d0', ac:'#059669', ib:'#d1fae5', it:'#064e3b', ic:'ri-hand-heart-line',   lb:'제스처' },
  speed:   { bg:'#fff1f2', bd:'#fecdd3', ac:'#be123c', ib:'#ffe4e6', it:'#881337', ic:'ri-speed-line',         lb:'속도'   },
};

// 현재 로그인 유저 (auth.js에서 업데이트)
let currentUser = null;
