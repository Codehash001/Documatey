'use client'

import { useState } from 'react'
import Beams from '@/components/ui/beam-background'
import { Button } from '@/components/ui/button'
import Wizard from '@/components/wizard'
import { ArrowRight } from 'lucide-react'

// Simple theme-friendly DM logo
function LogoDM({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label="DocuMatey logo" className="shrink-0">
      <rect x="2" y="2" width="44" height="44" rx="12" className="fill-neutral-900 dark:fill-white" fillOpacity="0.06" />
      <path d="M12 14h8c6 0 10 4 10 10s-4 10-10 10h-8V14z m6 16c4 0 6-2.5 6-6s-2-6-6-6h-2v12h2z" className="fill-blue-600 dark:fill-blue-400" />
      <path d="M28 34V14h4l4 6 4-6h4v20h-4V22l-4 6-4-6v12h-4z" className="fill-purple-600 dark:fill-purple-400" />
    </svg>
  )
}

export default function Home() {
  const [started, setStarted] = useState(false)

  if (started) {
    return <Wizard />
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Full-bleed animated background */}
      <div className="fixed inset-0 z-0">
        <Beams beamNumber={18} beamHeight={22} beamWidth={1.8} rotation={-10} noiseIntensity={1.5} speed={2.0} />
      </div>

      {/* Overlay header */}
      <header className="absolute top-0 left-0 right-0 z-10 px-6 py-5">
        <div className="flex items-center gap-2 text-white font-semibold text-lg tracking-tight">
          <LogoDM />
          <span>DocuMatey</span>
        </div>
      </header>

      {/* Centered hero content */}
      <main className="relative z-10 h-screen grid place-items-center px-6">
        <div className="text-center max-w-3xl">
          <h1 className="text-white text-5xl sm:text-6xl font-extrabold tracking-tight">Index. Plan. Build.</h1>
          <p className="mt-4 text-white/90 text-lg sm:text-xl">
            Turn your documentation into an agentic workflow: crawl content, ask smart clarifying questions, generate a step-by-step plan with citations, and troubleshoot via chat.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-white/90 text-sm">
            <span className="rounded-full border border-white/30 px-3 py-1 backdrop-blur">Same‑host site crawler</span>
            <span className="rounded-full border border-white/30 px-3 py-1 backdrop-blur">Google Embeddings + TiDB Vector</span>
            <span className="rounded-full border border-white/30 px-3 py-1 backdrop-blur">Gemini 2.5 Pro planning</span>
            <span className="rounded-full border border-white/30 px-3 py-1 backdrop-blur">Citations & Retrieval</span>
          </div>
          <div className="mt-10">
            <Button size="lg" onClick={() => setStarted(true)} className="border border-white bg-black/40 backdrop-blur-sm cursor-pointer hover:bg-black/60">
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}