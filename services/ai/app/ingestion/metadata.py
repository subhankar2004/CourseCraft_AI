"""Video and playlist metadata from YouTube via yt-dlp (SPEC §7.1 step 1). Nothing is downloaded.

yt-dlp is only ever given canonical URLs built from validated ids (app.ingestion.youtube_urls) and
is restricted to its YouTube extractors, so the ingestion API can't be used to make the server
fetch arbitrary sites.
"""

import logging
import re
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Protocol

import yt_dlp

from app.ingestion.youtube_urls import canonical_playlist_url, canonical_video_url

logger = logging.getLogger("app.ingestion.metadata")

# Anchored: plain "youtube" would also allow e.g. "youtube:search".
_ALLOWED_EXTRACTORS = [r"^youtube$", r"^youtube:playlist$", r"^youtube:tab$"]
_BASE_OPTIONS: dict[str, Any] = {
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "allowed_extractors": _ALLOWED_EXTRACTORS,
    "socket_timeout": 20,
    "noprogress": True,
}
_MAX_PARALLEL = 4


@dataclass(frozen=True)
class Chapter:
    start_sec: float
    title: str


@dataclass(frozen=True)
class VideoInfo:
    youtube_id: str
    title: str
    channel: str | None
    duration_sec: int
    thumbnail_url: str
    language: str | None
    chapters: list[Chapter] = field(default_factory=list)


@dataclass(frozen=True)
class FailedVideo:
    youtube_id: str
    reason: str


@dataclass(frozen=True)
class MetadataResult:
    videos: list[VideoInfo]
    failed: list[FailedVideo]
    truncated: bool


class VideoUnavailableError(Exception):
    """The video exists but can't be used (private, removed, age-restricted, live, ...)."""


class YoutubeClient(Protocol):
    def video(self, video_id: str) -> VideoInfo: ...
    def playlist_video_ids(self, playlist_id: str, limit: int) -> tuple[list[str], bool]: ...


def thumbnail_for(video_id: str) -> str:
    # Stable JPEG on YouTube's CDN (allow-listed by the web app's next/image config).
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


# yt-dlp messages look like "ERROR: [youtube] <video id>: Private video. Sign in ...".
_ERROR_PREFIX = re.compile(r"^(?:ERROR:\s*)?(?:\[[^\]]+\]\s*)?(?:[A-Za-z0-9_-]{11}:\s*)?")


def _clean_error(error: Exception) -> str:
    message = _ERROR_PREFIX.sub("", str(error)).strip()
    return message[:300] or error.__class__.__name__


class YtDlpClient:
    def __init__(self, extract: Callable[[str, dict[str, Any]], dict[str, Any]] | None = None):
        self._extract = extract or self._extract_with_yt_dlp

    @staticmethod
    def _extract_with_yt_dlp(url: str, options: dict[str, Any]) -> dict[str, Any]:
        with yt_dlp.YoutubeDL({**_BASE_OPTIONS, **options}) as ydl:  # type: ignore[arg-type]
            info = ydl.extract_info(url, download=False)
        return dict(info or {})

    def video(self, video_id: str) -> VideoInfo:
        try:
            info = self._extract(canonical_video_url(video_id), {"noplaylist": True})
        except yt_dlp.utils.DownloadError as error:
            raise VideoUnavailableError(_clean_error(error)) from error
        if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
            raise VideoUnavailableError("live or upcoming streams can't be ingested")
        duration = info.get("duration")
        if not isinstance(duration, (int, float)) or duration <= 0:
            raise VideoUnavailableError("video has no duration")
        return VideoInfo(
            youtube_id=video_id,
            title=str(info.get("title") or video_id),
            channel=info.get("channel") or info.get("uploader"),
            duration_sec=int(duration),
            thumbnail_url=thumbnail_for(video_id),
            language=info.get("language"),
            chapters=[
                Chapter(start_sec=float(c["start_time"]), title=str(c.get("title") or ""))
                for c in info.get("chapters") or []
                if isinstance(c, dict) and "start_time" in c
            ],
        )

    def playlist_video_ids(self, playlist_id: str, limit: int) -> tuple[list[str], bool]:
        """The playlist's video ids in order, at most `limit`; `True` if more were available."""
        try:
            info = self._extract(
                canonical_playlist_url(playlist_id),
                # Flat listing (no per-video resolution); one extra entry detects truncation.
                {"extract_flat": "in_playlist", "playlistend": limit + 1},
            )
        except yt_dlp.utils.DownloadError as error:
            raise VideoUnavailableError(_clean_error(error)) from error
        ids = [
            str(entry["id"])
            for entry in info.get("entries") or []
            if isinstance(entry, dict) and entry.get("id")
        ]
        return ids[:limit], len(ids) > limit


class MetadataService:
    def __init__(self, client: YoutubeClient, max_videos: int):
        self._client = client
        self._max_videos = max_videos

    def for_videos(self, video_ids: Iterable[str]) -> MetadataResult:
        unique = list(dict.fromkeys(video_ids))  # de-duplicate, keep order
        truncated = len(unique) > self._max_videos
        return self._fetch(unique[: self._max_videos], truncated)

    def for_playlist(self, playlist_id: str) -> MetadataResult:
        ids, truncated = self._client.playlist_video_ids(playlist_id, self._max_videos)
        return self._fetch(list(dict.fromkeys(ids)), truncated)

    def _fetch(self, video_ids: list[str], truncated: bool) -> MetadataResult:
        def one(video_id: str) -> VideoInfo | FailedVideo:
            try:
                return self._client.video(video_id)
            except VideoUnavailableError as error:
                logger.warning(
                    "video skipped", extra={"fields": {"youtubeId": video_id, "reason": str(error)}}
                )
                return FailedVideo(youtube_id=video_id, reason=str(error))

        with ThreadPoolExecutor(max_workers=_MAX_PARALLEL) as pool:
            results = list(pool.map(one, video_ids))  # map keeps the input order
        return MetadataResult(
            videos=[r for r in results if isinstance(r, VideoInfo)],
            failed=[r for r in results if isinstance(r, FailedVideo)],
            truncated=truncated,
        )
