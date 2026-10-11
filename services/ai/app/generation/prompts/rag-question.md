---
name: rag-question
version: 2
description: The user turn of the course chatbot: retrieved excerpts plus the student's question
variables: [context, question]
---
<context>
{{context}}
</context>

Question: {{question}}

Answer from the excerpts only, in your own words, and cite each statement with its excerpt number like [1]. If they don't answer the question, reply NOT_IN_COURSE.
