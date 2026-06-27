// API Base URL (Relative paths since server serves frontend statically)
const API_BASE = '';

// App State
const state = {
  user: null,
  notes: [],
  tags: [],
  currentView: 'notes', // 'notes', 'archive', 'trash', 'tag:<tagName>'
  searchQuery: '',
  viewLayout: 'grid', // 'grid' or 'list'
  theme: 'light',
  
  // Creator state
  creatorColor: '#ffffff',
  creatorTags: new Set(),
  creatorType: 'text', // 'text' or 'checklist'
  creatorReminder: null, // ISO string or null
  creatorImage: null, // Base64 data URL or null
  creatorVoice: null, // Base64 data URL or null
  
  // Modal Edit state
  selectedNote: null,
  selectedNoteTags: new Set(),
  editType: 'text', // 'text' or 'checklist'
  editReminder: null, // ISO string or null
  editImage: null, // Base64 data URL or null
  editVoice: null, // Base64 data URL or null
  
  creatorSaving: false
};

const notifiedReminders = new Set();

// ====================================================
// UTILITY HELPERS (XSS Escaping & Search Highlighting)
// ====================================================
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function highlightText(text, query) {
  const escapedText = escapeHTML(text);
  if (!query) return escapedText;
  const escapedQuery = escapeHTML(query).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
}

function isChecklist(content) {
  if (!content) return false;
  return /^\s*\[[ xX]\]\s/m.test(content);
}

function renderChecklist(content, noteId) {
  const lines = content.split('\n');
  let html = '<div class="checklist-container">';
  lines.forEach((line, idx) => {
    let cleanLine = line.trim();
    let isChecked = false;
    let hasMatch = false;
    
    // Self-healing loop to strip duplicate/redundant checkbox brackets (e.g. [ ] [ ] task)
    while (true) {
      const match = cleanLine.match(/^\[([ xX])\]\s*(.*)$/);
      if (match) {
        isChecked = isChecked || match[1].toLowerCase() === 'x';
        cleanLine = match[2].trim();
        hasMatch = true;
      } else {
        break;
      }
    }

    if (hasMatch) {
      const checkedAttr = isChecked ? 'checked' : '';
      const textClass = isChecked ? 'checklist-text completed' : 'checklist-text';
      html += `
        <div class="checklist-row">
          <input type="checkbox" class="checklist-cb" data-note-id="${noteId}" data-line="${idx}" ${checkedAttr}>
          <span class="${textClass}">${escapeHTML(cleanLine)}</span>
        </div>
      `;
    } else {
      if (line.trim()) {
        html += `<div class="checklist-plain-line">${escapeHTML(line)}</div>`;
      }
    }
  });
  html += '</div>';
  return html;
}

// ====================================================
// INITIALIZATION
// ====================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initLayout();
  checkAuth();
  setupEventListeners();
});

// Theme setup (Always light theme for premium SaaS UI)
function initTheme() {
  state.theme = 'light';
  document.documentElement.setAttribute('data-theme', 'light');
}

// Layout setup
function initLayout() {
  const savedLayout = localStorage.getItem('noteland-layout');
  if (savedLayout) {
    state.viewLayout = savedLayout;
  }
  updateLayoutIcon();
}

function updateLayoutIcon() {
  const viewIcon = document.getElementById('view-icon');
  if (!viewIcon) return;
  if (state.viewLayout === 'list') {
    viewIcon.setAttribute('data-lucide', 'layout-grid');
  } else {
    viewIcon.setAttribute('data-lucide', 'stretch-horizontal');
  }
  lucide.createIcons();
}

// ====================================================
// TOAST NOTIFICATIONS
// ====================================================
function showToast(message, type = 'success', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'warning') iconName = 'alert-triangle';
  if (type === 'danger') iconName = 'alert-octagon';

  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  // Trigger Slide In
  setTimeout(() => {
    toast.style.opacity = '1';
  }, 10);

  // Auto Dismiss
  setTimeout(() => {
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, duration);
}

