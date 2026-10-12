import type { QuestionDetail, SaveAck } from '@/types/api'
import { ApiError, http } from './api'
import { answerBody, type ExamAnswer } from './exam'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
export interface SaverSnapshot {
  status: SaveStatus
  unsaved: number
  lastSavedAt: number | null
}
export interface SaverConfig {
  attemptId: number
  getQuestion: (qid: number) => QuestionDetail | undefined
  getAnswer: (qid: number) => ExamAnswer | undefined
  getSeconds?: (qid: number) => number | undefined
  onAck?: (remainingSeconds: number) => void
  /** The server refused the save because the attempt is over (time is up or already submitted). */
  onLocked?: () => void
  onChange?: (snapshot: SaverSnapshot) => void
}

export const DEBOUNCE_CHOICE_MS = 250
export const DEBOUNCE_TEXT_MS = 900
export const RETRY_MS = 4000

const retryable = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status >= 500)

/**
 * Saves each question independently. Per question: edits bump a version, saves send the latest answer, and
 * a save that finishes while a newer edit exists triggers another save. Only network/5xx errors are retried.
 */
export class AnswerSaver {
  private version = new Map<number, number>()
  private saved = new Map<number, number>()
  private inflight = new Map<number, Promise<boolean>>()
  private timers = new Map<number, ReturnType<typeof setTimeout>>()
  private failed = new Set<number>()
  private locked = false
  private disposed = false
  private lastSavedAt: number | null = null

  constructor(private readonly cfg: SaverConfig) {}

  start() {
    this.disposed = false
  }

  /** Stops UI updates and pushes out anything still waiting, so leaving the page doesn't lose answers. */
  dispose() {
    void this.flush()
    this.disposed = true
  }

  get unsaved(): number {
    let n = 0
    for (const [qid, v] of this.version) if ((this.saved.get(qid) ?? 0) < v) n++
    return n
  }
  hasUnsaved() {
    return this.unsaved > 0
  }

  snapshot(): SaverSnapshot {
    const unsaved = this.unsaved
    const status: SaveStatus = this.inflight.size
      ? 'saving'
      : this.failed.size
        ? 'error'
        : unsaved
          ? 'saving'
          : this.lastSavedAt
            ? 'saved'
            : 'idle'
    return { status, unsaved, lastSavedAt: this.lastSavedAt }
  }

  private emit() {
    if (!this.disposed) this.cfg.onChange?.(this.snapshot())
  }

  /** Call after the local answer for `qid` changed. */
  touch(qid: number, delay: number = DEBOUNCE_TEXT_MS) {
    this.version.set(qid, (this.version.get(qid) ?? 0) + 1)
    this.schedule(qid, delay)
    this.emit()
  }

  private schedule(qid: number, delay: number) {
    clearTimeout(this.timers.get(qid))
    this.timers.set(
      qid,
      setTimeout(() => {
        this.timers.delete(qid)
        void this.save(qid)
      }, delay),
    )
  }

  async save(qid: number): Promise<boolean> {
    if (this.locked) return false
    while (this.inflight.has(qid)) await this.inflight.get(qid)
    if (this.locked) return false

    const v = this.version.get(qid) ?? 0
    if ((this.saved.get(qid) ?? 0) >= v) return true
    const question = this.cfg.getQuestion(qid)
    if (!question) {
      this.saved.set(qid, v)
      return true
    }

    const body = answerBody(question, this.cfg.getAnswer(qid), this.cfg.getSeconds?.(qid))
    const run = this.send(qid, v, body)
    this.inflight.set(qid, run)
    this.emit()
    const ok = await run
    this.inflight.delete(qid)
    if (ok && (this.version.get(qid) ?? 0) > v) return this.save(qid) // edited while saving
    this.emit()
    return ok
  }

  private async send(qid: number, v: number, body: unknown): Promise<boolean> {
    try {
      const ack = await http.put<SaveAck>(`/api/attempts/${this.cfg.attemptId}/answers/${qid}`, body)
      this.saved.set(qid, v)
      this.failed.delete(qid)
      this.lastSavedAt = Date.now()
      if (!this.disposed) this.cfg.onAck?.(ack.remaining_seconds)
      return true
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        this.locked = true
        if (!this.disposed) this.cfg.onLocked?.()
        return false
      }
      this.failed.add(qid)
      if (retryable(e) && !this.disposed) this.schedule(qid, RETRY_MS)
      return false
    }
  }

  /** Saves everything outstanding right now. Resolves true only if every answer reached the server. */
  async flush(): Promise<boolean> {
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
    const ids = [...this.version.keys()].filter(
      (q) => this.inflight.has(q) || (this.saved.get(q) ?? 0) < (this.version.get(q) ?? 0),
    )
    const results = await Promise.all(ids.map((q) => this.save(q)))
    return !this.locked && results.every(Boolean)
  }
}
