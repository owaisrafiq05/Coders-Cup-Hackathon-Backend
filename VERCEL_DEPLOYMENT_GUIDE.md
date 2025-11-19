# Vercel Deployment Guide

Complete guide to deploy the Coders Cup Microfinance Backend on Vercel with functional cron jobs.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Vercel Configuration](#vercel-configuration)
4. [Cron Jobs Setup](#cron-jobs-setup)
5. [Deployment Steps](#deployment-steps)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- ✅ GitHub account with repository access
- ✅ Vercel account (free tier works)
- ✅ MongoDB Atlas database (cloud)
- ✅ Stripe account for payments
- ✅ Gmail account for email service
- ✅ All environment variables ready

---

## Environment Variables

Before deploying, prepare these environment variables. You'll add them in Vercel dashboard.

### Required Environment Variables:

```env
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname

# JWT Secrets
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
JWT_REFRESH_SECRET=your-refresh-secret-jwt-key-minimum-32-characters

# Email Configuration (Gmail SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-gmail-app-password

# Stripe
STRIPE_SECRET_KEY=sk_test_51K...
STRIPE_WEBHOOK_SECRET=whsec_...

# Frontend URL
FRONTEND_URL=https://your-frontend.vercel.app

# Cron Security (Generate a random string)
CRON_SECRET=your-random-cron-secret-key-for-security

# Gemini AI
GEMINI_API_KEY=your-gemini-api-key

# Environment
NODE_ENV=production
```

### How to Get Gmail App Password:

1. Go to Google Account Settings
2. Security → 2-Step Verification (must be enabled)
3. App passwords → Generate new app password
4. Select "Mail" and "Other (Custom name)"
5. Copy the 16-character password
6. Use this as `EMAIL_PASSWORD`

---

## Vercel Configuration

The `vercel.json` file is already created with the following configuration:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "app.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "app.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  },
  "crons": [
    {
      "path": "/api/cron/installment-reminders",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/cron/overdue-notices",
      "schedule": "0 10 * * *"
    }
  ]
}
```

### Cron Schedule Explained:

| Cron Expression | Time (UTC) | Description |
|-----------------|------------|-------------|
| `0 9 * * *` | 9:00 AM daily | Installment reminders (3 days before due) |
| `0 10 * * *` | 10:00 AM daily | Overdue notices with fines |

**⚠️ Important:** Vercel Cron uses UTC timezone. Adjust schedules based on your timezone:
- Pakistan (PKT = UTC+5): `0 4 * * *` for 9 AM PKT
- India (IST = UTC+5:30): `0 3 30 * * *` for 9 AM IST

---

## Cron Jobs Setup

### How Vercel Cron Works:

1. **Vercel automatically calls** your cron endpoints at scheduled times
2. **HTTP GET request** sent to your API endpoints
3. **Authentication** via `Authorization: Bearer CRON_SECRET` header
4. **Background execution** - jobs run asynchronously

### Cron Endpoints Created:

#### 1. Installment Reminders
- **Endpoint:** `GET /api/cron/installment-reminders`
- **Schedule:** Daily at 9:00 AM UTC
- **Function:** Sends reminder emails with Stripe payment URLs
- **Controller:** `src/controllers/cron.controller.ts`

#### 2. Overdue Notices
- **Endpoint:** `GET /api/cron/overdue-notices`
- **Schedule:** Daily at 10:00 AM UTC
- **Function:** Sends overdue emails with fine calculation
- **Controller:** `src/controllers/cron.controller.ts`

### Security Features:

- ✅ Bearer token authentication (`CRON_SECRET`)
- ✅ Only authorized requests processed
- ✅ Logs all cron attempts
- ✅ Graceful error handling

---

## Deployment Steps

### Step 1: Push Code to GitHub

```bash
# Ensure all changes are committed
git add .
git commit -m "Add Vercel deployment configuration"
git push origin main
```

### Step 2: Connect to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Select "Coders-Cup-Hackathon-Backend"

### Step 3: Configure Project

**Framework Preset:** Other
**Root Directory:** `./` (leave as is)
**Build Command:** Leave empty
**Output Directory:** Leave empty

### Step 4: Add Environment Variables

In Vercel dashboard:

1. Go to project Settings → Environment Variables
2. Add each variable from the list above:
   - Variable Name: `MONGODB_URI`
   - Value: `mongodb+srv://...`
   - Environment: Production, Preview, Development
3. Click "Add" for each variable
4. Repeat for all variables

**⚠️ Critical Variables:**
- `MONGODB_URI` - Must be MongoDB Atlas (cloud database)
- `CRON_SECRET` - Generate a strong random string
- `STRIPE_WEBHOOK_SECRET` - From Stripe dashboard
- `JWT_SECRET` - At least 32 characters

### Step 5: Deploy

1. Click "Deploy"
2. Wait for build to complete (2-3 minutes)
3. You'll get a deployment URL: `https://your-project.vercel.app`

### Step 6: Enable Cron Jobs (Pro/Team Plan Required)

**⚠️ Important:** Vercel Cron is available on **Hobby (free)**, **Pro**, and **Team** plans.

#### On Free (Hobby) Plan:
Cron jobs are supported! They will work automatically.

#### To Verify Cron Setup:

1. Go to Project Dashboard
2. Click "Cron" tab (if visible)
3. You should see two cron jobs listed:
   - `/api/cron/installment-reminders` - Daily at 9:00 AM
   - `/api/cron/overdue-notices` - Daily at 10:00 AM

---

## Verification

### 1. Check Deployment Status

```bash
# Visit your deployment URL
https://your-project.vercel.app

# Should return: "API is running"
```

### 2. Test API Endpoints

```bash
# Health check
curl https://your-project.vercel.app/

# Test login
curl -X POST https://your-project.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@codercup.com",
    "password": "Admin@123"
  }'
```

### 3. Test Cron Endpoints (Manual Trigger)

```bash
# Test installment reminders
curl -X GET https://your-project.vercel.app/api/cron/installment-reminders \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Expected response:
{
  "success": true,
  "message": "Installment reminder job started",
  "timestamp": "2024-12-28T10:00:00.000Z"
}
```

```bash
# Test overdue notices
curl -X GET https://your-project.vercel.app/api/cron/overdue-notices \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Expected response:
{
  "success": true,
  "message": "Overdue notice job started",
  "timestamp": "2024-12-28T10:05:00.000Z"
}
```

### 4. Check Logs

In Vercel Dashboard:
1. Go to your project
2. Click "Deployments" → Latest deployment
3. Click "Functions" tab
4. View logs for cron executions

**Look for these logs:**
```
[INFO] Vercel Cron: Starting installment reminders job
[INFO] Payment URL generated for installment 507f...
[INFO] Reminder sent for installment 507f... (1/3) with payment URL
[INFO] Vercel Cron: Installment reminders completed
```

---

## Troubleshooting

### Issue 1: Cron Jobs Not Running

**Symptom:** No emails sent at scheduled times

**Solutions:**

1. **Check Vercel Plan:**
   - Verify you're on a plan that supports cron
   - Free Hobby plan supports cron jobs

2. **Check Cron Configuration:**
   ```bash
   # Verify vercel.json exists with crons array
   cat vercel.json
   ```

3. **Check Environment Variables:**
   - Ensure `CRON_SECRET` is set in Vercel
   - Verify MongoDB connection string is correct

4. **Check Logs:**
   - Go to Vercel Dashboard → Functions → Logs
   - Look for cron execution attempts

### Issue 2: 401 Unauthorized on Cron Endpoints

**Symptom:** Cron jobs return 401 error

**Solutions:**

1. **Verify CRON_SECRET:**
   ```bash
   # In Vercel dashboard, check Environment Variables
   # Ensure CRON_SECRET is set correctly
   ```

2. **Vercel Automatically Adds Auth Header:**
   - Vercel adds `Authorization: Bearer <CRON_SECRET>` automatically
   - You don't need to configure this manually

### Issue 3: Database Connection Errors

**Symptom:** "MongoDB connection error" in logs

**Solutions:**

1. **Use MongoDB Atlas (Cloud):**
   - Vercel serverless functions need cloud database
   - Local MongoDB won't work

2. **Whitelist Vercel IPs:**
   - In MongoDB Atlas → Network Access
   - Click "Add IP Address"
   - Select "Allow Access from Anywhere" (0.0.0.0/0)

3. **Check Connection String:**
   ```
   mongodb+srv://username:password@cluster.mongodb.net/dbname?retryWrites=true&w=majority
   ```

### Issue 4: Emails Not Sending

**Symptom:** Cron runs but no emails received

**Solutions:**

1. **Check Gmail App Password:**
   - Use Gmail app password, not regular password
   - Enable 2FA first, then generate app password

2. **Check Email Configuration:**
   ```env
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_SECURE=false  # Must be false for port 587
   ```

3. **Check Spam Folder:**
   - Emails might be filtered as spam

4. **Check Logs:**
   ```
   [INFO] Reminder sent for installment... with payment URL
   [ERROR] Failed to send reminder for installment...
   ```

### Issue 5: Stripe Payment URLs Not Working

**Symptom:** Payment button in email doesn't work

**Solutions:**

1. **Check Stripe Keys:**
   ```env
   STRIPE_SECRET_KEY=sk_live_... (production)
   # or
   STRIPE_SECRET_KEY=sk_test_... (testing)
   ```

2. **Check Frontend URL:**
   ```env
   FRONTEND_URL=https://your-frontend.vercel.app
   ```

3. **Test Payment Session Creation:**
   ```bash
   # Check if payment service is working
   curl -X POST https://your-api.vercel.app/api/admin/reminders/installments \
     -H "Authorization: Bearer ADMIN_TOKEN"
   ```

### Issue 6: Function Timeout

**Symptom:** "Function execution timed out"

**Solutions:**

1. **Response Immediately:**
   - Cron controllers respond immediately
   - Job runs in background
   - This prevents timeout

2. **Increase Timeout (Pro Plan):**
   - Go to Vercel Settings → Functions
   - Increase max duration (Pro plan: up to 60s)

3. **Optimize Job:**
   - Process in batches
   - Add delays between emails (100ms)

---

## Alternative: Using External Cron Service

If Vercel Cron doesn't work or you need more flexibility, use external services:

### Option 1: EasyCron (Recommended)

1. Sign up at [easycron.com](https://www.easycron.com)
2. Create two cron jobs:
   ```
   URL: https://your-api.vercel.app/api/cron/installment-reminders
   Schedule: 0 9 * * * (Daily 9 AM)
   Headers: Authorization: Bearer YOUR_CRON_SECRET
   
   URL: https://your-api.vercel.app/api/cron/overdue-notices
   Schedule: 0 10 * * * (Daily 10 AM)
   Headers: Authorization: Bearer YOUR_CRON_SECRET
   ```

### Option 2: GitHub Actions (Free)

Create `.github/workflows/cron.yml`:

```yaml
name: Cron Jobs

on:
  schedule:
    - cron: '0 9 * * *'  # 9 AM UTC
    - cron: '0 10 * * *' # 10 AM UTC

jobs:
  run-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Installment Reminders
        run: |
          curl -X GET ${{ secrets.API_URL }}/api/cron/installment-reminders \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
      
      - name: Trigger Overdue Notices
        run: |
          curl -X GET ${{ secrets.API_URL }}/api/cron/overdue-notices \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

---

## Post-Deployment Checklist

- [ ] API endpoint accessible
- [ ] Authentication working (login test)
- [ ] MongoDB connection successful
- [ ] Environment variables all set
- [ ] Cron jobs configured in Vercel
- [ ] CRON_SECRET set and secure
- [ ] Test cron endpoint manually
- [ ] Check logs for cron execution
- [ ] Emails sending successfully
- [ ] Stripe payment URLs working
- [ ] Webhook endpoint configured in Stripe

---

## Monitoring

### Daily Checks:

1. **Check Vercel Logs:**
   - Dashboard → Functions → Logs
   - Look for cron executions

2. **Check Email Logs:**
   - MongoDB → `emaillogs` collection
   - Verify emails sent successfully

3. **Check Payment Transactions:**
   - Stripe Dashboard → Payments
   - Verify payment sessions created

### Weekly Review:

- Review failed email count
- Check overdue installments
- Monitor payment success rate
- Review system errors

---

## Production Best Practices

1. **Security:**
   - ✅ Use strong `CRON_SECRET` (32+ characters)
   - ✅ Keep JWT secrets secure
   - ✅ Use environment variables, never hardcode

2. **Database:**
   - ✅ Use MongoDB Atlas (cloud)
   - ✅ Enable database backups
   - ✅ Whitelist Vercel IPs

3. **Email:**
   - ✅ Use dedicated email account
   - ✅ Monitor sending limits
   - ✅ Check spam rates

4. **Monitoring:**
   - ✅ Set up Vercel alerts
   - ✅ Monitor function execution times
   - ✅ Track error rates

5. **Stripe:**
   - ✅ Use live keys in production
   - ✅ Configure webhook URL in Stripe
   - ✅ Test payment flow thoroughly

---

## Support

For issues or questions:
- Check Vercel documentation: [vercel.com/docs](https://vercel.com/docs)
- Check logs in Vercel Dashboard
- Review this guide thoroughly
- Test locally first before deploying

---

## Summary

✅ **What Was Set Up:**

1. `vercel.json` - Deployment configuration with cron schedules
2. `src/controllers/cron.controller.ts` - Cron endpoint handlers
3. `src/routes/cron.routes.ts` - Cron routes
4. `app.js` - Updated to use Vercel cron instead of node-cron
5. Environment variable support for `CRON_SECRET`

✅ **Cron Jobs:**

- **Installment Reminders:** Daily at 9 AM UTC
- **Overdue Notices:** Daily at 10 AM UTC
- Both send emails with Stripe payment URLs

✅ **Ready to Deploy!**

Follow the deployment steps above and your backend will be live on Vercel with fully functional cron jobs! 🚀

---

*Last Updated: December 28, 2024*
