"""Do the recorded fixtures still match YouTube? (opt-in: `uv run pytest -m network`)

A failure means YouTube changed (captions edited, metadata updated): re-record with
`pnpm ai:fixtures` and review the diff. Whisper output is not compared (it depends on the model
version); tests/test_whisper_network.py checks Whisper live.
"""

import pytest

from app.ingestion.metadata import YtDlpClient
from app.ingestion.transcripts import TranscriptFetcher
from tests.fixture_data import EXCERPT_SEC, VIDEOS, FixtureName, load_transcript, load_videos

pytestmark = pytest.mark.network


@pytest.mark.parametrize("name", ["manual", "auto"])
def test_caption_fixtures_match_youtube(name: FixtureName) -> None:
    recorded = load_transcript(name)
    live = TranscriptFetcher().fetch(VIDEOS[name])
    assert (live.source, live.language) == (recorded.source, recorded.language)
    assert [s for s in live.segments if s.start < EXCERPT_SEC] == recorded.segments


def test_metadata_fixture_matches_youtube() -> None:
    client = YtDlpClient()
    for youtube_id, recorded in load_videos().items():
        live = client.video(youtube_id)
        assert (live.title, live.channel, live.duration_sec) == (
            recorded.title,
            recorded.channel,
            recorded.duration_sec,
        )
