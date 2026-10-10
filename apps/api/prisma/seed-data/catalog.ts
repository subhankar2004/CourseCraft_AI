/**
 * Demo catalog for local development and UI work before the AI pipeline exists (#8).
 *
 * The videos are real freeCodeCamp.org lectures. Their metadata and chapter start times were
 * verified with yt-dlp on 2026-10-10, and every `[▶ …]` anchor in the notes is one of those
 * chapter starts. The notes are handwritten demo content, not AI output (llmModel = "seed").
 */

export const domains = [
  {
    slug: 'web-development',
    name: 'Web Development',
    description: 'HTML, CSS, JavaScript, frameworks and how the web works.',
  },
  {
    slug: 'data-structures-algorithms',
    name: 'Data Structures & Algorithms',
    description: 'Arrays, trees, graphs, sorting, searching and complexity analysis.',
  },
  {
    slug: 'database-systems',
    name: 'Database Systems',
    description: 'Relational databases, SQL, database design and normalization.',
  },
  {
    slug: 'machine-learning',
    name: 'Machine Learning',
    description: 'Supervised and unsupervised learning, neural networks and model evaluation.',
  },
] as const;

export const videos = [
  {
    youtubeId: 'HXV3zeQKqGY',
    title: 'SQL Tutorial - Full Database Course for Beginners',
    channel: 'freeCodeCamp.org',
    durationSec: 15639,
    thumbnailUrl: 'https://i.ytimg.com/vi/HXV3zeQKqGY/hqdefault.jpg',
    language: 'en',
  },
  {
    youtubeId: 'ztHopE5Wnpc',
    title: 'Database Design Course - Learn how to design and plan a database for beginners',
    channel: 'freeCodeCamp.org',
    durationSec: 29240,
    thumbnailUrl: 'https://i.ytimg.com/vi/ztHopE5Wnpc/hqdefault.jpg',
    language: 'en',
  },
] as const;

type YoutubeId = (typeof videos)[number]['youtubeId'];

export interface SeedLesson {
  title: string;
  youtubeId: YoutubeId;
  summary: string;
  keyConcepts: string[];
  readingTimeMin: number;
  notesMarkdown: string;
}

export interface SeedModule {
  title: string;
  summary: string;
  lessons: SeedLesson[];
}

export const course = {
  slug: 'database-fundamentals',
  title: 'Database Fundamentals',
  description:
    'From "what is a database?" to writing SQL, modelling relationships and normalizing a schema. ' +
    'Built from two free freeCodeCamp.org lecture series.',
  level: 'Beginner',
  domainSlug: 'database-systems',
  thumbnailUrl: 'https://i.ytimg.com/vi/HXV3zeQKqGY/hqdefault.jpg',
} as const;

