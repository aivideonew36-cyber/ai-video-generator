import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const SHOT_TYPES = ['Extreme Close-Up', 'Medium Shot', 'Wide Shot']
const CAMERA_MOVES = ['Dolly Zoom', 'Pan', 'Tilt', 'Tracking', 'Bird\'s Eye View', 'Static']

export async function POST(req: NextRequest) {
  try {
    const { prompt, style } = await req.json()

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt requis' }, { status: 400 })
    }

    const systemPrompt = `Tu es un réalisateur IA expert. Génère un storyboard JSON pour une vidéo de 30 secondes (6 segments de 5 secondes chacun).

RÈGLES OBLIGATOIRES :
- Chaque segment doit avoir un type de plan ET un mouvement de caméra précis
- Types de plans disponibles : ${SHOT_TYPES.join(', ')}
- Mouvements de caméra : ${CAMERA_MOVES.join(', ')}
- Les prompts doivent être détaillés et cinématographiques (en anglais pour Wan 2.1)
- Assurer une cohérence narrative et visuelle entre les segments
- Le premier segment pose le décor (Wide Shot), les suivants développent l'action

Réponds UNIQUEMENT avec du JSON valide, sans explication, dans ce format exact :
{
  "title": "Titre court de la vidéo",
  "style": "Description du style visuel",
  "segments": [
    {
      "id": 1,
      "duration": 5,
      "shot_type": "Wide Shot",
      "camera_move": "Dolly Zoom",
      "prompt": "Detailed cinematic prompt in English for Wan 2.1...",
      "negative_prompt": "blur, low quality, distorted",
      "transition": "cross-fade"
    }
  ]
}`

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Crée un storyboard pour : "${prompt}"${style ? `. Style : ${style}` : ''}` },
      ],
      temperature: 0.8,
      max_tokens: 2048,
    })

    const raw = completion.choices[0]?.message?.content || ''

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Réponse Groq invalide')
    }

    const storyboard = JSON.parse(jsonMatch[0])

    return NextResponse.json({ success: true, storyboard })
  } catch (err) {
    console.error('Storyboard error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 }
    )
  }
}
