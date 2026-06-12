import crypto from 'crypto'

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!
const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!

// ─── Signature verification ───────────────────────────────────────────────────

export function verifySignature(body: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha256', CHANNEL_SECRET)
    .update(body)
    .digest('base64')
  return hash === signature
}

// ─── Reply API ────────────────────────────────────────────────────────────────

export async function replyMessage(replyToken: string, text: string) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LINE reply failed: ${res.status} ${err}`)
  }
}

// ─── Message logic ────────────────────────────────────────────────────────────

export function buildReply(text: string): string {
  const trimmed = text.trim()

  // ตัวเลข (จำนวนเงิน) — รองรับทั้ง 1500 และ 1,500
  const amount = parseFloat(trimmed.replace(/,/g, ''))
  if (!isNaN(amount) && amount > 0) {
    return `รับทราบ บันทึก ${amount.toLocaleString('th-TH')} บาท ✅`
  }

  // สรุป
  if (trimmed === 'สรุป') {
    // TODO: ดึงจาก Supabase จริงๆ ในอนาคต
    return [
      '📊 สรุปรายได้เดือนนี้ (ตัวอย่าง)',
      '',
      '💰 รายรับรวม:  45,000 บาท',
      '💸 รายจ่ายรวม: 12,000 บาท',
      '📈 คงเหลือ:    33,000 บาท',
      '',
      '🧾 ภาษีที่ควรเก็บ/เดือน: ~1,500 บาท',
    ].join('\n')
  }

  // default
  return 'พิมพ์จำนวนเงิน เช่น 5000\nหรือพิมพ์ "สรุป" เพื่อดูยอดรวม'
}
