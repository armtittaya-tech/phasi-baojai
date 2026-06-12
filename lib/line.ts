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

type Deduction = {
  type: string
  amount: number
}

// ─── Deduction type registry ──────────────────────────────────────────────────

type DeductionMeta = { key: string; label: string; max: number; aliases: string[] }

const DEDUCTION_TYPES: DeductionMeta[] = [
  { key: 'life_insurance',    label: 'ประกันชีวิต',         max: 100000, aliases: ['ประกันชีวิต', 'ไลฟ์'] },
  { key: 'health_insurance',  label: 'ประกันสุขภาพ',        max: 25000,  aliases: ['ประกันสุขภาพ', 'ประกันสุข'] },
  { key: 'social_security',   label: 'ประกันสังคม',         max: 9000,   aliases: ['ประกันสังคม', 'สังคม'] },
  { key: 'rmf',               label: 'กองทุน RMF',          max: 500000, aliases: ['rmf', 'RMF'] },
  { key: 'ssf',               label: 'กองทุน SSF',          max: 200000, aliases: ['ssf', 'SSF'] },
  { key: 'pvd',               label: 'กองทุนสำรองเลี้ยงชีพ', max: 500000, aliases: ['pvd', 'PVD', 'กองทุนสำรอง'] },
  { key: 'provident_fund',    label: 'กบข./กองทุนบำเหน็จ',  max: 500000, aliases: ['กบข', 'กองทุนบำเหน็จ'] },
  { key: 'education_donation',label: 'บริจาคเพื่อการศึกษา', max: 200000, aliases: ['บริจาคการศึกษา', 'บริจาคศึกษา'] },
  { key: 'general_donation',  label: 'บริจาคทั่วไป',        max: 100000, aliases: ['บริจาค', 'บริจาคทั่วไป'] },
]

function findDeductionType(input: string): DeductionMeta | undefined {
  const q = input.trim().toLowerCase()
  return DEDUCTION_TYPES.find((d) =>
    d.key === q || d.aliases.some((a) => a.toLowerCase() === q)
  )
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
  monthlyTax: number,
  savedDeductions = 0
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
        ...(savedDeductions > 0
          ? [{ type: 'text', text: `รวมลดหย่อน ${fmt(savedDeductions + 60000)} บาท`, size: 'xxs', color: '#86efac', margin: '4px' }]
          : [{ type: 'text', text: 'พิมพ์ "ลดหย่อน ประกันชีวิต 25000" เพื่อเพิ่มลดหย่อน', size: 'xxs', color: '#86efac', margin: '4px' }]),
      ],
    },
  }
}

