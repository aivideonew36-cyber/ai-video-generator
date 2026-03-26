'use client'

import { useState, useRef } from 'react'
import { Upload, Wand2, Film, AlertCircle, CheckCircle, Loader2, X } from 'lucide-react'
import StoryboardViewer from './StoryboardViewer'
import ProgressTracker from './ProgressTracker'

type Stage = 'idle' | 'storyboard' | 'rendering' | 'done' | 'error'

interface Segment {
  id: number
  duration: number
  shot_type: string
  camera_move: string
  prompt: string
  negative_prompt: string
  transition: string
}

interface Storyboard {
  title: string
  style: string
  segments: Segment[]
}

export default function VideoGenerator() {
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFiles = (files: FileList) => {
    setMediaFiles(prev => [...prev, ...Array.from(files)])
  }

  const removeFile = (idx: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const generateStoryboard = async () => {
    if (!prompt.trim()) return
    setStage('storyboard')
    setError(null)
    setStoryboard(null)
    setVideoUrl(null)

    try {
      const res = await fetch('/api/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Erreur storyboard')
      setStoryboard(data.storyboard)
      setStage('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      setStage('error')
    }
  }

  const generateVideo = async () => {
    if (!storyboard) return
    setStage('rendering')
    setError(null)

    try {
      let referenceImage: string | null = null
      if (mediaFiles.length > 0) {
        const firstImage = mediaFiles.find(f => f.type.startsWith('image/'))
        if (firstImage) {
          const reader = new FileReader()
          referenceImage = await new Promise(resolve => {
            reader.onload = e => resolve(e.target?.result as string)
            reader.readAsDataURL(firstImage)
          })
        }
      }

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboard, referenceImage }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur de génération')

      setVideoUrl(data.video_url)
      setStage('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      setStage('error')
    }
  }

  const reset = () => {
    setStage('idle')
    setStoryboard(null)
    setVideoUrl(null)
    setError(null)
    setPrompt('')
    setStyle('')
    setMediaFiles([])
  }

  return (
    <div className="space-y-6">
      {/* Input Card */}
      <div className="card p-6 space-y-4">
        <h2 className="text-white font-semibold text-lg flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-indigo-400" />
          Décrivez votre vidéo
        </h2>

        <div>
          <textarea
            className="input-field min-h-[120px] resize-none"
            placeholder="Ex : Un astronaute marche sur Mars au coucher du soleil, découvrant une ancienne cité alien enfouie sous le sable rouge..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={stage === 'storyboard' || stage === 'rendering'}
          />
        </div>

        <div>
          <input
            className="input-field"
            placeholder="Style visuel (optionnel) : cinématique sombre, futuriste lumineux, documentaire naturel..."
            value={style}
            onChange={e => setStyle(e.target.value)}
            disabled={stage === 'storyboard' || stage === 'rendering'}
          />
        </div>

        {/* Media Upload */}
        <div>
          <div
            className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-500/50 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault() }}
            onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
          >
            <Upload className="w-8 h-8 text-white/40 mx-auto mb-2" />
            <p className="text-white/50 text-sm">
              Glissez vos médias ici ou <span className="text-indigo-400">parcourir</span>
            </p>
            <p className="text-white/30 text-xs mt-1">Images de référence, vidéos source (illimité)</p>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={e => e.target.files && handleFiles(e.target.files)}
            />
          </div>

          {mediaFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {mediaFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-white/10 rounded-lg px-3 py-1.5 text-sm text-white/70">
                  <span className="truncate max-w-[150px]">{f.name}</span>
                  <button onClick={() => removeFile(i)} className="text-white/40 hover:text-red-400 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          className="btn-primary w-full flex items-center justify-center gap-2"
          onClick={generateStoryboard}
          disabled={!prompt.trim() || stage === 'storyboard' || stage === 'rendering'}
        >
          {stage === 'storyboard' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Analyse Groq en cours...</>
          ) : (
            <><Film className="w-4 h-4" /> Générer le Storyboard</>
          )}
        </button>
      </div>

      {/* Error */}
      {stage === 'error' && error && (
        <div className="card p-4 border-red-500/30 bg-red-500/10 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 font-medium">Erreur</p>
            <p className="text-red-400/80 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Storyboard */}
      {storyboard && (
        <StoryboardViewer
          storyboard={storyboard}
          onGenerate={generateVideo}
          isGenerating={stage === 'rendering'}
        />
      )}

      {/* Progress during rendering */}
      {stage === 'rendering' && (
        <ProgressTracker totalSegments={storyboard?.segments.length || 6} />
      )}

      {/* Result */}
      {stage === 'done' && videoUrl && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold">Vidéo générée avec succès !</span>
          </div>
          <video
            src={videoUrl}
            controls
            autoPlay
            className="w-full rounded-xl"
          />
          <div className="flex gap-3">
            <a
              href={videoUrl}
              download="video-ia-30s.mp4"
              className="btn-primary flex-1 text-center"
            >
              Télécharger (.mp4)
            </a>
            <button
              onClick={reset}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-6 rounded-xl transition-all"
            >
              Nouvelle vidéo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
