"""Transcripts for YouTube videos (SPEC §7.1 step 2).

Order of preference:
  1. youtube-transcript-api: manual English → auto-generated English → YouTube's translation to
     English → the original-language captions (labelled with their real language).
  2. yt-dlp subtitle tracks (manual English, then automatic English) as WebVTT, parsed here. Used
     when the first source is blocked, fails, or finds nothing.
  3. Whisper speech-to-text (app.ingestion.whisper, #19) when no captions exist, or when the
     captions' language doesn't match the video's spoken language (mis-labelled auto-captions).

Every result is normalised to segments `{text, start, duration}` with captions noise removed.
`NoTranscriptError`: nothing usable can be produced (definitive).
`TranscriptUnavailableError`: YouTube couldn't be reached or blocked us (retry later).
"""

import html
import logging
import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol
from urllib.parse import urlsplit

import yt_dlp
from youtube_transcript_api import (
    AgeRestricted,
    CouldNotRetrieveTranscript,
    InvalidVideoId,
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
    VideoUnplayable,
    YouTubeTranscriptApi,
)

from app.ingestion.whisper import AudioDownloadError, Transcriber, WhisperSkippedError
from app.ingestion.youtube_urls import canonical_video_url

logger = logging.getLogger("app.ingestion.transcripts")

ENGLISH = ("en", "en-US", "en-GB", "en-CA", "en-AU", "en-IN", "en-orig")
TranscriptSource = Literal["YT_MANUAL", "YT_AUTO", "WHISPER"]


class NoTranscriptError(Exception):
    """No usable transcript could be produced. Retrying won't help."""


class VideoInaccessibleError(NoTranscriptError):
    """The video itself can't be accessed (removed, private, age-restricted): Whisper can't help."""


class TranscriptUnavailableError(Exception):
    """YouTube couldn't be reached or refused the request (e.g. rate limiting). Retry later."""


@dataclass(frozen=True)
class Segment:
    text: str
    start: float
    duration: float


@dataclass(frozen=True)
class Transcript:
    source: TranscriptSource
    language: str
    segments: list[Segment]
    translated_from: str | None = None
    fetched_with: Literal["youtube-transcript-api", "yt-dlp", "whisper"] = "youtube-transcript-api"


# ─── Cleaning ───────────────────────────────────────────────────────────────

# Non-speech annotations: [Music], [Applause], (laughs), ♪ ... ♪, speaker-change markers.
_NOISE = re.compile(r"\[[^\]]{0,40}\]|\((?:music|applause|laughs?|laughter|inaudible)\)|♪|>>", re.I)
_SPACE = re.compile(r"\s+")


def clean_text(text: str) -> str:
    return _SPACE.sub(" ", _NOISE.sub(" ", html.unescape(text))).strip()


def clean_segments(raw: Iterable[tuple[str, float, float]]) -> list[Segment]:
    """Unescapes HTML, strips noise, collapses whitespace, drops empties, sorts by time."""
    segments = [
        Segment(text=text, start=round(start, 3), duration=round(max(duration, 0.0), 3))
        for text, start, duration in ((clean_text(t), s, d) for t, s, d in raw)
        if text
    ]
    return sorted(segments, key=lambda s: s.start)


# ─── WebVTT (yt-dlp fallback) ───────────────────────────────────────────────

_CUE_TIME = re.compile(
    r"^(?P<start>(?:\d+:)?\d{2}:\d{2}\.\d{3})\s+-->\s+(?P<end>(?:\d+:)?\d{2}:\d{2}\.\d{3})"
)
_INLINE_TAG = re.compile(r"<[^>]+>")


def _seconds(stamp: str) -> float:
    parts = [float(p) for p in stamp.split(":")]
    while len(parts) < 3:
        parts.insert(0, 0.0)
    hours, minutes, seconds = parts
    return hours * 3600 + minutes * 60 + seconds


