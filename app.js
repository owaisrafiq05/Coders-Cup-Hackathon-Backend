// app.js
require('dotenv').config();

const isVercel = process.env.VERCEL === '1';
const isProduction = process.env.NODE_ENV === 'production';

// Allow requiring .ts files directly in non-production (dev) environments
if (!isProduction) {
  try {
    require('ts-node').register({
      transpileOnly: true, // faster for development
      compilerOptions: {
        module: 'commonjs'
      }
    });
    console.log('ts-node registered for runtime TypeScript support');
  } catch (e) {
    console.error('Failed to register ts-node:', e.message);
    console.error('Make sure ts-node and typescript are installed: npm install');
  }
}

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');

// Because index.ts uses `export default router`
const routesModule = require('./src/routes');
const mainRouter = routesModule.default || routesModule;

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

      if (allowedOrigins.includes('*') || !origin) {
        callback(null, true);
      } else if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// Middleware (Express 5 compatible)
// Webhook endpoint needs raw body for signature verification
app.use('/payments/webhook', bodyParser.raw({ type: 'application/json' }));

// Regular JSON parsing for other routes
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MongoDB connection with caching for serverless
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    console.log('Using cached database connection');
    return cachedDb;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI is not defined');
    throw new Error('MONGODB_URI is not defined');
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('Connected to MongoDB');
    cachedDb = mongoose.connection;

    // Initialize cron jobs only if NOT on Vercel (Vercel uses serverless cron)
    if (!isVercel) {
      console.log('Starting node-cron jobs (local/non-Vercel environment)');
      const { startInstallmentReminderJobs } = require('./src/jobs/installmentReminderJob');
      startInstallmentReminderJobs();
    } else {
      console.log('Running on Vercel - using Vercel Cron instead of node-cron');
    }

    return cachedDb;
  } catch (err) {
    console.error('MongoDB connection error:', err);
    throw err;
  }
}

// Connect to database (for serverless, connection happens on first request)
if (isVercel) {
  // For Vercel serverless, connect on demand in middleware
  app.use(async (req, res, next) => {
    try {
      await connectToDatabase();
      next();
    } catch (error) {
      console.error('Database connection failed:', error);
      res.status(500).json({ success: false, message: 'Database connection failed' });
    }
  });
} else {
  // For local development, connect immediately
  connectToDatabase().catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });
}

// Routes - mount at root for Vercel (Vercel routes /api/* to this function)
app.use('/', mainRouter);

// Simple health route
app.get('/', (req, res) => {
  res.send('API is running');
});

// Only listen when running locally (not on Vercel serverless)
if (!isVercel) {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

module.exports = app;
