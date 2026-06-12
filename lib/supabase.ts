import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = {
  id: string
  line_user_id: string
  created_at: string
}

export type Transaction = {
  id: string
  user_id: string
  type: 'income' | 'expense'
  amount: number
  date: string
  note: string | null
  created_at: string
}

export type Deduction = {
  id: string
  user_id: string
  type: 'personal' | 'social_security' | 'life_insurance'
  amount: number
  updated_at: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getTransactionsByYear(userId: string, year: number) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date', { ascending: false })
  if (error) throw error
  return data as Transaction[]
}

export async function upsertDeduction(
  userId: string,
  type: Deduction['type'],
  amount: number
) {
  const { data, error } = await supabase
    .from('deductions')
    .upsert(
      { user_id: userId, type, amount, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,type' }
    )
    .select()
    .single()
  if (error) throw error
  return data as Deduction
}

export async function getDeductions(userId: string) {
  const { data, error } = await supabase
    .from('deductions')
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  return data as Deduction[]
}
