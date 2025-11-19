// app.js
require('dotenv').config();

// Allow requiring .ts files directly
require('ts-node').register({
  transpileOnly: true,            // faster, fine for dev
  compilerOptions: {
    module: 'commonjs'
  }
});

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
    
    // Initialize cron jobs after successful DB connection
    const { startInstallmentReminderJobs } = require('./src/jobs/installmentReminderJob');
    startInstallmentReminderJobs();
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
