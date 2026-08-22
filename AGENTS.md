# Agent guide

This repository contains the static Blazor WebAssembly Pokemon Field Guide. Before changing the project, read the [documentation index](docs/README.md) and every linked page that covers the area you will change.

## Finish a change

Treat documentation as part of the implementation. Before you finish each change:

1. Inspect the diff and list every durable behavior, decision, workflow, or project fact that the work added or changed.
2. Compare that list with the relevant pages under `docs/`.
3. Update stale pages in the same change. Add a focused page and link it from the documentation index when no page fits.
4. Remove or rewrite documentation for plans and behavior that the change supersedes.
5. Run `just check-docs` after a Markdown-only change. Run `just check` after changing Razor, C#, JavaScript, CSS, generated JSON, schemas, tooling, or deployment configuration. `just check` includes the documentation checks.

When investigation establishes a durable project fact, record it in the relevant documentation during the same task. Documentation review is complete only when every item from step 1 is either documented or confirmed to be internal and temporary.

## Make discrete commits

Do not create commits on `main`. Before the first commit for a task, create or switch to a dedicated feature branch and verify that it is checked out. Pushing directly to `main` is prohibited.

Before creating commits, split the work into coherent, independently revertible changes. Keep the code, tests, generated artifacts, and documentation needed for one change together. Put unrelated behavior, refactoring, data, styling, tooling, or deployment work in separate commits.

Format every subject as `<type>(<scope>): <imperative summary>`. Use one of these types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, or `revert`. Use a lowercase, repository-specific scope such as `frlg`, `state`, `packages`, or `tooling`. Keep the subject at 72 characters or fewer.

Before each commit:

1. Verify that the current branch is a dedicated feature branch, not `main`.
2. Review `git diff --stat` and `git status --short` to identify separate concerns.
3. Stage only one coherent change.
4. Review `git diff --cached` and confirm that its code, tests, generated artifacts, and documentation all belong to that change.
5. Write the subject in the required format.

When reviewing work, treat a mixed-purpose commit, a malformed subject, or stale documentation as a finding that must be fixed before the work is complete.

## Scope and safety

- Follow the [architecture](docs/architecture.md), [game-package](docs/adding-a-game.md), [development](docs/development.md), and [deployment](docs/deployment.md) guidance.
- Do not add or request a ROM.
- Preserve user progress and stable checklist identifiers unless the task includes an explicit migration.
- Follow the mandatory versioning and migration procedure in [checklist backups](docs/save-backups.md). Any serialized-contract or checklist-identifier change must increment the appropriate envelope or per-game profile version and include a tested forward migration. Keep released format interpretations fixed unless the user approves a correction. Document an approved correction, preserve unrelated data, and test representative files from that released format.
- Preserve unrelated user changes in a dirty worktree.
