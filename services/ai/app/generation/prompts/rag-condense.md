---
name: rag-condense
version: 2
description: Rewrites a chat follow-up as a standalone question, so retrieval can find its topic
variables: [conversation, question]
---
Below is a conversation between a student and a course assistant, then the student's newest message.

Rewrite the newest message as ONE standalone question that can be understood without the conversation:
- Replace words like "it", "that", "the other one" or "again" with the topic they refer to, and always name the main topic explicitly (for example "recursion", "SQL joins", "depth-first search"), even if the student didn't repeat it.
- Keep the student's intent otherwise. Do not answer it, and do not add topics the student didn't ask about.
- If the message is already standalone, return it unchanged.

Examples (from other courses):
- After a conversation about SQL inner joins, "and the other kind?" → "What is a SQL outer join and how does it differ from an inner join?"
- After a conversation about Python lists, "show me that again with an example" → "Can you show an example of creating and using a Python list?"

Reply with only the rewritten question, on one line.

<conversation>
{{conversation}}
</conversation>

Newest message: {{question}}
