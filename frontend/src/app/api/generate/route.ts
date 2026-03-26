import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { storyboard, referenceImage } = body

    const colabUrl = process.env.NEXT_PUBLIC_COLAB_URL
    if (!colabUrl) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_COLAB_URL non configuré. Démarrez votre session Colab.' },
        { status: 503 }
      )
    }

    const response = await fetch(`${colabUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyboard, reference_image: referenceImage }),
      signal: AbortSignal.timeout(600_000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Colab error ${response.status}: ${errorText}`)
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('Generate error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur de connexion au serveur Colab' },
      { status: 500 }
    )
  }
}

export async function GET() {
  const colabUrl = process.env.NEXT_PUBLIC_COLAB_URL
  if (!colabUrl) {
    return NextResponse.json({ connected: false, message: 'URL Colab non configurée' })
  }

  try {
    const response = await fetch(`${colabUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    })
    const data = await response.json()
    return NextResponse.json({ connected: response.ok, ...data })
  } catch {
    return NextResponse.json({ connected: false, message: 'Serveur Colab inaccessible' })
  }
}
