"""Evaluation endpoints (internal: called only by the CourseCraft API). SPEC §9.

`POST /eval/cognitive-load` measures notes without generating anything: the API calls it when an
admin edits a lesson (#43), so the stored index always describes the notes as they are.
"""

from fastapi import APIRouter

from app.evaluation.cognitive_load import cognitive_load
from app.schemas import CognitiveLoadOut, CognitiveLoadRequest

router = APIRouter(prefix="/eval", tags=["evaluation"])


@router.post("/cognitive-load")
def measure_cognitive_load(body: CognitiveLoadRequest) -> CognitiveLoadOut:
    """The Cognitive Load Index of the given notes (0 light .. 100 heavy) and its parts."""
    load = cognitive_load(body.notes_markdown, body.key_concepts)
    return CognitiveLoadOut(
        flesch_kincaid=load.flesch_kincaid,
        avg_sentence_len=load.avg_sentence_len,
        concept_density=load.concept_density,
        index=load.index,
        words=load.words,
        simplified=False,
        simplify_attempted=False,
        original_index=None,
    )
