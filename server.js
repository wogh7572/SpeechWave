// ── server.js ───────────────────────────────────────────
// SpeechWave 서버 진입점
// 라우트 등록 + 정적 파일 서빙만 담당

const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const app = express();

// ── 미들웨어 ─────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── API 라우트 ────────────────────────────────────────────
app.use('/api/tts',      require('./routes/tts'));
app.use('/api/evaluate', require('./routes/evaluate'));
app.use('/api/analyze',  require('./routes/analyze'));

// ── 상태 확인 ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    tts:    !!process.env.OPENAI_API_KEY,
    ai:     !!process.env.ANTHROPIC_API_KEY,
  });
});

// ── SPA 폴백 ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── 서버 시작 ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎤 SpeechWave 서버 실행 중`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   TTS : ${process.env.OPENAI_API_KEY     ? '✅ 연결됨' : '❌ OPENAI_API_KEY 없음'}`);
  console.log(`   AI  : ${process.env.ANTHROPIC_API_KEY  ? '✅ 연결됨' : '❌ ANTHROPIC_API_KEY 없음'}\n`);
});
