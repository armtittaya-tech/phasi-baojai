import crypto from 'crypto'
import { supabaseServer } from '@/lib/supabase-server'

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!
const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!

// ─── Types ────────────────────────────────────────────────────────────────────

type QuickReplyItem = {
  type: 'action'
  action: { type: 'message'; label: string; text: string }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LineMessage = Record<string, any>

type Transaction = {
  id: string
  type: 'income' | 'expense'
  amount: number
  date: string
}

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

async function replyFlex(replyToken: string, altText: string, contents: object) {
  await sendReply(replyToken, [{ type: 'flex', altText, contents }])
}

async function replyWithQuickReply(
  replyToken: string,
  text: string,
  items: QuickReplyItem[]
) {
  await sendReply(replyToken, [{ type: 'text', text, quickReply: { items } }])
}

// ─── Flex Message builders ────────────────────────────────────────────────────

function buildSummaryFlex(
  monthName: string,
  income: number,
  expense: number,
  balance: number,
  monthlyTax: number
) {
  const balanceColor = balance >= 0 ? '#16a34a' : '#dc2626'

  const row = (label: string, value: string, valueColor = '#111827') => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#6b7280', flex: 3 },
      { type: 'text', text: value, size: 'sm', color: valueColor, align: 'end', weight: 'bold', flex: 4 },
    ],
    paddingTop: '8px',
  })

  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#166534',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: '📊 สรุปรายรับ-รายจ่าย', color: '#dcfce7', size: 'xs', weight: 'bold' },
        { type: 'text', text: monthName, color: '#ffffff', size: 'lg', weight: 'bold', margin: 'xs' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      contents: [
        row('💰 รายรับรวม', `${fmt(income)} บาท`, '#16a34a'),
        row('💸 รายจ่ายรวม', `${fmt(expense)} บาท`, '#dc2626'),
        { type: 'separator', margin: '12px' },
        row('📈 คงเหลือ', `${fmt(balance)} บาท`, balanceColor),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#f0fdf4',
      paddingAll: '14px',
      contents: [
        { type: 'text', text: '🧾 ควรเก็บไว้สำหรับภาษี', size: 'xs', color: '#15803d', weight: 'bold' },
        { type: 'text', text: `~${fmt(monthlyTax)} บาท/เดือน`, size: 'xl', color: '#15803d', weight: 'bold', margin: '4px' },
        { type: 'text', text: 'ประมาณการจากรายรับเดือนนี้ × 12', size: 'xxs', color: '#86efac', margin: '4px' },
      ],
    },
  }
}

function buildTransactionListFlex(monthName: string, rows: Transaction[]) {
  const txRows = rows.slice(0, 10).map((t, i) => {
    const isIncome = t.type === 'income'
    return {
      type: 'box',
      layout: 'horizontal',
      paddingTop: '8px',
      contents: [
        {
          type: 'text',
          text: `${i + 1}.`,
          size: 'xs',
          color: '#9ca3af',
          flex: 1,
          gravity: 'center',
        },
        {
          type: 'text',
          text: isIncome ? '💰 รายรับ' : '💸 รายจ่าย',
          size: 'sm',
          color: isIncome ? '#16a34a' : '#dc2626',
          flex: 4,
          gravity: 'center',
        },
        {
          type: 'text',
          text: `${fmt(Number(t.amount))} บาท`,
          size: 'sm',
          color: '#111827',
          align: 'end',
          weight: 'bold',
          flex: 4,
          gravity: 'center',
        },
        {
          type: 'text',
          text: fmtDate(t.date),
          size: 'xxs',
          color: '#9ca3af',
          align: 'end',
          flex: 3,
          gravity: 'center',
        },
      ],
    }
  })

  const emptyState = {
    type: 'box',
    layout: 'vertical',
    paddingAll: '20px',
    contents: [
      { type: 'text', text: '📭 ยังไม่มีรายการเดือนนี้', align: 'center', color: '#9ca3af', size: 'sm' },
    ],
  }

  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#166534',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: '📋 รายการธุรกรรม', color: '#dcfce7', size: 'xs', weight: 'bold' },
        { type: 'text', text: monthName, color: '#ffffff', size: 'lg', weight: 'bold', margin: 'xs' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      contents: rows.length > 0 ? txRows : [emptyState],
    },
    ...(rows.length > 0 && {
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#f9fafb',
        paddingAll: '12px',
        contents: [
          { type: 'text', text: 'แก้ไข → "แก้ไข 1 8000" หรือ "แก้ไข 1 รายรับ"', size: 'xxs', color: '#6b7280' },
          { type: 'text', text: 'ลบ → "ลบ 1"', size: 'xxs', color: '#6b7280', margin: '4px' },
        ],
      },
    }),
  }
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

