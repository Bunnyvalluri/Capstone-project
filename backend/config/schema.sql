-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Notes Table
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT DEFAULT '',
  content TEXT DEFAULT '',
  color TEXT DEFAULT '#ffffff',
  isPinned INTEGER DEFAULT 0, -- 0 for false, 1 for true
  isArchived INTEGER DEFAULT 0, -- 0 for false, 1 for true
  isDeleted INTEGER DEFAULT 0, -- 0 for false, 1 for true
  reminder TEXT DEFAULT NULL,
  type TEXT DEFAULT 'text',
  image TEXT DEFAULT NULL,
  voice TEXT DEFAULT NULL,
  order_index INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tags/Labels Table
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, name)
);

-- Note Tags Mapping Table
CREATE TABLE IF NOT EXISTS note_tags (
  note_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