export const modules: SeedModule[] = [
  {
    title: 'Relational Databases and SQL',
    summary: 'What a database is, how tables and keys work, and the core SQL statements.',
    lessons: [
      {
        title: 'Databases, Tables and Keys',
        youtubeId: 'HXV3zeQKqGY',
        summary:
          'Why we use databases, how a relational table stores rows and columns, and how keys identify and connect rows.',
        keyConcepts: ['Database', 'DBMS', 'Relational table', 'Primary key', 'Foreign key', 'SQL'],
        readingTimeMin: 4,
        notesMarkdown: `# Databases, Tables and Keys

## What is a database? [▶ 2:36]

A **database** is any organised collection of related information. A **database management system (DBMS)** is the software that stores it and lets us create, read, update and delete (**CRUD**) it safely, even with many users at once.

- **Relational databases** (MySQL, PostgreSQL, SQL Server) store data in **tables**.
- **Non-relational (NoSQL)** databases store documents, key-value pairs or graphs.

## Tables and keys [▶ 23:10]

A table has **columns** (attributes) and **rows** (records).

| Concept | Meaning |
| --- | --- |
| **Primary key** | Uniquely identifies each row, e.g. \`emp_id\` |
| **Surrogate key** | A key with no real-world meaning (an auto-generated id) |
| **Natural key** | A key with real-world meaning (e.g. a national ID number) |
| **Foreign key** | A column that stores another table's primary key, linking the rows |
| **Composite key** | A primary key made of two or more columns |

> Foreign keys are how relational databases express relationships, for example *an employee works in a branch*.

## SQL basics [▶ 43:31]

**SQL** (Structured Query Language) is the language used to talk to a relational DBMS. Its statements fall into a few groups:

- **DDL**: define the schema (\`CREATE\`, \`ALTER\`, \`DROP\`)
- **DML**: change data (\`INSERT\`, \`UPDATE\`, \`DELETE\`)
- **DQL**: query data (\`SELECT\`)

## Recap

- A DBMS manages data safely for many users; relational DBMSs use tables.
- Primary keys identify rows; foreign keys connect tables.
- SQL is how we define and query relational data.
`,
      },
      {
        title: 'Creating and Querying Tables with SQL',
        youtubeId: 'HXV3zeQKqGY',
        summary:
          'Create tables, insert and change rows, enforce constraints, and retrieve data with SELECT and joins.',
        keyConcepts: ['CREATE TABLE', 'INSERT', 'Constraints', 'UPDATE / DELETE', 'SELECT', 'JOIN'],
        readingTimeMin: 5,
        notesMarkdown: `# Creating and Querying Tables with SQL

## Creating tables [▶ 1:15:49]

\`\`\`sql
CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name       VARCHAR(40),
  major      VARCHAR(40)
);
\`\`\`

Every column has a **data type** (\`INT\`, \`VARCHAR(n)\`, \`DECIMAL(p, s)\`, \`DATE\` …).

## Inserting data [▶ 1:31:05]

\`\`\`sql
INSERT INTO student VALUES (1, 'Jack', 'Biology');
INSERT INTO student (student_id, name) VALUES (2, 'Kate');  -- major stays NULL
\`\`\`

## Constraints [▶ 1:38:17]

Constraints make the database reject bad data:

- \`NOT NULL\`: a value is required
- \`UNIQUE\`: no duplicates in the column
- \`DEFAULT 'undecided'\`: the value used when none is given
- \`AUTO_INCREMENT\`: the database generates the key

## Update and delete [▶ 1:48:11]

\`\`\`sql
UPDATE student SET major = 'Bio' WHERE major = 'Biology';
DELETE FROM student WHERE student_id = 5;
\`\`\`

> Always double-check the \`WHERE\` clause. Without it, **every row** is updated or deleted.

## Basic queries [▶ 1:56:11]

\`\`\`sql
SELECT name, major
FROM student
WHERE major IN ('Biology', 'Chemistry')
ORDER BY name ASC
LIMIT 10;
\`\`\`

## Joins [▶ 3:01:36]

A **join** combines rows from two tables using a related column:

\`\`\`sql
SELECT employee.first_name, branch.branch_name
FROM employee
JOIN branch ON employee.emp_id = branch.mgr_id;
\`\`\`

\`LEFT JOIN\` keeps every row from the left table, even without a match.

## Recap

- DDL creates the structure; DML fills and changes it; \`SELECT\` reads it.
- Constraints protect data quality at the database level.
- Joins answer questions that span several tables.
`,
      },
    ],
  },
  {
    title: 'Designing a Database',
    summary:
      'Model relationships with keys, then normalize the schema and speed it up with indexes.',
    lessons: [
      {
        title: 'Relationships and Keys',
        youtubeId: 'ztHopE5Wnpc',
        summary:
          'One-to-one, one-to-many and many-to-many relationships, and the keys that implement them.',
        keyConcepts: [
          'One-to-one',
          'One-to-many',
          'Many-to-many',
          'Junction table',
          'Candidate key',
          'Foreign key',
        ],
        readingTimeMin: 5,
        notesMarkdown: `# Relationships and Keys

## Relationships [▶ 1:44:25]

Tables are related when rows in one refer to rows in another. There are three kinds:

### One-to-one [▶ 1:50:35]

Each row matches **at most one** row on the other side, e.g. *user ↔ user profile*. It is often modelled by putting a unique foreign key on one side.

### One-to-many [▶ 1:53:45]

One parent row has **many** child rows, e.g. *course → modules*. The **child** table holds the foreign key.

### Many-to-many [▶ 1:57:50]

Many rows match many rows, e.g. *students ↔ courses*. A relational database implements it with a **junction (intermediary) table** that holds both foreign keys:

\`\`\`sql
CREATE TABLE enrollment (
  student_id INT REFERENCES student(student_id),
  course_id  INT REFERENCES course(course_id),
  PRIMARY KEY (student_id, course_id)
);
\`\`\`

## Keys [▶ 2:54:42]

- **Superkey**: any set of columns that uniquely identifies a row.
- **Candidate key**: a *minimal* superkey.
- **Primary key**: the candidate key we choose. The others become **alternate keys**.
- **Surrogate vs natural key**: a generated id vs a meaningful real-world value.

## Foreign keys [▶ 4:13:07]

A **foreign key** references a primary key in another table and enforces **referential integrity**: you cannot point to a row that doesn't exist. The \`ON DELETE\` rules (\`CASCADE\`, \`RESTRICT\`, \`SET NULL\`) decide what happens to child rows when a parent is deleted.

## Recap

- One-to-many uses a foreign key in the child; many-to-many needs a junction table.
- Pick a primary key from the candidate keys; foreign keys keep references valid.
`,
      },
      {
        title: 'Normalization and Indexes',
        youtubeId: 'ztHopE5Wnpc',
        summary: 'Remove redundancy with 1NF, 2NF and 3NF, and use indexes to make lookups fast.',
        keyConcepts: ['Normalization', '1NF', '2NF', '3NF', 'Functional dependency', 'Index'],
        readingTimeMin: 4,
        notesMarkdown: `# Normalization and Indexes

## Why normalize? [▶ 5:35:14]

**Normalization** organises tables to remove **redundant data**, which prevents *update, insert and delete anomalies* (for example, changing a value in one row but not in its copies).

## First normal form (1NF) [▶ 5:39:48]

- Every column holds **atomic** (indivisible) values: no lists inside a cell.
- No repeating groups of columns (\`phone1\`, \`phone2\`, …).

## Second normal form (2NF) [▶ 5:46:34]

- The table is in 1NF, **and**
- every non-key column depends on the **whole** primary key, with no *partial dependency* on part of a composite key.

## Third normal form (3NF) [▶ 5:55:00]

- The table is in 2NF, **and**
- no non-key column depends on another non-key column (no **transitive dependency**).

> A common summary: every non-key attribute depends on *"the key, the whole key, and nothing but the key."*

## Indexes [▶ 6:01:12]

An **index** is a separate data structure (usually a B-tree) that lets the database find rows without scanning the whole table.

| Type | Idea |
| --- | --- |
| **Clustered** | The table's rows are stored in index order (one per table) |
| **Non-clustered** | A separate structure that points to the rows |
| **Composite** | An index over several columns; it can also serve lookups on its leading column |

Indexes speed up reads but cost storage and slow down writes, so index the columns you filter and join on.

## Recap

- 1NF: atomic values. 2NF: no partial dependencies. 3NF: no transitive dependencies.
- Index the columns you search and join on, but not everything.
`,
      },
    ],
  },
];