async function saveTransaction(userId: string, type: 'income' | 'expense', amount: number) {
  const { error } = await supabaseServer.from('transactions').insert({
    user_id: userId,
    type,
    amount,
    date: new Date().toISOString().slice(0, 10),
  })
  if (error) throw error
}

/** ดึง transactions เดือนนี้ เรียงล่าสุดก่อน (ใช้ index เป็น "เลขรายการ") */
async function getMonthlyTransactions(userId: string): Promise<Transaction[]> {
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const { data, error } = await supabaseServer
    .from('transactions')
    .select('id, type, amount, date')
    .eq('user_id', userId)
    .gte('date', from)
    .lte('date', to)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Transaction[]
}

async function getMonthlySummary(userId: string) {
  const rows = await getMonthlyTransactions(userId)
  const income = rows.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const expense = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
  const annualIncome = income * 12
  const netIncome = Math.max(0, annualIncome - Math.min(annualIncome * 0.5, 100000) - 60000)
  return {
    income,
    expense,
    balance: income - expense,
    monthlyTaxSetAside: calcProgressiveTax(netIncome) / 12,
  }
}

async function deleteTransaction(userId: string, id: string): Promise<boolean> {
  const { error } = await supabaseServer
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  return !error
}

async function updateTransactionAmount(userId: string, id: string, amount: number): Promise<boolean> {
  const { error } = await supabaseServer
    .from('transactions')
    .update({ amount })
    .eq('id', id)
    .eq('user_id', userId)
  return !error
}

async function updateTransactionType(userId: string, id: string, type: 'income' | 'expense'): Promise<boolean> {
  const { error } = await supabaseServer
    .from('transactions')
    .update({ type })
    .eq('id', id)
    .eq('user_id', userId)
  return !error
}

// ─── Utils ────────────────────────────────────────────────────────────────────

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

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

function typeLabel(type: 'income' | 'expense') {
  return type === 'income' ? '💰 รายรับ' : '💸 รายจ่าย'
}


// ─── Welcome (follow event) ───────────────────────────────────────────────────