// ====================================================
// API HELPERS
// ====================================================
async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  
  // Set credentials to send/receive cookies
  options.credentials = 'include';
  options.headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (options.body && typeof options.body === 'object') {
    options.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      // If unauthorized and we're not trying to log in/register or check session, bounce to login
      if (response.status === 401 && !['/login', '/register', '/me'].includes(endpoint)) {
        handleUnauthorized();
      }
      throw new Error(data.error || `HTTP error! Status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`API Call failed to ${endpoint}:`, error.message);
    throw error;
  }
}

function handleUnauthorized() {
  state.user = null;
  document.getElementById('app-container').classList.add('hidden');
  document.getElementById('auth-section').classList.remove('hidden');
  showToast('Session expired. Please log in again.', 'warning');
}

// ====================================================
// AUTHENTICATION LOGIC
// ====================================================
// ====================================================
// AUTHENTICATION LOGIC (Bypassed for single-user mode)
// ====================================================
async function checkAuth() {
  try {
    const data = await apiCall('/me');
    if (data && data.user) {
      state.user = data.user;
    } else {
      state.user = { name: 'NoteLand User', email: 'user@noteland.com' };
    }
  } catch (err) {
    state.user = { name: 'NoteLand User', email: 'user@noteland.com' };
  }
  showApp();
}

function showApp() {
  // Set User Profile initials and dropdown info
  if (state.user) {
    document.getElementById('user-initials').innerText = state.user.name.charAt(0).toUpperCase();
    document.getElementById('profile-user-name').innerText = state.user.name;
    document.getElementById('profile-user-email').innerText = state.user.email;
  }
  
  // Fetch notes and tags
  fetchNotes();
  fetchTags();
  
  lucide.createIcons();
}

// ====================================================
// DATA FETCHING
// ====================================================
async function fetchNotes() {
  try {
    const notes = await apiCall('/notes');
    state.notes = notes;
    renderNotes();
  } catch (err) {
    showToast('Failed to load notes.', 'danger');
  }
}

async function fetchTags() {
  try {
    const tags = await apiCall('/tags');
    state.tags = tags;
    renderSidebarTags();
    renderTagDropdowns();
  } catch (err) {
    console.error('Failed to load tags:', err);
  }
}

// ====================================================
// RENDER VIEWS
// ====================================================
function renderNotes() {
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  
  // Show clear button in search if search has text
  if (state.searchQuery) {
    searchClear.classList.remove('hidden');
  } else {
    searchClear.classList.add('hidden');
  }

  // Filter notes
  let filteredNotes = state.notes;

  // 1. Filter by Current Sidebar View
  if (state.currentView === 'notes') {
    filteredNotes = filteredNotes.filter(n => !n.isArchived && !n.isDeleted);
    document.getElementById('view-title-display').innerText = 'Notes';
    document.getElementById('creator-section').classList.remove('hidden');
    document.getElementById('trash-alert').classList.add('hidden');
  } else if (state.currentView === 'archive') {
    filteredNotes = filteredNotes.filter(n => n.isArchived && !n.isDeleted);
    document.getElementById('view-title-display').innerText = 'Archive';
    document.getElementById('creator-section').classList.add('hidden');
    document.getElementById('trash-alert').classList.add('hidden');
  } else if (state.currentView === 'trash') {
    filteredNotes = filteredNotes.filter(n => n.isDeleted);
    document.getElementById('view-title-display').innerText = 'Trash';
    document.getElementById('creator-section').classList.add('hidden');
    document.getElementById('trash-alert').classList.remove('hidden');
  } else if (state.currentView.startsWith('tag:')) {
    const tagName = state.currentView.split('tag:')[1];
    filteredNotes = filteredNotes.filter(n => !n.isDeleted && !n.isArchived && n.tags.some(t => t.name === tagName));
    document.getElementById('view-title-display').innerText = `Label: ${tagName}`;
    document.getElementById('creator-section').classList.remove('hidden');
    document.getElementById('trash-alert').classList.add('hidden');
  }

  // 2. Filter by Search Query
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    filteredNotes = filteredNotes.filter(n => {
      const matchTitle = n.title && n.title.toLowerCase().includes(query);
      const matchContent = n.content && n.content.toLowerCase().includes(query);
      const matchTags = n.tags && n.tags.some(t => t.name.toLowerCase().includes(query));
      return matchTitle || matchContent || matchTags;
    });
    document.getElementById('view-title-display').innerText = `Search Results: "${state.searchQuery}"`;
  }

  // Split into Pinned and Others
  const pinnedNotes = filteredNotes.filter(n => n.isPinned);
  const otherNotes = filteredNotes.filter(n => !n.isPinned);

  const pinnedGrid = document.getElementById('pinned-notes-grid');
  const othersGrid = document.getElementById('notes-grid');
  const pinnedWrapper = document.getElementById('pinned-section-wrapper');
  const othersTitle = document.getElementById('others-title');
  const emptyState = document.getElementById('empty-state');

  // Clear Grids
  pinnedGrid.innerHTML = '';
  othersGrid.innerHTML = '';

  // Render Pinned Notes
  if (pinnedNotes.length > 0) {
    pinnedWrapper.classList.remove('hidden');
    distributeNotesToMasonry(pinnedGrid, pinnedNotes);
    othersTitle.classList.remove('hidden');
  } else {
    pinnedWrapper.classList.add('hidden');
    othersTitle.classList.add('hidden');
  }

  // Render Other Notes
  distributeNotesToMasonry(othersGrid, otherNotes);

  // Empty State logic
  if (filteredNotes.length === 0) {
    emptyState.classList.remove('hidden');
    updateEmptyStateContent();
  } else {
    emptyState.classList.add('hidden');
  }

  lucide.createIcons();
}

function distributeNotesToMasonry(grid, notes) {
  grid.innerHTML = '';
  if (notes.length === 0) return;
  
  if (state.viewLayout === 'list') {
    grid.classList.remove('grid-view');
    grid.classList.add('list-view');
    notes.forEach(note => {
      grid.appendChild(createNoteCard(note));
    });
    return;
  }
  
  grid.classList.remove('list-view');
  grid.classList.add('grid-view');
  
  // Calculate dynamic column count based on current viewport
  let colCount = 3;
  if (window.innerWidth < 640) {
    colCount = 1;
  } else if (window.innerWidth < 1024) {
    colCount = 2;
  }
  
  const columns = [];
  for (let i = 0; i < colCount; i++) {
    const col = document.createElement('div');
    col.className = 'masonry-column';
    grid.appendChild(col);
    columns.push(col);
  }
  
  notes.forEach((note, idx) => {
    const card = createNoteCard(note);
    columns[idx % colCount].appendChild(card);
  });
}

function updateEmptyStateContent() {
  const icon = document.getElementById('empty-icon');
  const title = document.getElementById('empty-title');
  const subtitle = document.getElementById('empty-subtitle');

  if (state.searchQuery) {
    icon.setAttribute('data-lucide', 'search');
    title.innerText = 'No matching notes found';
    subtitle.innerText = 'Try checking your spelling or searching for a different term.';
  } else if (state.currentView === 'notes') {
    icon.setAttribute('data-lucide', 'file-text');
    title.innerText = 'Notes you add appear here';
    subtitle.innerText = 'Click the creator box above to type a quick note.';
  } else if (state.currentView === 'archive') {
    icon.setAttribute('data-lucide', 'archive');
    title.innerText = 'Your archived notes appear here';
    subtitle.innerText = 'Move notes out of your main feed into the archive.';
  } else if (state.currentView === 'trash') {
    icon.setAttribute('data-lucide', 'trash-2');
    title.innerText = 'No notes in Trash';
    subtitle.innerText = 'Notes moved to trash will appear here.';
  } else if (state.currentView.startsWith('tag:')) {
    icon.setAttribute('data-lucide', 'tag');
    title.innerText = 'No notes with this label';
    subtitle.innerText = 'Add this label to a note to organize it.';
  }
  lucide.createIcons();
}

function createNoteCard(note) {
  const card = document.createElement('div');
  card.className = 'note-card';
  card.setAttribute('data-id', note.id);
  card.setAttribute('data-color', note.color || '#ffffff');

  // Drag and Drop bindings
  card.draggable = !note.isDeleted;
  
  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', note.id);
  });
  
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.note-card').forEach(c => c.classList.remove('drag-over'));
  });
  
  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!card.classList.contains('dragging')) {
      card.classList.add('drag-over');
    }
  });
  
  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over');
  });
  
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('drag-over');
    const draggedId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const targetId = note.id;
    if (draggedId && draggedId !== targetId) {
      handleNoteDrop(draggedId, targetId);
    }
  });

  // Pin button (visible on hover)
  const isPinned = note.isPinned;
  const pinClass = isPinned ? 'card-pin-btn pinned' : 'card-pin-btn';
  const pinIconFill = isPinned ? 'fill-current' : '';

  // Image Header HTML
  let imageHTML = '';
  if (note.image) {
    imageHTML = `
      <div class="card-image-header">
        <img src="${note.image}" alt="Note Image">
      </div>
    `;
  }

  // Voice Note Player HTML
  let voiceHTML = '';
  if (note.voice) {
    voiceHTML = `
      <div class="card-voice-player" style="margin-top: 8px;">
        <div class="voice-player-container">
          <button type="button" class="icon-btn-sm voice-play-card-btn" data-audio="${note.voice}" title="Play Recording">
            <i data-lucide="play" class="voice-play-card-icon"></i>
          </button>
          <div class="voice-progress-bar">
            <div class="voice-progress-fill voice-progress-card-fill"></div>
          </div>
          <span class="voice-duration">0:00</span>
        </div>
      </div>
    `;
  }

  // Tags HTML
  let tagsHTML = '';
  if (note.tags && note.tags.length > 0) {
    tagsHTML = `<div class="note-tags-container" style="margin-top: 8px; margin-bottom: 0;">
      ${note.tags.map(t => `<span class="tag-pill">${escapeHTML(t.name)}</span>`).join('')}
    </div>`;
  }

  // Reminder Chip HTML
  let reminderHTML = '';
  if (note.reminder) {
    const reminderDate = new Date(note.reminder);
    const isExpired = reminderDate < new Date();
    const expiredClass = isExpired ? 'expired' : '';
    const displayTime = formatReminderDate(reminderDate);
    reminderHTML = `
      <div class="reminder-chip ${expiredClass}" data-note-id="${note.id}">
        <i data-lucide="clock"></i>
        <span>${displayTime}</span>
      </div>
    `;
  }

  // Decide actions based on view
  let actionsHTML = '';
  if (note.isDeleted) {
    // Actions in Trash: Restore, Delete Permanently
    actionsHTML = `
      <button class="icon-btn-sm action-restore" title="Restore Note">
        <i data-lucide="rotate-ccw"></i>
      </button>
      <button class="icon-btn-sm action-delete-perm text-danger" title="Delete Permanently">
        <i data-lucide="trash-2"></i>
      </button>
    `;
  } else {
    // Regular actions: Color, Tag/Labels, Archive, Trash
    const isArchived = note.isArchived;
    actionsHTML = `
      <button class="icon-btn-sm action-archive" title="${isArchived ? 'Unarchive' : 'Archive'}">
        <i data-lucide="${isArchived ? 'folder-up' : 'archive'}"></i>
      </button>
      <button class="icon-btn-sm action-trash text-danger" title="Move to Trash">
        <i data-lucide="trash-2"></i>
      </button>
    `;
  }

  const contentHTML = isChecklist(note.content)
    ? `<div class="card-content">${renderChecklist(note.content, note.id)}</div>`
    : (note.content ? `<div class="card-content">${highlightText(note.content, state.searchQuery)}</div>` : '');

  card.innerHTML = `
    ${imageHTML}
    <button class="${pinClass}" title="${isPinned ? 'Unpin note' : 'Pin note'}">
      <i data-lucide="pin" class="${pinIconFill}"></i>
    </button>
    <div>
      ${note.title ? `<div class="card-title">${highlightText(note.title, state.searchQuery)}</div>` : ''}
      ${contentHTML}
      ${voiceHTML}
      <div class="note-metadata-container">
        ${tagsHTML}
        ${reminderHTML}
      </div>
    </div>
    <div class="card-actions">
      ${actionsHTML}
    </div>
  `;

  // Bind voice play button inside note card
  const voiceBtn = card.querySelector('.voice-play-card-btn');
  if (voiceBtn) {
    voiceBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Don't open edit modal
      const base64Audio = voiceBtn.getAttribute('data-audio');
      const progressFill = card.querySelector('.voice-progress-card-fill');
      const playIcon = voiceBtn.querySelector('i');
      playVoiceAudio(base64Audio, progressFill, playIcon);
    });
  }

  // Bind checklist toggles instantly
  card.querySelectorAll('.checklist-cb').forEach(cb => {
    cb.addEventListener('click', (e) => e.stopPropagation()); // Stop modal trigger
    cb.addEventListener('change', async (e) => {
      e.stopPropagation();
      const lineIdx = parseInt(cb.getAttribute('data-line'), 10);
      const isChecked = cb.checked;
      
      try {
        const lines = note.content.split('\n');
        const line = lines[lineIdx];
        const match = line.match(/^\s*\[([ xX])\]\s*(.*)$/);
        if (match) {
          lines[lineIdx] = `[${isChecked ? 'x' : ' '}] ${match[2]}`;
        }
        const updatedContent = lines.join('\n');
        
        const updatedNote = await apiCall(`/notes/${note.id}`, {
          method: 'PUT',
          body: {
            title: note.title,
            content: updatedContent,
            color: note.color,
            isPinned: note.isPinned,
            isArchived: note.isArchived,
            type: note.type,
            reminder: note.reminder,
            image: note.image,
            voice: note.voice,
            tags: note.tags.map(t => t.name)
          }
        });
        
        const idx = state.notes.findIndex(n => n.id === note.id);
        if (idx !== -1) {
          state.notes[idx] = updatedNote;
        }
        
        showToast(isChecked ? 'Item completed.' : 'Item unchecked.', 'success');
        renderNotes();
      } catch (err) {
        cb.checked = !isChecked; // Revert UI
        showToast('Failed to update item.', 'danger');
      }
    });
  });

  // Attach card event listeners
  card.addEventListener('click', (e) => {
    // Prevent trigger if clicking on buttons, tag pills, or checkboxes
    if (e.target.closest('button') || e.target.closest('.tag-pill') || e.target.closest('.checklist-cb') || e.target.closest('.reminder-chip')) return;
    if (note.isDeleted) return; // Can't edit trashed notes directly
    openEditModal(note);
  });

  // Pin Button Action
  card.querySelector('.card-pin-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const data = await apiCall(`/notes/pin/${note.id}`, { method: 'PATCH' });
      // Update local state
      const target = state.notes.find(n => n.id === note.id);
      if (target) {
        target.isPinned = data.isPinned;
        target.isArchived = data.isArchived; // Auto-unarchived if pinned
      }
      showToast(data.message, 'success');
      renderNotes();
    } catch (err) {
      showToast('Error updating pin status.', 'danger');
    }
  });

  if (note.isDeleted) {
    // Restore action
    card.querySelector('.action-restore').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const data = await apiCall(`/notes/trash/${note.id}`, { 
          method: 'PATCH',
          body: { isDeleted: false }
        });
        const target = state.notes.find(n => n.id === note.id);
        if (target) {
          target.isDeleted = false;
        }
        showToast(data.message, 'success');
        renderNotes();
      } catch (err) {
        showToast('Error restoring note.', 'danger');
      }
    });

    // Permanent delete action
    card.querySelector('.action-delete-perm').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Are you sure you want to permanently delete this note? This action cannot be undone.')) return;
      try {
        await apiCall(`/notes/${note.id}`, { method: 'DELETE' });
        state.notes = state.notes.filter(n => n.id !== note.id);
        showToast('Note deleted permanently.', 'success');
        renderNotes();
      } catch (err) {
        showToast('Error deleting note.', 'danger');
      }
    });
  } else {
    // Archive Action
    card.querySelector('.action-archive').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const data = await apiCall(`/notes/archive/${note.id}`, { method: 'PATCH' });
        const target = state.notes.find(n => n.id === note.id);
        if (target) {
          target.isArchived = data.isArchived;
          target.isPinned = data.isPinned;
        }
        showToast(data.message, 'success');
        renderNotes();
      } catch (err) {
        showToast('Error updating archive status.', 'danger');
      }
    });

    // Trash Action
    card.querySelector('.action-trash').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const data = await apiCall(`/notes/trash/${note.id}`, { 
          method: 'PATCH',
          body: { isDeleted: true }
        });
        const target = state.notes.find(n => n.id === note.id);
        if (target) {
          target.isDeleted = true;
          target.isPinned = false;
          target.isArchived = false;
        }
        showToast(data.message, 'success');
        renderNotes();
      } catch (err) {
        showToast('Error moving note to trash.', 'danger');
      }
    });
  }

  return card;
}

// Render Tags in sidebar
function renderSidebarTags() {
  const list = document.getElementById('sidebar-labels-list');
  if (!list) return;
  list.innerHTML = '';

  state.tags.forEach(tag => {
    const item = document.createElement('button');
    item.className = 'nav-item';
    item.setAttribute('data-view', `tag:${tag.name}`);
    if (state.currentView === `tag:${tag.name}`) {
      item.classList.add('active');
    }

    item.innerHTML = `
      <i data-lucide="tag"></i>
      <span>${tag.name}</span>
    `;

    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
      item.classList.add('active');
      state.currentView = `tag:${tag.name}`;
      renderNotes();
      
      // Close sidebar drawer on mobile
      if (window.innerWidth <= 768) {
        document.getElementById('app-sidebar').classList.remove('active');
      }
    });

    list.appendChild(item);
  });
  lucide.createIcons();
}

// Render dynamic tag list checkboxes inside note creator dropdown & edit modal dropdown
function renderTagDropdowns() {
  const creatorDropdown = document.getElementById('creator-tag-dropdown');
  const editDropdown = document.getElementById('edit-tag-dropdown');

  const populate = (dropdown, activeSet, onToggle) => {
    if (!dropdown) return;
    dropdown.innerHTML = '';
    
    if (state.tags.length === 0) {
      dropdown.innerHTML = '<div style="padding: 6px 8px; font-size: 0.8rem; color: var(--text-muted);">No labels created yet.</div>';
      return;
    }

    state.tags.forEach(tag => {
      const option = document.createElement('div');
      option.className = 'tag-option';
      
      const checked = activeSet.has(tag.name) ? 'checked' : '';
      option.innerHTML = `
        <input type="checkbox" id="tag-${dropdown.id}-${tag.id}" ${checked}>
        <label for="tag-${dropdown.id}-${tag.id}" style="cursor:pointer; flex:1;">${tag.name}</label>
      `;

      option.querySelector('input').addEventListener('change', (e) => {
        onToggle(tag.name, e.target.checked);
      });

      // Clicking option wrapper checks checkbox
      option.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        const cb = option.querySelector('input');
        cb.checked = !cb.checked;
        onToggle(tag.name, cb.checked);
      });

      dropdown.appendChild(option);
    });
  };

  // Creator checklist toggle
  populate(creatorDropdown, state.creatorTags, (tagName, isChecked) => {
    if (isChecked) {
      state.creatorTags.add(tagName);
    } else {
      state.creatorTags.delete(tagName);
    }
    renderCreatorTagsPills();
  });

  // Edit Checklist toggle
  if (state.selectedNote) {
    populate(editDropdown, state.selectedNoteTags, (tagName, isChecked) => {
      if (isChecked) {
        state.selectedNoteTags.add(tagName);
      } else {
        state.selectedNoteTags.delete(tagName);
      }
      renderEditTagsPills();
    });
  }
}

function renderCreatorTagsPills() {
  const container = document.getElementById('creator-tags-container');
  if (!container) return;
  
  if (state.creatorTags.size === 0) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = Array.from(state.creatorTags).map(tag => `
    <span class="tag-pill">
      <span>${tag}</span>
      <span class="tag-pill-delete" data-tag="${tag}">
        <i data-lucide="x" style="width:12px; height:12px;"></i>
      </span>
    </span>
  `).join('');

  // Attach delete events
  container.querySelectorAll('.tag-pill-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tag = btn.getAttribute('data-tag');
      state.creatorTags.delete(tag);
      renderCreatorTagsPills();
      renderTagDropdowns(); // Update checkboxes
    });
  });
  
  lucide.createIcons();
}

function renderEditTagsPills() {
  const container = document.getElementById('edit-tags-container');
  if (!container) return;

  if (state.selectedNoteTags.size === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = Array.from(state.selectedNoteTags).map(tag => `
    <span class="tag-pill">
      <span>${tag}</span>
      <span class="tag-pill-delete" data-tag="${tag}">
        <i data-lucide="x" style="width:12px; height:12px;"></i>
      </span>
    </span>
  `).join('');

  container.querySelectorAll('.tag-pill-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tag = btn.getAttribute('data-tag');
      state.selectedNoteTags.delete(tag);
      renderEditTagsPills();
      renderTagDropdowns(); // Update checkboxes
    });
  });
  
  lucide.createIcons();
}

// ====================================================
// MODAL FOR EDITING NOTES
// ====================================================
function openEditModal(note) {
  state.selectedNote = note;
  state.selectedNoteTags = new Set(note.tags.map(t => t.name));
  state.editType = note.type || 'text';
  state.editReminder = note.reminder || null;
  state.editImage = note.image || null;
  state.editVoice = note.voice || null;

  const modal = document.getElementById('edit-modal');
  const container = document.getElementById('modal-container-element');
  
  // Set Inputs
  document.getElementById('edit-title').value = note.title || '';
  document.getElementById('edit-content').value = note.content || '';
  
  // Apply note bg to modal container
  container.style.backgroundColor = note.color || '#ffffff';
  container.setAttribute('data-color', note.color || '#ffffff');

  // Set correct color swatch active inside edit modal
  document.querySelectorAll('.edit-form .color-swatch').forEach(swatch => {
    if (swatch.getAttribute('data-color') === (note.color || '#ffffff')) {
      swatch.classList.add('active');
    } else {
      swatch.classList.remove('active');
    }
  });

  // Pin active styling
  const pinBtn = document.getElementById('edit-pin-btn');
  if (note.isPinned) {
    pinBtn.classList.add('pinned');
  } else {
    pinBtn.classList.remove('pinned');
  }

  // Archive styling
  const archiveBtn = document.getElementById('edit-archive-btn');
  if (note.isArchived) {
    archiveBtn.style.color = 'var(--primary-color)';
  } else {
    archiveBtn.style.color = '';
  }

  // Image Preview Setup
  const imgPreview = document.getElementById('edit-image-preview');
  if (state.editImage) {
    imgPreview.querySelector('img').src = state.editImage;
    imgPreview.classList.remove('hidden');
  } else {
    imgPreview.classList.add('hidden');
  }

  // Voice Preview Setup
  const voicePreview = document.getElementById('edit-voice-preview');
  if (state.editVoice) {
    voicePreview.classList.remove('hidden');
    document.getElementById('edit-voice-progress').style.width = '0%';
  } else {
    voicePreview.classList.add('hidden');
  }
  document.getElementById('edit-voice-recording').classList.add('hidden');

  // Reminder Chip Setup
  updateReminderChip('edit');

  renderEditTagsPills();
  renderTagDropdowns();

  modal.classList.remove('hidden');
  
  // Auto grow content text-area
  const txtArea = document.getElementById('edit-content');
  txtArea.style.height = 'auto';
  txtArea.style.height = txtArea.scrollHeight + 'px';
  
  lucide.createIcons();
}

function closeEditModal() {
  const modal = document.getElementById('edit-modal');
  modal.classList.add('hidden');
  state.selectedNote = null;
  state.selectedNoteTags.clear();
  state.editType = 'text';
  state.editReminder = null;
  state.editImage = null;
  state.editVoice = null;

  // Stop any playing audio
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }

  document.getElementById('edit-image-preview').classList.add('hidden');
  document.getElementById('edit-voice-preview').classList.add('hidden');
  document.getElementById('edit-voice-recording').classList.add('hidden');
  document.getElementById('edit-reminder-chip').classList.add('hidden');
}

// ====================================================
// LABELS MANAGER MODAL
// ====================================================
function openLabelsModal() {
  document.getElementById('labels-modal').classList.remove('hidden');
  renderLabelsManagerList();
}

function closeLabelsModal() {
  document.getElementById('labels-modal').classList.add('hidden');
}

function renderLabelsManagerList() {
  const container = document.getElementById('labels-list-manager');
  if (!container) return;
  container.innerHTML = '';

  state.tags.forEach(tag => {
    const row = document.createElement('div');
    row.className = 'label-manager-item';
    row.innerHTML = `
      <i data-lucide="tag" style="width:16px; height:16px; margin-left: 8px;"></i>
      <input type="text" value="${tag.name}" id="input-tag-rename-${tag.id}">
      <div class="label-item-actions">
        <button class="icon-btn-sm btn-rename-save" data-id="${tag.id}" title="Rename Label" style="display:none;">
          <i data-lucide="check"></i>
        </button>
        <button class="icon-btn-sm btn-label-delete" data-id="${tag.id}" title="Delete Label">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;

    const input = row.querySelector('input');
    const saveBtn = row.querySelector('.btn-rename-save');

    // Show checkmark save button when user modifies tag name
    input.addEventListener('input', () => {
      if (input.value.trim() !== tag.name) {
        saveBtn.style.display = 'inline-flex';
      } else {
        saveBtn.style.display = 'none';
      }
    });

    // Rename tag action
    saveBtn.addEventListener('click', async () => {
      const newName = input.value.trim();
      if (!newName) return;
      try {
        // SQLite backend doesn't have an explicit PUT /tags/:id, but wait,
        // we can add a rename functionality to tags?
        // Let's check: the routes in schema didn't specify PUT /tags/:id, but we can easily delete the tag and recreate,
        // or just send a request. Oh, we don't have PUT /tags/:id in the backend router!
        // Rather than editing the backend, wait, let's implement rename by deleting and re-creating or we can implement it.
        // Wait, let's see. If the user renames a tag, since notes map to tag_id, updating the tag row renames it globally!
        // We can add a controller method or we can modify backend to support it. But wait, since we haven't written PUT /tags/:id,
        // let's see if we should write a patch/put tags endpoint. Yes, it's very simple.
        // Wait! We can also just make a POST or DELETE. But let's check: since we want to be professional,
        // let's support editing label names.
        // Wait, did we implement tag rename in routes/tags.js? No, tags.js has:
        // `GET /`, `POST /`, `DELETE /:id`.
        // Let's modify tags.js and notesController.js to support tag renaming! Or we can do it later.
        // Actually, we can add tag updating easily. Let's see: `PUT /tags/:id` is standard REST.
        // Wait! Let's write the controller updateTag method:
        // `UPDATE tags SET name = ? WHERE id = ? AND user_id = ?`.
        // Let's implement that! It's extremely professional.
        // For now, let's write code in app.js that makes a PUT request to `/tags/:id` with the new name.
        
        await apiCall(`/tags/${tag.id}`, {
          method: 'PUT',
          body: { name: newName }
        });
        
        showToast('Label renamed successfully.', 'success');
        fetchTags();
        fetchNotes();
      } catch (err) {
        showToast(err.message || 'Error renaming label.', 'danger');
      }
    });

    // Delete tag action
    row.querySelector('.btn-label-delete').addEventListener('click', async () => {
      if (!confirm(`Are you sure you want to delete the label "${tag.name}"? It will be removed from all notes.`)) return;
      try {
        await apiCall(`/tags/${tag.id}`, { method: 'DELETE' });
        showToast('Label deleted.', 'success');
        
        // If we were viewing this tag, switch view back to notes
        if (state.currentView === `tag:${tag.name}`) {
          state.currentView = 'notes';
          document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
          document.querySelector('.nav-item[data-view="notes"]').classList.add('active');
        }

        fetchTags();
        fetchNotes();
      } catch (err) {
        showToast('Error deleting label.', 'danger');
      }
    });

    container.appendChild(row);
  });
  lucide.createIcons();
}

