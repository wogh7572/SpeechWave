const express = require('express');
const router = express.Router();
router.post('/', async (req, res) => {
  res.json({ error: 'TTS 비활성화' });
});
module.exports = router;
