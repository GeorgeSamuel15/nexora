# document-service

Owns document metadata and uploads/downloads. The actual file bytes never
touch Postgres - they live behind a storage abstraction
(`src/storage/StorageDriver`), with only local disk implemented for V1
per the build spec ("...replaced with S3-compatible storage later").
`uploadedBy` is an opaque reference to auth-service's `userId`;
`entityType`/`entityId` is a generic polymorphic link to a record in any
other service (e.g. `entityType: "project"`, `entityId: <project id>`),
with no cross-database FK.

## Endpoints

| Method | Path                      | Permission        | Notes                                                                                                                               |
| ------ | ------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/documents`              | `document.upload` | `multipart/form-data`, file field name `file`, plus optional `category`/`entityType`/`entityId` fields                              |
| GET    | `/documents`              | `document.read`   | Paginated, filterable by category/entity, free-text name search                                                                     |
| GET    | `/documents/:id`          | `document.read`   | Metadata only                                                                                                                       |
| GET    | `/documents/:id/download` | `document.read`   | Streams the actual bytes with correct `Content-Type`/`Content-Disposition` - the client never sees a storage key or filesystem path |
| PATCH  | `/documents/:id`          | `document.upload` | Rename only (no `document.update` permission exists in the spec's list, so this uses the closest write permission)                  |
| POST   | `/documents/:id/share`    | `document.upload` | Records the share and publishes `DOCUMENT_SHARED` (Phase 10) - see "Sharing" below for exactly what this does and doesn't do        |
| DELETE | `/documents/:id`          | `document.delete` | Removes both the metadata row and the stored bytes                                                                                  |

## Sharing (Phase 10) - honest about what this does and doesn't do

`POST /documents/:id/share {userId}` creates a `DocumentShare` record and
publishes `DOCUMENT_SHARED`, which notification-service turns into "a
document was shared with you." **This is not an access-control gate.**
Document access is already org-wide via the `document.read` permission
(anyone with that permission can already read/download/list every
document in the org) - sharing here is purely informational: an audit
trail of who was explicitly pointed at a document, and a trigger for a
notification. Building real per-document access control (private by
default, visible only to the uploader plus explicit shares) would mean
reworking the whole permission model this service currently uses, which
is a bigger change than this phase's scope. Sharing the same document
with the same person twice is idempotent (upserted, not duplicated).

## Storage abstraction

`src/storage/StorageDriver` is the interface; `LocalStorageDriver` is the
only implementation for V1. It has **zero external dependencies** - only
`node:fs/promises` and `node:path` - which matters for how it was
verified (see below). It also defends against path traversal: every key
is resolved and checked to stay inside the configured storage root before
any read/write/delete, since keys are partly derived from user-supplied
file names. This is the concrete mechanism behind the build spec's "do
not expose unrestricted file-system paths" requirement, not just a
docstring promise.

Adding S3 support later means writing an `S3StorageDriver` implementing
the same interface against `@aws-sdk/client-s3`, and changing one line in
`src/storage/index.ts`'s factory - no service or route code changes.

## This test suite was actually executed, not just type-checked

Every other service in this build was verified by type-checking against
the real `@nexora/*` packages, because `pnpm install` can't run in this
sandbox (no network). `LocalStorageDriver` is different: it has no
external dependencies at all, so it doesn't need `pnpm install` to run -
only Node itself. It was genuinely executed here, against a real
temporary directory, and all of the following were actually observed to
pass, not just type-checked as plausible:

- save → read round-trip returns the exact bytes
- `exists()` correctly reports true/false
- reading a missing key throws `StorageKeyNotFoundError`
- nested directories are created automatically
- `delete()` is idempotent (deleting twice doesn't throw)
- **path-traversal keys are actually rejected** (`../../etc/passwd` style)
- identical file names in different orgs don't collide on disk

`tests/localStorageDriver.test.ts` is the permanent vitest version of
exactly what was run. Worth noting honestly: getting to that point involved
tracking down a real red herring - my first attempt to run it via
`tsx -e "import(...)"` (dynamic import of an absolute path) produced
`[ 'default' ]` instead of the real named exports, which looked like a bug
in the source. It wasn't - `tsx` handles a `.ts` file differently when
it's the actual CLI entry point (`tsx file.ts`) versus dynamically
imported by absolute path from an eval string; the latter loses named
CJS/ESM interop in a way the former doesn't. Running it the normal way
(`tsx some-script.ts` with static imports) resolved cleanly. If you hit
`{ default: [Object] }` from a dynamic `import()` of a `.ts` file during
your own debugging, that's very likely the same tooling quirk, not your
code.

The rest of `document.service.ts` (Prisma-backed metadata, permission
checks, the Express routes) follows the same type-check-only verification
as every other service, since it depends on `@nexora/http` which
transitively needs `zod` - not installed here.

## Business rules enforced

- **Upload and metadata creation are linked**: if the metadata write
  fails after the bytes are already saved, the just-saved file is deleted
  rather than left orphaned on disk.
- **Deletion order is metadata-first, storage-second**: the database row
  is the source of truth for "does this document exist," so it's deleted
  before the underlying bytes - if the storage delete then failed, you'd
  have an orphaned file (recoverable by a cleanup job) rather than a
  metadata row pointing at nothing (a broken reference with no easy fix).
- **File names are sanitized** before being folded into a storage key,
  independently of the storage driver's own path-traversal protection -
  two layers, not reliance on just one.
- **Max upload size is enforced by multer** (`DOCUMENT_MAX_UPLOAD_SIZE_MB`,
  default 25MB) before the handler even runs.

## What's tested

`tests/localStorageDriver.test.ts` - see above; actually executed.

`tests/document.service.test.ts` - upload creating both stored bytes and
a metadata record, file-name sanitization against a path-traversal
attempt, no orphaned file on a simulated metadata-write failure, category/
entity filtering, download returning exact bytes, deletion removing both
metadata and storage, and tenant isolation across get/download/rename/
delete. Type-checked only (via the fake storage/Prisma in `tests/fakes.ts`),
not executed - this one does depend on `@nexora/http`, which needs `zod`.

Run for real:

```bash
pnpm install
pnpm --filter @nexora/document-service prisma:migrate -- --name init
pnpm --filter @nexora/document-service test
pnpm --filter @nexora/document-service typecheck
```
