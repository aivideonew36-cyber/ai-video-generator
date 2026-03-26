'use client'

import { useEffect, useState } from 'react'
import { Cpu, Zap, Film } from 'lucide-react'

interface Props {
  totalSegments: number
}

const STEPS = [
  { label: 'Chargement des poids Wan 2.1', icon: Cpu, duration: 8000 },
  { label: 'Génération segment 1/6', icon: Film, duration: 12000 },
  { label: 'Génération segment 2/6', icon: Film, duration: 12000 },
  { label: 'Génération segment 3/6', icon: Film, duration: 12000 },
  { label: 'Génération segment 4/6', icon: Film, duration: 12000 },
  { label: 'Génération segment 5/6', icon: Film, duration: 12000 },
  { label: 'Génération segment 6/6', icon: Film, duration: 12000 },
  { label: 'Assemblage FFmpeg + cross-fade', icon: Zap, duration: 5000 },
  { label: 'Upscaling Real-ESRGAN 4×', icon: Zap, duration: 10000 },
]

export default function ProgressTracker({ totalSegments }: Props) {
  const [currentStep, setCurrentStep] = useState(0)
  const [stepProgress, setStepProgress] = useState(0)

  useEffect(() => {
    let timeout: NodeJS.Timeout
    let interval: NodeJS.Timeout

    const advanceStep = (stepIdx: number) => {
      if (stepIdx >= STEPS.length) return
      setCurrentStep(stepIdx)
      setStepProgress(0)

      const step = STEPS[stepIdx]
      const updateInterval = 100
      const totalUpdates = step.duration / updateInterval

      let update = 0
      interval = setInterval(() => {
        update++
        setStepProgress(Math.min((update / totalUpdates) * 100, 98))
        if (update >= totalUpdates) {
          clearInterval(interval)
          setStepProgress(100)
          timeout = setTimeout(() => advanceStep(stepIdx + 1), 300)
        }
      }, updateInterval)
    }

    advanceStep(0)
    return () => { clearTimeout(timeout); clearInterval(interval) }
  }, [totalSegments])

  const overallProgress = ((currentStep + (stepProgress / 100)) / STEPS.length) * 100

  return (
    <div className="card p-6 space-y-5">
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-white font-semibold">Rendu GPU en cours</span>
          <span className="text-indigo-300 text-sm font-mono">{Math.round(overallProgress)}%</span>
        </div>
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {STEPS.map((step, idx) => {
          const Icon = step.icon
          const isActive = idx === currentStep
          const isDone = idx < currentStep

          return (
            <div
              key={idx}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                isActive ? 'bg-indigo-600/20 border border-indigo-500/30' :
                isDone ? 'opacity-50' : 'opacity-30'
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isDone ? 'bg-green-500/30' : isActive ? 'bg-indigo-600/50' : 'bg-white/10'
              }`}>
                {isDone ? (
                  <span className="text-green-400 text-xs">✓</span>
                ) : (
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-300 animate-pulse' : 'text-white/40'}`} />
                )}
              </div>
              <span className={`text-sm ${isActive ? 'text-white' : isDone ? 'text-white/50' : 'text-white/30'}`}>
                {step.label}
              </span>
              {isActive && (
                <div className="ml-auto w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-400 rounded-full transition-all"
                    style={{ width: `${stepProgress}%` }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-white/30 text-xs text-center">
        50 sampling steps · guidance_scale 7.5 · réinjection de seed inter-clips
      </p>
    </div>
  )
}
