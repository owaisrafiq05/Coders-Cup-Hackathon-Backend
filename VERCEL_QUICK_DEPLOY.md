# Vercel Deployment Quick Reference

## 🚀 Quick Deploy Steps

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Add Vercel deployment config"
   git push origin main
   ```

2. **Import to Vercel**
   - Go to vercel.com → New Project
   - Import GitHub repository
   - Framework: Other

3. **Add Environment Variables**
   Copy from `.env` to Vercel Settings → Environment Variables:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
   - `FRONTEND_URL`
   - `CRON_SECRET` (generate new random string)
   - `GEMINI_API_KEY`
   - `NODE_ENV=production`

4. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes
   - Get deployment URL

## ⏰ Cron Jobs (Automatic)

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| Daily 9 AM UTC | `/api/cron/installment-reminders` | Send reminders with payment URLs |
| Daily 10 AM UTC | `/api/cron/overdue-notices` | Send overdue notices with fines |

**Security:** Protected by `CRON_SECRET` bearer token

## 🧪 Test Endpoints

```bash
# Health check
curl https://your-project.vercel.app/

# Test cron (manual trigger)
curl -X GET https://your-project.vercel.app/api/cron/installment-reminders \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## 📊 Monitor

- **Vercel Dashboard** → Functions → Logs
- Look for: `[INFO] Vercel Cron: Starting...`
- Check email logs in MongoDB

## ⚠️ Important Notes

1. **MongoDB must be cloud** (MongoDB Atlas) - local DB won't work
2. **Whitelist Vercel IPs** in MongoDB Atlas: Allow `0.0.0.0/0`
3. **Gmail App Password** required for emails (not regular password)
4. **CRON_SECRET** must be strong (32+ characters)
5. **Timezone:** Vercel Cron uses UTC (adjust for your timezone)

## 🔧 Timezone Conversion

| Your Location | UTC Time | Vercel Cron |
|---------------|----------|-------------|
| Pakistan (PKT, UTC+5) | 9 AM PKT | `0 4 * * *` |
| India (IST, UTC+5:30) | 9 AM IST | `0 3 30 * * *` |
| US East (EST, UTC-5) | 9 AM EST | `0 14 * * *` |

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| DB connection fails | Use MongoDB Atlas, whitelist all IPs |
| Emails not sending | Use Gmail app password, check spam |
| 401 on cron | Check `CRON_SECRET` in Vercel env vars |
| Cron not running | Verify Vercel plan supports cron (Hobby/Pro) |

## 📞 Support

Full guide: `VERCEL_DEPLOYMENT_GUIDE.md`

---

**Deployment Ready!** ✅
