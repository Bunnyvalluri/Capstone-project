const express = require('express');
const router = express.Router();
const notesController = require('../controllers/notesController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', notesController.getTags);
router.post('/', notesController.createTag);
router.delete('/:id', notesController.deleteTag);
router.put('/:id', notesController.updateTag);

module.exports = router;
