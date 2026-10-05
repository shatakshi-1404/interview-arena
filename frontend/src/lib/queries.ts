import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthContext'
import { http } from './api'
import { localTzOffsetMinutes } from './time'
import type {
  Achievement, ActivityResponse, AssessmentDetail, AssessmentSummary, AttemptResult, AttemptState,
  AttemptSummary, Capabilities, LeaderboardPeriod, LeaderboardResponse, ProgressOverview, ReadinessDetail,
  MockOptions, MockReport, Page, QuestionDetail, QuestionMeta, QuestionSummary, QuestionType,
  RecommendationList, TopicsResponse, User,
} from '@/types/api'

export const useProgress = () => {
  const tz = localTzOffsetMinutes()
  return useQuery({
    queryKey: ['progress', tz],
    queryFn: () => http.get<ProgressOverview>('/api/progress', { tz_offset_minutes: tz }),
  })
}

export const useTopics = () =>
  useQuery({ queryKey: ['topics'], queryFn: () => http.get<TopicsResponse>('/api/progress/topics') })

export const useActivity = (days: number) => {
  const tz = localTzOffsetMinutes()
  return useQuery({
    queryKey: ['activity', days, tz],
    queryFn: () => http.get<ActivityResponse>('/api/progress/activity', { days, tz_offset_minutes: tz }),
  })
}

export const useReadiness = () =>
  useQuery({ queryKey: ['readiness'], queryFn: () => http.get<ReadinessDetail>('/api/progress/readiness') })

export const useRecommendations = () =>
  useQuery({ queryKey: ['recommendations'], queryFn: () => http.get<RecommendationList>('/api/recommendations') })

export const useLeaderboard = (period: LeaderboardPeriod) =>
  useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () => http.get<LeaderboardResponse>('/api/leaderboard', { period }),
  })

export const useAchievements = () =>
  useQuery({ queryKey: ['achievements'], queryFn: () => http.get<Achievement[]>('/api/achievements') })

export function useDismissRecommendation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => http.post<RecommendationList>(`/api/recommendations/${id}/dismiss`),
    onSuccess: (data) => qc.setQueryData(['recommendations'], data),
  })
}

export function useUpdateProfile() {
  const { setUser } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name?: string; show_on_leaderboard?: boolean }) => http.patch<User>('/api/users/me', body),
    onSuccess: (user) => {
      setUser(user)
      void qc.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })
}

export const PAGE_SIZE = 20
export type QuestionParams = {
  q?: string
  category?: string
  difficulty?: string
  question_type?: string
  tag?: string
  page: number
}

export const useQuestions = (p: QuestionParams) =>
  useQuery({
    queryKey: ['questions', p],
    queryFn: () => http.get<Page<QuestionSummary>>('/api/questions', { ...p, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

export const useQuestion = (id: number, enabled = true) =>
  useQuery({ queryKey: ['question', id], queryFn: () => http.get<QuestionDetail>(`/api/questions/${id}`), enabled })

export const useQuestionMeta = () =>
  useQuery({ queryKey: ['question-meta'], queryFn: () => http.get<QuestionMeta>('/api/questions/meta'), staleTime: 5 * 60_000 })

/** What this server can actually grade. The mock-interview options list only the question types that work. */
export const useCapabilities = () =>
  useQuery({
    queryKey: ['capabilities'],
    queryFn: async (): Promise<Capabilities> => {
      const o = await http.get<{ includes: QuestionType[] }>('/api/mock-interviews/options')
      return { coding: o.includes.includes('CODING'), shortAnswer: o.includes.includes('SHORT_ANSWER') }
    },
    staleTime: 5 * 60_000,
  })

export const useAssessments = (page: number) =>
  useQuery({
    queryKey: ['assessments', 'list', page],
    queryFn: () => http.get<Page<AssessmentSummary>>('/api/assessments', { page, page_size: 12 }),
    placeholderData: keepPreviousData,
  })

export const useAssessment = (id: number, enabled = true) =>
  useQuery({
    queryKey: ['assessments', 'detail', id],
    queryFn: () => http.get<AssessmentDetail>(`/api/assessments/${id}`),
    enabled,
  })

export const useAttempts = () =>
  useQuery({ queryKey: ['attempts'], queryFn: () => http.get<AttemptSummary[]>('/api/attempts') })

/** The exam must always start from the server's current state, so this is never kept after the page closes. */
export const useAttemptState = (id: number, enabled = true) =>
  useQuery({
    queryKey: ['attempt', id],
    queryFn: () => http.get<AttemptState>(`/api/attempts/${id}`),
    enabled,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

export const useAttemptResult = (id: number, enabled = true) =>
  useQuery({
    queryKey: ['attempt-result', id],
    queryFn: () => http.get<AttemptResult>(`/api/attempts/${id}/result`),
    enabled,
  })

export const useMockOptions = () =>
  useQuery({
    queryKey: ['mock-options'],
    queryFn: () => http.get<MockOptions>('/api/mock-interviews/options'),
    staleTime: 5 * 60_000,
  })

export const useCurrentMock = () =>
  useQuery({
    queryKey: ['mock-current'],
    queryFn: () => http.get<AttemptState | null>('/api/mock-interviews/current'),
  })

export const useMockReport = (id: number, enabled = true) =>
  useQuery({
    queryKey: ['mock-report', id],
    queryFn: () => http.get<MockReport>(`/api/mock-interviews/${id}/report`),
    enabled,
  })

/** Call after anything that changes a user's answers (practice, assessments, mock interviews). */
export function invalidateLearningData(qc: QueryClient) {
  for (const key of ['progress', 'topics', 'activity', 'readiness', 'recommendations', 'achievements',
    'notifications', 'leaderboard', 'questions', 'question', 'assessments', 'attempts', 'mock-current']) {
    void qc.invalidateQueries({ queryKey: [key] })
  }
}
