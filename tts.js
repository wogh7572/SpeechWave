// ── routes/tts.js ──────────────────────────────────────
// OpenAI TTS API 프록시 라우트

const express = require('express');
const router  = express.Router();
const OpenAI  = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/tts
 * 스크립트 텍스트를 받아 OpenAI TTS 오디오(WAV)를 반환
 */
router.post('/', async (req, res) => {
  const { text, voice = 'alloy', speed = 1.0 } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: '텍스트를 입력해주세요' });
  }
  if (text.length > 2000) {
    return res.status(400).json({ error: '텍스트가 너무 깁니다 (최대 2000자)' });
  }

  try {
    const response = await openai.audio.speech.create({
      model:           'tts-1-hd',
      voice,                        // alloy, nova, echo, fable, onyx, shimmer
      input:           text,
      response_format: 'wav',       // F0 분석에 적합한 무압축 포맷
      speed,
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    res.set({
      'Content-Type':   'audio/wav',
      'Content-Length': buffer.length,
      'Cache-Control':  'public, max-age=3600',
    });
    res.send(buffer);

  } catch (err) {
    console.error('[TTS Error]', err.message);
    res.status(500).json({ error: 'TTS 생성 실패: ' + err.message });
  }
});

module.exports = router;
