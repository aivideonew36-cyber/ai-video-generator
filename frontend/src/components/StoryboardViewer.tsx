'use client'

import { Camera, Move, Clock, Cpu, Loader2 } from 'lucide-react'

interface Segment {
  id: number
  duration: number
  shot_type: string
  camera_move: string
  prompt: string
  transition: string
}

interface Storyboard {
  title: string
  style: string
  segments: Segment[]
}

const SHOT_COLORS: Record<string, string> = {
  'Extreme Close-Up': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  'Medium Shot': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'Wide Shot': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
}

const MOVE_COLORS: Record<string, string> = {
  'Dolly Zoom': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'Pan': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Tilt': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  'Tracking': 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  "Bird's Eye View": 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  'Static': 'bg-gray-500/20 text-gray-300 border-gray-500/30',
}

interface Props {
  storyboard: Storyboard
  onGenerate: () => void
  isGenerating: boolean
}

export default function StoryboardViewer({ storyboard, onGenerate, isGenerating }: Props) {
  return (
    <div className="card p-6 space-y-5">
      <div>
        <h2 className="text-white font-bold text-xl">{storyboard.title}</h2>
        <p className="text-white/50 text-sm mt-1">{storyboard.style}</p>
        <div className="flex items-center gap-4 mt-3 text-white/40 text-xs">
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> 30 secondes</span>
          <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" /> {storyboard.segments.length} segments</span>
          <span>50 steps · CFG 7.5</span>
        </div>
      </div>

      <div className="space-y-3">
        {storyboard.segments.map((seg, idx) => (
          <div key={seg.id} className="flex gap-3">
            {/* Timeline */}
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-indigo-600/40 border border-indigo-500/50 flex items-center justify-center text-indigo-300 text-xs font-bold flex-shrink-0">
                {seg.id}
              </div>
              {idx < storyboard.segments.length - 1 && (
                <div className="w-px flex-1 bg-white/10 my-1" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 bg-white/5 rounded-xl p-4 mb-2">
              <div className="flex flex-wrap gap-2 mb-3">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border ${SHOT_COLORS[seg.shot_type] || 'bg-white/10 text-white/60 border-white/20'}`}>
                  <Camera className="w-3 h-3" />
                  {seg.shot_type}
                </span>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border ${MOVE_COLORS[seg.camera_move] || 'bg-white/10 text-white/60 border-white/20'}`}>
                  <Move className="w-3 h-3" />
                  {seg.camera_move}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-white/40 px-2 py-1">
                  <Clock className="w-3 h-3" />{seg.duration}s
                </span>
              </div>
              <p className="text-white/70 text-sm leading-relaxed line-clamp-3">{seg.prompt}</p>
              {idx < storyboard.segments.length - 1 && (
                <p className="text-white/30 text-xs mt-2">↓ {seg.transition}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        className="btn-primary w-full flex items-center justify-center gap-2"
        onClick={onGenerate}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Rendu en cours sur Colab...</>
        ) : (
          '🎬 Lancer le Rendu GPU (Wan 2.1)'
        )}
      </button>
    </div>
  )
}
