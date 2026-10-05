import { Route, Routes } from 'react-router-dom'
import AdminAssessmentEditor from './AdminAssessmentEditor'
import AdminAssessments from './AdminAssessments'
import AdminAuditLog from './AdminAuditLog'
import AdminCategories from './AdminCategories'
import AdminLayout from './AdminLayout'
import AdminOverview from './AdminOverview'
import AdminQuestionEditor from './AdminQuestionEditor'
import AdminQuestions from './AdminQuestions'
import AdminSubmissionDetail from './AdminSubmissionDetail'
import AdminSubmissions from './AdminSubmissions'
import AdminUsers from './AdminUsers'

/** Mounted at /admin/* by App.tsx; paths here are relative to /admin. */
export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminOverview />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="questions" element={<AdminQuestions />} />
        <Route path="questions/new" element={<AdminQuestionEditor />} />
        <Route path="questions/:questionId" element={<AdminQuestionEditor />} />
        <Route path="assessments" element={<AdminAssessments />} />
        <Route path="assessments/new" element={<AdminAssessmentEditor />} />
        <Route path="assessments/:assessmentId" element={<AdminAssessmentEditor />} />
        <Route path="submissions" element={<AdminSubmissions />} />
        <Route path="submissions/:submissionId" element={<AdminSubmissionDetail />} />
        <Route path="audit-log" element={<AdminAuditLog />} />
        <Route path="categories" element={<AdminCategories />} />
      </Route>
    </Routes>
  )
}
