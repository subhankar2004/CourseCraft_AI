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
    provider: Literal["pinecone"]
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
