import { describe, expect, it } from 'vitest'
import type { AdminQuestion } from '@/types/api'
import { adminQuestion } from '@/test/admin-fixtures'
import { emptyForm, formFromQuestion, parseKeywords, parseTags, toPayload, validateForm, type QuestionForm } from './questionForm'

const valid = (over: Partial<QuestionForm> = {}): QuestionForm => ({
  ...emptyForm('MCQ'), title: 'Binary search', description: 'Complexity?',
  options: [{ text: 'O(n)', is_correct: false }, { text: 'O(log n)', is_correct: true }], ...over,
})

describe('parsing', () => {
  it('normalizes tags like the API does', () => {
    expect(parseTags(' Searching, binary-search , searching,, ')).toEqual(['searching', 'binary-search'])
  })
  it('splits keywords on commas and new lines', () => {
    expect(parseKeywords('circular wait,\nmutual exclusion , circular wait')).toEqual(['circular wait', 'mutual exclusion'])
  })
})

describe('validateForm', () => {
  it('flags an empty new question', () => {
    const e = validateForm(emptyForm())
    expect(Object.keys(e).sort()).toEqual(['description', 'options', 'title'])
  })
  it('accepts a valid MCQ', () => {
    expect(validateForm(valid())).toEqual({})
  })
  it('MCQ needs two filled options and a correct one', () => {
    expect(validateForm(valid({ options: [{ text: 'a', is_correct: true }] })).options).toMatch(/at least 2/)
    expect(validateForm(valid({ options: [{ text: 'a', is_correct: false }, { text: 'b', is_correct: false }] })).options).toMatch(/correct/)
    expect(validateForm(valid({ options: [{ text: 'a', is_correct: true }, { text: '', is_correct: false }] })).options).toMatch(/empty/)
  })
  it('checks the time limit and tag count', () => {
    expect(validateForm(valid({ time_limit: '0' })).time_limit).toBeDefined()
    expect(validateForm(valid({ time_limit: '1.5' })).time_limit).toBeDefined()
    expect(validateForm(valid({ time_limit: '99999' })).time_limit).toBeDefined()
    expect(validateForm(valid({ time_limit: '90' })).time_limit).toBeUndefined()
    expect(validateForm(valid({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(',') })).tags).toMatch(/at most 10/)
  })
  it('CODING needs starter code, tests, and a visible sample', () => {
    const coding = { ...emptyForm('CODING'), title: 'Max subarray', description: 'Find it' }
    expect(validateForm({ ...coding, starter_python: '', starter_java: '' }).starter_code).toBeDefined()
    expect(validateForm({ ...coding, test_cases: [] }).test_cases).toMatch(/at least one/)
    expect(validateForm({ ...coding, test_cases: [{ input_data: '1', expected_output: '', is_sample: true }] }).test_cases).toMatch(/expected output/)
    expect(validateForm({ ...coding, test_cases: [{ input_data: '1', expected_output: '1', is_sample: false }] }).test_cases).toMatch(/sample/)
    expect(validateForm({ ...coding, test_cases: [{ input_data: '', expected_output: '1', is_sample: true }] })).toEqual({})
  })
  it('SQL needs schema, seed data and a solution', () => {
    const sql = { ...emptyForm('SQL'), title: 'Second highest', description: 'Find it' }
    expect(Object.keys(validateForm(sql)).sort()).toEqual(['schema_sql', 'seed_sql', 'solution_query'])
  })
  it('SHORT_ANSWER needs a model answer and well-formed concepts', () => {
    const short = { ...emptyForm('SHORT_ANSWER'), title: 'Explain deadlock', description: 'What is it?' }
    expect(validateForm(short).model_answer).toBeDefined()
    expect(validateForm({ ...short, model_answer: 'x' }).concepts).toMatch(/name and at least one keyword/)
    const concept = { concept: 'circular wait', keywords: 'cycle', weight: '11' }
    expect(validateForm({ ...short, model_answer: 'x', concepts: [concept] }).concepts).toMatch(/1 to 10/)
    expect(validateForm({ ...short, model_answer: 'x', concepts: [{ ...concept, weight: '2' }] })).toEqual({})
  })
})

