import VideoGenerator from '@/components/VideoGenerator'

export default function Home() {
  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-500/30 rounded-full px-4 py-1.5 text-indigo-300 text-sm font-medium mb-6">
            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse-slow"></span>
            Wan 2.1 × Groq LPU — Rendu GPU sur Google Colab
          </div>
          <h1 className="text-5xl font-bold text-white mb-4 leading-tight">
            Générateur Vidéo IA
          </h1>
          <p className="text-white/60 text-xl max-w-2xl mx-auto">
            Transformez vos idées en 30 secondes de vidéo haute fidélité avec
            des mouvements de caméra cinématographiques professionnels.
          </p>
        </div>

        {/* Main Component */}
        <VideoGenerator />

        {/* Footer */}
        <div className="mt-16 text-center text-white/30 text-sm">
          Propulsé par Wan 2.1 · Groq LPU · FFmpeg · Real-ESRGAN
        </div>
      </div>
    </main>
  )
}
