# ภาษีเบาใจ

คำนวณภาษีสำหรับ Freelancer ไทย + LINE Bot สำหรับบันทึกรายรับ-รายจ่าย

---

## วิธีตั้งค่า

### 1. ติดตั้ง dependencies

```bash
npm install
```

### 2. ตั้งค่า Environment Variables

ไฟล์ `.env.local` มีค่าพร้อมใช้แล้ว ตรวจสอบให้มีครบ:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
```

### 3. รัน SQL Schema ใน Supabase

1. ไปที่ [Supabase Dashboard](https://supabase.com/dashboard) → project ของคุณ
2. แถบซ้าย → **SQL Editor** → **New query**
3. Copy จากไฟล์ [`supabase/schema.sql`](supabase/schema.sql) → วาง → **Run**

### 4. รันแบบ local

```bash
npm run dev
```

แอปจะขึ้นที่ `http://localhost:3000`

---

## ตั้งค่า LINE Webhook

> **⚠️ LINE ต้องการ HTTPS URL จริง — localhost ใช้ไม่ได้**
> ต้อง deploy ก่อนถึงจะตั้ง Webhook URL ได้

### Deploy ขึ้น Vercel (แนะนำ)

```bash
npx vercel --prod
```

Vercel จะให้ URL เช่น `https://phasi-baojai.vercel.app`

จากนั้นไปตั้งค่าใน [LINE Developers Console](https://developers.line.biz/console/):

1. เลือก Channel → **Messaging API** tab
2. ส่วน **Webhook URL** → ใส่: `https://your-domain.vercel.app/api/line/webhook`
3. กด **Verify** — ควรได้ "Success"
4. เปิด **Use webhook** เป็น ON

### ตั้งค่า Environment Variables บน Vercel

ใน Vercel Dashboard → Settings → Environment Variables ใส่ค่าเดียวกับ `.env.local` ทุกตัว

---

## โครงสร้างโปรเจกต์

```
.
├── app/
│   ├── api/
│   │   └── line/
│   │       └── webhook/
│   │           └── route.ts   # POST /api/line/webhook
│   └── page.tsx               # Tax Calculator UI
├── lib/
│   ├── line.ts                # verify signature, replyMessage, buildReply
│   └── supabase.ts            # Supabase client + query helpers
├── supabase/
│   └── schema.sql             # รัน 1 ครั้งใน Supabase SQL Editor
└── .env.local                 # ห้าม commit ขึ้น git
```

## LINE Bot Commands

| ส่งมา | บอทตอบ |
|---|---|
| ตัวเลข เช่น `5000` | "รับทราบ บันทึก 5,000 บาท ✅" |
| `สรุป` | สรุปรายรับ-รายจ่ายเดือนนี้ |
| อื่นๆ | แนะนำวิธีใช้ |
