"""Ingestion endpoints (internal: called only by the CourseCraft API)."""

from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import Settings, get_settings
from app.ingestion.metadata import MetadataService, YtDlpClient
from app.ingestion.youtube_urls import InvalidYoutubeUrlError, YoutubeRef, parse_youtube_url
from app.schemas import IngestMetadataRequest, IngestMetadataResponse

router = APIRouter(prefix="/ingest", tags=["ingestion"])


def get_metadata_service(settings: Annotated[Settings, Depends(get_settings)]) -> MetadataService:
    return MetadataService(YtDlpClient(), max_videos=settings.max_videos_per_course)


@router.post("/metadata")
def ingest_metadata(
    body: IngestMetadataRequest,
    service: Annotated[MetadataService, Depends(get_metadata_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> IngestMetadataResponse:
    """Resolves videos (or a playlist) to metadata. Sync def: FastAPI runs it in its thread pool."""
    if body.playlist_url is not None:
        ref = _parse_all([body.playlist_url])[0]
        if ref.kind != "playlist":
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "playlistUrl must be a playlist URL (https://www.youtube.com/playlist?list=...)",
            )
        result = service.for_playlist(ref.id)
    else:
        refs = _parse_all(body.urls or [])
        if playlists := [r.id for r in refs if r.kind == "playlist"]:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                [f"use playlistUrl for playlists: {pid}" for pid in playlists],
            )
        result = service.for_videos(r.id for r in refs)

    return IngestMetadataResponse.model_validate(
        {**asdict(result), "max_videos": settings.max_videos_per_course}
    )


def _parse_all(urls: list[str]) -> list[YoutubeRef]:
    """Parses every URL first, then reports all invalid ones at once."""
    refs: list[YoutubeRef] = []
    problems: list[str] = []
    for index, url in enumerate(urls):
        try:
            refs.append(parse_youtube_url(url))
        except InvalidYoutubeUrlError as error:
            problems.append(f"urls[{index}]: {error}")
    if problems:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, problems)
    return refs