describe('toPayload', () => {
  it('creates an MCQ with only MCQ data', () => {
    const p = toPayload(valid({ title: ' Binary search ', tags: 'Graphs, BFS', time_limit: '90', explanation: '  ' }), 'create')
    expect(p).toEqual({
      question_type: 'MCQ', title: 'Binary search', description: 'Complexity?', category: 'DSA', difficulty: 'EASY',
      time_limit: 90, tags: ['graphs', 'bfs'], constraints: null, explanation: null, is_published: false,
      options: [{ text: 'O(n)', is_correct: false }, { text: 'O(log n)', is_correct: true }],
    })
  })
  it('never sends the type on update, and sends null to clear the time limit', () => {
    const p = toPayload(valid(), 'update')
    expect(p).not.toHaveProperty('question_type')
    expect(p.time_limit).toBeNull()
  })
  it('sends only the starter languages that were filled in, and no examples when blank', () => {
    const f = { ...emptyForm('CODING'), title: 'Max', description: 'd', starter_java: '', test_cases: [{ input_data: '1', expected_output: '1', is_sample: true }] }
    const p = toPayload(f, 'create')
    expect(Object.keys(p.starter_code as object)).toEqual(['python'])
    expect(p.examples).toBeNull()
    expect(p.test_cases).toEqual([{ input_data: '1', expected_output: '1', is_sample: true }])
    expect(p).not.toHaveProperty('options')
  })
  it('keeps examples that have content and drops empty explanation fields', () => {
    const f = { ...emptyForm('CODING'), examples: [{ input: '3', output: '6', explanation: '' }, { input: '', output: '', explanation: 'ignored' }] }
    expect(toPayload(f, 'create').examples).toEqual([{ input: '3', output: '6' }])
  })
  it('builds SQL and short-answer payloads', () => {
    const sql = { ...emptyForm('SQL'), schema_sql: 'CREATE TABLE t(a int);', seed_sql: 'INSERT INTO t VALUES (1);', solution_query: 'SELECT a FROM t', order_matters: true }
    expect(toPayload(sql, 'create').sql_challenge).toEqual({ schema_sql: 'CREATE TABLE t(a int);', seed_sql: 'INSERT INTO t VALUES (1);', solution_query: 'SELECT a FROM t', order_matters: true })
    const short = { ...emptyForm('SHORT_ANSWER'), model_answer: ' Wait cycle. ', concepts: [{ concept: ' circular wait ', keywords: 'cycle, loop', weight: '2' }] }
    expect(toPayload(short, 'create').reference_answer).toEqual({ model_answer: 'Wait cycle.', concepts: [{ concept: 'circular wait', keywords: ['cycle', 'loop'], weight: 2 }] })
  })
})

describe('formFromQuestion', () => {
  it('loads an MCQ and round-trips to an equivalent update payload', () => {
    const q = adminQuestion() as unknown as AdminQuestion
    const form = formFromQuestion(q)
    expect(form.options).toEqual([{ text: 'O(n)', is_correct: false }, { text: 'O(log n)', is_correct: true }])
    expect(form.tags).toBe('searching')
    expect(toPayload(form, 'update')).toMatchObject({ title: q.title, time_limit: 60, tags: ['searching'], is_published: true })
  })
  it('loads coding data: starters, examples and test cases', () => {
    const q = adminQuestion({
      question_type: 'CODING', options: [], starter_code: { java: 'class Main {}' },
      examples: [{ input: '3', output: '6', explanation: 'sum' }],
      test_cases: [{ id: 1, input_data: '3', expected_output: '6', is_sample: true }],
    }) as unknown as AdminQuestion
    const form = formFromQuestion(q)
    expect(form.starter_python).toBe('')
    expect(form.starter_java).toBe('class Main {}')
    expect(form.examples).toEqual([{ input: '3', output: '6', explanation: 'sum' }])
    expect(toPayload(form, 'update').starter_code).toEqual({ java: 'class Main {}' })
  })
  it('loads short-answer concepts', () => {
    const q = adminQuestion({
      question_type: 'SHORT_ANSWER', options: [],
      reference_answer: { model_answer: 'm', concepts: [{ concept: 'c', keywords: ['a', 'b'], weight: 3 }] },
    }) as unknown as AdminQuestion
    expect(formFromQuestion(q).concepts).toEqual([{ concept: 'c', keywords: 'a, b', weight: '3' }])
  })
})
