"""One video's transcript → a finished lesson (SPEC §7.1 steps 3-5, `POST /process/lesson`).

Order matters: the notes are generated FIRST (slow, may fail), and the chunks are embedded and
stored only once the notes exist. A video that fails therefore leaves no vectors behind that the
chatbot could cite for a lesson that is never created. Re-running is idempotent: the lesson's
vectors are replaced under the same deterministic ids.

The lesson id is allocated by the API before processing (the Lesson row is written later, at
step 8), so chunk ids `{lessonId}-{index}` match the API's Chunk rows.
"""

import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass

from app.generation.notes import LessonNotes, NotesGenerator
from app.generation.usage import TokenCounts
from app.processing.chunking import Chunk, TimedText, chunk_transcript
from app.processing.indexing import LessonRef, VectorIndex

logger = logging.getLogger("app.processing.lesson")


class EmptyTranscriptError(ValueError):
    pass


@dataclass(frozen=True)
class ProcessedLesson:
    chunks: list[Chunk]
    chunk_ids: list[str]
    notes: LessonNotes
    llm_calls: int
    tokens: TokenCounts
    elapsed_sec: float


class LessonProcessor:
    def __init__(
        self,
        index: VectorIndex,
        notes: NotesGenerator,
        *,
        chunk_target_tokens: int = 800,
        chunk_overlap_tokens: int = 120,
    ):
        self.index = index
        self.notes = notes
        self.chunk_target_tokens = chunk_target_tokens
        self.chunk_overlap_tokens = chunk_overlap_tokens

    def process(
        self,
        *,
        course_id: str,
        lesson_id: str,
        youtube_id: str,
        video_title: str,
        segments: Sequence[TimedText],
    ) -> ProcessedLesson:
        started = time.perf_counter()
        chunks = chunk_transcript(
            segments,
            target_tokens=self.chunk_target_tokens,
            overlap_tokens=self.chunk_overlap_tokens,
        )
        if not chunks:
            raise EmptyTranscriptError("transcript has no text")

        notes = self.notes.generate(video_title, segments)
        # The vectors carry the generated lesson title (clearer in citations than the video's).
        lesson = LessonRef(course_id, lesson_id, youtube_id, notes.title)
        chunk_ids = self.index.index_lesson(lesson, chunks)

        elapsed = round(time.perf_counter() - started, 1)
        usage = self.notes.usage
        logger.info(
            "lesson processed",
            extra={
                "fields": {
                    "courseId": course_id,
                    "lessonId": lesson_id,
                    "youtubeId": youtube_id,
                    "chunks": len(chunks),
                    "llmCalls": usage.calls,
                    "elapsedSec": elapsed,
                }
            },
        )
        return ProcessedLesson(
            chunks=chunks,
            chunk_ids=chunk_ids,
            notes=notes,
            llm_calls=usage.calls,
            tokens=TokenCounts(usage.counts.input_tokens, usage.counts.output_tokens),
            elapsed_sec=elapsed,
        )