def parse_vtt(text: str) -> list[tuple[str, float, float]]:
    """Parses WebVTT into (text, start, duration).

    Handles YouTube's auto-generated "rolling" captions: each new line first appears with inline
    word timings, then is repeated in short hold cues and as the first line of the next cue. Lines
    identical to one of the last few emitted lines are dropped, which removes the repetition
    without affecting manual captions (where a cue's lines form one sentence).
    """
    results: list[tuple[str, float, float]] = []
    recent: list[str] = []
    # Cues are separated by EMPTY lines only: YouTube auto cues contain lines holding a single
    # space, which must not split a cue (that would detach its text from its timing).
    blocks = re.split(r"\n{2,}", text.replace("\r\n", "\n"))
    for block in blocks:
        lines = block.strip("\n").split("\n")
        cue = next(((i, m) for i, line in enumerate(lines) if (m := _CUE_TIME.match(line))), None)
        if cue is None:
            continue  # header, NOTE or STYLE block
        timing, match = cue
        start, end = _seconds(match["start"]), _seconds(match["end"])
        new_lines = []
        for raw_line in lines[timing + 1 :]:
            line = _SPACE.sub(" ", _INLINE_TAG.sub("", raw_line)).strip()
            if line and line not in recent:
                new_lines.append(line)
                recent = [*recent[-3:], line]
        if new_lines:
            results.append((" ".join(new_lines), start, end - start))
    return results


def _base_language(code: str) -> str:
    return code.split("-")[0].lower()


def _language_mismatch(transcript: Transcript, spoken_language: str | None) -> bool:
    """True when untranslated captions are in a different language than the speech."""
    if not spoken_language or transcript.translated_from is not None:
        return False
    return _base_language(transcript.language) != _base_language(spoken_language)


# ─── Sources ────────────────────────────────────────────────────────────────


class TranscriptApi(Protocol):
    def list(self, video_id: str) -> Any: ...


YtDlpInfo = Callable[[str], dict[str, Any]]
HttpGet = Callable[[str], str]


def _ytdlp_info(video_id: str) -> dict[str, Any]:
    options: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "allowed_extractors": [r"^youtube$"],
        "socket_timeout": 20,
    }
    with yt_dlp.YoutubeDL(options) as ydl:  # type: ignore[arg-type]
        return dict(ydl.extract_info(canonical_video_url(video_id), download=False) or {})


def _http_get(url: str) -> str:
    with yt_dlp.YoutubeDL({"quiet": True, "socket_timeout": 20}) as ydl:
        response = ydl.urlopen(url)
        return str(response.read().decode("utf-8"))


