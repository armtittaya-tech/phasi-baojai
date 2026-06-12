import { NextRequest, NextResponse } from 'next/server'
import { verifySignature, handleEvent, handleFollowEvent } from '@/lib/line'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-line-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    console.warn('[LINE webhook] invalid signature')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  const body = JSON.parse(rawBody)

  for (const event of body.events ?? []) {
    const replyToken: string = event.replyToken
    const lineUserId: string = event.source?.userId ?? ''

    try {
      if (event.type === 'follow') {
        await handleFollowEvent(replyToken, lineUserId)
        continue
      }

      if (event.type === 'message' && event.message?.type === 'text') {
        await handleEvent(replyToken, event.message.text, lineUserId)
      }
    } catch (err) {
      console.error('[LINE webhook] error:', err)
    }
  }

  return NextResponse.json({ ok: true })
}
