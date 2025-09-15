'use client'

import { JSX, useMemo, useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'
import { Send, ChevronDown } from 'lucide-react'

// Safe local type for ReactMarkdown code component props (avoids depending on internal paths)
type CodePropsLike = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
  inline?: boolean
  children?: React.ReactNode
}

// Simple theme-friendly DM logo
function LogoDM({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-label="DocuMatey logo"
      className="shrink-0"
    >
      {/* Outer rounded container reacts to theme */}
      <rect x="2" y="2" width="44" height="44" rx="12" className="fill-neutral-900 dark:fill-white" fillOpacity="0.06" />
      {/* D */}
      <path
        d="M12 14h8c6 0 10 4 10 10s-4 10-10 10h-8V14z m6 16c4 0 6-2.5 6-6s-2-6-6-6h-2v12h2z"
        className="fill-blue-600 dark:fill-blue-400"
      />
      {/* M */}
      <path
        d="M28 34V14h4l4 6 4-6h4v20h-4V22l-4 6-4-6v12h-4z"
        className="fill-purple-600 dark:fill-purple-400"
      />
    </svg>
  )
}

export default function Wizard() {
  // Global states shared across steps
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [goal, setGoal] = useState('')
  const [questions, setQuestions] = useState<Array<{ id: string; text: string; options?: string[] }>>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [plan, setPlan] = useState<any | null>(null)

  // UX states
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clarifying, setClarifying] = useState(false)
  const [clarified, setClarified] = useState(false)

  // Chat states
  const [chatInput, setChatInput] = useState('')
  const [chatAnswer, setChatAnswer] = useState<{ answer: string; citations: { url: string; evidence: string }[] } | null>(null)
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string,
    role: 'user' | 'assistant',
    content: string,
    citations?: { url: string; evidence: string }[],
    status?: 'thinking' | 'done'
  }>>([])

  // Interactive plan states
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Sticky measurements
  const [headerH, setHeaderH] = useState(0)

  // Chat auto-scroll
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  useEffect(() => {
    const measure = () => {
      const el = document.getElementById('app-header')
      const h = el ? el.offsetHeight : 0
      setHeaderH(h)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const canNext = useMemo(() => {
    if (busy) return false
    // Step 1: allow Next to attempt skip even without input
    if (step === 1) return true
    if (step === 2) return goal.trim().length > 0
    if (step === 3) return true
    // Step 4: allow Next to submit chat only if there is input
    return Boolean(chatInput.trim())
  }, [busy, step, url, text, goal, chatInput])

  function gotoNext() {
    if (step < 4) setStep((s) => ((s + 1) as any))
  }
  function gotoPrev() {
    if (step > 1) setStep((s) => ((s - 1) as any))
  }

  function showToast(msg: string, isError = false) {
    if (isError) {
      setError(msg)
      setNotice(null)
    } else {
      setNotice(msg)
      setError(null)
    }
  }
  function clearToast(delay = 1800) {
    window.setTimeout(() => {
      setNotice(null)
      setError(null)
    }, delay)
  }

  async function doIndex(): Promise<boolean> {
    setBusy(true)
    setError(null)
    showToast('Indexing…')
    try {
      const res = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url || undefined, text: text || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to index')
      showToast(`Indexed ${data.chunks} chunks from ${data.source}.`)
      clearToast()
      return true
    } catch (e: any) {
      showToast(String(e?.message || e), true)
      clearToast()
      return false
    } finally {
      setBusy(false)
    }
  }

  async function generatePlan(): Promise<boolean> {
    setBusy(true)
    setError(null)
    showToast('Generating plan…')
    setPlan(null)
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, answers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate plan')
      setPlan(data)
      // initialize interactive state
      const newCompleted: Record<string, boolean> = {}
      const newExpanded: Record<string, boolean> = {}
      if (Array.isArray(data.steps)) {
        data.steps.forEach((s: any, i: number) => {
          const id = s.id || String(i)
          newCompleted[id] = false
          // expand first item by default
          newExpanded[id] = i === 0
        })
        setSelectedStepId(data.steps[0]?.id || '0')
      }
      setCompleted(newCompleted)
      setExpanded(newExpanded)
      showToast('Plan generated')
      clearToast()
      return true
    } catch (e: any) {
      showToast(String(e?.message || e), true)
      clearToast()
      return false
    } finally {
      setBusy(false)
    }
  }

  async function askChat(): Promise<boolean> {
    if (!chatInput.trim()) return false
    setBusy(true)
    setError(null)
    showToast('Thinking…')
    // push user message and a thinking assistant placeholder
    const userMsg = { id: `u-${Date.now()}`, role: 'user' as const, content: chatInput.trim() }
    const asstId = `a-${Date.now()}`
    const placeholder = { id: asstId, role: 'assistant' as const, content: 'Thinking…', status: 'thinking' as const }
    setChatMessages((prev) => [...prev, userMsg, placeholder])
    const toSend = chatInput
    setChatInput('')
    setChatAnswer(null)
    try {
      // Ensure we have the selected step's detail and citations available in this scope
      const steps = Array.isArray(plan?.steps) ? (plan as any).steps : []
      const idx = steps.findIndex((x: any, i: number) => (x.id || String(i)) === selectedStepId)
      const step = idx >= 0 ? steps[idx] : null
      const stepDetail: string = String(step?.detail || '')
      const stepCitations: Array<{ url: string; evidence?: string }> = Array.isArray(step?.citations) ? step.citations : []
      const assumptions: string[] = Array.isArray((plan as any)?.assumptions) ? (plan as any).assumptions : []

      // Derive host filter from citations (single host only)
      const hosts = Array.from(new Set(stepCitations.map((c) => { try { return new URL(c.url).host } catch { return '' } }).filter(Boolean)))
      const hostFilter: { sourceHost?: string } | undefined = hosts.length === 1 ? { sourceHost: hosts[0] } : undefined
      // Provide slim chat history for grounding (skip thinking placeholders)
      const history = chatMessages
        .filter((m) => m.status !== 'thinking')
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: toSend,
          stepId: selectedStepId,
          stepDetail,
          stepCitations,
          assumptions,
          history,
          // strengthen filter using a common path prefix if available
          filters: (() => {
            if (!hostFilter) return undefined
            try {
              const urls = stepCitations
                .map((c) => { try { return new URL(c.url) } catch { return null } })
                .filter((u): u is URL => !!u)
              if (urls.length < 2) return hostFilter
              // compute common pathname prefix
              const paths = urls.map((u) => u.pathname.split('/').filter(Boolean))
              const minLen = Math.min(...paths.map((p) => p.length))
              const commonParts: string[] = []
              for (let i = 0; i < minLen; i++) {
                const part = paths[0][i]
                if (paths.every((p) => p[i] === part)) commonParts.push(part)
                else break
              }
              if (commonParts.length >= 1) {
                const u0 = urls[0]
                const prefix = `${u0.protocol}//${u0.host}/${commonParts.join('/')}`
                return { ...hostFilter, sourcePrefix: prefix }
              }
              return hostFilter
            } catch {
              return hostFilter
            }
          })(),
          topK: 5,
          strict: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to get answer')
      // update placeholder to real answer
      setChatMessages((prev) => prev.map(m => m.id === asstId ? { id: asstId, role: 'assistant', content: data.answer || String(data || ''), citations: data.citations || [], status: 'done' } : m))
      setChatAnswer(data)
      showToast('Answer ready')
      clearToast()
      return true
    } catch (e: any) {
      const msg = String(e?.message || e)
      showToast(msg, true)
      // mark placeholder as error text
      setChatMessages((prev) => prev.map(m => m.status === 'thinking' ? { ...m, content: msg, status: 'done' } : m))
      clearToast()
      return false
    } finally {
      setBusy(false)
    }
  }

  async function trySkip(): Promise<boolean> {
    setBusy(true)
    setError(null)
    showToast('Checking existing index…')
    try {
      const res = await fetch('/api/status', { method: 'GET' })
      const data = await res.json()
      if (Number(data?.count) > 0) {
        showToast(`Found ${data.count} indexed chunks`)
        clearToast()
        return true
      } else {
        showToast('No existing indexed data found. Please index a URL or paste text.', true)
        clearToast()
        return false
      }
    } catch (e: any) {
      showToast(String(e?.message || e), true)
      clearToast()
      return false
    } finally {
      setBusy(false)
    }
  }

  // Step 2: Proceed should generate follow-up questions then allow user to review; move to Step 3 on next click
  async function proceedStep2(): Promise<boolean> {
    if (!goal.trim()) return false
    setClarifying(true)
    setError(null)
    showToast('Generating follow‑up questions…')
    try {
      const res = await fetch('/api/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, context: {} }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate follow-up questions')

      const qs = data.questions || []
      setQuestions(qs)
      const init: Record<string, string> = {}
      qs.forEach((q: any) => (init[q.id] = ''))
      setAnswers(init)

      showToast(qs.length ? `Generated ${qs.length} follow‑ups` : 'No follow‑ups needed')
      clearToast()
      setClarified(true)
      return true
    } catch (e: any) {
      showToast(String(e?.message || e), true)
      clearToast()
      return false
    } finally {
      setClarifying(false)
    }
  }

  async function primaryAction() {
    if (busy) return
    if (step === 1) {
      // Prefer indexing if user provided input, otherwise attempt skip
      const ok = url || text ? await doIndex() : await trySkip()
      if (ok) gotoNext()
      return
    }
    if (step === 2) {
      if (!clarified) {
        await proceedStep2() // stay on step 2 to display questions
      } else {
        gotoNext()
      }
      return
    }
    if (step === 3) {
      const ok = await generatePlan()
      if (ok) gotoNext()
      return
    }
    if (step === 4) {
      await askChat()
      return
    }
  }

  // Utility: render step detail as Markdown (GFM) with fallback + citations
  function renderDetail(detail: string, citations?: { url: string; evidence?: string }[]) {
    const hasFenced = /```[\s\S]*?```/.test(detail)
    const content = hasFenced ? (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown rehypePlugins={[rehypeHighlight]} components={mkMarkdownComponents()}>
          {detail}
        </ReactMarkdown>
      </div>
    ) : (
      // Fallback to heuristic splitting + copy for single-line commands
      (() => {
        const blocks: JSX.Element[] = []
        const lines = detail.split('\n')
        const acc: string[] = []
        const flushText = () => {
          if (acc.length) {
            blocks.push(<p key={`pt-${blocks.length}`} className="text-sm opacity-90 whitespace-pre-wrap">{acc.join('\n')}</p>)
            acc.length = 0
          }
        }
        lines.forEach((ln) => {
          if (/^\s*\$|^\s*(npm |yarn |pnpm |bun |python |pip |pip3 |node |npx |curl |wget |git )/i.test(ln)) {
            flushText()
            blocks.push(renderCodeBlock(ln.replace(/^\s*\$\s?/, ''), `sh-${blocks.length}`))
          } else {
            acc.push(ln)
          }
        })
        flushText()
        return <div className="grid gap-2">{blocks}</div>
      })()
    )

    return (
      <div className="grid gap-2">
        {content}
        {Array.isArray(citations) && citations.length > 0 && (
          <div className="mt-2 text-xs">
            <div className="font-semibold mb-1">Citations</div>
            <ul className="list-disc ml-5">
              {citations.map((c, i) => (
                <li key={i}>
                  <a className="underline" href={c.url} target="_blank" rel="noreferrer">{c.url}</a>
                  {c.evidence && <span className="opacity-70"> — {c.evidence}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  function renderCodeBlock(code: string, key: string) {
    return (
      <div key={key} className="relative group">
        <pre className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-black/10 dark:border-white/10 rounded-md p-3 overflow-auto whitespace-pre-wrap break-words pr-10">
          <code>{code}</code>
        </pre>
        <Button
          type="button"
          className="absolute top-2 right-2 h-7 px-2 text-xs bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
          onClick={() => {
            navigator.clipboard.writeText(code)
            showToast('Copied')
            clearToast()
          }}
        >
          Copy
        </Button>
      </div>
    )
  }

  function confirmAndHome() {
    if (confirm('Leave and go back to Home? Your progress will be lost.')) {
      window.location.href = '/'
    }
  }

  const isOutcome = step === 4

  // Typed markdown components (fixes TS error: 'inline' does not exist ...)
  const mkMarkdownComponents = (): Components => ({
    pre({ children }) {
      const raw = (() => {
        try { return String((children as any)?.props?.children || '') } catch { return '' }
      })()
      return (
        <div className="relative group not-prose">
          <pre className="max-w-full overflow-auto rounded-md bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 text-xs p-3 whitespace-pre-wrap break-words pr-10 hljs">{children}</pre>
          <Button
            type="button"
            className="absolute top-2 right-2 h-7 px-2 text-xs bg-white/15 hover:bg-white/25"
            onClick={() => { navigator.clipboard.writeText(raw); showToast('Copied'); clearToast() }}
          >
            Copy
          </Button>
        </div>
      )
    },
    code(props: CodePropsLike) {
      const { inline, children, ...rest } = props || {}
      if (inline) return <code className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 break-words" {...rest}>{children}</code>
      // block code is rendered by pre; fall back (no copy) just in case
      return <code {...rest}>{children}</code>
    },
  })

  return (
    <div className={`h-dvh overflow-hidden grid ${isOutcome ? 'grid-rows-[auto_1fr]' : 'grid-rows-[auto_1fr_auto]'} bg-white dark:bg-[#080707]`}>
      {/* Header */}
      <header id="app-header" className="px-6 py-4 border-b bg-white/70 dark:bg-neutral-950/50 backdrop-blur supports-[backdrop-filter]:bg-white/40">
        <div className={`mx-auto ${isOutcome ? 'max-w-7xl' : 'max-w-5xl'} flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-3">
            <LogoDM />
            <span className="text-lg font-semibold">DocuMatey</span>
          </div>
          <div className="flex items-center gap-3">
            {isOutcome && (
              <Button variant="outline" onClick={confirmAndHome} className="mr-2">
                Back to Home
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main area: card wizard for steps 1–3, full-width workspace for outcome */}
      <main className={`px-6 ${isOutcome ? 'overflow-hidden' : 'overflow-auto'} min-h-0 h-full`}>
        <div className={`mx-auto ${isOutcome ? 'max-w-7xl' : 'max-w-5xl'} py-6 min-h-0 h-full`}>
          {!isOutcome ? (
            <Card className="w-full max-w-2xl mx-auto border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#0b0b0b]/70 backdrop-blur rounded-2xl shadow-sm">
              <CardHeader>
                {step === 1 && (
                  <div>
                    <CardTitle>Step 1 · Index Documentation</CardTitle>
                    <CardDescription>Paste a documentation URL to crawl or paste raw text.</CardDescription>
                  </div>
                )}
                {step === 2 && (
                  <div>
                    <CardTitle>Step 2 · Clarify Your Goal</CardTitle>
                    <CardDescription>Describe your target outcome. We'll detect any missing details.</CardDescription>
                  </div>
                )}
                {step === 3 && (
                  <div>
                    <CardTitle>Step 3 · Review & Generate Plan</CardTitle>
                    <CardDescription>Confirm your goal and answers, then generate an actionable plan.</CardDescription>
                  </div>
                )}
              </CardHeader>

              <CardContent className="grid gap-5 min-h-0">
                {step === 1 && (
                  <section className="grid gap-4">
                    <div className="grid gap-2">
                      <label className="text-sm">Documentation URL</label>
                      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.example.com/guide" />
                    </div>
                    <div className="text-center text-xs opacity-60">or</div>
                    <div className="grid gap-2">
                      <label className="text-sm">Unstructured text</label>
                      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste documentation text here..." />
                    </div>
                  </section>
                )}

                {step === 2 && (
                  <section className="grid gap-4 min-h-0">
                    <div className="grid gap-2">
                      <label className="text-sm">Describe your goal</label>
                      <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g., Build a RAG endpoint in Next.js using TiDB Vector" />
                    </div>

                    {/* After generation, show follow-up questions inline for review */}
                    {clarified && questions.length > 0 && (
                      <div className="grid gap-3 mt-2">
                        <div className="text-sm font-medium">Follow-up questions</div>
                        {questions.map((q) => (
                          <div key={q.id} className="grid gap-1 border-b last:border-b-0 border-black/5 dark:border-white/10 pb-3">
                            <div className="text-sm">{q.text}</div>
                            {q.options && q.options.length > 0 ? (
                              <Select
                                value={answers[q.id] || ''}
                                onValueChange={(v: any) => setAnswers({ ...answers, [q.id]: v })}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select an option" />
                                </SelectTrigger>
                                <SelectContent>
                                  {q.options.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                placeholder="Your answer"
                                value={answers[q.id] || ''}
                                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {step === 3 && (
                  <section className="grid gap-5">
                    {/* Goal summary */}
                    <div className="grid gap-2">
                      <div className="text-sm font-semibold tracking-tight">Goal</div>
                      <div className="rounded-md border border-black/10 dark:border-white/10 bg-neutral-50/70 dark:bg-neutral-900/60 px-4 py-3 text-sm">
                        {goal ? (
                          <span className="opacity-90">{goal}</span>
                        ) : (
                          <span className="opacity-60">(empty)</span>
                        )}
                      </div>
                    </div>

                    {/* Answers as modern key/value grid */}
                    <div className="grid gap-3">
                      <div className="text-sm font-semibold tracking-tight">Your answers</div>
                      {Object.keys(answers).length > 0 ? (
                        <div className="grid gap-2">
                          {Object.entries(answers).map(([k, v]) => (
                            <div key={k} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] items-start gap-2 rounded-md border border-black/5 dark:border-white/10 bg-white/60 dark:bg-neutral-950/40 px-3 py-2">
                              <div>
                                <span className="inline-flex items-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">{k}</span>
                              </div>
                              <div className="text-sm opacity-90">{v || '-'}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm opacity-70">No answers provided.</div>
                      )}
                    </div>

                    {/* Plan preview */}
                    {plan ? (
                      <div className="grid gap-3">
                        {Array.isArray(plan.assumptions) && plan.assumptions.length > 0 && (
                          <div className="grid gap-2">
                            <div className="text-sm font-semibold tracking-tight">Assumptions</div>
                            <ul className="list-disc ml-5 text-sm opacity-90">
                              {plan.assumptions.map((a: string, idx: number) => (
                                <li key={idx}>{a}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(plan.steps) && plan.steps.length > 0 && (
                          <div className="grid gap-2">
                            <div className="text-sm font-semibold tracking-tight">Proposed steps</div>
                            <ol className="grid gap-2">
                              {plan.steps.map((s: any, i: number) => (
                                <li key={s.id || i} className="rounded-md border border-black/10 dark:border-white/10 bg-white/50 dark:bg-neutral-950/40 p-3">
                                  <div className="text-sm font-medium">{s.title}</div>
                                  <div className="mt-2">{renderDetail(String(s.detail || ''), s.citations)}</div>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        <div className="text-xs opacity-70">Click Next to generate the plan.</div>
                      </div>
                    )}
                  </section>
                )}
              </CardContent>

              <CardFooter className="flex flex-wrap items-center justify-between gap-3">
                {/* Status area (kept for debug) */}
                <div className="text-sm min-h-[1.5rem] opacity-70">
                  {notice && <span className="text-green-700">{notice}</span>}
                  {error && <span className="text-red-600">{error}</span>}
                </div>

                {/* Contextual secondary actions (e.g., Skip) */}
                <div className="flex items-center gap-2">
                  {step === 1 && (
                    <Button variant="ghost" onClick={async () => { const ok = await trySkip(); if (ok) gotoNext(); }} disabled={busy}>
                      Skip (use existing)
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>
          ) : (
            // Outcome workspace
            <div className="grid grid-cols-[3fr_2fr] gap-6 min-h-0 h-full">
              <div className="grid grid-rows-[auto_1fr] gap-4 min-h-0 h-full min-w-0">
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold">Build Plan</div>
                  {Array.isArray(plan?.steps) && plan!.steps.length > 0 && (
                    (() => {
                      const total = plan!.steps.length
                      const done = Object.values(completed).filter(Boolean).length
                      const pct = Math.round((done / Math.max(total, 1)) * 100)
                      return (
                        <div className="flex items-center gap-3 min-w-[200px]">
                          <div className="text-xs opacity-70">{done}/{total}</div>
                          <div className="h-2 w-40 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                            <div className="h-full bg-blue-500/70" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })()
                  )}
                </div>
                {Array.isArray(plan?.steps) && plan!.steps.length > 0 ? (
                  <ol className="grid gap-3 overflow-auto min-h-0 h-full pr-1 pb-6">
                    {plan!.steps.map((s: any, i: number) => {
                      const id = s.id || String(i)
                      const isOpen = !!expanded[id]
                      return (
                        <li key={id} className={`rounded-xl border ${selectedStepId === id ? 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.25)]' : 'border-black/10 dark:border-white/10'} bg-white/80 dark:bg-neutral-950/40 transition-colors hover:border-blue-400/60`}>
                          {/* Accordion header */}
                          <button
                            type="button"
                            className="w-full text-left px-4 py-3 flex items-start gap-3"
                            onClick={() => {
                              setSelectedStepId(id)
                              setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
                            }}
                          >
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 flex-none"
                              checked={!!completed[id]}
                              onChange={(e) => setCompleted({ ...completed, [id]: e.target.checked })}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-semibold tracking-tight truncate">{s.title}</div>
                                <ChevronDown className={`h-4 w-4 flex-none transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                              </div>
                            </div>
                          </button>
                          {/* Accordion content */}
                          {isOpen && (
                            <div className="px-4 pb-4">
                              <div className="mt-2">{renderDetail(String(s.detail || ''), s.citations)}</div>
                              {Array.isArray(s.citations) && s.citations.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {s.citations.map((c: any, j: number) => (
                                    <a key={j} href={c.url} target="_blank" rel="noreferrer" className="text-xs rounded-full border border-black/10 dark:border-white/10 px-2 py-0.5 hover:underline">
                                      {(new URL(c.url)).host.replace('www.', '')}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                ) : (
                  <div className="text-sm opacity-70">No plan steps available.</div>
                )}
              </div>

              {/* Chat panel (sticky) */}
              <div className="col-span-1 min-w-0">
                <div
                  className="sticky grid grid-rows-[auto_minmax(0,1fr)_auto] gap-3 bg-transparent min-h-0 box-border"
                  style={{ top: headerH + 10, height: `calc(100dvh - ${headerH}px - 20px)` }}
                >
                  {/* Header */}
                  <div className="grid gap-1">
                    <div className="text-base font-semibold">Chat helper</div>
                    <div className="text-xs opacity-70">
                      Context: {selectedStepId ? `Step ${plan?.steps?.findIndex((x: any, idx: number) => (x.id || String(idx)) === selectedStepId) + 1}` : 'None selected'}
                    </div>
                  </div>

                  {/* Scrollable answer area */}
                  <div className="min-h-0 overflow-auto rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-neutral-950/40 p-3 pb-2 shadow-sm">
                    {chatMessages.length === 0 ? (
                      <div className="text-xs opacity-70">Ask a question about the selected step. The conversation will appear here.</div>
                    ) : (
                      <div className="grid gap-3">
                        {chatMessages.map((m) => (
                          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gradient-to-b from-white/90 to-white/80 dark:from-neutral-900 dark:to-neutral-950 text-neutral-900 dark:text-neutral-100'} rounded-2xl px-3 py-2 max-w-[90%] shadow-sm border border-black/5 dark:border-white/10`}> 
                              {m.status === 'thinking' ? (
                                <div className="text-xs opacity-80 flex items-center gap-2">
                                  <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span></span>
                                  Thinking…
                                </div>
                              ) : (
                                <div className="prose dark:prose-invert max-w-none text-[13px] leading-5">
                                  <ReactMarkdown rehypePlugins={[rehypeHighlight]} components={mkMarkdownComponents()}>
                                    {m.content}
                                  </ReactMarkdown>
                                </div>
                              )}
                              {m.role === 'assistant' && Array.isArray(m.citations) && m.citations.length > 0 && (
                                <div className="mt-2 text-xs opacity-80">
                                  <div className="font-semibold mb-1">Sources</div>
                                  <ul className="list-disc ml-5">
                                    {m.citations.map((c, i) => (
                                      <li key={i}>
                                        <a className="underline" href={c.url} target="_blank" rel="noreferrer">{c.url}</a>
                                        {c.evidence && <span> — {c.evidence}</span>}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>

                  {/* Composer fixed at bottom of panel */}
                  <div className="flex items-end gap-2 mt-2 pb-6">
                    <Textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (!busy && chatInput.trim()) {
                            askChat();
                          }
                        }
                      }}
                      placeholder="Ask about the selected step…"
                      className="min-h-[40px] max-h-[120px] resize-none rounded-xl border-black/10 dark:border-white/10 focus-visible:ring-2 bg-white/90 dark:bg-neutral-900 text-sm"
                    />
                    <Button onClick={askChat} disabled={busy || !chatInput.trim()} className="h-[44px] px-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow">
                      <Send className="h-4 w-4" />
                      <span className="sr-only">Send</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer (hidden on outcome) */}
      {!isOutcome && (
        <footer className="px-6 py-4 border-t bg-white/70 dark:bg-neutral-950/50 backdrop-blur supports-[backdrop-filter]:bg-white/40">
          <div className={`mx-auto ${isOutcome ? 'max-w-7xl' : 'max-w-5xl'} flex items-center justify-between gap-3`}>
            <div />
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={gotoPrev} disabled={step === 1 || busy}>
                Back
              </Button>
              <Button onClick={primaryAction} disabled={!canNext || busy || clarifying}>
                Next
              </Button>
            </div>
          </div>
        </footer>
      )}

      {/* Toast */}
      {(notice || error && notice != 'Thinking…') && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className={`rounded-md px-4 py-2 shadow-lg text-sm ${error ? 'bg-red-600 text-white' : 'bg-black/80 text-white'} backdrop-blur`}> 
            {error || notice}
          </div>
        </div>
      )}
    </div>
  )
}
