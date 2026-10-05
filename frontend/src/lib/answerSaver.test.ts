import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionDetail } from '@/types/api'
import { AnswerSaver, DEBOUNCE_TEXT_MS, RETRY_MS, type SaverSnapshot } from './answerSaver'
import type { ExamAnswer } from './exam'
import { tokenStore } from './tokens'

const question = { id: 1, question_type: 'MCQ', starter_code: null, options: [] } as unknown as QuestionDetail
const ok = () => new Response(JSON.stringify({ saved_at: 'now', remaining_seconds: 100 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
const fail = (status: number, detail = 'nope') => new Response(JSON.stringify({ detail }), { status, headers: { 'Content-Type': 'application/json' } })
const fetchMock = vi.fn()
const sentBody = (n: number) => JSON.parse((fetchMock.mock.calls[n]![1] as RequestInit).body as string)

function setup(seconds?: number) {
  const state: { answers: Record<number, ExamAnswer> } = { answers: { 1: { selected_option_ids: [10] } } }
  const snaps: SaverSnapshot[] = []
  const onLocked = vi.fn()
  const onAck = vi.fn()
  const saver = new AnswerSaver({
    attemptId: 5,
    getQuestion: (id) => (id === 1 ? question : undefined),
    getAnswer: (id) => state.answers[id],
    getSeconds: seconds == null ? undefined : () => seconds,
    onAck, onLocked, onChange: (s) => snaps.push(s),
  })
  saver.start()
  return { saver, state, snaps, onLocked, onAck }
}

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  tokenStore.set('A', 'R')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  tokenStore.clear()
})

describe('AnswerSaver', () => {
  it('waits for a pause in typing, then saves only the latest content', async () => {
    fetchMock.mockImplementation(async () => ok())
    const { saver, state, onAck } = setup()
    saver.touch(1, DEBOUNCE_TEXT_MS)
    state.answers[1] = { selected_option_ids: [11] }
    saver.touch(1, DEBOUNCE_TEXT_MS)

    await vi.advanceTimersByTimeAsync(DEBOUNCE_TEXT_MS - 1)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe('PUT')
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/attempts/5/answers/1')
    expect(sentBody(0)).toEqual({ selected_option_ids: [11] })
    expect(onAck).toHaveBeenCalledWith(100)
    expect(saver.hasUnsaved()).toBe(false)
  })

  it('includes the time spent and sends an empty body when the answer was cleared', async () => {
    fetchMock.mockImplementation(async () => ok())
    const { saver, state } = setup(42)
    saver.touch(1, 0)
    await vi.advanceTimersByTimeAsync(1)
    expect(sentBody(0)).toEqual({ selected_option_ids: [10], time_taken_seconds: 42 })

    state.answers[1] = { selected_option_ids: [] }
    saver.touch(1, 0)
    await vi.advanceTimersByTimeAsync(1)
    expect(sentBody(1)).toEqual({})
  })

  it('saves again when the answer changes while a save is in flight', async () => {
    const gates: (() => void)[] = []
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => gates.push(() => resolve(ok()))))
    const { saver, state } = setup()
    saver.touch(1, 0)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    state.answers[1] = { selected_option_ids: [11] }
    saver.touch(1, 0)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(1) // waits for the first save instead of overlapping it

    gates[0]!()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sentBody(1)).toEqual({ selected_option_ids: [11] })
    gates[1]!()
    await vi.advanceTimersByTimeAsync(1)
    expect(saver.hasUnsaved()).toBe(false)
  })

  it('retries after a network failure and recovers', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline')).mockImplementation(async () => ok())
    const { saver, snaps } = setup()
    saver.touch(1, 0)
    await vi.advanceTimersByTimeAsync(1)
    expect(snaps.at(-1)?.status).toBe('error')
    expect(saver.hasUnsaved()).toBe(true)

    await vi.advanceTimersByTimeAsync(RETRY_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(snaps.at(-1)?.status).toBe('saved')
    expect(saver.hasUnsaved()).toBe(false)
  })

  it('does not retry a rejected edit (4xx)', async () => {
    fetchMock.mockImplementation(async () => fail(422, 'bad'))
    const { saver, snaps } = setup()
    saver.touch(1, 0)
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(snaps.at(-1)?.status).toBe('error')
  })

  it('stops for good when the server says the attempt is over (409)', async () => {
    fetchMock.mockImplementation(async () => fail(409, 'Time is up'))
    const { saver, onLocked } = setup()
    saver.touch(1, 0)
    await vi.advanceTimersByTimeAsync(1)
    expect(onLocked).toHaveBeenCalledOnce()
    await expect(saver.flush()).resolves.toBe(false)
    await vi.advanceTimersByTimeAsync(RETRY_MS * 2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('flush saves immediately and cancels the pending debounce', async () => {
    fetchMock.mockImplementation(async () => ok())
    const { saver } = setup()
    saver.touch(1, DEBOUNCE_TEXT_MS)
    await expect(saver.flush()).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_TEXT_MS * 2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('flush reports failure when an answer could not be saved', async () => {
    fetchMock.mockImplementation(async () => fail(500, 'boom'))
    const { saver } = setup()
    saver.touch(1, DEBOUNCE_TEXT_MS)
    await expect(saver.flush()).resolves.toBe(false)
  })
})
