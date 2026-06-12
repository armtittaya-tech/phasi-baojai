import { NextRequest, NextResponse } from 'next/server'
import { verifySignature, handleEvent } from '@/lib/line'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-line-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    console.warn('[LINE webhook] invalid signature')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  const body = JSON.parse(rawBody)

  for (const event of body.events ?? []) {
    if (event.type !== 'message' || event.message?.type !== 'text') continue

    const text: string = event.message.text
    const replyToken: string = event.replyToken
    const lineUserId: string = event.source?.userId ?? ''

    try {
      await handleEvent(replyToken, text, lineUserId)
    } catch (err) {
      console.error('[LINE webhook] error:', err)
    }
  }

  return NextResponse.json({ ok: true })
}
