import { NextRequest, NextResponse } from 'next/server'
import { verifySignature, replyMessage, buildReply } from '@/lib/line'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-line-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    console.warn('[LINE webhook] invalid signature')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  const body = JSON.parse(rawBody)
  console.log('[LINE webhook] events:', JSON.stringify(body.events, null, 2))

  for (const event of body.events ?? []) {
    if (event.type !== 'message' || event.message?.type !== 'text') continue

    const text: string = event.message.text
    const replyToken: string = event.replyToken

    try {
      await replyMessage(replyToken, buildReply(text))
    } catch (err) {
      console.error('[LINE webhook] reply error:', err)
    }
  }

  // LINE requires 200 OK even if we had partial errors
  return NextResponse.json({ ok: true })
}
