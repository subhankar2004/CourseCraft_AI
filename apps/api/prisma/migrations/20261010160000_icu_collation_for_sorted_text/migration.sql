-- Sort catalog names the way people (and JavaScript's localeCompare) expect, independent of the
-- server's C library. The default `en_US.utf8` collation comes from libc: musl (Alpine) compared
-- bytes, glibc (Debian, used since #21 by the pgvector image) ignores spaces and punctuation, so
-- "Database Systems" sorted before "Data Structures". ICU's root collation is the same everywhere.
-- Prisma's schema can't express column collations; it doesn't diff them either.
ALTER TABLE "domains" ALTER COLUMN "name" TYPE TEXT COLLATE "und-x-icu";
ALTER TABLE "courses" ALTER COLUMN "title" TYPE TEXT COLLATE "und-x-icu";
