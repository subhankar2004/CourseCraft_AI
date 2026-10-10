"""Re-records the offline test fixtures from YouTube (network; Whisper runs locally).

    pnpm ai:fixtures          # from the repo root
    uv run python -m scripts.record_fixtures   # from services/ai

Review the diff before committing: captions can change when uploaders edit them, and Whisper
output can change with the model or library version.
"""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from app.ingestion.metadata import YtDlpClient
from app.ingestion.transcripts import TranscriptFetcher
from app.ingestion.whisper import WhisperTranscriber
from tests.fixture_data import (
    METADATA,
    TRANSCRIPTS,
    VIDEOS,
    transcript_to_json,
    video_to_json,
)


def _write(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {path}")


def main() -> None:
    recorded_at = datetime.now(UTC).date().isoformat()
    client = YtDlpClient()
    videos = {name: client.video(youtube_id) for name, youtube_id in VIDEOS.items()}
    _write(
        METADATA,
        {"recordedAt": recorded_at, "videos": [video_to_json(v) for v in videos.values()]},
    )

    fetcher = TranscriptFetcher(whisper=WhisperTranscriber("base", max_minutes=10))
    for name, youtube_id in VIDEOS.items():
        transcript = fetcher.fetch(youtube_id, spoken_language=videos[name].language)
        expected = {"manual": "YT_MANUAL", "auto": "YT_AUTO", "whisper": "WHISPER"}[name]
        if transcript.source != expected:
            sys.exit(f"{name}: expected {expected}, got {transcript.source}; pick another video")
        data = transcript_to_json(transcript, youtube_id, recorded_at)
        _write(TRANSCRIPTS / f"{name}.json", data)


if __name__ == "__main__":
    main()
