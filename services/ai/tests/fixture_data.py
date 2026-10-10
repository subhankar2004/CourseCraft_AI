"""Recorded YouTube data for offline tests (refresh: `pnpm ai:fixtures`, see scripts/).

Transcripts are short EXCERPTS (≤ 10 minutes) of real lectures, enough to exercise chunking,
timestamps and retrieval without committing large transcripts (AGENTS.md rule 6).
"""

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, Literal

from app.ingestion.metadata import Chapter, VideoInfo
from app.ingestion.transcripts import Segment, Transcript

FIXTURES = Path(__file__).parent / "fixtures"
TRANSCRIPTS = FIXTURES / "transcripts"
METADATA = FIXTURES / "metadata" / "videos.json"

FixtureName = Literal["manual", "auto", "whisper"]


#: What each fixture is: the three transcript sources the pipeline handles (#18, #19).
VIDEOS: dict[FixtureName, str] = {
    # freeCodeCamp.org, "SQL Tutorial - Full Database Course for Beginners" (seed course):
    # manual English captions.
    "manual": "HXV3zeQKqGY",
    # Only auto-generated English captions.
    "auto": "kqtD5dpn9C8",
    # "What is a database in under 4 minutes": speech and no captions at all → Whisper.
    "whisper": "Tk1t3WKK-ZY",
}
EXCERPT_SEC = 600.0


def transcript_to_json(transcript: Transcript, youtube_id: str, recorded_at: str) -> dict[str, Any]:
    return {
        "youtubeId": youtube_id,
        "recordedAt": recorded_at,
        "excerptSec": EXCERPT_SEC,
        "source": transcript.source,
        "language": transcript.language,
        "translatedFrom": transcript.translated_from,
        "fetchedWith": transcript.fetched_with,
        "segments": [
            {"text": s.text, "start": s.start, "duration": s.duration}
            for s in transcript.segments
            if s.start < EXCERPT_SEC
        ],
    }


def load_transcript(name: FixtureName) -> Transcript:
    data = json.loads((TRANSCRIPTS / f"{name}.json").read_text(encoding="utf-8"))
    return Transcript(
        source=data["source"],
        language=data["language"],
        segments=[Segment(s["text"], s["start"], s["duration"]) for s in data["segments"]],
        translated_from=data["translatedFrom"],
        fetched_with=data["fetchedWith"],
    )


def video_to_json(info: VideoInfo) -> dict[str, Any]:
    return asdict(info)


def load_videos() -> dict[str, VideoInfo]:
    """Recorded metadata by YouTube id."""
    data = json.loads(METADATA.read_text(encoding="utf-8"))
    return {
        v["youtube_id"]: VideoInfo(
            **{**v, "chapters": [Chapter(c["start_sec"], c["title"]) for c in v["chapters"]]}
        )
        for v in data["videos"]
    }
