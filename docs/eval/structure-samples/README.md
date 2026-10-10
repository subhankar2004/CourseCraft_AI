# Course structuring: manual check (issue #25)

`POST /process/structure` with the free local model, through the dev AI server. The raw responses are the `*.llama3-1-8b.json` files here, kept verbatim. The 10-lesson input is `services/ai/tests/fixtures/structure/sql-10-lessons.json`: real chapter titles of the seed SQL course, with hand-written summaries.

**Setup:** Ollama `llama3.1:8b` in JSON mode (`format="json"`), prompt `course-structure@1`, temperature 0.2.

| Input                         | Time   | Tokens (in/out) | Result                                                                                                                         |
| ----------------------------- | ------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 10 lessons, run 1             | 17.7 s | 619 / 329       | 5 modules (3-2-2-2-1), no repairs                                                                                              |
| 10 lessons, run 2             | 12.2 s | 619 / 295       | 5 modules, same grouping, different titles, no repairs                                                                         |
| 10 lessons, run 3             | 10.8 s | 619 / 262       | 4 modules (joins, nested queries and ER diagrams merged as "Advanced SQL Topics"), no repairs                                  |
| 10 lessons in shuffled order  | 12.3 s | –               | Valid (every lesson once, no repairs) but the given order was kept: "What is a Database?" 4th, Mac before Windows installation |
| All 23 chapters (titles only) | 17.8 s | –               | 8 modules of 2–3 chapters in order, sensible titles ("Company Database", "Database Design"), no repairs                        |

## Findings

- **Validity:** all 5 runs were valid on the first attempt: every lesson placed exactly once, no repairs, no fallback. JSON mode removed formatting failures entirely.
- **Consistency:** the three runs on the same input agreed on the grouping of the first 7 lessons; module titles and the split of the last lessons varied. The admin review (#31) is where the final outline is decided.
- **Limitation, order:** `llama3.1:8b` follows the order it is given and does not restore a teaching order from shuffled input. Course generation passes the playlist (or URL) order, which is normally the teaching order, and the admin can reorder lessons (#31). A stronger model or an ordering step could be evaluated later.
- **Limitation, granularity:** with titles only (23 chapters), modules are mostly consecutive groups of three; summaries from the notes (#23) give the model more to go on.
