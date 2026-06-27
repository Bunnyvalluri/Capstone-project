const { dbQuery } = require('../config/db');

// Retrieve all notes for the authenticated user
exports.getNotes = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch notes
    const notes = await dbQuery.all(
      'SELECT * FROM notes WHERE user_id = ? ORDER BY isPinned DESC, updated_at DESC',
      [userId]
    );

    // Fetch note-tag associations
    const noteTags = await dbQuery.all(
      `SELECT nt.note_id, t.id as tag_id, t.name 
       FROM note_tags nt 
       JOIN tags t ON nt.tag_id = t.id 
       WHERE t.user_id = ?`,
      [userId]
    );

    // Map tags to notes
    const notesWithTags = notes.map(note => {
      const tags = noteTags
        .filter(nt => nt.note_id === note.id)
        .map(nt => ({ id: nt.tag_id, name: nt.name }));
      return {
        ...note,
        isPinned: !!note.isPinned,
        isArchived: !!note.isArchived,
        isDeleted: !!note.isDeleted,
        tags
      };
    });

    res.json(notesWithTags);
  } catch (err) {
    console.error('Error fetching notes:', err);
    res.status(500).json({ error: 'Server error fetching notes.' });
  }
};

// Create a new note
exports.createNote = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, content, color, isPinned, isArchived, tags } = req.body;

    const noteColor = color || '#ffffff';
    const pinVal = isPinned ? 1 : 0;
    const archiveVal = isArchived ? 1 : 0;

    // Insert note
    const result = await dbQuery.run(
      `INSERT INTO notes (user_id, title, content, color, isPinned, isArchived, isDeleted) 
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [userId, title || '', content || '', noteColor, pinVal, archiveVal]
    );

    const noteId = result.id;

    // Handle tags if provided
    let insertedTags = [];
    if (tags && Array.isArray(tags)) {
      for (const tagName of tags) {
        if (!tagName.trim()) continue;
        
        // Find or create tag
        let tag = await dbQuery.get('SELECT * FROM tags WHERE user_id = ? AND name = ?', [userId, tagName.trim()]);
        if (!tag) {
          const tagResult = await dbQuery.run('INSERT INTO tags (user_id, name) VALUES (?, ?)', [userId, tagName.trim()]);
          tag = { id: tagResult.id, name: tagName.trim() };
        }
        
        // Associate tag with note
        await dbQuery.run('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', [noteId, tag.id]);
        insertedTags.push(tag);
      }
    }

    const newNote = {
      id: noteId,
      user_id: userId,
      title: title || '',
      content: content || '',
      color: noteColor,
      isPinned: !!pinVal,
      isArchived: !!archiveVal,
      isDeleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tags: insertedTags
    };

    res.status(201).json(newNote);
  } catch (err) {
    console.error('Error creating note:', err);
    res.status(500).json({ error: 'Server error creating note.' });
  }
};

// Update an existing note
exports.updateNote = async (req, res) => {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;
    const { title, content, color, isPinned, isArchived, tags } = req.body;

    // Check if note exists and belongs to user
    const note = await dbQuery.get('SELECT * FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);
    if (!note) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    const noteColor = color !== undefined ? color : note.color;
    const pinVal = isPinned !== undefined ? (isPinned ? 1 : 0) : note.isPinned;
    const archiveVal = isArchived !== undefined ? (isArchived ? 1 : 0) : note.isArchived;

    // Update note details
    await dbQuery.run(
      `UPDATE notes 
       SET title = ?, content = ?, color = ?, isPinned = ?, isArchived = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND user_id = ?`,
      [title !== undefined ? title : note.title, content !== undefined ? content : note.content, noteColor, pinVal, archiveVal, noteId, userId]
    );

    // Sync tags if tag list is provided in the body
    let finalTags = [];
    if (tags && Array.isArray(tags)) {
      // Remove old tag mappings for this note
      await dbQuery.run('DELETE FROM note_tags WHERE note_id = ?', [noteId]);

      for (const tagName of tags) {
        if (!tagName.trim()) continue;

        // Find or create tag
        let tag = await dbQuery.get('SELECT * FROM tags WHERE user_id = ? AND name = ?', [userId, tagName.trim()]);
        if (!tag) {
          const tagResult = await dbQuery.run('INSERT INTO tags (user_id, name) VALUES (?, ?)', [userId, tagName.trim()]);
          tag = { id: tagResult.id, name: tagName.trim() };
        }

        // Add mapping
        await dbQuery.run('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', [noteId, tag.id]);
        finalTags.push(tag);
      }
    } else {
      // Retrieve current tags
      const currentTags = await dbQuery.all(
        `SELECT t.id, t.name 
         FROM note_tags nt 
         JOIN tags t ON nt.tag_id = t.id 
         WHERE nt.note_id = ?`,
        [noteId]
      );
      finalTags = currentTags;
    }

    // Retrieve updated note
    const updatedNote = await dbQuery.get('SELECT * FROM notes WHERE id = ?', [noteId]);

    res.json({
      ...updatedNote,
      isPinned: !!updatedNote.isPinned,
      isArchived: !!updatedNote.isArchived,
      isDeleted: !!updatedNote.isDeleted,
      tags: finalTags
    });
  } catch (err) {
    console.error('Error updating note:', err);
    res.status(500).json({ error: 'Server error updating note.' });
  }
};

// Permanently delete a note from database
exports.deleteNote = async (req, res) => {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;

    const note = await dbQuery.get('SELECT * FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);
    if (!note) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    await dbQuery.run('DELETE FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);
    res.json({ message: 'Note permanently deleted.' });
  } catch (err) {
    console.error('Error deleting note:', err);
    res.status(500).json({ error: 'Server error deleting note.' });
  }
};

// Patch note Pinned status
exports.patchPin = async (req, res) => {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;
    const { isPinned } = req.body;

    const note = await dbQuery.get('SELECT * FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);
    if (!note) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    // Toggle if no value specified, or use specified value
    let newPinVal = isPinned !== undefined ? (isPinned ? 1 : 0) : (note.isPinned ? 0 : 1);
    
    // If pinning a note, un-archive it (standard Keep behavior)
    let newArchiveVal = note.isArchived;
    if (newPinVal === 1) {
      newArchiveVal = 0;
    }

    await dbQuery.run(
      'UPDATE notes SET isPinned = ?, isArchived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [newPinVal, newArchiveVal, noteId, userId]
    );

    res.json({
      message: newPinVal ? 'Note pinned.' : 'Note unpinned.',
      id: noteId,
      isPinned: !!newPinVal,
      isArchived: !!newArchiveVal
    });
  } catch (err) {
    console.error('Error toggling pin:', err);
    res.status(500).json({ error: 'Server error updating pin.' });
  }
};

// Patch note Archived status
exports.patchArchive = async (req, res) => {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;
    const { isArchived } = req.body;

    const note = await dbQuery.get('SELECT * FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);
    if (!note) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    // Toggle or use body val
    let newArchiveVal = isArchived !== undefined ? (isArchived ? 1 : 0) : (note.isArchived ? 0 : 1);

    // If archiving, we MUST unpin it (standard Keep behavior)
    let newPinVal = note.isPinned;
    if (newArchiveVal === 1) {
      newPinVal = 0;
    }

    await dbQuery.run(
      'UPDATE notes SET isArchived = ?, isPinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [newArchiveVal, newPinVal, noteId, userId]
    );

    res.json({
      message: newArchiveVal ? 'Note archived.' : 'Note unarchived.',
      id: noteId,
      isArchived: !!newArchiveVal,
      isPinned: !!newPinVal
    });
  } catch (err) {
    console.error('Error toggling archive:', err);
    res.status(500).json({ error: 'Server error updating archive.' });
  }
};

// Patch note Trash status (moves to trash or restores it)
exports.patchTrash = async (req, res) => {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;
    const { isDeleted } = req.body;

    const note = await dbQuery.get('SELECT * FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);
    if (!note) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    let newTrashVal = isDeleted !== undefined ? (isDeleted ? 1 : 0) : (note.isDeleted ? 0 : 1);

    // Trashed notes should be unpinned and unarchived automatically
    let newPinVal = note.isPinned;
    let newArchiveVal = note.isArchived;
    if (newTrashVal === 1) {
      newPinVal = 0;
      newArchiveVal = 0;
    }

    await dbQuery.run(
      'UPDATE notes SET isDeleted = ?, isPinned = ?, isArchived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [newTrashVal, newPinVal, newArchiveVal, noteId, userId]
    );

    res.json({
      message: newTrashVal ? 'Note moved to Trash.' : 'Note restored from Trash.',
      id: noteId,
      isDeleted: !!newTrashVal,
      isPinned: !!newPinVal,
      isArchived: !!newArchiveVal
    });
  } catch (err) {
    console.error('Error toggling trash:', err);
    res.status(500).json({ error: 'Server error updating trash status.' });
  }
};

// --- Tags Controllers ---
exports.getTags = async (req, res) => {
  try {
    const userId = req.user.id;
    const tags = await dbQuery.all('SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC', [userId]);
    res.json(tags);
  } catch (err) {
    console.error('Error fetching tags:', err);
    res.status(500).json({ error: 'Server error fetching tags.' });
  }
};

exports.createTag = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tag name cannot be empty.' });
    }

    const tagName = name.trim();

    // Check if tag already exists for user
    const existingTag = await dbQuery.get('SELECT * FROM tags WHERE user_id = ? AND name = ?', [userId, tagName]);
    if (existingTag) {
      return res.status(400).json({ error: 'Tag already exists.' });
    }

    const result = await dbQuery.run('INSERT INTO tags (user_id, name) VALUES (?, ?)', [userId, tagName]);
    res.status(201).json({ id: result.id, user_id: userId, name: tagName });
  } catch (err) {
    console.error('Error creating tag:', err);
    res.status(500).json({ error: 'Server error creating tag.' });
  }
};

exports.deleteTag = async (req, res) => {
  try {
    const userId = req.user.id;
    const tagId = req.params.id;

    const tag = await dbQuery.get('SELECT * FROM tags WHERE id = ? AND user_id = ?', [tagId, userId]);
    if (!tag) {
      return res.status(404).json({ error: 'Tag not found.' });
    }

    await dbQuery.run('DELETE FROM tags WHERE id = ? AND user_id = ?', [tagId, userId]);
    res.json({ message: 'Tag deleted successfully.' });
  } catch (err) {
    console.error('Error deleting tag:', err);
    res.status(500).json({ error: 'Server error deleting tag.' });
  }
};

exports.updateTag = async (req, res) => {
  try {
    const userId = req.user.id;
    const tagId = req.params.id;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tag name cannot be empty.' });
    }

    const tagName = name.trim();

    // Check if tag exists
    const tag = await dbQuery.get('SELECT * FROM tags WHERE id = ? AND user_id = ?', [tagId, userId]);
    if (!tag) {
      return res.status(404).json({ error: 'Tag not found.' });
    }

    // Check if new name already exists for this user (and it's a different tag)
    const existingTag = await dbQuery.get('SELECT * FROM tags WHERE user_id = ? AND name = ? AND id != ?', [userId, tagName, tagId]);
    if (existingTag) {
      return res.status(400).json({ error: 'Another tag with this name already exists.' });
    }

    await dbQuery.run('UPDATE tags SET name = ? WHERE id = ? AND user_id = ?', [tagName, tagId, userId]);
    res.json({ message: 'Tag updated successfully.', id: tagId, name: tagName });
  } catch (err) {
    console.error('Error updating tag:', err);
    res.status(500).json({ error: 'Server error updating tag.' });
  }
};

