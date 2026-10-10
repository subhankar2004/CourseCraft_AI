import pytest

from app.ingestion.youtube_urls import (
    InvalidYoutubeUrlError,
    YoutubeRef,
    canonical_playlist_url,
    canonical_video_url,
    parse_youtube_url,
)

VID = "HXV3zeQKqGY"
PL = "PLWKjhJtqVAbm3T2Eq1_KgloC7ogdXxdRa"


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/watch?v={VID}",
        f"https://youtube.com/watch?v={VID}&t=120s",
        f"http://m.youtube.com/watch?feature=share&v={VID}",
        f"https://music.youtube.com/watch?v={VID}",
        f"https://youtu.be/{VID}",
        f"https://youtu.be/{VID}?si=abc123&t=42",
        f"https://www.youtube.com/shorts/{VID}",
        f"https://www.youtube.com/embed/{VID}?start=10",
        f"https://www.youtube-nocookie.com/embed/{VID}",
        f"https://www.youtube.com/live/{VID}",
        f"www.youtube.com/watch?v={VID}",  # scheme added
        f"  https://WWW.YOUTUBE.COM/watch?v={VID}  ",  # case-insensitive host, trimmed
        f"https://www.youtube.com/watch?v={VID}&list={PL}",  # a video inside a playlist
    ],
)
def test_video_urls(url: str) -> None:
    assert parse_youtube_url(url) == YoutubeRef(kind="video", id=VID)


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/playlist?list={PL}",
        f"https://m.youtube.com/playlist?list={PL}&si=x",
    ],
)
def test_playlist_urls(url: str) -> None:
    assert parse_youtube_url(url) == YoutubeRef(kind="playlist", id=PL)


@pytest.mark.parametrize(
    "url",
    [
        "https://vimeo.com/123456",
        f"https://youtube.com.evil.example/watch?v={VID}",  # look-alike host
        f"https://evil.example/?u=https://youtube.com/watch?v={VID}",
        f"https://user:pass@www.youtube.com/watch?v={VID}",  # credentials
        f"https://www.youtube.com:8443/watch?v={VID}",  # odd port
        f"ftp://www.youtube.com/watch?v={VID}",
        f"javascript:alert('{VID}')",
        "https://www.youtube.com/watch?v=short",  # malformed id
        "https://www.youtube.com/watch?v=HXV3zeQKqGY<script>",
        "https://www.youtube.com/watch",  # no id
        "https://www.youtube.com/@freecodecamp",  # channel, not a video/playlist
        "https://www.youtube.com/results?search_query=sql",
        "https://youtu.be/",
        "file:///etc/passwd",
        "http://169.254.169.254/latest/meta-data/",  # cloud metadata endpoint (SSRF)
        "",
        "x" * 3000,
    ],
)
def test_rejects_everything_else(url: str) -> None:
    with pytest.raises(InvalidYoutubeUrlError):
        parse_youtube_url(url)


def test_canonical_urls_are_built_from_ids_only() -> None:
    assert canonical_video_url(VID) == f"https://www.youtube.com/watch?v={VID}"
    assert canonical_playlist_url(PL) == f"https://www.youtube.com/playlist?list={PL}"
