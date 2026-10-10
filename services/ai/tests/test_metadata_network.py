"""Live YouTube checks (opt-in: `uv run pytest -m network`). Uses real yt-dlp, no API keys."""

import pytest

from app.ingestion.metadata import MetadataService, YtDlpClient

pytestmark = pytest.mark.network

# freeCodeCamp.org: "SQL Tutorial - Full Database Course for Beginners" (also used by the seed).
SQL_COURSE = "HXV3zeQKqGY"
# freeCodeCamp.org: "Deep Learning with PyTorch Live Course" (6 videos).
PYTORCH_PLAYLIST = "PLWKjhJtqVAbm3T2Eq1_KgloC7ogdXxdRa"


def test_real_video_metadata() -> None:
    info = YtDlpClient().video(SQL_COURSE)
    assert info.title == "SQL Tutorial - Full Database Course for Beginners"
    assert info.channel == "freeCodeCamp.org"
    assert info.duration_sec > 4 * 3600
    assert len(info.chapters) >= 20


def test_real_playlist_is_resolved_and_capped() -> None:
    result = MetadataService(YtDlpClient(), max_videos=3).for_playlist(PYTORCH_PLAYLIST)
    assert result.truncated is True  # 6 videos, capped at 3
    assert len(result.videos) + len(result.failed) == 3
    assert all(v.duration_sec > 0 and v.title for v in result.videos)