// ====================================================
// EVENT LISTENERS
// ====================================================
function setupEventListeners() {
  
  // Profile dropdown menu toggle
  document.getElementById('profile-menu-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('profile-dropdown').classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown && !dropdown.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
    }
  });

  // Sidebar Toggling drawer
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    const sidebar = document.getElementById('app-sidebar');
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('active');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });

  // Sidebar navigation click filters
  document.querySelectorAll('.sidebar-nav > .nav-item').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      state.currentView = button.getAttribute('data-view');
      renderNotes();

      // Close sidebar drawer on mobile
      if (window.innerWidth <= 768) {
        document.getElementById('app-sidebar').classList.remove('active');
      }
    });
  });

  // Layout Toggle (Grid vs List)
  document.getElementById('view-toggle').addEventListener('click', () => {
    state.viewLayout = state.viewLayout === 'grid' ? 'list' : 'grid';
    localStorage.setItem('noteland-layout', state.viewLayout);
    updateLayoutIcon();
    renderNotes();
  });



  // Live Search Input with debouncing
  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = e.target.value;
      renderNotes();
    }, 150);
  });

  // Search Clear button
  document.getElementById('search-clear').addEventListener('click', () => {
    const input = document.getElementById('search-input');
    input.value = '';
    state.searchQuery = '';
    renderNotes();
  });

  // Escape key global listener for accessibility (closing modals & autosaving Keep-style)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const editModal = document.getElementById('edit-modal');
      const labelsModal = document.getElementById('labels-modal');
      if (editModal && !editModal.classList.contains('hidden')) {
        document.getElementById('edit-save-btn').click();
      }
      if (labelsModal && !labelsModal.classList.contains('hidden')) {
        closeLabelsModal();
      }
    }
  });

  // Empty Trash button
  document.getElementById('empty-trash-btn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to permanently delete all notes in the Trash? This cannot be undone.')) return;
    try {
      // Find all trashed notes
      const trashedNotes = state.notes.filter(n => n.isDeleted);
      for (const note of trashedNotes) {
        await apiCall(`/notes/${note.id}`, { method: 'DELETE' });
      }
      state.notes = state.notes.filter(n => !n.isDeleted);
      showToast('Trash emptied successfully.', 'success');
      renderNotes();
    } catch (err) {
      showToast('Error emptying trash.', 'danger');
    }
  });

  // ====================================================
  // NOTE CREATOR COMPONENT INTERACTIVE HANDLERS
  // ====================================================
  const creator = document.getElementById('note-creator');
  const closedState = document.getElementById('creator-closed');
  const openedState = document.getElementById('creator-form');
  const closeBtn = document.getElementById('creator-close-btn');
  const contentArea = document.getElementById('creator-content');

  // Expand Creator Form
  closedState.addEventListener('click', (e) => {
    e.stopPropagation();
    closedState.classList.add('hidden');
    openedState.classList.remove('hidden');
    document.getElementById('creator-title').focus();
    creator.style.backgroundColor = state.creatorColor;
    
    // Initial textarea auto-growth
    contentArea.style.height = 'auto';
  });

  // Expand Creator Form as Checklist
  const newListBtn = document.getElementById('creator-new-list-btn');
  if (newListBtn) {
    newListBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closedState.classList.add('hidden');
      openedState.classList.remove('hidden');
      contentArea.value = '[ ] ';
      contentArea.style.height = 'auto';
      contentArea.focus();
      contentArea.setSelectionRange(4, 4);
      creator.style.backgroundColor = state.creatorColor;
    });
  }

  // Auto-grow textarea rows and auto-insert checklist prefix on Enter key
  contentArea.addEventListener('input', () => {
    contentArea.style.height = 'auto';
    contentArea.style.height = contentArea.scrollHeight + 'px';
  });

  contentArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cursorPos = contentArea.selectionStart;
      const textBefore = contentArea.value.substring(0, cursorPos);
      const lines = textBefore.split('\n');
      const currentLine = lines[lines.length - 1];
      if (currentLine.match(/^\s*\[([ xX])\]/)) {
        e.preventDefault();
        const textAfter = contentArea.value.substring(cursorPos);
        contentArea.value = textBefore + '\n[ ] ' + textAfter;
        contentArea.setSelectionRange(cursorPos + 5, cursorPos + 5);
        contentArea.style.height = 'auto';
        contentArea.style.height = contentArea.scrollHeight + 'px';
      }
    }
  });

  // Color picker swatches
  document.querySelectorAll('.creator-form .color-swatch').forEach(swatch => {
    // Initial active class
    if (swatch.getAttribute('data-color') === '#ffffff') {
      swatch.classList.add('active');
    }
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      const color = swatch.getAttribute('data-color');
      state.creatorColor = color;
      creator.style.backgroundColor = color;
      
      document.querySelectorAll('.creator-form .color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
    });
  });

  // Pin Toggle inside Creator
  const pinBtn = document.getElementById('creator-pin-btn');
  pinBtn.addEventListener('click', () => {
    pinBtn.classList.toggle('pinned');
  });

  // Archive Toggle inside Creator
  const creatorArchiveBtn = document.getElementById('creator-archive-btn');
  let isCreatorArchived = false;
  creatorArchiveBtn.addEventListener('click', () => {
    isCreatorArchived = !isCreatorArchived;
    if (isCreatorArchived) {
      creatorArchiveBtn.style.color = 'var(--primary-color)';
      showToast('Note will be archived on creation.', 'info');
      // Unpin if archiving
      pinBtn.classList.remove('pinned');
    } else {
      creatorArchiveBtn.style.color = '';
    }
  });

  // Close Creator button (triggers Note save)
  const saveAndCloseCreator = async () => {
    if (state.creatorSaving) return;

    const title = document.getElementById('creator-title').value.trim();
    const content = contentArea.value.trim();
    const isPinned = pinBtn.classList.contains('pinned');

    // Save note if title or content or media exists
    if (title || content || state.creatorImage || state.creatorVoice) {
      try {
        state.creatorSaving = true;
        
        // Optimistic UI close
        openedState.classList.add('hidden');
        closedState.classList.remove('hidden');
        document.getElementById('creator-title').value = '';
        contentArea.value = '';
        contentArea.style.height = 'auto';
        creator.style.backgroundColor = '';
        pinBtn.classList.remove('pinned');
        creatorArchiveBtn.style.color = '';
        document.querySelectorAll('.creator-form .color-swatch').forEach(s => s.classList.remove('active'));
        const defaultSwatch = document.querySelector('.creator-form .color-swatch[data-color="#ffffff"]');
        if (defaultSwatch) defaultSwatch.classList.add('active');

        // Hide previews optimistically
        document.getElementById('creator-image-preview').classList.add('hidden');
        document.getElementById('creator-voice-preview').classList.add('hidden');
        document.getElementById('creator-reminder-chip').classList.add('hidden');

        const newNote = await apiCall('/notes', {
          method: 'POST',
          body: {
            title,
            content,
            color: state.creatorColor,
            isPinned,
            isArchived: isCreatorArchived,
            type: state.creatorType,
            reminder: state.creatorReminder,
            image: state.creatorImage,
            voice: state.creatorVoice,
            tags: Array.from(state.creatorTags)
          }
        });
        
        state.notes.unshift(newNote);
        showToast('Note created successfully.', 'success');
        renderNotes();
      } catch (err) {
        showToast('Error saving note.', 'danger');
        // Restore values on failure
        document.getElementById('creator-title').value = title;
        contentArea.value = content;
        openedState.classList.remove('hidden');
        closedState.classList.add('hidden');
        creator.style.backgroundColor = state.creatorColor;
      } finally {
        state.creatorSaving = false;
        state.creatorColor = '#ffffff';
        state.creatorTags.clear();
        state.creatorType = 'text';
        state.creatorReminder = null;
        state.creatorImage = null;
        state.creatorVoice = null;
        isCreatorArchived = false;
        renderCreatorTagsPills();
        renderTagDropdowns();
      }
    } else {
      // Just close
      openedState.classList.add('hidden');
      closedState.classList.remove('hidden');
      creator.style.backgroundColor = '';
      pinBtn.classList.remove('pinned');
      creatorArchiveBtn.style.color = '';
      
      document.querySelectorAll('.creator-form .color-swatch').forEach(s => s.classList.remove('active'));
      const defaultSwatch = document.querySelector('.creator-form .color-swatch[data-color="#ffffff"]');
      if (defaultSwatch) defaultSwatch.classList.add('active');

      document.getElementById('creator-image-preview').classList.add('hidden');
      document.getElementById('creator-voice-preview').classList.add('hidden');
      document.getElementById('creator-reminder-chip').classList.add('hidden');

      state.creatorColor = '#ffffff';
      state.creatorTags.clear();
      state.creatorType = 'text';
      state.creatorReminder = null;
      state.creatorImage = null;
      state.creatorVoice = null;
      isCreatorArchived = false;
      renderCreatorTagsPills();
      renderTagDropdowns();
    }
  };

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    saveAndCloseCreator();
  });

  // Click outside Creator closes & saves it
  document.addEventListener('click', (e) => {
    if (!creator.contains(e.target) && !openedState.classList.contains('hidden')) {
      // Don't close if they clicked dropdown tools
      if (e.target.closest('.color-picker-dropdown') || e.target.closest('.tag-selector-dropdown')) return;
      saveAndCloseCreator();
    }
  });

  // ====================================================
  // EDIT NOTE MODAL FORM HANDLERS
  // ====================================================
  const editModal = document.getElementById('edit-modal');
  const modalContainer = document.getElementById('modal-container-element');
  const editContentArea = document.getElementById('edit-content');

  // Auto-grow textarea rows during typing inside modal
  // Auto-grow textarea rows during typing inside modal and auto-insert checklist indicators
  editContentArea.addEventListener('input', () => {
    editContentArea.style.height = 'auto';
    editContentArea.style.height = editContentArea.scrollHeight + 'px';
  });

  editContentArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cursorPos = editContentArea.selectionStart;
      const textBefore = editContentArea.value.substring(0, cursorPos);
      const lines = textBefore.split('\n');
      const currentLine = lines[lines.length - 1];
      if (currentLine.match(/^\s*\[([ xX])\]/)) {
        e.preventDefault();
        const textAfter = editContentArea.value.substring(cursorPos);
        editContentArea.value = textBefore + '\n[ ] ' + textAfter;
        editContentArea.setSelectionRange(cursorPos + 5, cursorPos + 5);
        editContentArea.style.height = 'auto';
        editContentArea.style.height = editContentArea.scrollHeight + 'px';
      }
    }
  });

  // Edit Modal Color swatches
  document.querySelectorAll('.edit-form .color-swatch').forEach(swatch => {
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      const color = swatch.getAttribute('data-color');
      if (state.selectedNote) {
        state.selectedNote.color = color;
        modalContainer.style.backgroundColor = color;
        modalContainer.setAttribute('data-color', color);
        
        document.querySelectorAll('.edit-form .color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
      }
    });
  });

  // Pin Toggle inside Edit Modal
  const editPinBtn = document.getElementById('edit-pin-btn');
  editPinBtn.addEventListener('click', () => {
    editPinBtn.classList.toggle('pinned');
    if (state.selectedNote) {
      state.selectedNote.isPinned = editPinBtn.classList.contains('pinned');
      // If pinned, auto-unarchive
      if (state.selectedNote.isPinned) {
        state.selectedNote.isArchived = false;
        document.getElementById('edit-archive-btn').style.color = '';
      }
    }
  });

  // Archive Toggle inside Edit Modal
  const editArchiveBtn = document.getElementById('edit-archive-btn');
  editArchiveBtn.addEventListener('click', () => {
    if (state.selectedNote) {
      state.selectedNote.isArchived = !state.selectedNote.isArchived;
      if (state.selectedNote.isArchived) {
        editArchiveBtn.style.color = 'var(--primary-color)';
        // If archived, auto-unpin
        state.selectedNote.isPinned = false;
        editPinBtn.classList.remove('pinned');
        showToast('Note will be archived on save.', 'info');
      } else {
        editArchiveBtn.style.color = '';
        showToast('Note will be moved to feed on save.', 'info');
      }
    }
  });

  // Trash button inside Edit Modal
  document.getElementById('edit-trash-btn').addEventListener('click', async () => {
    if (!state.selectedNote) return;
    try {
      const data = await apiCall(`/notes/trash/${state.selectedNote.id}`, {
        method: 'PATCH',
        body: { isDeleted: true }
      });
      
      const target = state.notes.find(n => n.id === state.selectedNote.id);
      if (target) {
        target.isDeleted = true;
        target.isPinned = false;
        target.isArchived = false;
      }
      
      closeEditModal();
      showToast(data.message, 'success');
      renderNotes();
    } catch (err) {
      showToast('Error moving note to trash.', 'danger');
    }
  });

  // Submit Modal Save Form
  document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.selectedNote) return;

    const title = document.getElementById('edit-title').value.trim();
    const content = editContentArea.value.trim();

    try {
      const updatedNote = await apiCall(`/notes/${state.selectedNote.id}`, {
        method: 'PUT',
        body: {
          title,
          content,
          color: state.selectedNote.color,
          isPinned: state.selectedNote.isPinned,
          isArchived: state.selectedNote.isArchived,
          type: state.editType,
          reminder: state.editReminder,
          image: state.editImage,
          voice: state.editVoice,
          tags: Array.from(state.selectedNoteTags)
        }
      });

      // Update local state notes
      const idx = state.notes.findIndex(n => n.id === updatedNote.id);
      if (idx !== -1) {
        state.notes[idx] = updatedNote;
      }

      closeEditModal();
      showToast('Note updated successfully.', 'success');
      renderNotes();
    } catch (err) {
      showToast('Error updating note.', 'danger');
    }
  });

  // Click backdrop closes Modal
  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) {
      // Programmatically submit the form to save changes automatically on click outside (Google Keep behavior)
      document.getElementById('edit-save-btn').click();
    }
  });

  // ====================================================
  // TAGS MANAGER DIALOG ACTIONS
  // ====================================================
  document.getElementById('manage-labels-btn').addEventListener('click', openLabelsModal);
  document.getElementById('close-labels-modal').addEventListener('click', closeLabelsModal);
  document.getElementById('labels-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('labels-modal')) {
      closeLabelsModal();
    }
  });

  // Create Tag Action
  const createTagInput = document.getElementById('new-label-input');
  const addTagFunc = async () => {
    const tagName = createTagInput.value.trim();
    if (!tagName) return;

    try {
      const newTag = await apiCall('/tags', {
        method: 'POST',
        body: { name: tagName }
      });

      state.tags.push(newTag);
      createTagInput.value = '';
      showToast(`Label "${tagName}" created.`, 'success');
      
      // Update UI dropdowns and sidebar lists
      fetchTags();
      fetchNotes();
    } catch (err) {
      showToast(err.message || 'Error creating label.', 'danger');
    }
  };

  document.getElementById('btn-add-label').addEventListener('click', addTagFunc);
  createTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTagFunc();
    }
  });

  // Ctrl+K Search Focus Shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const input = document.getElementById('search-input');
      if (input) {
        input.focus();
        input.select();
      }
    }
  });

  // Floating Action Button (FAB)
  const fab = document.getElementById('fab-add-note');
  if (fab) {
    fab.addEventListener('click', () => {
      // 1. Switch back to Notes view if in another view
      if (state.currentView !== 'notes') {
        state.currentView = 'notes';
        // Highlight active nav item
        document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
        const notesNavItem = document.querySelector('.nav-item[data-view="notes"]');
        if (notesNavItem) notesNavItem.classList.add('active');
        renderNotes();
      }
      
      // 2. Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // 3. Open the creator widget
      const closedState = document.getElementById('creator-closed');
      const openedState = document.getElementById('creator-form');
      if (closedState && openedState) {
        closedState.classList.add('hidden');
        openedState.classList.remove('hidden');
        document.getElementById('creator-title').focus();
        const creatorEl = document.getElementById('note-creator');
        if (creatorEl) creatorEl.style.backgroundColor = state.creatorColor;
        
        // Initial textarea auto-growth
        const contentArea = document.getElementById('creator-content');
        if (contentArea) contentArea.style.height = 'auto';
      }
    });
  }

  // Creator Image Attachment Bindings
  const creatorImgBtn = document.getElementById('creator-image-btn');
  const creatorImgInput = document.getElementById('creator-image-file-input');
  const creatorImgRemove = document.getElementById('creator-remove-image-btn');

  if (creatorImgBtn && creatorImgInput) {
    creatorImgBtn.addEventListener('click', () => creatorImgInput.click());
    creatorImgInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          state.creatorImage = ev.target.result;
          const preview = document.getElementById('creator-image-preview');
          preview.querySelector('img').src = state.creatorImage;
          preview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
      }
    });
  }
  if (creatorImgRemove) {
    creatorImgRemove.addEventListener('click', () => {
      state.creatorImage = null;
      document.getElementById('creator-image-preview').classList.add('hidden');
      creatorImgInput.value = '';
    });
  }

  // Creator Voice Note Recording Bindings
  const creatorVoiceBtn = document.getElementById('creator-voice-btn');
  const creatorVoiceStopBtn = document.getElementById('creator-voice-stop-btn');
  const creatorVoiceRemove = document.getElementById('creator-remove-voice-btn');
  const creatorVoicePlay = document.getElementById('creator-voice-play-btn');

  if (creatorVoiceBtn) {
    creatorVoiceBtn.addEventListener('click', () => startVoiceRecording(false));
  }
  if (creatorVoiceStopBtn) {
    creatorVoiceStopBtn.addEventListener('click', () => stopVoiceRecording());
  }
  if (creatorVoiceRemove) {
    creatorVoiceRemove.addEventListener('click', () => {
      state.creatorVoice = null;
      document.getElementById('creator-voice-preview').classList.add('hidden');
    });
  }
  if (creatorVoicePlay) {
    creatorVoicePlay.addEventListener('click', () => {
      if (state.creatorVoice) {
        const fill = document.getElementById('creator-voice-progress');
        const icon = document.getElementById('creator-voice-play-icon');
        playVoiceAudio(state.creatorVoice, fill, icon);
      }
    });
  }

  // Creator Reminder Bindings
  const creatorReminderInput = document.getElementById('creator-reminder-input');
  const creatorReminderSave = document.getElementById('creator-reminder-save');
  const creatorReminderRemove = document.getElementById('creator-remove-reminder-btn');

  document.querySelectorAll('#creator-reminder-dropdown .reminder-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const preset = btn.getAttribute('data-preset');
      setReminderPreset(preset, 'creator');
    });
  });

  if (creatorReminderSave && creatorReminderInput) {
    creatorReminderSave.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = creatorReminderInput.value;
      if (val) {
        state.creatorReminder = new Date(val).toISOString();
        updateReminderChip('creator');
        showToast('Reminder set.', 'success');
        document.getElementById('creator-reminder-dropdown').style.display = 'none';
      }
    });
  }
  if (creatorReminderRemove) {
    creatorReminderRemove.addEventListener('click', () => {
      state.creatorReminder = null;
      updateReminderChip('creator');
    });
  }

  // Creator Checklist Toggle Button
  const creatorTypeBtn = document.getElementById('creator-type-btn');
  if (creatorTypeBtn) {
    creatorTypeBtn.addEventListener('click', () => toggleNoteType(false));
  }

  // Edit Modal Image Attachment Bindings
  const editImgBtn = document.getElementById('edit-image-btn');
  const editImgInput = document.getElementById('edit-image-file-input');
  const editImgRemove = document.getElementById('edit-remove-image-btn');

  if (editImgBtn && editImgInput) {
    editImgBtn.addEventListener('click', () => editImgInput.click());
    editImgInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          state.editImage = ev.target.result;
          const preview = document.getElementById('edit-image-preview');
          preview.querySelector('img').src = state.editImage;
          preview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
      }
    });
  }
  if (editImgRemove) {
    editImgRemove.addEventListener('click', () => {
      state.editImage = null;
      document.getElementById('edit-image-preview').classList.add('hidden');
      editImgInput.value = '';
    });
  }

  // Edit Modal Voice Note recording Bindings
  const editVoiceBtn = document.getElementById('edit-voice-btn');
  const editVoiceStopBtn = document.getElementById('edit-voice-stop-btn');
  const editVoiceRemove = document.getElementById('edit-remove-voice-btn');
  const editVoicePlay = document.getElementById('edit-voice-play-btn');

  if (editVoiceBtn) {
    editVoiceBtn.addEventListener('click', () => startVoiceRecording(true));
  }
  if (editVoiceStopBtn) {
    editVoiceStopBtn.addEventListener('click', () => stopVoiceRecording());
  }
  if (editVoiceRemove) {
    editVoiceRemove.addEventListener('click', () => {
      state.editVoice = null;
      document.getElementById('edit-voice-preview').classList.add('hidden');
    });
  }
  if (editVoicePlay) {
    editVoicePlay.addEventListener('click', () => {
      if (state.editVoice) {
        const fill = document.getElementById('edit-voice-progress');
        const icon = document.getElementById('edit-voice-play-icon');
        playVoiceAudio(state.editVoice, fill, icon);
      }
    });
  }

  // Edit Modal Reminder Bindings
  const editReminderInput = document.getElementById('edit-reminder-input');
  const editReminderSave = document.getElementById('edit-reminder-save');
  const editReminderRemove = document.getElementById('edit-remove-reminder-btn');

  document.querySelectorAll('#edit-reminder-dropdown .reminder-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const preset = btn.getAttribute('data-preset');
      setReminderPreset(preset, 'edit');
    });
  });

  if (editReminderSave && editReminderInput) {
    editReminderSave.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = editReminderInput.value;
      if (val) {
        state.editReminder = new Date(val).toISOString();
        updateReminderChip('edit');
        showToast('Reminder set.', 'success');
        document.getElementById('edit-reminder-dropdown').style.display = 'none';
      }
    });
  }
  if (editReminderRemove) {
    editReminderRemove.addEventListener('click', () => {
      state.editReminder = null;
      updateReminderChip('edit');
    });
  }

  // Edit Modal Checklist Toggle Button
  const editTypeBtn = document.getElementById('edit-type-btn');
  if (editTypeBtn) {
    editTypeBtn.addEventListener('click', () => toggleNoteType(true));
  }
}

