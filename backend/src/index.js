require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { migrate, getDb } = require('./database');
const apiRouter = require('./routes');

// Initialize DB and run migrations
getDb(); // Ensure DB is initialized
migrate();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // allow large image payloads

// API routes
app.use('/api', apiRouter);

// Static proxy helper for dev: serve frontend built files if present
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use('/', express.static(frontendDist));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
