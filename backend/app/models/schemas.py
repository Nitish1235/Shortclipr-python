from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


Department = Literal["learn", "story", "engage"]
AspectRatio = Literal["9:16", "1:1", "16:9"]
ProjectStatus = Literal["draft", "queued", "planning", "rendering", "complete", "failed", "cancelled"]
ClipType = Literal[
    "Animated explainer",
    "Comparisons & visual facts",
    "Historical story",
    "Maps & geography",
    "Space & scale journey",
    "What-if simulation",
    "Myth-busting experiment",
    "News & event recap",
    "Character comedy",
    "Mini story or fable",
    "Mystery & suspense",
    "Horror short",
    "Animated conversation",
    "Quiz & visual puzzle",
    "Sports tactics",
    "Architecture transformation",
]


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(word.capitalize() for word in rest)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class GoogleAuthRequest(ApiModel):
    credential: str = Field(min_length=20)


class UserResponse(ApiModel):
    id: UUID
    email: EmailStr
    full_name: str
    avatar_url: str | None = None
    plan: str
    subscription_status: str = "inactive"
    is_admin: bool = False


class AuthResponse(ApiModel):
    access_token: str
    user: UserResponse


class CreateProjectRequest(ApiModel):
    brief: str = Field(min_length=10, max_length=1600)
    clip_type: ClipType
    department: Department
    language: str = Field(min_length=2, max_length=80)
    voice_id: str = Field(min_length=1, max_length=120)
    visual_style: str = Field(min_length=2, max_length=80)
    duration_seconds: Literal[15, 20, 30, 45, 60]
    aspect_ratio: AspectRatio


class ProjectResponse(ApiModel):
    id: UUID
    title: str
    brief: str
    clip_type: str
    department: Department
    language: str
    voice_id: str
    visual_style: str
    duration_seconds: int
    aspect_ratio: AspectRatio
    status: ProjectStatus
    progress: int
    credits_reserved: int
    output_url: str | None = None
    poster_url: str | None = None
    created_at: datetime
    updated_at: datetime


class ProjectDownloadResponse(ApiModel):
    download_url: str


class CreditBalanceResponse(ApiModel):
    total: int
    used: int
    remaining: int
    cycle_ends_at: datetime | None = None


class VoiceResponse(ApiModel):
    id: str
    name: str
    language: str
    description: str | None = None
    preview_url: str | None = None


class VoiceLibraryGenerationResponse(ApiModel):
    generated: int
    failed: int
    total: int
    failures: list[str] = []


class ShowcaseResponse(ApiModel):
    id: UUID
    title: str
    description: str
    department: Department
    aspect_ratio: AspectRatio
    video_url: str
    poster_url: str | None = None
    published: bool
    featured: bool
    landing_visible: bool = False
    source_project_id: UUID | None = None
    sort_order: int
    created_at: datetime


class ShowcaseUpdate(ApiModel):
    title: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=220)
    published: bool | None = None
    featured: bool | None = None
    landing_visible: bool | None = None
    sort_order: int | None = None


class LandingMediaResponse(ApiModel):
    id: UUID
    slot: str
    title: str
    caption: str
    media_kind: Literal["image", "video"]
    media_url: str
    created_at: datetime


class LandingMediaRevisionResponse(ApiModel):
    id: UUID
    slot: str
    title: str
    caption: str
    media_kind: Literal["image", "video"]
    media_url: str
    created_at: datetime


class AdminProjectResponse(ProjectResponse):
    owner_email: EmailStr
    owner_name: str


class AssignProjectToShowcaseRequest(ApiModel):
    title: str | None = Field(default=None, max_length=80)
    description: str = Field(default="", max_length=220)
    published: bool = True
    landing_visible: bool = True
    featured: bool = False


class InternalRunRequest(ApiModel):
    project_id: UUID
    attempt_id: UUID
    lease_token: UUID


class CheckoutRequest(ApiModel):
    plan: Literal["starter", "creator", "studio"]


class CheckoutResponse(ApiModel):
    checkout_url: str
    session_id: str


class BillingPortalResponse(ApiModel):
    portal_url: str


class BillingCheckoutStatusResponse(ApiModel):
    session_id: str
    plan: Literal["starter", "creator", "studio"]
    status: Literal["created", "completed", "failed"]


class WorkerRegionResponse(ApiModel):
    job_class: Literal["api", "render"]
    region: str
    capacity: int
    assigned: int
    available: int
    status: Literal["available", "full", "cooldown"]
    blocked_until: datetime | None = None
    last_error: str | None = None
    last_rejection_at: datetime | None = None
    last_success_at: datetime | None = None
    updated_at: datetime


class WorkerFleetResponse(ApiModel):
    regions: list[WorkerRegionResponse]
    queued_api: int
    queued_render: int
    running_api: int
    running_render: int
    failed_24h: int
    generated_at: datetime
