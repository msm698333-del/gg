# DEPLOY.md — راهنمای انتشار بازی «سایهٔ خندان»

## مقدمه کوتاه درباره‌ی ایران

هاست‌های خارجی رایگان (Render، Railway، Fly.io) برای بازیکنان ایرانی **تضمین سرعت و اتصال پایدار ندارند**؛ ممکن است بعضی از دیتاسنترهای ایران به آن‌ها متصل شوند و بعضی نه، و پینگ می‌تواند متغیر باشد. اگر خواستید که بازی واقعاً سریع و پایدار برای کاربران ایرانی باشد، باید از یک هاست یا سرور مجازی داخل ایران استفاده کنید. این فایل، هر دو راه را توضیح می‌دهد.

---

## گزینه ۱ — ادامه‌ی همان سرور Render فعلی (جایگزین فایل‌ها)

آدرس فعلی بازی «نقشه مهاجران» در Render: `https://gg-zvgx.onrender.com`
این سرور قبلاً روی شاخه‌ی `main` مخزن [gg](https://github.com/msm698333-del/gg) تنظیم شده است. لازم نیست سرویس جدیدی بسازید؛ کافی است محتوای مخزن را با فایل‌های جدید این بازی عوض کنید. Render خودش دوباره deploy می‌کند.

### مراحل آپلود فایل‌ها (چون دستور push از این رایانه ممکن نیست)

1. وارد مخزن شوید: `https://github.com/msm698333-del/gg`
2. فایل‌های قدیمی را (مثل `public/game.js`، `public/socket-client.js`، `test-flow.js`) حذف کنید (Delete files).
3. فایل‌های جدید را از پوشه‌ی `gg-upload` همین پروژه از طریق دکمه‌ی **Add file → Upload files** آپلود کنید؛ همان ساختار باید حفظ شود:
   ```
   server.js
   package.json
   package-lock.json
   START.bat
   .gitignore
   README.md
   DEPLOY.md
   test-horror.js
   public/index.html
   public/style.css
   public/net.js
   public/horror.js
   public/app.js
   ```
   (توجه: پوشه‌ی `node_modules` آپلود نشود)
4. در گوشه‌ی پایین صفحه، پیام commit را بنویسید (مثلاً `deploy laughing shadow v2`) و روی **Commit changes** بزنید.
5. Render به‌صورت خودکار متوجه commit می‌شود و دوباره deploy می‌کند (Deploys → Deploy succeeded).
6. آدرس `https://gg-zvgx.onrender.com` همان قبلی می‌شود ولی بازی «سایهٔ خندان» را نشان می‌دهد.

### تنظیمات Build / Start Command در Render (برای رفع خطای قبلی)

در داشبورد Render → سرویس `gg` → **Settings**:

- **Build Command:** `npm install` (به‌جای `yarn`)
- **Start Command:** `node server.js`
- **Instance Type:** Free

### نکته‌ی قطعیِ قطع‌وصلی در نسخه‌ی رایگان Render

در پلن رایگان Render، سرور اگر ۱۵ دقیقه بدون درخواست بماند می‌خوابد؛ اولین بازدید بعد از خواب، حدود ۳۰ تا ۶۰ ثانیه طول می‌کشد تا «بیدار» شود. بعد از بیدار شدن، WebSocket (پایه‌ی بازی) پایدار است. این محدودیت Render است و با هیچ فایل یا ترفندی به طور کامل رفع نمی‌شود. راه‌حل‌ها:

- **پلن پولی Render (Starter ≈ $8/ماه)** — همیشه بیدار
- یا یکی از گزینه‌های زیر

---

## گزینه ۲ — هاست داخل ایران (سرعت و پایداری واقعی برای ایران)

برای گیمرهای ایرانی بهترین تجربه، سرور داخل ایران است. نمونه‌ها:

- سرور مجازی از ابرهای ایرانی (ابر آروان، ابر برنتین، هزار گرفا، مهان‌رایان، پارس‌سرور و...)
- هاست node.js ایرانی (مثلاً هاست پارس‌لینک، کافه‌بازار — آگهی‌ها را جستجو کنید)

روی سرور ایرانی لینوکس، این دستورات را اجرا کنید:

```bash
# ۱) نصب nodejs (حداقل نسخه ۱۸)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# ۲) انتقال فایل‌ها به سرور (می‌توانید از FTP/FTPS یا rsync/Shared Files استفاده کنید)
# پوشه‌ی این پروژه را آپلود کنید، مثلاً در /var/www/shadow

# ۳) اجرا
cd /var/www/shadow
npm install
npm install -g pm2
pm2 start server.js --name shadow
pm2 save
pm2 startup
```

سپس (اختیاری اما توصیه‌شده) یک دامنه و SSL رایگان با Let's Encrypt روی Nginx قرار دهید:

```nginx
server {
    listen 80;
    server_name game.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;   # ← برای WebSocket ضروری است
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;                 # نگه‌داشتن اتصال بلند مدت
    }
}
```

نیازهای حداقلی: ۵۱۲ مگابایت RAM کافی است؛ ترافیک هر بازی بسیار کم است.

---

## گزینه ۳ — هاست‌های خارجی جایگزین (Railway یا Fly.io)

### Railway.app
1. در https://railway.app با GitHub لاگین کنید.
2. **New Project → Deploy from GitHub repo** و مخزن `gg` را انتخاب کنید.
3. Railway به‌صورت خودکار `npm install` و `node server.js` را اجرا می‌کند.
4. بعد از deploy، تب **Settings → Domains → Generate Domain** را بزنید تا آدرس عمومی بگیرید.
5. Railway پلن رایگان با اعتبار محدود (مثلاً ۵ دلار در ماه) دارد؛ بیش از آن پولی است.

### Fly.io
1. در https://fly.io ثبت‌نام کنید (نیاز به کارت بانکی بین‌المللی دارد).
2. `fly launch` را در همان پوشه از ترمینال اجرا کنید — یک Dockerfile خودکار می‌سازد.
3. `fly deploy`
4. آدرس `https://<app>.fly.dev` برای بازی در دسترس خواهد بود.

**نکته:** Railway اروپای غربی/سنگاپور دارد؛ Fly.io همچنین سنگاپور (نزدیک‌تر به ایران) دارد. ولی باز هم سرعت واقعی را فقط از داخل ایران می‌توانید بسنجید.

---

## تست نهایی بعد از deploy

در هر حالت (Render، Railway، Fly.io یا هاست ایرانی):

1. `/health` را باز کنید: `https://آدرس-سرور/health` — باید `{"ok":true,...}` برگردد.
2. در دو مرورگر جدا (یا یک مرورگر معمولی + پنجره‌ی ناشناس) وارد شوید.
3. یک نفر اتاق بسازد، کد ۶ رقمی را به نفر دوم بدهد؛ نفر دوم با «ورود با کد» وارد شود.
4. حالت را انتخاب کنید: «سه نفره» ← هر ۳ نفر وارد شوند، «start» را میزبان بزند، بازی شروع می‌شود.

## چرا سایهٔ خندان برای نسخه‌ی چندنفره مناسب است؟

- نقشه کوچک (۱۵×۱۵ خانه) → تأخیر کم مهم نیست؛ حتی ۲۵۰ms پینگ هم بازی را قابل بازی نگه می‌دارد.
- سرور ساده و بدون پایگاه‌داده؛ فقط حافظه‌ی متن‌ها؛ هیچ چیز سنگین‌ای ندارد.
- حجم کل بازی تنها چند کیلوبایت × چند فایل — برای اینترنت ایران سبک است.