// ====================================================
// SAAS FEATURES EXTRA HELPERS
// ====================================================

// Reminders Helpers
function setReminderPreset(preset, mode) {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  const date = new Date();
  if (preset === 'today') {
    date.setHours(20, 0, 0, 0); // Today 8:00 PM
  } else if (preset === 'tomorrow') {
    date.setDate(date.getDate() + 1);
    date.setHours(8, 0, 0, 0); // Tomorrow 8:00 AM
  } else if (preset === 'next-week') {
    const daysTillMon = (1 - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + daysTillMon);
    date.setHours(8, 0, 0, 0); // Next Monday 8:00 AM
  }
  
  const iso = date.toISOString();
  if (mode === 'creator') {
    state.creatorReminder = iso;
    updateReminderChip('creator');
    document.getElementById('creator-reminder-dropdown').style.display = 'none';
  } else {
    state.editReminder = iso;
    updateReminderChip('edit');
    document.getElementById('edit-reminder-dropdown').style.display = 'none';
  }
  showToast('Reminder set successfully.', 'success');
}

function updateReminderChip(mode) {
  const chip = document.getElementById(`${mode}-reminder-chip`);
  const display = document.getElementById(`${mode}-reminder-time-display`);
  const val = mode === 'creator' ? state.creatorReminder : state.editReminder;
  
  if (val) {
    const d = new Date(val);
    display.innerText = formatReminderDate(d);
    chip.classList.remove('hidden');
    if (d < new Date()) {
      chip.classList.add('expired');
    } else {
      chip.classList.remove('expired');
    }
  } else {
    chip.classList.add('hidden');
  }
}

