# Test fixtures

Recorded YouTube data so the default test suite runs offline and deterministically. Loaded by `tests/fixture_data.py`; re-recorded with `pnpm ai:fixtures` (from the repo root). Review the diff before committing: uploaders can edit captions, and Whisper output changes with the model version. `pytest -m network` checks whether the caption and metadata fixtures still match YouTube.

| File                          | Video                                                                       | Source                             |
| ----------------------------- | --------------------------------------------------------------------------- | ---------------------------------- |
| `transcripts/manual.json`     | `HXV3zeQKqGY` freeCodeCamp.org, "SQL Tutorial - Full Database Course for Beginners" | Manual English captions            |
| `transcripts/auto.json`       | `kqtD5dpn9C8` Programming with Mosh, "Python for Beginners"                  | Auto-generated English captions    |
| `transcripts/whisper.json`    | `Tk1t3WKK-ZY` Linux Academy, "What is a database in under 4 minutes"        | No captions; transcribed by Whisper (`base`) |
| `metadata/videos.json`        | The three videos above                                                       | yt-dlp metadata (title, channel, duration, chapters) |
| `manual.vtt`, `auto_rolling.vtt` | Hand-made WebVTT samples                                                  | Parser tests (#18)                 |

Transcripts are **excerpts of at most 10 minutes**, kept only for automated testing of this non-commercial student project. All rights remain with the original creators; the full videos are on YouTube.
