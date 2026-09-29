# project-service

Owns projects, project membership, tasks, task comments, and task activity
history. `ownerId`/`assigneeId`/`creatorId`/`authorId`/`actorId` are all
opaque references to auth-service's `userId` (same convention as
hr-service - see its README for the reasoning).

## Endpoints

All require a Bearer access token.

| Method   | Path                            | Permission                                                                                |
| -------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| POST     | `/projects`                     | `project.create`                                                                          |
| GET      | `/projects`                     | `project.read` - paginated, filterable by status, free-text search                        |
| GET      | `/projects/:id`                 | `project.read` - includes live-computed `progress`                                        |
| PATCH    | `/projects/:id`                 | `project.update`                                                                          |
| DELETE   | `/projects/:id`                 | `project.delete` - **archives** (sets status `ARCHIVED`), never a hard delete             |
| GET/POST | `/projects/:id/members`         | GET: `project.read`. POST: `project.update`                                               |
| DELETE   | `/projects/:id/members/:userId` | `project.update` - refuses to remove the owner                                            |
| POST     | `/tasks`                        | `task.create`                                                                             |
| GET      | `/tasks`                        | `task.read` - filterable by project/assignee/status/priority, sortable                    |
| GET      | `/tasks/:id`                    | `task.read`                                                                               |
| PATCH    | `/tasks/:id`                    | `task.update`                                                                             |
| PATCH    | `/tasks/:id/assign`             | `task.assign` - separate from general update per the spec's explicit "assign task" action |
| POST     | `/tasks/:id/complete`           | `task.update` - separate endpoint per the spec's explicit "complete task" action          |
| GET/POST | `/tasks/:id/comments`           | `task.read`                                                                               |
| GET      | `/tasks/:id/activity`           | `task.read`                                                                               |

## Business rules enforced

- **A project's owner is automatically a project member** at creation -
  they need to be assignable to their own project's tasks without an
  extra step, and can't be removed as a member later.
- **Tasks can only be assigned to a project member.** This is what makes
  "project members" a real gate rather than a list nobody checks -
  assignment (at task creation, via `/assign`, or reassignment) always
  validates membership first.
- **Progress is computed live from task data**, never stored: `percentComplete
= completedTasks / totalTasks`, with `CANCELLED` tasks excluded from
  both the numerator and denominator (they don't represent real remaining
  work).
- **A task can't be completed twice**, and a **cancelled task can't be
  completed** - both rejected with a clear `ConflictError` rather than
  silently succeeding.
- **Every meaningful task action writes an activity entry**: creation,
  assignment/unassignment, status changes, field updates, and comments -
  all queryable via `/tasks/:id/activity`.
- **Delete is archive, not deletion** - same pattern as user-service's
  employee deactivation: history (comments, activity, completed tasks)
  must stay intact.

## Events (Phase 10)

Task creation-with-assignee and reassignment publish `TASK_ASSIGNED`
(unassignment does not); completion publishes `TASK_COMPLETED` -
published even though notification-service currently drops it (its
payload has no clear recipient field, see
`notification-service/README.md`). Publishing isn't conditional on
whether today's only consumer acts on it - other future consumers
(analytics, audit) may still want it on the bus.

## What's tested

`tests/project.service.test.ts`: auto-membership on creation, progress
computation (including the CANCELLED-exclusion rule), duplicate-member
rejection, owner-removal rejection, and tenant isolation across
get/update/archive/members/list.

`tests/task.service.test.ts`: activity logging on creation, assignment
gated on project membership (both the rejection and the success cases via
owner-as-auto-member and an explicitly added member), cross-org project
rejection, reassignment and unassignment, the completion state machine
(already-completed and cancelled-task rejections), progress reflecting a
real completion, comment activity logging, and tenant isolation across
get/update/assign/complete/comment.

Same verification caveat as every other service: written and type-checked
against the real `@nexora/*` packages (loose stubs for external npm
packages not installed in this sandbox), never actually executed here.

Run for real:

```bash
pnpm install
pnpm --filter @nexora/project-service prisma:migrate -- --name init
pnpm --filter @nexora/project-service test
pnpm --filter @nexora/project-service typecheck
```
