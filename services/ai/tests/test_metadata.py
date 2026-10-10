from collections.abc import Iterator
from typing import Any

import pytest
import yt_dlp
from fastapi.testclient import TestClient

from app.api.ingest import get_metadata_service
from app.config import Settings
from app.ingestion.metadata import (
    MetadataService,
    VideoInfo,
    VideoUnavailableError,
    YtDlpClient,
)
from app.main import create_app
from tests.conftest import INTERNAL_KEY

VID_A, VID_B, VID_C = "AAAAAAAAAAA", "BBBBBBBBBBB", "CCCCCCCCCCC"
PL = "PLxxxxxxxxxxxxxxxx"


class FakeExtractor:
    """Stands in for yt-dlp: records calls and returns canned info dicts."""

    def __init__(self, responses: dict[str, dict[str, Any] | Exception]):
        self.responses = responses
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def __call__(self, url: str, options: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((url, options))
        response = self.responses[url]
        if isinstance(response, Exception):
            raise response
        return response


def watch(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def video_info(video_id: str, **overrides: Any) -> dict[str, Any]:
    return {
        "id": video_id,
        "title": f"Title {video_id}",
        "channel": "freeCodeCamp.org",
        "duration": 600.4,
        "language": "en",
        "chapters": [{"start_time": 0.0, "title": "Intro"}, {"start_time": 95.0, "title": "Joins"}],
        **overrides,
    }


class TestYtDlpClient:
    def test_maps_video_metadata_from_a_canonical_url(self) -> None:
        extract = FakeExtractor({watch(VID_A): video_info(VID_A)})
        info = YtDlpClient(extract).video(VID_A)
        assert info.title == f"Title {VID_A}"
        assert info.duration_sec == 600
        assert info.thumbnail_url == f"https://i.ytimg.com/vi/{VID_A}/hqdefault.jpg"
        assert [c.title for c in info.chapters] == ["Intro", "Joins"]
        url, options = extract.calls[0]
        assert url == watch(VID_A)  # built from the id, never the user's URL
        assert options == {"noplaylist": True}

    @pytest.mark.parametrize(
        ("overrides", "reason"),
        [
            ({"live_status": "is_live"}, "live"),
            ({"live_status": "is_upcoming"}, "live"),
            ({"duration": None}, "no duration"),
        ],
    )
    def test_rejects_unusable_videos(self, overrides: dict[str, Any], reason: str) -> None:
        client = YtDlpClient(FakeExtractor({watch(VID_A): video_info(VID_A, **overrides)}))
        with pytest.raises(VideoUnavailableError, match=reason):
            client.video(VID_A)

    @pytest.mark.parametrize(
        ("raw", "reason"),
        [
            ("ERROR: [youtube] AAAAAAAAAAA: Private video", "Private video"),
            (
                "ERROR: [youtube] AAAAAAAAAAA: Video unavailable. This video has been removed",
                "Video unavailable. This video has been removed",
            ),
            ("Some unexpected failure", "Some unexpected failure"),
        ],
    )
    def test_translates_yt_dlp_errors_into_a_clean_reason(self, raw: str, reason: str) -> None:
        client = YtDlpClient(FakeExtractor({watch(VID_A): yt_dlp.utils.DownloadError(raw)}))
        with pytest.raises(VideoUnavailableError) as caught:
            client.video(VID_A)
        assert str(caught.value) == reason

    def test_lists_playlist_ids_flat_with_truncation(self) -> None:
        entries = [{"id": v} for v in (VID_A, VID_B, VID_C)]
        url = f"https://www.youtube.com/playlist?list={PL}"
        extract = FakeExtractor({url: {"entries": entries}})
        ids, truncated = YtDlpClient(extract).playlist_video_ids(PL, limit=2)
        assert (ids, truncated) == ([VID_A, VID_B], True)
        assert extract.calls[0][1] == {"extract_flat": "in_playlist", "playlistend": 3}


class FakeClient:
    def __init__(self, unavailable: set[str] | None = None):
        self.unavailable = unavailable or set()

    def video(self, video_id: str) -> VideoInfo:
        if video_id in self.unavailable:
            raise VideoUnavailableError("Private video")
        return VideoInfo(video_id, f"T {video_id}", "ch", 60, f"thumb/{video_id}", "en")

    def playlist_video_ids(self, playlist_id: str, limit: int) -> tuple[list[str], bool]:
        return [VID_A, VID_B][:limit], limit < 2


class TestMetadataService:
    def test_dedupes_keeps_order_and_reports_failures(self) -> None:
        service = MetadataService(FakeClient(unavailable={VID_B}), max_videos=10)
        result = service.for_videos([VID_C, VID_A, VID_C, VID_B])
        assert [v.youtube_id for v in result.videos] == [VID_C, VID_A]
        assert [(f.youtube_id, f.reason) for f in result.failed] == [(VID_B, "Private video")]
        assert result.truncated is False

    def test_caps_at_max_videos(self) -> None:
        result = MetadataService(FakeClient(), max_videos=2).for_videos([VID_A, VID_B, VID_C])
        assert [v.youtube_id for v in result.videos] == [VID_A, VID_B]
        assert result.truncated is True

    def test_playlist(self) -> None:
        result = MetadataService(FakeClient(), max_videos=1).for_playlist(PL)
        assert [v.youtube_id for v in result.videos] == [VID_A]
        assert result.truncated is True


@pytest.fixture
def api(settings: Settings) -> Iterator[TestClient]:
    app = create_app(settings)
    app.dependency_overrides[get_metadata_service] = lambda: MetadataService(
        FakeClient(unavailable={VID_B}), max_videos=settings.max_videos_per_course
    )
    with TestClient(app, raise_server_exceptions=False) as client:
        client.headers["X-Internal-Key"] = INTERNAL_KEY
        yield client


class TestIngestMetadataEndpoint:
    def test_videos_in_camel_case_with_failures(self, api: TestClient) -> None:
        res = api.post(
            "/ingest/metadata",
            json={
                "urls": [f"https://youtu.be/{VID_A}", f"https://www.youtube.com/watch?v={VID_B}"]
            },
        )
        assert res.status_code == 200
        body = res.json()
        assert body["videos"][0]["youtubeId"] == VID_A
        assert body["videos"][0]["durationSec"] == 60
        assert body["failed"] == [{"youtubeId": VID_B, "reason": "Private video"}]
        assert body["truncated"] is False
        assert body["maxVideos"] == 25

    def test_playlist(self, api: TestClient) -> None:
        url = f"https://www.youtube.com/playlist?list={PL}"
        res = api.post("/ingest/metadata", json={"playlistUrl": url})
        assert res.status_code == 200
        assert [v["youtubeId"] for v in res.json()["videos"]] == [VID_A]

    def test_lists_every_invalid_url(self, api: TestClient) -> None:
        res = api.post(
            "/ingest/metadata",
            json={"urls": [f"https://youtu.be/{VID_A}", "https://vimeo.com/1", "nope"]},
        )
        assert res.status_code == 422
        message = res.json()["message"]
        assert isinstance(message, list) and len(message) == 2
        assert message[0].startswith("urls[1]:") and message[1].startswith("urls[2]:")

    @pytest.mark.parametrize(
        "body",
        [
            {},
            {
                "urls": [f"https://youtu.be/{VID_A}"],
                "playlistUrl": f"https://www.youtube.com/playlist?list={PL}",
            },
            {"urls": []},
            {"urls": [f"https://www.youtube.com/playlist?list={PL}"]},  # playlist sent as a video
            {"playlistUrl": f"https://youtu.be/{VID_A}"},  # video sent as a playlist
        ],
    )
    def test_rejects_bad_requests(self, api: TestClient, body: dict[str, Any]) -> None:
        assert api.post("/ingest/metadata", json=body).status_code == 422

    def test_requires_the_internal_key(self, api: TestClient) -> None:
        res = api.post(
            "/ingest/metadata",
            json={"urls": [f"https://youtu.be/{VID_A}"]},
            headers={"X-Internal-Key": "wrong-key-wrong-key-wrong-key-xx"},
        )
        assert res.status_code == 401
