// app.js
require('dotenv').config();

// Allow requiring .ts files directly in non-production (dev) environments
if (process.env.NODE_ENV !== 'production' && process.env.FORCE_TS_NODE !== '1') {
  try {
    require('ts-node').register({
      transpileOnly: true, // faster for development
      compilerOptions: {
        module: 'commonjs'
      }
    });
    console.log('ts-node registered for runtime TypeScript support');
  } catch (e) {
    console.warn('ts-node not registered (not installed or running in production)');
  }
}

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');

// Because index.ts uses `export default router`
const mainRouter = require('./src/routes').default;

const app = express();
const port = process.env.PORT || 5000;

// Middleware (Express 5 compatible)
// Webhook endpoint needs raw body for signature verification
app.use('/api/payments/webhook', bodyParser.raw({ type: 'application/json' }));

// Regular JSON parsing for other routes
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// MongoDB connection
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('MONGO_URI is not defined in .env');
  process.exit(1);
}

mongoose
  .connect(mongoUri)
  .then(() => {
    console.log('Connected to MongoDB');
    
    // Initialize cron jobs only if NOT on Vercel (Vercel uses serverless cron)
    const isVercel = process.env.VERCEL === '1';
    if (!isVercel) {
      console.log('Starting node-cron jobs (local/non-Vercel environment)');
      const { startInstallmentReminderJobs } = require('./src/jobs/installmentReminderJob');
      startInstallmentReminderJobs();
    } else {
      console.log('Running on Vercel - using Vercel Cron instead of node-cron');
    }
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Routes
app.use('/api', mainRouter);

// Simple health route
app.get('/', (req, res) => {
  res.send('API is running');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;