export async function handleFollowEvent(replyToken: string, lineUserId: string) {
  await getOrCreateUser(lineUserId)
  await replyMessage(
    replyToken,
    [
      'สวัสดีครับ 👋 ผมชื่อ "เบาใจ" ผู้ช่วยเรื่องภาษีของคุณ',
      '',
      'ผมจะช่วยคุณ',
      '💰 บันทึกรายรับ-รายจ่าย',
      '📊 คำนวณภาษีให้แบบเรียลไทม์',
      '💡 บอกว่าควรเก็บเงินไว้เท่าไหร่สำหรับยื่นภาษี',
      '',
      'เริ่มต้นง่ายๆ แค่พิมพ์จำนวนเงินที่ได้รับหรือจ่ายไป เช่น "15000" แล้วเบาใจจะถามว่าเป็นรายรับหรือรายจ่ายครับ',
    ].join('\n')
  )
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleEvent(replyToken: string, text: string, lineUserId: string) {
  const trimmed = text.trim()

  // ── บันทึก: รับเลือก รายรับ/รายจ่าย จาก Quick Reply ("รายรับ:5000") ────────
  const choiceMatch = trimmed.match(/^(รายรับ|รายจ่าย):(\d+(\.\d+)?)$/)
  if (choiceMatch) {
    const type = choiceMatch[1] === 'รายรับ' ? 'income' : 'expense'
    const amount = parseFloat(choiceMatch[2])
    const userId = await getOrCreateUser(lineUserId)
    await saveTransaction(userId, type, amount)
    const label = type === 'income' ? 'รายรับ' : 'รายจ่าย'
    await replyMessage(replyToken, `เบาใจบันทึก${label} ${fmt(amount)} บาท ให้แล้วครับ ✅`)
    return
  }

  // ── บันทึก: ตัวเลข → ถาม รายรับ/รายจ่าย ────────────────────────────────────
  const amount = parseFloat(trimmed.replace(/,/g, ''))
  if (!isNaN(amount) && amount > 0) {
    await replyWithQuickReply(
      replyToken,
      `${fmt(amount)} บาท — เป็นรายรับหรือรายจ่ายครับ?`,
      [
        { type: 'action', action: { type: 'message', label: '💰 รายรับ', text: `รายรับ:${amount}` } },
        { type: 'action', action: { type: 'message', label: '💸 รายจ่าย', text: `รายจ่าย:${amount}` } },
      ]
    )
    return
  }

  // ── รายการ ────────────────────────────────────────────────────────────────────
  if (trimmed === 'รายการ') {
    const userId = await getOrCreateUser(lineUserId)
    const rows = await getMonthlyTransactions(userId)
    const now = new Date()
    const monthName = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
    await replyFlex(replyToken, `รายการ${monthName}`, buildTransactionListFlex(monthName, rows))
    return
  }

  // ── ลบ [n] ───────────────────────────────────────────────────────────────────
  const deleteMatch = trimmed.match(/^ลบ\s+(\d+)$/)
  if (deleteMatch) {
    const n = parseInt(deleteMatch[1]) - 1
    const userId = await getOrCreateUser(lineUserId)
    const rows = await getMonthlyTransactions(userId)
    if (n < 0 || n >= rows.length) {
      await replyMessage(replyToken, `ไม่มีรายการที่ ${n + 1} ครับ พิมพ์ "รายการ" เพื่อดูรายการทั้งหมด`)
      return
    }
    const target = rows[n]
    const ok = await deleteTransaction(userId, target.id)
    if (ok) {
      await replyMessage(
        replyToken,
        `ลบแล้วครับ — ${typeLabel(target.type)} ${fmt(Number(target.amount))} บาท (${fmtDate(target.date)}) 🗑️`
      )
    } else {
      await replyMessage(replyToken, 'เกิดข้อผิดพลาดครับ ลองใหม่อีกครั้งนะครับ')
    }
    return
  }

  // ── แก้ไข [n] [amount หรือ รายรับ/รายจ่าย] ──────────────────────────────────
  const editMatch = trimmed.match(/^แก้ไข\s+(\d+)\s+(.+)$/)
  if (editMatch) {
    const n = parseInt(editMatch[1]) - 1
    const value = editMatch[2].trim()
    const userId = await getOrCreateUser(lineUserId)
    const rows = await getMonthlyTransactions(userId)

    if (n < 0 || n >= rows.length) {
      await replyMessage(replyToken, `ไม่มีรายการที่ ${n + 1} ครับ พิมพ์ "รายการ" เพื่อดูรายการทั้งหมด`)
      return
    }

    const target = rows[n]

    if (value === 'รายรับ' || value === 'รายจ่าย') {
      const newType = value === 'รายรับ' ? 'income' : 'expense'
      await updateTransactionType(userId, target.id, newType)
      await replyMessage(
        replyToken,
        `เบาใจแก้ไขรายการที่ ${n + 1} เป็น${typeLabel(newType)} ${fmt(Number(target.amount))} บาท แล้วครับ ✅`
      )
      return
    }

    const newAmount = parseFloat(value.replace(/,/g, ''))
    if (!isNaN(newAmount) && newAmount > 0) {
      await updateTransactionAmount(userId, target.id, newAmount)
      await replyMessage(
        replyToken,
        `เบาใจแก้ไขรายการที่ ${n + 1} จาก ${fmt(Number(target.amount))} → ${fmt(newAmount)} บาท แล้วครับ ✅`
      )
      return
    }

    await replyMessage(replyToken, 'รูปแบบไม่ถูกต้องครับ\nตัวอย่าง: "แก้ไข 1 8000" หรือ "แก้ไข 1 รายรับ"')
    return
  }

  // ── สรุป ─────────────────────────────────────────────────────────────────────
  if (trimmed === 'สรุป') {
    const userId = await getOrCreateUser(lineUserId)
    const s = await getMonthlySummary(userId)
    const now = new Date()
    const monthName = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
    await replyFlex(
      replyToken,
      `สรุป${monthName}`,
      buildSummaryFlex(monthName, s.income, s.expense, s.balance, s.monthlyTaxSetAside)
    )
    return
  }

  // ── default ───────────────────────────────────────────────────────────────────
  await replyMessage(
    replyToken,
    'พิมพ์จำนวนเงินได้เลยครับ (เช่น 15000)\nหรือพิมพ์ "สรุป" เพื่อดูยอดรวมเดือนนี้'
  )
}
