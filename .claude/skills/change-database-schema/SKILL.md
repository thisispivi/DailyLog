---
name: change-database-schema
description: Change DailyLog's SQLite schema. Use when adding a table, column, index, or CHECK constraint in daily-log/src/infrastructure/database/schema.ts, bumping SCHEMA_VERSION, or adding a field that must survive backup export and import.
---

# Change the database schema

Rules: docs/CODING_STANDARDS.md ("Database", "Runtime validation"). Paths are relative to `daily-log/`.

## How migrations work here

- `src/infrastructure/database/schema.ts` holds one idempotent `migrateDatabase` function and `SCHEMA_VERSION`. There are no numbered migration files. Tables use `CREATE TABLE IF NOT EXISTS`; columns added later are guarded by a `PRAGMA table_info(...)` check before `ALTER TABLE ... ADD COLUMN`.
- `src/infrastructure/database/client.ts` (`getDatabase`) copies an older database to `<file>.pre-web-v<old version>.bak` before migrating, but only when its `user_version` is below `SCHEMA_VERSION`.
- `schema.ts` must stay free of Node APIs: the browser demo runs the same migrations on sql.js.
- Existing databases include ones created by the retired Telegram bot. Changes must be additive.

## Steps

1. **Schema.** Add the table or guarded `ALTER TABLE` in `migrateDatabase`. New columns need a `DEFAULT` (or must be nullable) so existing rows stay valid. Put invariants in `CHECK` constraints or partial unique indexes. Store timestamps as UTC ISO strings with `+00:00`, weights as integer grams. Every table carries `user_id`.
2. **Version.** Increment `SCHEMA_VERSION` so existing databases get the pre-migration backup.
3. **Repository.** Read and write the column in `src/infrastructure/database/logbook-repository.ts`, filtering by `userId`.
4. **Backup.** If the data belongs to the user, add it to `exportBackup` and `importBackup` in the repository and to `backupSchema` in `src/features/backup/schemas.ts`. Give the new field a `.default(...)` there so older backups still import (see the `goalDate` and `timeFormat` examples). Bump `BACKUP_VERSION` only if old files can no longer be read.
5. **Demo.** If the demo should show the field, update its sample data in `demo/shell/seed.ts`.
6. **Tests.** In `logbook-repository.test.ts`: the new behaviour, the `CHECK` rejections that matter, and an upgrade from a database at the previous version (the test file already opens one with `new Database(":memory:")` and `migrateDatabase`). Update `src/features/backup/schemas.test.ts` for the backup shape.
7. **Check.** Run the `check` skill, including `npm run demo:build`.

## Hard rules

- Never drop or rename a column or table, and never rewrite user data destructively.
- Never run `npm run db:migrate` against the default `DATABASE_PATH` while developing; it may be the owner's real journal.
- Don't re-validate rows with Zod after reading them; the `CHECK` constraints are the contract.

## Stop and ask

Before any change that is not additive, that changes the meaning of existing data, or that would need `BACKUP_VERSION` bumped. Describe the options and the effect on existing databases and backup files.
