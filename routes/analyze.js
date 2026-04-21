// ── routes/analyze.js ──────────────────────────────────
// Claude API 스크립트 분석 라우트

const express = require('express');
const router  = express.Router();

/**
 * POST /api/analyze
 * 스크립트를 받아 Claude AI가 강세·연음·포즈·코칭팁을 분석해서 반환
 */
router.post('/', async (req, res) => {
  const { script } = req.body;

  if (!script || script.trim().length === 0) {
    return res.status(400).json({ error: '스크립트를 입력해주세요' });
  }

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{
          role:    'user',
          content: `You are an expert English phonetics and speech coach for Korean learners.
Analyze this English script and return coaching data. Script: "${script.trim()}"

Return ONLY valid JSON, no markdown:
{
  "phrases": [
    {
      "words": [
        {"text":"Good","stress":"high","phonetic":"ɡʊd","syllables":"Good","liaison":false,"pauseAfter":false}
      ],
      "hints": ["끝에서 음 낮추기"]
    }
  ],
  "rules": [{"type":"liaison","phrase":"...","desc":"Korean explanation"}],
  "coaching": [{"type":"emphasis","title":"Korean title","description":"Korean desc","target":"target phrase","priority":"high"}],
  "words": [{"word":"Good","type":null,"pauseAfter":false}],
  "scores": {"rhythm":80,"clarity":85,"flow":75,"pace":79},
  "strengths": ["Korean strength point"],
  "summaryTip": "Korean one-line tip",
  "estTime": "약 30초",
  "wpm": 140,
  "pauseCount": 2,
  "fillerWords": 0
}

Rules:
- Split script into natural breath-group phrases (1 phrase = 1 breath)
- Per word: stress=high(강세)/mid(중간)/low(약세), phonetic=IPA, syllables=CAPS for stressed syllable (e.g. "MOR-ning"), liaison=true if naturally linked to next word, pauseAfter=true at phrase boundary
- hints: 1-2 short Korean delivery hints per phrase
- rules: 3-5 items, type must be one of: liaison/stress/pause/drop
- coaching: 4-6 items, type must be one of: emphasis/pause/tone/gesture/speed, priority=high/medium/low
- words: flat list of all words with type=emphasis/tone/liaison/null and pauseAfter=true/false
- summaryTip: 1 most important Korean tip (1 sentence)
- estTime: estimated reading time in Korean (e.g. "약 20초")`,
        }],
      }),
    });

    const data = await claudeRes.json();
    const raw  = data.content?.[0]?.text;

    if (!raw) throw new Error('Claude 응답 없음');

    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch (e) {
      throw new Error('JSON 파싱 실패: ' + e.message);
    }

    res.json({ ok: true, data: parsed });

  } catch (err) {
    console.error('[Analyze Error]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
