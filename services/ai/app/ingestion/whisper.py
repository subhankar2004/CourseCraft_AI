"""Speech-to-text fallback with Whisper (faster-whisper), for videos without usable captions.

- Audio only is downloaded with yt-dlp as the original stream (no conversion, so no ffmpeg
  binary is needed; faster-whisper decodes it with PyAV) into a temporary directory that is
  always deleted.
- The video length is checked BEFORE downloading against WHISPER_MAX_MINUTES.
- Inference runs on the CPU with int8 quantisation (CTranslate2 has no Apple GPU backend), with
  voice-activity detection (VAD) to skip silence and music, which also reduces Whisper's
  tendency to hallucinate text over non-speech audio.
"""

import logging
import tempfile
import time
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any, Protocol

import yt_dlp
from faster_whisper import WhisperModel

from app.ingestion.youtube_urls import canonical_video_url

logger = logging.getLogger("app.ingestion.whisper")

_MAX_AUDIO_BYTES = 500 * 1024 * 1024  # a 2 h lecture at 128 kbit/s is ~115 MB


class WhisperSkippedError(Exception):
    """Whisper was not run (too long, no audio, live stream ...). Not retryable."""


class AudioDownloadError(Exception):
    """Downloading the audio failed (network, blocked). Retry later."""


@dataclass(frozen=True)
class WhisperSegment:
    text: str
    start: float
    duration: float


@dataclass(frozen=True)
class WhisperResult:
    language: str
    language_probability: float
    segments: list[WhisperSegment]
    audio_sec: float
    elapsed_sec: float


class Transcriber(Protocol):
    def transcribe_video(self, video_id: str) -> WhisperResult: ...


@cache
def _load_model(name: str) -> WhisperModel:
    # Downloaded from Hugging Face on first use and cached (~145 MB for `base`).
    logger.info("loading whisper model", extra={"fields": {"model": name}})
    return WhisperModel(name, device="cpu", compute_type="int8")


class WhisperTranscriber:
    def __init__(self, model_name: str, max_minutes: int):
        self.model_name = model_name
        self.max_minutes = max_minutes

    def transcribe_video(self, video_id: str) -> WhisperResult:
        with tempfile.TemporaryDirectory(prefix="coursecraft-audio-") as tmp:
            audio = self._download_with_retry(video_id, Path(tmp))
            return self.transcribe_file(audio)
        # TemporaryDirectory removes the audio even when transcription raises.

    def _download_with_retry(self, video_id: str, directory: Path, attempts: int = 2) -> Path:
        # YouTube's media servers intermittently answer 403 (observed while building #19); a
        # second attempt with a fresh extraction usually succeeds.
        for attempt in range(1, attempts + 1):
            try:
                return self._download_audio(video_id, directory)
            except AudioDownloadError:
                if attempt == attempts:
                    raise
                logger.warning(
                    "audio download failed; retrying",
                    extra={"fields": {"youtubeId": video_id, "attempt": attempt}},
                )
                for leftover in directory.iterdir():
                    leftover.unlink(missing_ok=True)
                time.sleep(2)
        raise AssertionError("unreachable")  # pragma: no cover

    def _download_audio(self, video_id: str, directory: Path) -> Path:
        options: dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            "allowed_extractors": [r"^youtube$"],
            "socket_timeout": 30,
            "noplaylist": True,
            # Original audio stream, smallest first-class format; no post-processing (no ffmpeg).
            "format": "bestaudio[ext=m4a]/bestaudio/worstaudio",
            "outtmpl": str(directory / "%(id)s.%(ext)s"),
            "max_filesize": _MAX_AUDIO_BYTES,
            "postprocessors": [],
        }
        try:
            with yt_dlp.YoutubeDL(options) as ydl:  # type: ignore[arg-type]
                info = ydl.extract_info(canonical_video_url(video_id), download=False) or {}
                if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
                    raise WhisperSkippedError("live or upcoming streams can't be transcribed")
                duration = float(info.get("duration") or 0)
                if duration <= 0:
                    raise WhisperSkippedError("video has no duration")
                if duration > self.max_minutes * 60:
                    raise WhisperSkippedError(
                        f"video is {duration / 60:.0f} min; Whisper is limited to "
                        f"{self.max_minutes} min (WHISPER_MAX_MINUTES)"
                    )
                ydl.process_ie_result(info, download=True)
        except WhisperSkippedError:
            raise
        except yt_dlp.utils.DownloadError as error:
            raise AudioDownloadError(f"audio download failed: {error}") from error

        files = [p for p in directory.iterdir() if p.is_file() and not p.name.endswith(".part")]
        if not files:
            raise AudioDownloadError("audio download produced no file")
        return files[0]

    def transcribe_file(self, audio: Path) -> WhisperResult:
        started = time.perf_counter()
        segments, info = _load_model(self.model_name).transcribe(
            str(audio),
            vad_filter=True,
            # Each window is decoded independently: avoids the repetition loops long lectures
            # can trigger when previous text conditions the next window.
            condition_on_previous_text=False,
        )
        result = [
            WhisperSegment(
                text=s.text.strip(),
                start=round(s.start, 3),
                duration=round(max(s.end - s.start, 0.0), 3),
            )
            for s in segments  # a lazy generator: decoding happens here
            if s.text.strip()
        ]
        elapsed = time.perf_counter() - started
        logger.info(
            "whisper transcription",
            extra={
                "fields": {
                    "model": self.model_name,
                    "language": info.language,
                    "audioSec": round(info.duration, 1),
                    "elapsedSec": round(elapsed, 1),
                    "segments": len(result),
                }
            },
        )
        return WhisperResult(
            language=info.language,
            language_probability=round(info.language_probability, 3),
            segments=result,
            audio_sec=round(info.duration, 1),
            elapsed_sec=round(elapsed, 1),
        )
