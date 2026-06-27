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
  
  // Modal Edit state
  selectedNote: null,
  selectedNoteTags: new Set(),
  creatorSaving: false
};

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

// Theme setup
function initTheme() {
  const savedTheme = localStorage.getItem('noteland-theme');
  if (savedTheme) {
    state.theme = savedTheme;
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    state.theme = prefersDark ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const themeIcon = document.getElementById('theme-icon');
  if (!themeIcon) return;
  if (state.theme === 'dark') {
    themeIcon.setAttribute('data-lucide', 'sun');
  } else {
    themeIcon.setAttribute('data-lucide', 'moon');
  }
  lucide.createIcons();
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

  // Setup view layout (grid vs list)
  [pinnedGrid, othersGrid].forEach(grid => {
    if (state.viewLayout === 'list') {
      grid.classList.remove('grid-view');
      grid.classList.add('list-view');
    } else {
      grid.classList.remove('list-view');
      grid.classList.add('grid-view');
    }
  });

  // Render Pinned Notes
  if (pinnedNotes.length > 0) {
    pinnedWrapper.classList.remove('hidden');
    pinnedNotes.forEach(note => {
      pinnedGrid.appendChild(createNoteCard(note));
    });
    othersTitle.classList.remove('hidden');
  } else {
    pinnedWrapper.classList.add('hidden');
    othersTitle.classList.add('hidden');
  }

  // Render Other Notes
  if (otherNotes.length > 0) {
    otherNotes.forEach(note => {
      othersGrid.appendChild(createNoteCard(note));
    });
  }

  // Empty State logic
  if (filteredNotes.length === 0) {
    emptyState.classList.remove('hidden');
    updateEmptyStateContent();
  } else {
    emptyState.classList.add('hidden');
  }

  lucide.createIcons();
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

  // Pin button (visible on hover)
  const isPinned = note.isPinned;
  const pinClass = isPinned ? 'card-pin-btn pinned' : 'card-pin-btn';
  const pinIconFill = isPinned ? 'fill-current' : '';

  // Tags HTML
  let tagsHTML = '';
  if (note.tags && note.tags.length > 0) {
    tagsHTML = `<div class="note-tags-container" style="margin-top: 8px; margin-bottom: 0;">
      ${note.tags.map(t => `<span class="tag-pill">${escapeHTML(t.name)}</span>`).join('')}
    </div>`;
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
    <button class="${pinClass}" title="${isPinned ? 'Unpin note' : 'Pin note'}">
      <i data-lucide="pin" class="${pinIconFill}"></i>
    </button>
    <div>
      ${note.title ? `<div class="card-title">${highlightText(note.title, state.searchQuery)}</div>` : ''}
      ${contentHTML}
      ${tagsHTML}
    </div>
    <div class="card-actions">
      ${actionsHTML}
    </div>
  `;

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
    if (e.target.closest('button') || e.target.closest('.tag-pill') || e.target.closest('.checklist-cb')) return;
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

  // Dark Mode Toggle
  document.getElementById('theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('noteland-theme', state.theme);
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();
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

    // Save note if title or content exists
    if (title || content) {
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

        const newNote = await apiCall('/notes', {
          method: 'POST',
          body: {
            title,
            content,
            color: state.creatorColor,
            isPinned,
            isArchived: isCreatorArchived,
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

      state.creatorColor = '#ffffff';
      state.creatorTags.clear();
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
}
