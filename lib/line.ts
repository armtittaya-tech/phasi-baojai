import crypto from 'crypto'
import { supabaseServer } from '@/lib/supabase-server'

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!
const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!

// ─── Types ────────────────────────────────────────────────────────────────────

type QuickReplyItem = {
  type: 'action'
  action: {
    type: 'message'
    label: string
    text: string
  }
}

type LineMessage =
  | { type: 'text'; text: string }
  | { type: 'text'; text: string; quickReply: { items: QuickReplyItem[] } }

// ─── Signature verification ───────────────────────────────────────────────────

export function verifySignature(body: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha256', CHANNEL_SECRET)
    .update(body)
    .digest('base64')
  return hash === signature
}

// ─── Reply API ────────────────────────────────────────────────────────────────

async function sendReply(replyToken: string, messages: LineMessage[]) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LINE reply failed: ${res.status} ${err}`)
  }
}

export async function replyMessage(replyToken: string, text: string) {
  await sendReply(replyToken, [{ type: 'text', text }])
}

async function replyWithQuickReply(
  replyToken: string,
  text: string,
  items: QuickReplyItem[]
) {
  await sendReply(replyToken, [{ type: 'text', text, quickReply: { items } }])
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function getOrCreateUser(lineUserId: string): Promise<string> {
  const { data: existing } = await supabaseServer
    .from('users')
    .select('id')
    .eq('line_user_id', lineUserId)
    .single()

  if (existing) return existing.id

  const { data: created, error } = await supabaseServer
    .from('users')
    .insert({ line_user_id: lineUserId })
    .select('id')
    .single()

  if (error) throw error
  return created.id
}

async function saveTransaction(
  userId: string,
  type: 'income' | 'expense',
  amount: number
) {
  const { error } = await supabaseServer.from('transactions').insert({
    user_id: userId,
    type,
    amount,
    date: new Date().toISOString().slice(0, 10),
  })
  if (error) throw error
}

type MonthlySummary = {
  income: number
  expense: number
  balance: number
  monthlyTaxSetAside: number
}

async function getMonthlySummary(userId: string): Promise<MonthlySummary> {
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10)

  const { data, error } = await supabaseServer
    .from('transactions')
    .select('type, amount')
    .eq('user_id', userId)
    .gte('date', from)
    .lte('date', to)

  if (error) throw error

  const income = (data ?? [])
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + Number(t.amount), 0)

  const expense = (data ?? [])
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + Number(t.amount), 0)

  // ประมาณภาษีจากรายรับ annualized (40(2): หัก 50% สูงสุด 100k, ลดหย่อนส่วนตัว 60k)
  const annualIncome = income * 12
  const expenseDeduction = Math.min(annualIncome * 0.5, 100000)
  const netIncome = Math.max(0, annualIncome - expenseDeduction - 60000)
  const annualTax = calcProgressiveTax(netIncome)

  return {
    income,
    expense,
    balance: income - expense,
    monthlyTaxSetAside: annualTax / 12,
  }
}

function calcProgressiveTax(net: number): number {
  const brackets = [
    { min: 0, max: 150000, rate: 0.0 },
    { min: 150000, max: 300000, rate: 0.05 },
    { min: 300000, max: 500000, rate: 0.1 },
    { min: 500000, max: 750000, rate: 0.15 },
    { min: 750000, max: 1000000, rate: 0.2 },
    { min: 1000000, max: Infinity, rate: 0.25 },
  ]
  let tax = 0
  for (const b of brackets) {
    if (net <= b.min) break
    tax += (Math.min(net, b.max) - b.min) * b.rate
  }
  return tax
}

function fmt(n: number) {
  return Math.round(n).toLocaleString('th-TH')
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleEvent(
  replyToken: string,
  text: string,
  lineUserId: string
) {
  const trimmed = text.trim()

  // ─── รับเลือก รายรับ/รายจ่าย จาก Quick Reply ───────────────────────────
  // format: "รายรับ:5000" หรือ "รายจ่าย:5000"
  const choiceMatch = trimmed.match(/^(รายรับ|รายจ่าย):(\d+(\.\d+)?)$/)
  if (choiceMatch) {
    const type = choiceMatch[1] === 'รายรับ' ? 'income' : 'expense'
    const amount = parseFloat(choiceMatch[2])
    const userId = await getOrCreateUser(lineUserId)
    await saveTransaction(userId, type, amount)
    const label = type === 'income' ? 'รายรับ' : 'รายจ่าย'
    await replyMessage(
      replyToken,
      `✅ บันทึก${label} ${fmt(amount)} บาท เรียบร้อยแล้ว`
    )
    return
  }

  // ─── ตัวเลข → ถามประเภท ──────────────────────────────────────────────────
  const amount = parseFloat(trimmed.replace(/,/g, ''))
  if (!isNaN(amount) && amount > 0) {
    await replyWithQuickReply(
      replyToken,
      `${fmt(amount)} บาท — เป็นอะไรครับ?`,
      [
        {
          type: 'action',
          action: { type: 'message', label: '💰 รายรับ', text: `รายรับ:${amount}` },
        },
        {
          type: 'action',
          action: { type: 'message', label: '💸 รายจ่าย', text: `รายจ่าย:${amount}` },
        },
      ]
    )
    return
  }

  // ─── สรุป ─────────────────────────────────────────────────────────────────
  if (trimmed === 'สรุป') {
    const userId = await getOrCreateUser(lineUserId)
    const s = await getMonthlySummary(userId)
    const now = new Date()
    const monthName = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })

    const lines = [
      `📊 สรุป${monthName}`,
      '',
      `💰 รายรับรวม:   ${fmt(s.income)} บาท`,
      `💸 รายจ่ายรวม:  ${fmt(s.expense)} บาท`,
      `📈 คงเหลือ:     ${fmt(s.balance)} บาท`,
      '',
      `🧾 ภาษีที่ควรเก็บ/เดือน: ~${fmt(s.monthlyTaxSetAside)} บาท`,
      '(ประมาณการจากรายรับเดือนนี้ × 12)',
    ]

    if (s.income === 0) {
      lines.push('', '📝 ยังไม่มีรายการเดือนนี้ ลองพิมพ์จำนวนเงินเพื่อบันทึกได้เลยครับ')
    }

    await replyMessage(replyToken, lines.join('\n'))
    return
  }

  // ─── default ──────────────────────────────────────────────────────────────
  await replyMessage(
    replyToken,
    'พิมพ์จำนวนเงิน เช่น 5000\nหรือพิมพ์ "สรุป" เพื่อดูยอดรวมเดือนนี้'
  )
}
