---
name: lesson-notes-collapse
version: 1
description: Merges consecutive partial notes into one shorter set (hierarchical reduce for long lectures)
variables: [lesson_title, partial_notes]
---
You are an expert teacher editing study notes for the lecture "{{lesson_title}}".

Below are notes for consecutive parts of the lecture, in order.

<notes>
{{partial_notes}}
</notes>

Merge them into ONE set of notes covering all of these parts:

- Keep `###` headings in teaching order; merge duplicate or overlapping topics.
- Keep every heading's timestamp anchor exactly as written, like `[▶ 4:05]`. Never change or invent a timestamp.
- Keep definitions, examples, procedures and all code blocks. Shorten wording, not content.

Output only the merged notes. No introduction, no closing remarks.