@dataclass
class TranscriptFetcher:
    api: TranscriptApi = field(default_factory=YouTubeTranscriptApi)
    ytdlp_info: YtDlpInfo = _ytdlp_info
    http_get: HttpGet = _http_get
    #: Speech-to-text fallback (#19); `None` disables it.
    whisper: Transcriber | None = None

    def fetch(self, video_id: str, spoken_language: str | None = None) -> Transcript:
        """Captions when usable, else Whisper.

        Whisper runs when no captions exist, or when the captions' language doesn't match
        `spoken_language` (the video's language from its metadata, #17), which catches YouTube
        auto-captions that were generated for the wrong language.
        """
        try:
            captions = self._captions(video_id)
        except VideoInaccessibleError:
            raise
        except NoTranscriptError as no_captions:
            return self._transcribe(video_id, reason=str(no_captions))

        if _language_mismatch(captions, spoken_language) and self.whisper is not None:
            logger.info(
                "caption language doesn't match the spoken language; trying Whisper",
                extra={
                    "fields": {
                        "youtubeId": video_id,
                        "captions": captions.language,
                        "spoken": spoken_language,
                    }
                },
            )
            try:
                return self._transcribe(video_id, reason="caption language mismatch")
            except (NoTranscriptError, TranscriptUnavailableError) as error:
                logger.warning(
                    "Whisper unavailable; keeping the mismatched captions",
                    extra={"fields": {"youtubeId": video_id, "error": str(error)}},
                )
        return captions

    def _transcribe(self, video_id: str, reason: str) -> Transcript:
        if self.whisper is None:
            raise NoTranscriptError(reason)
        try:
            result = self.whisper.transcribe_video(video_id)
        except WhisperSkippedError as error:
            raise NoTranscriptError(f"{reason}; Whisper skipped: {error}") from error
        except AudioDownloadError as error:
            raise TranscriptUnavailableError(str(error)) from error
        segments = clean_segments((s.text, s.start, s.duration) for s in result.segments)
        if not segments:
            raise NoTranscriptError(f"{reason}; no speech detected in the audio")
        return Transcript("WHISPER", result.language, segments, fetched_with="whisper")

    def _captions(self, video_id: str) -> Transcript:
        primary_error: Exception | None = None
        try:
            transcript = self._from_transcript_api(video_id)
            if transcript is not None:
                return transcript
        except NoTranscriptError:
            raise
        except Exception as error:  # blocked, rate-limited, network, parsing...
            primary_error = error
            logger.warning(
                "youtube-transcript-api failed; trying yt-dlp",
                extra={"fields": {"youtubeId": video_id, "error": type(error).__name__}},
            )

        try:
            transcript = self._from_ytdlp(video_id)
        except NoTranscriptError:
            raise
        except Exception as error:
            raise TranscriptUnavailableError(
                f"could not reach YouTube captions ({type(primary_error or error).__name__})"
            ) from error
        if transcript is None:
            raise NoTranscriptError("no captions are available for this video")
        return transcript

    def _from_transcript_api(self, video_id: str) -> Transcript | None:
        try:
            listing = self.api.list(video_id)
        except (TranscriptsDisabled, NoTranscriptFound):
            return None  # let yt-dlp have a look before giving up
        except (VideoUnavailable, VideoUnplayable, AgeRestricted, InvalidVideoId) as error:
            raise VideoInaccessibleError(
                f"video can't be accessed ({type(error).__name__})"
            ) from error

        choices: list[tuple[str, TranscriptSource]] = [
            ("find_manually_created_transcript", "YT_MANUAL"),
            ("find_generated_transcript", "YT_AUTO"),
        ]
        for finder, source in choices:
            try:
                found = getattr(listing, finder)(ENGLISH)
            except NoTranscriptFound:
                continue
            return self._build(found, source, translated_from=None)

        tracks = list(listing)

        # No English track: ask YouTube to translate one. Translation is often refused
        # (NotTranslatable) or fails, so each attempt is independent.
        for track in tracks:
            if not getattr(track, "is_translatable", False):
                continue
            kind: TranscriptSource = "YT_AUTO" if track.is_generated else "YT_MANUAL"
            try:
                return self._build(track.translate("en"), kind, translated_from=track.language_code)
            except CouldNotRetrieveTranscript as error:
                logger.info(
                    "translation unavailable",
                    extra={"fields": {"youtubeId": video_id, "error": type(error).__name__}},
                )

        # Last resort: the original-language captions, labelled honestly (the LLM can still write
        # English notes from them). Mis-labelled auto captions are a known YouTube issue that the
        # Whisper fallback (#19) handles by comparing caption and video languages.
        for track in tracks:
            kind = "YT_AUTO" if track.is_generated else "YT_MANUAL"
            try:
                transcript = self._build(track, kind, translated_from=None)
            except CouldNotRetrieveTranscript:
                continue
            if transcript is not None:
                return transcript
        return None

    @staticmethod
    def _build(
        track: Any, source: TranscriptSource, translated_from: str | None
    ) -> Transcript | None:
        fetched = track.fetch()
        segments = clean_segments((s.text, s.start, s.duration) for s in fetched.snippets)
        if not segments:
            return None
        language = "en" if translated_from else str(track.language_code)
        return Transcript(source, language, segments, translated_from)

    def _from_ytdlp(self, video_id: str) -> Transcript | None:
        info = self.ytdlp_info(video_id)
        sources: tuple[tuple[str, TranscriptSource], ...] = (
            ("subtitles", "YT_MANUAL"),
            ("automatic_captions", "YT_AUTO"),
        )
        for key, source in sources:
            tracks: dict[str, list[dict[str, Any]]] = info.get(key) or {}
            for language in ENGLISH:
                vtt = next((t for t in tracks.get(language, []) if t.get("ext") == "vtt"), None)
                if vtt is None:
                    continue
                url = str(vtt.get("url", ""))
                host = urlsplit(url).hostname or ""
                if urlsplit(url).scheme != "https" or not (
                    host == "youtube.com" or host.endswith(".youtube.com")
                ):
                    continue  # defence in depth: only fetch captions from YouTube itself
                segments = clean_segments(parse_vtt(self.http_get(url)))
                if segments:
                    language_code = "en" if language == "en-orig" else language
                    return Transcript(
                        source,
                        language_code,
                        segments,
                        fetched_with="yt-dlp",
                    )
        return None
