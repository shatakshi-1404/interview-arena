from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import (
    get_admin_assessment_service,
    get_admin_dashboard_service,
    get_admin_question_service,
    get_pagination,
    get_question_filters,
    require_admin,
)
from app.models.attempt import SubmissionStatus
from app.models.user import Role, User
from app.repositories.question_repository import QuestionFilters
from app.schemas.admin import (
    AdminCategoryOut,
    AdminSubmissionDetail,
    AdminSubmissionOut,
    AdminUserOut,
    AdminUserUpdate,
    AuditLogOut,
    PlatformStats,
)
from app.schemas.assessment import AssessmentAdminDetail, AssessmentCreate, AssessmentSummary, AssessmentUpdate
from app.schemas.question import (
    Page,
    QuestionAdminDetail,
    QuestionCreate,
    QuestionSummary,
    QuestionUpdate,
)
from app.services.admin_dashboard_service import AdminDashboardService
from app.services.assessment_service import AdminAssessmentService
from app.services.question_service import AdminQuestionService

# Router-level dependency: every route below requires ADMIN, enforced on the server.
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/questions", response_model=Page[QuestionSummary])
def list_questions(
    filters: QuestionFilters = Depends(get_question_filters),
    pagination: tuple[int, int] = Depends(get_pagination),
    svc: AdminQuestionService = Depends(get_admin_question_service),
):
    page, page_size = pagination
    return svc.list(filters, page, page_size)


@router.get("/questions/{question_id}", response_model=QuestionAdminDetail)
def get_question(question_id: int, svc: AdminQuestionService = Depends(get_admin_question_service)):
    return svc.get(question_id)


@router.post("/questions", response_model=QuestionAdminDetail, status_code=status.HTTP_201_CREATED)
def create_question(
    body: QuestionCreate,
    admin: User = Depends(require_admin),
    svc: AdminQuestionService = Depends(get_admin_question_service),
):
    return svc.create(admin, body)


@router.patch("/questions/{question_id}", response_model=QuestionAdminDetail)
def update_question(
    question_id: int,
    body: QuestionUpdate,
    admin: User = Depends(require_admin),
    svc: AdminQuestionService = Depends(get_admin_question_service),
):
    return svc.update(admin, question_id, body)


@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question(
    question_id: int,
    admin: User = Depends(require_admin),
    svc: AdminQuestionService = Depends(get_admin_question_service),
):
    svc.delete(admin, question_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/assessments", response_model=Page[AssessmentSummary])
def list_assessments(
    pagination: tuple[int, int] = Depends(get_pagination),
    svc: AdminAssessmentService = Depends(get_admin_assessment_service),
):
    page, page_size = pagination
    return svc.list(page, page_size)


@router.get("/assessments/{assessment_id}", response_model=AssessmentAdminDetail)
def get_assessment(assessment_id: int, svc: AdminAssessmentService = Depends(get_admin_assessment_service)):
    return svc.get(assessment_id)


@router.post("/assessments", response_model=AssessmentAdminDetail, status_code=status.HTTP_201_CREATED)
def create_assessment(
    body: AssessmentCreate,
    admin: User = Depends(require_admin),
    svc: AdminAssessmentService = Depends(get_admin_assessment_service),
):
    return svc.create(admin, body)


@router.patch("/assessments/{assessment_id}", response_model=AssessmentAdminDetail)
def update_assessment(
    assessment_id: int,
    body: AssessmentUpdate,
    admin: User = Depends(require_admin),
    svc: AdminAssessmentService = Depends(get_admin_assessment_service),
):
    return svc.update(admin, assessment_id, body)


@router.delete("/assessments/{assessment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assessment(
    assessment_id: int,
    admin: User = Depends(require_admin),
    svc: AdminAssessmentService = Depends(get_admin_assessment_service),
):
    svc.delete(admin, assessment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/stats", response_model=PlatformStats)
def platform_stats(svc: AdminDashboardService = Depends(get_admin_dashboard_service)):
    return svc.stats()


@router.get("/users", response_model=Page[AdminUserOut])
def list_users(
    search: str | None = Query(None, max_length=100),
    role: Role | None = None,
    is_active: bool | None = None,
    pagination: tuple[int, int] = Depends(get_pagination),
    svc: AdminDashboardService = Depends(get_admin_dashboard_service),
):
    page, page_size = pagination
    return svc.list_users(search=search, role=role, is_active=is_active, page=page, page_size=page_size)


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    body: AdminUserUpdate,
    admin: User = Depends(require_admin),
    svc: AdminDashboardService = Depends(get_admin_dashboard_service),
):
    return svc.update_user(admin, user_id, body)


@router.get("/submissions", response_model=Page[AdminSubmissionOut])
def list_submissions(
    submission_status: SubmissionStatus | None = Query(None, alias="status"),
    question_id: int | None = None,
    user_id: int | None = None,
    language: str | None = Query(None, max_length=20),
    pagination: tuple[int, int] = Depends(get_pagination),
    svc: AdminDashboardService = Depends(get_admin_dashboard_service),
):
    page, page_size = pagination
    return svc.list_submissions(status=submission_status, question_id=question_id, user_id=user_id,
                                language=language, page=page, page_size=page_size)


@router.get("/submissions/{submission_id}", response_model=AdminSubmissionDetail)
def get_submission(submission_id: int, svc: AdminDashboardService = Depends(get_admin_dashboard_service)):
    return svc.get_submission(submission_id)


@router.get("/audit-log", response_model=Page[AuditLogOut])
def audit_log(
    entity_type: str | None = Query(None, max_length=50),
    action: str | None = Query(None, max_length=50),
    pagination: tuple[int, int] = Depends(get_pagination),
    svc: AdminDashboardService = Depends(get_admin_dashboard_service),
):
    page, page_size = pagination
    return svc.audit_log(entity_type=entity_type, action=action, page=page, page_size=page_size)


@router.get("/categories", response_model=list[AdminCategoryOut])
def category_overview(svc: AdminDashboardService = Depends(get_admin_dashboard_service)):
    return svc.categories()
