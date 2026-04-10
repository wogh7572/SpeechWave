// ── routes/evaluate.js ─────────────────────────────────
// Claude API 발음 평가 프록시 라우트

const express = require('express');
const router  = express.Router();

/**
 * POST /api/evaluate
 * STT 결과 + F0 데이터를 받아 Claude AI 판단 점수를 반환
 * (연음 자연스러움 15점 + 전달력 15점)
 */
router.post('/', async (req, res) => {
  const { originalScript, sttResult, f0StdDev, voicedRatio, pitchRange } = req.body;

  if (!originalScript || !sttResult) {
    return res.status(400).json({ error: '필수 파라미터 누락' });
  }

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role:    'user',
          content: `You are an expert English pronunciation evaluator for Korean learners.

## Original Script
${originalScript}

## STT Result (what the speaker actually said)
${sttResult}

## Pitch Analysis
- F0 standard deviation: ${(f0StdDev || 0).toFixed(2)} (higher = more natural variation)
- Voiced ratio: ${((voicedRatio || 0) * 100).toFixed(1)}%
- Pitch range: ${(pitchRange || 0).toFixed(1)} Hz

Score these two criteria. Return ONLY valid JSON, no markdown:
{
  "liaison": {
    "score": <integer 0-15>,
    "feedback": "<Korean feedback sentence>",
    "examples": ["<specific phrase>"]
  },
  "delivery": {
    "score": <integer 0-15>,
    "feedback": "<Korean feedback sentence>",
    "tips": ["<actionable Korean tip>"]
  }
}

Scoring:
- liaison (0-15): Natural connected speech, reduction (wanna/gonna), assimilation
- delivery (0-15): Pitch variety (not monotone), confidence, sentence-final falling tone`,
        }],
      }),
    });

    const data = await claudeRes.json();
    const raw  = data.content?.[0]?.text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      parsed = {
        liaison:  { score: 8,  feedback: '분석 결과를 파싱하지 못했습니다.', examples: [] },
        delivery: { score: 8,  feedback: '분석 결과를 파싱하지 못했습니다.', tips: [] },
      };
    }

    res.json(parsed);

  } catch (err) {
    console.error('[Evaluate Error]', err.message);
    // 에러 시 기본 점수 반환 (서비스 중단 방지)
    res.json({
      liaison:  { score: 10, feedback: 'AI 분석을 일시적으로 사용할 수 없습니다.', examples: [] },
      delivery: { score: 10, feedback: 'AI 분석을 일시적으로 사용할 수 없습니다.', tips: [] },
    });
  }
});

module.exports = router;
