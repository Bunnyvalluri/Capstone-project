# 💡 NoteLand - Google Keep Clone (Capstone Project)

NoteLand is a modern, responsive, and beautiful note-taking web application designed as a feature-rich clone of Google Keep. It allows users to effortlessly capture thoughts, manage lists with interactive checklists, assign colors and labels, and keep notes organized with advanced search, pinning, archiving, and trash features.

---

## 🚀 Key Features

*   **⚡ Interactive Note Creator**: Expandable input form to capture titles, detailed notes, list items, pin/unpin options, note colors, and label associations.
*   **🎨 Dynamic Personalization**: Personalize each note card with custom, vibrant, and light/dark theme-compatible pastel colors.
*   **🏷️ Label & Tag Manager**: Create, rename, delete, and map custom labels to notes. Navigate through notes categorized by specific labels via the sidebar.
*   **📌 Organization & Views**:
    *   **Pin/Unpin**: Keep critical notes at the very top of your feed.
    *   **Archive**: Declutter your main view by moving completed tasks or notes to the Archive.
    *   **Trash**: Safely recycle notes. Notes in trash can be restored or permanently cleared.
*   **🌓 Dark & Light Modes**: Seamless toggle between sleek dark mode and clean light mode, respecting system defaults or user preferences.
*   **🔍 Live Search & Highlighting**: Instantly filter notes by titles, contents, or tags, with matched terms highlighted in real-time.
*   **✅ Self-Healing Checklists**: Type bracketed items like `[ ] Buy groceries` or `[x] Read book` to automatically render them as interactive checklists.
*   **📱 Fully Responsive Layout**: Switches easily between Grid and List layouts, optimized for all viewport sizes (desktop, tablet, and mobile).

---

## 🛠️ Technology Stack

NoteLand is built using a clean, modern, and light-weight tech stack:

*   **Frontend**: 
    *   **Structure & Layout**: Semantic HTML5.
    *   **Styling & Themes**: Vanilla CSS3 (featuring HSL color tokens, CSS Variables, glassmorphism, responsive grids, and transitions).
    *   **Icons**: [Lucide Icons](https://lucide.dev) for clean, vector-based iconography.
    *   **Logic & Rendering**: Vanilla Javascript (ES6+) for DOM manipulation, reactive state, dynamic rendering, and local-first UI updates.
*   **Backend**:
    *   **Server**: Node.js & Express.js.
    *   **Authentication & Session**: Cookie-Parser, JSONWebTokens, and bcryptjs (pre-configured for standard or single-user fallback flow).
    *   **CORS**: Configured for local cross-origin development.
*   **Database**:
    *   **Engine**: SQLite3 (lightweight, single-file serverless database).
    *   **Driver**: `sqlite3` for Node.js.
    *   **SQL Schema**: Relations between Users, Notes, Tags, and Note-Tag mappings with foreign key cascading.

---

## 📂 Project Structure

The codebase is organized into modular frontend and backend structures:

```text
Capstone Project/
├── backend/
│   ├── config/
│   │   └── db.js            # SQLite database connection & initialization
│   ├── controllers/
│   │   ├── authController.js
│   │   └── notesController.js
│   ├── middleware/
│   │   └── authMiddleware.js
│   ├── routes/
│   │   ├── auth.js          # Authentication endpoints
│   │   ├── notes.js         # CRUD notes endpoints
│   │   └── tags.js          # Tag management endpoints
│   └── server.js            # Express application entrypoint
├── database/
│   ├── noteland.db          # Auto-generated SQLite database (git-ignored)
│   └── schema.sql           # Initial database schema setup script
├── frontend/
│   ├── app.js               # Frontend application state & UI logic
│   ├── index.html           # Single-page interface structure
│   └── style.css            # Custom CSS styling and typography rules
├── .gitignore               # Ignored folders (node_modules, .db, envs)
├── package.json             # NPM dependencies & scripts
└── README.md                # Project documentation
```

---

## 🗄️ Database Architecture

The SQLite database relies on four relational tables:

1.  **`users`**: Manages user accounts and credentials.
2.  **`notes`**: Stores note metadata (titles, text contents, colors, status flags for pinning, archiving, or deletion).
3.  **`tags`**: Stores unique custom labels created by users.
4.  **`note_tags`**: A mapping table to link multiple tags to multiple notes (Many-to-Many relationship).

For full details, review [database/schema.sql](file:///c:/Users/vallu/OneDrive/Desktop/mywebside/Capstone%20Project/database/schema.sql).

---

## 🚀 Getting Started

### 📋 Prerequisites
Make sure you have [Node.js](https://nodejs.org) installed on your system.

### 📥 Installation & Setup
1. Clone the repository (or navigate to your local project folder):
   ```bash
   git clone https://github.com/Bunnyvalluri/Capstone-project.git
   cd Capstone-project
   ```

2. Install backend and frontend dependencies:
   ```bash
   npm install
   ```

3. Run the development server (automatically reloads backend on changes):
   ```bash
   npm run dev
   ```

4. Start the server in production mode:
   ```bash
   npm start
   ```

5. Access the application in your browser at:
   **[http://localhost:5000](http://localhost:5000)**

---

## 🛣️ API Endpoints Summary

### Authentication Routes (`/`)
*   `POST /register` - Register a new user account.
*   `POST /login` - Sign in to an existing account.
*   `POST /logout` - Clear cookies and session.
*   `GET /me` - Retrieve current session user details.

### Notes Routes (`/notes`)
*   `GET /notes` - Retrieve all notes (filtered by active, archived, or deleted state).
*   `POST /notes` - Create a new note.
*   `PUT /notes/:id` - Update note content, title, color, pin status, or archived status.
*   `DELETE /notes/:id` - Permanently delete a note or move it to trash.

### Tags/Labels Routes (`/tags`)
*   `GET /tags` - Get all tags created by the logged-in user.
*   `POST /tags` - Create a new custom tag.
*   `DELETE /tags/:id` - Delete a tag.