function buildDeductionFlex() {
  const deductionRow = (label: string, max: string, note?: string) => ({
    type: 'box',
    layout: 'vertical',
    paddingTop: '10px',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: label, size: 'sm', color: '#111827', flex: 5, wrap: true },
          { type: 'text', text: max, size: 'sm', color: '#16a34a', align: 'end', weight: 'bold', flex: 4 },
        ],
      },
      ...(note ? [{ type: 'text', text: note, size: 'xxs', color: '#9ca3af', margin: '4px', wrap: true }] : []),
    ],
  })

  const separator = { type: 'separator', margin: '10px' }

  const header = (emoji: string, title: string, bg: string) => ({
    type: 'box',
    layout: 'vertical',
    backgroundColor: bg,
    paddingAll: '14px',
    contents: [
      { type: 'text', text: emoji + ' ' + title, color: '#ffffff', size: 'md', weight: 'bold' },
    ],
  })

  const card = (emoji: string, title: string, bg: string, rows: object[]) => ({
    type: 'bubble',
    size: 'kilo',
    header: header(emoji, title, bg),
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '14px',
      contents: rows,
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#f9fafb',
      paddingAll: '10px',
      contents: [
        { type: 'text', text: '* ปีภาษี 2567 | อ้างอิงกรมสรรพากร', size: 'xxs', color: '#9ca3af' },
      ],
    },
  })

  return {
    type: 'carousel',
    contents: [
      card('👤', 'ลดหย่อนส่วนบุคคล', '#1e40af', [
        deductionRow('ส่วนตัว', '60,000 บาท'),
        separator,
        deductionRow('คู่สมรส (ไม่มีรายได้)', '60,000 บาท'),
        separator,
        deductionRow('บุตร (คนละ)', '30,000 บาท', 'บุตรคนที่ 2+ เกิดปี 2561 เป็นต้นไป ได้ 60,000 บาท'),
        separator,
        deductionRow('บิดา-มารดา (คนละ)', '30,000 บาท', 'สูงสุด 4 คน (ต้องอายุ 60+ และรายได้ไม่เกิน 30,000/ปี)'),
        separator,
        deductionRow('ผู้พิการ/ทุพพลภาพ (คนละ)', '60,000 บาท'),
      ]),

      card('🛡️', 'ประกัน', '#166534', [
        deductionRow('ประกันสังคม', 'สูงสุด 9,000 บาท'),
        separator,
        deductionRow('ประกันชีวิต', 'สูงสุด 100,000 บาท', 'รวมกับประกันสุขภาพไม่เกิน 100,000 บาท'),
        separator,
        deductionRow('ประกันสุขภาพ', 'สูงสุด 25,000 บาท', 'อยู่ในวงเงิน 100,000 ร่วมกับประกันชีวิต'),
        separator,
        deductionRow('ประกันชีวิตแบบบำนาญ', 'สูงสุด 200,000 บาท', 'รวม RMF/SSF/กบข. ไม่เกิน 500,000 บาท'),
      ]),

      card('📈', 'การลงทุน', '#7c3aed', [
        deductionRow('กองทุน RMF', 'สูงสุด 500,000 บาท', '30% ของรายได้ | รวมกองทุนการออมเพื่อเกษียณอื่นๆ ไม่เกิน 500,000 บาท'),
        separator,
        deductionRow('กองทุน SSF', 'สูงสุด 200,000 บาท', '30% ของรายได้ | ถือครองขั้นต่ำ 10 ปี'),
      ]),

      card('🏠', 'อื่นๆ', '#92400e', [
        deductionRow('ดอกเบี้ยเงินกู้ซื้อบ้าน', 'สูงสุด 100,000 บาท'),
        separator,
        deductionRow('ค่าฝากครรภ์/คลอดบุตร', 'สูงสุด 60,000 บาท/ครรภ์'),
        separator,
        deductionRow('เงินบริจาคการศึกษา/กีฬา', '2 เท่า ไม่เกิน 10% ของรายได้สุทธิ'),
        separator,
        deductionRow('เงินบริจาคทั่วไป', 'ไม่เกิน 10% ของรายได้สุทธิ'),
      ]),
    ],
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
  const [rows, deductions] = await Promise.all([
    getMonthlyTransactions(userId),
    getUserDeductions(userId),
  ])
  const income = rows.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const expense = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
  const annualIncome = income * 12
  const savedDeductionsTotal = deductions.reduce((s, d) => s + Number(d.amount), 0)
  const netIncome = Math.max(
    0,
    annualIncome - Math.min(annualIncome * 0.5, 100000) - 60000 - savedDeductionsTotal
  )
  return {
    income,
    expense,
    balance: income - expense,
    monthlyTaxSetAside: calcProgressiveTax(netIncome) / 12,
    savedDeductionsTotal,
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

async function upsertDeduction(userId: string, type: string, amount: number): Promise<void> {
  const { error } = await supabaseServer
    .from('deductions')
    .upsert({ user_id: userId, type, amount, updated_at: new Date().toISOString() }, { onConflict: 'user_id,type' })
  if (error) throw error
}

async function getUserDeductions(userId: string): Promise<Deduction[]> {
  const { data, error } = await supabaseServer
    .from('deductions')
    .select('type, amount')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as Deduction[]
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


function buildUserDeductionsFlex(deductions: Deduction[]): object {
  const rows = DEDUCTION_TYPES.map((meta) => {
    const saved = deductions.find((d) => d.type === meta.key)
    const amount = saved ? Number(saved.amount) : 0
    const filled = amount > 0
    return {
      type: 'box',
      layout: 'horizontal',
      paddingTop: '10px',
      contents: [
        {
          type: 'text',
          text: meta.label,
          size: 'sm',
          color: filled ? '#111827' : '#9ca3af',
          flex: 5,
          gravity: 'center',
        },
        {
          type: 'text',
          text: filled ? `${fmt(amount)} บาท` : '—',
          size: 'sm',
          color: filled ? '#16a34a' : '#d1d5db',
          align: 'end',
          weight: filled ? 'bold' : 'regular',
          flex: 4,
          gravity: 'center',
        },
      ],
    }
  })

  const total = deductions.reduce((s, d) => s + Number(d.amount), 0)

  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#1e40af',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: '✨ ค่าลดหย่อนของคุณ', color: '#dbeafe', size: 'xs', weight: 'bold' },
        { type: 'text', text: 'รวมทั้งปี', color: '#ffffff', size: 'lg', weight: 'bold', margin: 'xs' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      contents: [
        ...rows,
        { type: 'separator', margin: '12px' },
        {
          type: 'box',
          layout: 'horizontal',
          paddingTop: '10px',
          contents: [
            { type: 'text', text: 'รวมลดหย่อน', size: 'sm', color: '#374151', weight: 'bold', flex: 5 },
            { type: 'text', text: `${fmt(total + 60000)} บาท`, size: 'sm', color: '#1d4ed8', align: 'end', weight: 'bold', flex: 4 },
          ],
        },
        { type: 'text', text: '(รวมส่วนตัว 60,000 บาทแล้ว)', size: 'xxs', color: '#9ca3af', margin: '4px', align: 'end' },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#eff6ff',
      paddingAll: '12px',
      contents: [
        { type: 'text', text: 'บันทึก → "ลดหย่อน ประกันชีวิต 25000"', size: 'xxs', color: '#3b82f6' },
      ],
    },
  }
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

  // ── ลดหย่อน [ประเภท] [จำนวน] — บันทึกค่าลดหย่อน ────────────────────────────
  const saveDeductionMatch = trimmed.match(/^ลดหย่อน\s+(.+?)\s+(\d[\d,]*)$/)
  if (saveDeductionMatch) {
    const typeName = saveDeductionMatch[1].trim()
    const amount = parseFloat(saveDeductionMatch[2].replace(/,/g, ''))
    const meta = findDeductionType(typeName)
    if (!meta) {
      await replyMessage(
        replyToken,
        `ไม่รู้จักประเภท "${typeName}" ครับ\nลองพิมพ์ "ลดหย่อน" เพื่อดูรายการที่รองรับ`
      )
      return
    }
    const capped = Math.min(amount, meta.max)
    const userId = await getOrCreateUser(lineUserId)
    await upsertDeduction(userId, meta.key, capped)
    const capNote = amount > meta.max ? `\n(จำกัดสูงสุด ${fmt(meta.max)} บาท ตามกฎหมาย)` : ''
    await replyMessage(
      replyToken,
      `บันทึก${meta.label} ${fmt(capped)} บาท แล้วครับ ✅${capNote}\n\nพิมพ์ "ดูลดหย่อน" เพื่อดูรายการทั้งหมด`
    )
    return
  }

  // ── ดูลดหย่อน — แสดงรายการลดหย่อนที่บันทึกไว้ ────────────────────────────
  if (trimmed === 'ดูลดหย่อน') {
    const userId = await getOrCreateUser(lineUserId)
    const deductions = await getUserDeductions(userId)
    await replyFlex(replyToken, 'ค่าลดหย่อนของคุณ', buildUserDeductionsFlex(deductions))
    return
  }

  // ── ลดหย่อน (ไม่มีพารามิเตอร์) — แสดง guide ──────────────────────────────
  if (trimmed === 'ลดหย่อน') {
    await replyFlex(replyToken, 'รายการค่าลดหย่อนภาษี ปี 2567', buildDeductionFlex())
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
      buildSummaryFlex(monthName, s.income, s.expense, s.balance, s.monthlyTaxSetAside, s.savedDeductionsTotal)
    )
    return
  }

  // ── default ───────────────────────────────────────────────────────────────────
  await replyMessage(
    replyToken,
    'พิมพ์จำนวนเงินได้เลยครับ (เช่น 15000)\nหรือพิมพ์คำสั่ง:\n• "สรุป" — ดูภาษีประมาณการ\n• "รายการ" — ดูธุรกรรมเดือนนี้\n• "ลดหย่อน" — ดูรายการค่าลดหย่อน\n• "ดูลดหย่อน" — ดูที่บันทึกไว้\n• "ลดหย่อน ประกันชีวิต 25000" — บันทึกลดหย่อน'
  )
}