function formatReminderDate(date) {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today, ${timeStr}`;
  if (isTomorrow) return `Tomorrow, ${timeStr}`;
  
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
}

// Checklist Converter
function toggleNoteType(isEditMode = false) {
  if (isEditMode) {
    const contentArea = document.getElementById('edit-content');
    const text = contentArea.value;
    if (state.editType === 'text') {
      state.editType = 'checklist';
      contentArea.value = text.split('\n').map(line => {
        if (line.trim().match(/^\[([ xX])\]/)) return line;
        return `[ ] ${line}`;
      }).join('\n');
      showToast('Converted note to checklist.', 'info');
    } else {
      state.editType = 'text';
      contentArea.value = text.split('\n').map(line => {
        return line.replace(/^\s*\[([ xX])\]\s*/, '');
      }).join('\n');
      showToast('Converted checklist to text.', 'info');
    }
  } else {
    const contentArea = document.getElementById('creator-content');
    const text = contentArea.value;
    if (state.creatorType === 'text') {
      state.creatorType = 'checklist';
      contentArea.value = text.split('\n').map(line => {
        if (line.trim().match(/^\[([ xX])\]/)) return line;
        return `[ ] ${line}`;
      }).join('\n');
      showToast('Converted note to checklist.', 'info');
    } else {
      state.creatorType = 'text';
      contentArea.value = text.split('\n').map(line => {
        return line.replace(/^\s*\[([ xX])\]\s*/, '');
      }).join('\n');
      showToast('Converted checklist to text.', 'info');
    }
  }
}

// Voice Note Recording
let mediaRecorder;
let audioChunks = [];
let recordingTimerInterval;
let recordingStartTime;

async function startVoiceRecording(isEditMode = false) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };
    
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Audio = event.target.result;
        if (isEditMode) {
          state.editVoice = base64Audio;
          showVoicePreview(base64Audio, 'edit');
        } else {
          state.creatorVoice = base64Audio;
          showVoicePreview(base64Audio, 'creator');
        }
      };
      reader.readAsDataURL(audioBlob);
      stream.getTracks().forEach(track => track.stop()); // close microphone
    };
    
    mediaRecorder.start();
    recordingStartTime = Date.now();
    
    if (isEditMode) {
      document.getElementById('edit-voice-recording').classList.remove('hidden');
      updateRecordingTimeDisplay('edit');
    } else {
      document.getElementById('creator-voice-recording').classList.remove('hidden');
      updateRecordingTimeDisplay('creator');
    }
  } catch (err) {
    console.error('Mic access denied:', err);
    showToast('Permission to access microphone was denied.', 'danger');
  }
}

function stopVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  clearInterval(recordingTimerInterval);
  document.getElementById('creator-voice-recording').classList.add('hidden');
  document.getElementById('edit-voice-recording').classList.add('hidden');
}

function updateRecordingTimeDisplay(mode) {
  const display = document.getElementById(`${mode}-recording-time`);
  recordingTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    display.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
  }, 1000);
}

function showVoicePreview(base64Audio, mode) {
  const preview = document.getElementById(`${mode}-voice-preview`);
  preview.classList.remove('hidden');
  const dur = document.getElementById(`${mode}-voice-duration`);
  
  const a = new Audio(base64Audio);
  a.addEventListener('loadedmetadata', () => {
    const m = Math.floor(a.duration / 60);
    const s = Math.floor(a.duration % 60);
    dur.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
  });
}

// Voice Note Playback
let activeAudio = null;
let activeProgressFill = null;
let activePlayIcon = null;

function playVoiceAudio(base64Audio, progressFillElement, playIconElement) {
  if (activeAudio && activeAudio.src === base64Audio) {
    if (activeAudio.paused) {
      activeAudio.play();
      playIconElement.className = 'lucide lucide-pause';
      lucide.createIcons();
    } else {
      activeAudio.pause();
      playIconElement.className = 'lucide lucide-play';
      lucide.createIcons();
    }
    return;
  }
  
  if (activeAudio) {
    activeAudio.pause();
    if (activePlayIcon) {
      activePlayIcon.className = 'lucide lucide-play';
    }
  }
  
  const audio = new Audio(base64Audio);
  activeAudio = audio;
  activeProgressFill = progressFillElement;
  activePlayIcon = playIconElement;
  
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      const pct = (audio.currentTime / audio.duration) * 100;
      progressFillElement.style.width = `${pct}%`;
    }
  });
  
  audio.addEventListener('ended', () => {
    progressFillElement.style.width = '0%';
    playIconElement.className = 'lucide lucide-play';
    lucide.createIcons();
    activeAudio = null;
  });
  
  audio.play();
  playIconElement.className = 'lucide lucide-pause';
  lucide.createIcons();
}

// Drag and Drop Note swap
async function handleNoteDrop(draggedId, targetId) {
  if (draggedId === targetId) return;
  
  const draggedIdx = state.notes.findIndex(n => n.id === draggedId);
  const targetIdx = state.notes.findIndex(n => n.id === targetId);
  
  if (draggedIdx === -1 || targetIdx === -1) return;
  
  // Move in state notes list
  const [draggedNote] = state.notes.splice(draggedIdx, 1);
  state.notes.splice(targetIdx, 0, draggedNote);
  
  // Re-render instantly
  renderNotes();
  
  try {
    const orderList = state.notes.map(n => n.id);
    await apiCall('/notes/reorder', {
      method: 'PUT',
      body: { order: orderList }
    });
    showToast('Notes reordered.', 'success');
  } catch (err) {
    console.error('Reorder update failed:', err);
    showToast('Failed to save notes order in database.', 'warning');
  }
}

// Reminder check alarm loop (runs every 15s)
setInterval(() => {
  const now = new Date();
  state.notes.forEach(note => {
    if (note.reminder && !note.isDeleted && !note.isArchived) {
      const reminderDate = new Date(note.reminder);
      if (reminderDate <= now && !notifiedReminders.has(note.id)) {
        notifiedReminders.add(note.id);
        triggerReminderAlert(note);
      }
    }
  });
}, 15000);

function triggerReminderAlert(note) {
  showToast(`Reminder: ${note.title || 'Untitled Note'}`, 'warning', 7000);
  
  if (Notification.permission === 'granted') {
    new Notification('NoteLand Reminder', {
      body: note.content ? note.content.substring(0, 80) + '...' : 'Open NoteLand to check your note!',
      icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23FBBF24%22><path d=%22M9 21h6v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-1.3l-.85-.6C8.57 13.05 7 11.11 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 2.11-1.57 4.05-3.15 5.1z%22/></svg>'
    });
  }

  // Play browser beep tone
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime); // E5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.warn('AudioContext beep blocked by user gesture restrictions.');
  }

  // Reload notes representation to toggleExpired flag style
  renderNotes();
}

