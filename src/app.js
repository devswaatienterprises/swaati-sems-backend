const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const apiV1Router = require('./routes/v1');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security & Middleware
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Versioned API Routes
app.use('/api/v1', apiV1Router);

// Centralized Error Handler
app.use(errorHandler);

// Start Server
app.listen(env.PORT, () => {
  console.log(`[Backend API] Server running on http://localhost:${env.PORT}`);
});

module.exports = app;
