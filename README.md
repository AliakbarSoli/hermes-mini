# hermes-mini

دستیار کارهای روزانهٔ شخصی روی تلگرام — نسخهٔ خیلی کوچکِ «هرمس». کاملاً روی Cloudflare free plan.

## معماری

- **Cloudflare Workers** (TypeScript) — webhook تلگرام + cron یادآوری
- **D1** — جدول `tasks` (SQLite)
- **Workers AI** — پارس متن آزاد فارسی (binding `AI`، بدون key)
- تلگرام از ایران فیلتره ولی Workers مستقیم به `api.telegram.org` می‌رسه

## استفاده

| کامند | کار |
|---|---|
| `/add متن` | کار جدید برای امروز |
| `/today` یا `/list` | لیست امروز با وضعیت |
| `/done شماره` | تیک زدن |
| `/undone شماره` | برداشتن تیک |
| `/del شماره` | حذف |

متن آزاد → Workers AI تصمیم می‌گیره (اضافه/تیک/لیست/جواب کوتاه). اگه AI خطا بده، متن به‌عنوان تسک جدید ثبت می‌شه.

## کانفیگ (`wrangler.jsonc`)

- `ALLOWED_TELEGRAM_ID` — فقط این user ID سرویس می‌شه
- `AI_MODEL` — مدل Workers AI (پیش‌فرض `@cf/meta/llama-3.1-8b-instruct`؛ گزینهٔ ارزون‌تر: `@cf/qwen/qwen3-30b-a3b-fp8`)
- `REMINDER_HOUR` — ساعت یادآوری صبح به وقت تهران (پیش‌فرض ۸؛ cron هر ۱۵ دقیقه چک می‌کنه، فقط ساعت مقصد ارسال می‌شه)

## Secrets

- `TELEGRAM_BOT_TOKEN` — از @BotFather
- `TELEGRAM_WEBHOOK_SECRET` — رشتهٔ رندوم؛ هم در secret و هم در `setWebhook` باید یکی باشه

## توسعه

```bash
npx tsc --noEmit                          # چک تایپ
npx wrangler d1 migrations apply hermes-mini --remote
npx wrangler deploy
npx wrangler tail                         # لاگ زنده
```

آدرس webhook: `https://<worker-url>/webhook` — با هدر `x-telegram-bot-api-secret-token` محافظت می‌شه.
