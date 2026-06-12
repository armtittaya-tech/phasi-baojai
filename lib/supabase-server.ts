import { createClient } from '@supabase/supabase-js'

// ใช้ service role key เพื่อ bypass RLS ฝั่ง server (LINE webhook)
export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
