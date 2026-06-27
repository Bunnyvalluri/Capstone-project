const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../../database/noteland.db');
const schemaPath = path.resolve(__dirname, '../../database/schema.sql');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
  } else {
    console.log('Connected to the NoteLand SQLite database at:', dbPath);
    initializeDatabase();
  }
});

function initializeDatabase() {
  try {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON;', (err) => {
      if (err) {
        console.error('Error enabling foreign keys:', err.message);
        return;
      }
      
      // Execute schema creation
      db.exec(schemaSql, (execErr) => {
        if (execErr) {
          console.error('Error initializing tables:', execErr.message);
        } else {
          console.log('Database tables verified/created successfully.');
          
          // Seed default user
          db.run(
            `INSERT OR IGNORE INTO users (id, name, email, password) 
             VALUES (1, 'NoteLand User', 'user@noteland.com', 'defaultpassword')`,
            (insertErr) => {
              if (insertErr) {
                console.error('Error seeding default user:', insertErr.message);
              } else {
                console.log('Default NoteLand User verified/seeded.');
              }
            }
          );

          // SaaS column migrations (safely add columns if they do not exist)
          const migrations = [
            "ALTER TABLE notes ADD COLUMN reminder TEXT DEFAULT NULL",
            "ALTER TABLE notes ADD COLUMN type TEXT DEFAULT 'text'",
            "ALTER TABLE notes ADD COLUMN image TEXT DEFAULT NULL",
            "ALTER TABLE notes ADD COLUMN voice TEXT DEFAULT NULL",
            "ALTER TABLE notes ADD COLUMN order_index INTEGER DEFAULT 0"
          ];
          
          migrations.forEach((sql) => {
            db.run(sql, (err) => {
              if (err && !err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
                console.warn(`Migration notice: ${err.message}`);
              }
            });
          });
        }
      });
    });
  } catch (err) {
    console.error('Failed to read schema file:', err.message);
  }
}

// Promisified DB helpers to make controller code clean and readable
const dbQuery = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

module.exports = {
  db,
  dbQuery
};
