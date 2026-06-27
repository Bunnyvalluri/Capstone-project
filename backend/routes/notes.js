const express = require('express');
const router = express.Router();
const notesController = require('../controllers/notesController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Protect all routes under /notes and /tags
router.use(authMiddleware);

// Note CRUD API endpoints
router.get('/', notesController.getNotes);
router.post('/', notesController.createNote);
router.put('/:id', notesController.updateNote);
router.delete('/:id', notesController.deleteNote);

// Note state updates (PATCH endpoints)
router.patch('/pin/:id', notesController.patchPin);
router.patch('/archive/:id', notesController.patchArchive);
router.patch('/trash/:id', notesController.patchTrash);

// Tag management routes (mounted under notes or root server, we can place them here)
// However, since server.js will map router to /api/notes, let's also support tag routes at /api/tags in server.js
// Wait! Let's export tags sub-router separately, or let's create a separate tags.js route file!
// That is much cleaner. Let's keep notes.js focused only on /notes routes, and make backend/routes/tags.js for tags!

module.exports = router;
