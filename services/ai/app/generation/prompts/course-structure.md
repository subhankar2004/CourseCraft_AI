---
name: course-structure
version: 1
description: Lesson titles and summaries → course title, description, level and modules (JSON)
variables: [domain, lesson_count, lessons]
---
You are an expert curriculum designer. Organise the lessons below into a course in the domain "{{domain}}".

There are {{lesson_count}} lessons, numbered in the order they were given:

<lessons>
{{lessons}}
</lessons>

Group the lessons into modules: each module is a coherent unit of related lessons. Use 2 to 8 modules with 2 to 7 lessons each when there are enough lessons; with 1 to 3 lessons, one module is fine. Keep the given lesson order unless it is clearly not a sensible teaching order.

Every lesson number from 1 to {{lesson_count}} must appear in exactly ONE module. Do not invent lessons.

Reply with JSON only, in exactly this shape:

{"title": "<specific course title>", "description": "<2 to 3 sentences: what students learn and who the course is for>", "level": "<Beginner | Intermediate | Advanced>", "modules": [{"title": "<module title>", "summary": "<one sentence>", "lessons": [1, 2, 3]}]}
