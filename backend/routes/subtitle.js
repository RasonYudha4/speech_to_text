const express = require('express');
const subtitleController = require('../controllers/subtitleController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Save/Update entire SRT file with subtitles
router.post('/subtitles', authMiddleware, subtitleController.saveSubtitles);

// Get SRT file with all subtitles by filename
router.get('/subtitles/:filename', authMiddleware, subtitleController.getSubtitles);

// Edit a single subtitle by sequence number
router.put('/subtitles/:subtitle_id', authMiddleware, subtitleController.editSubtitle);

// Delete a single subtitle by sequence number
router.delete('/subtitles/:sequence_number', authMiddleware, subtitleController.deleteSubtitle);

module.exports = router;