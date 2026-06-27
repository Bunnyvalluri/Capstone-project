const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('./config/db'); // Load database connection and runs migrations

const authRoutes = require('./routes/auth');
const notesRoutes = require('./routes/notes');
const tagsRoutes = require('./routes/tags');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: true, // Allow all origins during dev, with credentials
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/', authRoutes); // Exposes POST /register, POST /login, POST /logout, GET /me
app.use('/notes', notesRoutes); // Exposes CRUD notes
app.use('/tags', tagsRoutes); // Exposes custom tag routes

// Serve Static Frontend Files
app.use(express.static(path.join(__dirname, '../frontend')));

// Catch-all route to serve index.html for frontend routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start Server if not on Netlify
if (!process.env.NETLIFY) {
  app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`NoteLand Server is running on: http://localhost:${PORT}`);
    console.log(`===================================================`);
  });
}

module.exports = app;
