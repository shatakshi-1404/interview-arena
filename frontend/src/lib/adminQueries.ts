import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  AdminAssessment, AdminCategory, AdminQuestion, AdminSubmission, AdminSubmissionDetail, AdminUser, AssessmentSummary,
  AuditEntry, Page, PlatformStats, QuestionSummary, Role,
} from '@/types/api'
import { http } from './api'

/** After any admin change, learner-facing lists must not keep showing stale content. */
export function invalidateAdmin(qc: QueryClient) {
  for (const key of ['admin', 'questions', 'question', 'question-meta', 'assessments', 'recommendations']) {
    void qc.invalidateQueries({ queryKey: [key] })
  }
}

export const useAdminStats = () =>
  useQuery({ queryKey: ['admin', 'stats'], queryFn: () => http.get<PlatformStats>('/api/admin/stats') })

export const useAdminCategories = () =>
  useQuery({ queryKey: ['admin', 'categories'], queryFn: () => http.get<AdminCategory[]>('/api/admin/categories') })

// ----------------------------------------------------------------- users
export type AdminUserParams = { search?: string; role?: string; is_active?: string; page: number }
export const useAdminUsers = (p: AdminUserParams) =>
  useQuery({
    queryKey: ['admin', 'users', p],
    queryFn: () => http.get<Page<AdminUser>>('/api/admin/users', { ...p, page_size: 20 }),
    placeholderData: keepPreviousData,
  })

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: { role?: Role; is_active?: boolean } }) =>
      http.patch<AdminUser>(`/api/admin/users/${id}`, body),
    onSuccess: () => invalidateAdmin(qc),
  })
}

// ------------------------------------------------------------- questions
export type AdminQuestionParams = { q?: string; category?: string; difficulty?: string; question_type?: string; page: number }
export const useAdminQuestions = (p: AdminQuestionParams, pageSize = 20) =>
  useQuery({
    queryKey: ['admin', 'questions', p, pageSize],
    queryFn: () => http.get<Page<QuestionSummary>>('/api/admin/questions', { ...p, page_size: pageSize }),
    placeholderData: keepPreviousData,
  })

/** The editor copies this into its own form state once, so it must never be silently replaced underneath it. */
export const useAdminQuestion = (id: number, enabled = true) =>
  useQuery({
    queryKey: ['admin', 'question', id],
    queryFn: () => http.get<AdminQuestion>(`/api/admin/questions/${id}`),
    enabled,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

export function useSaveQuestion(id?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: unknown) =>
      id == null ? http.post<AdminQuestion>('/api/admin/questions', body) : http.patch<AdminQuestion>(`/api/admin/questions/${id}`, body),
    onSuccess: () => invalidateAdmin(qc),
  })
}

export function usePatchQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      http.patch<AdminQuestion>(`/api/admin/questions/${id}`, body),
    onSuccess: () => invalidateAdmin(qc),
  })
}

export function useDeleteQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => http.delete<void>(`/api/admin/questions/${id}`),
    onSuccess: () => invalidateAdmin(qc),
  })
}

// ----------------------------------------------------------- assessments
export const useAdminAssessments = (page: number) =>
  useQuery({
    queryKey: ['admin', 'assessments', page],
    queryFn: () => http.get<Page<AssessmentSummary>>('/api/admin/assessments', { page, page_size: 20 }),
    placeholderData: keepPreviousData,
  })

export const useAdminAssessment = (id: number, enabled = true) =>
  useQuery({
    queryKey: ['admin', 'assessment', id],
    queryFn: () => http.get<AdminAssessment>(`/api/admin/assessments/${id}`),
    enabled,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

export function useSaveAssessment(id?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: unknown) =>
      id == null ? http.post<AdminAssessment>('/api/admin/assessments', body) : http.patch<AdminAssessment>(`/api/admin/assessments/${id}`, body),
    onSuccess: () => invalidateAdmin(qc),
  })
}

export function usePatchAssessment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      http.patch<AdminAssessment>(`/api/admin/assessments/${id}`, body),
    onSuccess: () => invalidateAdmin(qc),
  })
}

export function useDeleteAssessment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => http.delete<void>(`/api/admin/assessments/${id}`),
    onSuccess: () => invalidateAdmin(qc),
  })
}

// ------------------------------------------------------ submissions, audit
export type AdminSubmissionParams = { status?: string; language?: string; question_id?: number; user_id?: number; page: number }
export const useAdminSubmissions = (p: AdminSubmissionParams) =>
  useQuery({
    queryKey: ['admin', 'submissions', p],
    queryFn: () => http.get<Page<AdminSubmission>>('/api/admin/submissions', { ...p, page_size: 20 }),
    placeholderData: keepPreviousData,
  })

export const useAdminSubmission = (id: number, enabled = true) =>
  useQuery({
    queryKey: ['admin', 'submission', id],
    queryFn: () => http.get<AdminSubmissionDetail>(`/api/admin/submissions/${id}`),
    enabled,
  })

export type AuditParams = { entity_type?: string; action?: string; page: number }
export const useAuditLog = (p: AuditParams) =>
  useQuery({
    queryKey: ['admin', 'audit', p],
    queryFn: () => http.get<Page<AuditEntry>>('/api/admin/audit-log', { ...p, page_size: 25 }),
    placeholderData: keepPreviousData,
  })
