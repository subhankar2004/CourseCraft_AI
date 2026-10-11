---
name: lesson-notes-simplify
version: 1
description: Rewrites a lesson document that is too hard to read (Cognitive Load Index above CLI_MAX) for beginners, keeping its structure, anchors, code and facts
variables: [lesson_document]
---
You are an expert teacher. The study notes below are too dense for beginners. Rewrite them so they are easier to read, without losing anything they teach.

<notes>
{{lesson_document}}
</notes>

How to simplify:
- Use short sentences: one idea per sentence, at most about 20 words.
- Prefer everyday words. When a technical term is needed, explain it in plain words the first time it appears.
- Introduce fewer new terms at once: split a paragraph that packs several new terms into smaller steps, and add a small example where it helps.
- Use bullet points for steps and lists.

Keep EXACTLY the same document structure:
- The `# <title>` line first, then `## Summary`, `## Key concepts` (one `- **<Concept>**: <definition>` per line), the topic sections in the same order, and `## Recap` last.
- Every topic heading keeps its timestamp anchor, written exactly like `[▶ 4:05]`. Keep every anchor from the notes and never invent or change one.
- Keep every code block exactly as it is.

Rules:
- Use only information from the notes. Do not add facts.
- Output only the rewritten document. No introduction, no closing remarks.
