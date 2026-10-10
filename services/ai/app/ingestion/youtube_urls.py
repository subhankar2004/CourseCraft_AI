"""Strict parsing of YouTube URLs into video / playlist ids.

This is a security boundary: yt-dlp supports over a thousand sites, so user-supplied URLs are
NEVER handed to it. Only the ids extracted here are used, to build canonical youtube.com URLs
(see `canonical_*_url`), which prevents server-side request forgery through the ingestion API.
"""

import re
from dataclasses import dataclass
from typing import Literal
from urllib.parse import parse_qs, urlsplit

VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")
PLAYLIST_ID = re.compile(r"[A-Za-z0-9_-]{10,64}")

_WATCH_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}
_SHORT_HOSTS = {"youtu.be"}
_EMBED_HOSTS = {"youtube-nocookie.com", "www.youtube-nocookie.com"}
_PATH_ID_PREFIXES = ("/shorts/", "/embed/", "/live/", "/v/")


class InvalidYoutubeUrlError(ValueError):
    pass


@dataclass(frozen=True)
class YoutubeRef:
    kind: Literal["video", "playlist"]
    id: str


def canonical_video_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def canonical_playlist_url(playlist_id: str) -> str:
    return f"https://www.youtube.com/playlist?list={playlist_id}"


def parse_youtube_url(raw: str) -> YoutubeRef:
    """Accepts watch, youtu.be, shorts, embed, live and playlist URLs. Raises otherwise.

    A watch URL that also carries `list=` is treated as the single video it points at; pass a
    `/playlist?list=` URL to ingest a whole playlist.
    """
    text = raw.strip()
    if len(text) > 2048:
        raise InvalidYoutubeUrlError("URL is too long")
    if "://" not in text:
        text = f"https://{text}"
    try:
        parts = urlsplit(text)
        port = parts.port  # parsed lazily; raises ValueError for a non-numeric port
    except ValueError as exc:
        raise InvalidYoutubeUrlError(f"not a valid URL: {raw!r}") from exc

    if parts.scheme not in ("http", "https"):
        raise InvalidYoutubeUrlError(f"unsupported scheme in {raw!r}")
    if parts.username or parts.password or port not in (None, 80, 443):
        raise InvalidYoutubeUrlError(f"credentials or unusual ports are not allowed: {raw!r}")
    host = (parts.hostname or "").lower()
    query = parse_qs(parts.query)
    path = parts.path

    def first(param: str) -> str | None:
        values = query.get(param)
        return values[0] if values else None

    candidate: tuple[Literal["video", "playlist"], str | None]
    if host in _SHORT_HOSTS:
        candidate = ("video", path.strip("/").split("/")[0] or None)
    elif host in _WATCH_HOSTS and path in ("/watch", "/watch/"):
        candidate = ("video", first("v"))
    elif host in _WATCH_HOSTS and path in ("/playlist", "/playlist/"):
        candidate = ("playlist", first("list"))
    elif host in _WATCH_HOSTS | _EMBED_HOSTS and path.startswith(_PATH_ID_PREFIXES):
        candidate = ("video", path.split("/")[2] or None)
    else:
        raise InvalidYoutubeUrlError(f"not a supported YouTube video or playlist URL: {raw!r}")

    kind, value = candidate
    pattern = VIDEO_ID if kind == "video" else PLAYLIST_ID
    if value is None or not pattern.fullmatch(value):
        raise InvalidYoutubeUrlError(f"missing or malformed {kind} id in {raw!r}")
    return YoutubeRef(kind=kind, id=value)
