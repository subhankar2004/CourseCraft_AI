"""Request/response contracts of the AI service.

JSON uses camelCase to match the TypeScript side (apps/api, packages/shared). When a contract
changes, update the TypeScript mirror in the same PR (AGENTS.md).
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ErrorResponse(CamelModel):
    """Same error shape as the NestJS API (apps/api AllExceptionsFilter)."""

    status_code: int
    error: str
    message: str | list[str]
    path: str
    timestamp: str
    request_id: str | None = None


class LlmInfo(CamelModel):
    provider: Literal["openai", "ollama"]
    chat_model: str
    embedding_model: str
    embedding_dimension: int
    configured: bool


class VectorStoreInfo(CamelModel):
    provider: Literal["pgvector", "pinecone"]
    index: str
    configured: bool


class Providers(CamelModel):
    llm: LlmInfo
    vector_store: VectorStoreInfo


class HealthResponse(CamelModel):
    status: Literal["ok"]
    service: str
    version: str
    providers: Providers


# ─── Ingestion: metadata (#17) ──────────────────────────────────────────────


class IngestMetadataRequest(CamelModel):
    """Exactly one of `urls` (videos) or `playlistUrl`. URLs are validated before anything runs."""

    urls: list[str] | None = Field(default=None, min_length=1, max_length=200)
    playlist_url: str | None = None

    @model_validator(mode="after")
    def _exactly_one_source(self) -> "IngestMetadataRequest":
        if (self.urls is None) == (self.playlist_url is None):
            raise ValueError("provide either 'urls' or 'playlistUrl', not both or neither")
        return self


class ChapterOut(CamelModel):
    start_sec: float
    title: str


class VideoMetadataOut(CamelModel):
    youtube_id: str
    title: str
    channel: str | None
    duration_sec: int
    thumbnail_url: str
    language: str | None
    chapters: list[ChapterOut]


class FailedVideoOut(CamelModel):
    youtube_id: str
    reason: str


class IngestMetadataResponse(CamelModel):
    videos: list[VideoMetadataOut]
    failed: list[FailedVideoOut]
    #: True when the input had more videos than MAX_VIDEOS_PER_COURSE allows.
    truncated: bool
    max_videos: int


# ─── Ingestion: transcripts (#18) ───────────────────────────────────────────


class IngestTranscriptRequest(CamelModel):
    youtube_id: str = Field(pattern=r"^[A-Za-z0-9_-]{11}$")
    #: The video's spoken language from its metadata (#17), e.g. "en". When the captions are in
    #: a different language, Whisper transcribes the audio instead.
    spoken_language: str | None = Field(
        default=None, pattern=r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$"
    )


class SegmentOut(CamelModel):
    text: str
    start: float
    duration: float


class IngestTranscriptResponse(CamelModel):
    youtube_id: str
    #: Matches the API's TranscriptSource enum.
    source: Literal["YT_MANUAL", "YT_AUTO", "WHISPER"]
    language: str
    #: Original language when YouTube translated the captions to English.
    translated_from: str | None
    fetched_with: Literal["youtube-transcript-api", "yt-dlp", "whisper"]
    segment_count: int
    #: End of the last segment, in seconds.
    covered_sec: float
    segments: list[SegmentOut]


# ─── Vectors: embeddings and search (#21) ───────────────────────────────────

#: Database ids (Prisma cuid) and other path identifiers.
ID_PATTERN = r"^[A-Za-z0-9_-]{1,64}$"


class SegmentIn(CamelModel):
    text: str = Field(max_length=20_000)
    start: float = Field(ge=0)
    duration: float = Field(ge=0)


class IndexLessonRequest(CamelModel):
    """A lesson's transcript (from /ingest/transcript): chunked, embedded and stored."""

    module_id: str = Field(pattern=ID_PATTERN)
    video_id: str = Field(pattern=ID_PATTERN)
    youtube_id: str = Field(pattern=r"^[A-Za-z0-9_-]{11}$")
    lesson_title: str = Field(min_length=1, max_length=300)
    segments: list[SegmentIn] = Field(min_length=1, max_length=50_000)


class ChunkOut(CamelModel):
    #: Deterministic `{lessonId}-{index}`: the API stores its Chunk row under the same id.
    id: str
    index: int
    text: str
    start_sec: float
    end_sec: float
    token_count: int
    overlap_chars: int


class IndexLessonResponse(CamelModel):
    course_id: str
    lesson_id: str
    embedding_model: str
    chunks: list[ChunkOut]


class SearchRequest(CamelModel):
    query: str = Field(min_length=1, max_length=2_000)
    #: Defaults to RAG_TOP_K.
    k: int | None = Field(default=None, ge=1, le=50)


class SearchHitOut(CamelModel):
    id: str
    module_id: str
    lesson_id: str
    video_id: str
    youtube_id: str
    chunk_index: int
    start_sec: float
    end_sec: float
    lesson_title: str
    text: str
    #: Cosine similarity; higher is closer.
    score: float


class SearchResponse(CamelModel):
    course_id: str
    hits: list[SearchHitOut]


class DeleteVectorsResponse(CamelModel):
    course_id: str
    deleted: int
