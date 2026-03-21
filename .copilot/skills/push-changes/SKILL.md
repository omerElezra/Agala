---
name: push-changes
description: >
  Full push workflow for the Agala app. Use when the user says "push",
  "push changes", "commit and push", "תדחוף", "תעשה פוש", "תשלח", "שלח שינויים",
  "סיים ודחוף", "גמרנו תדחוף", "branch is ready", "ready to push", "do the push".
  Orchestrates: QA check → documentation updates → commit → push.
  MUST be loaded before starting any push/commit workflow.
metadata:
  version: 1.0.0
  author: Omer Elezra
compatibility: Agala workspace only.
---

# Push Changes Skill

Orchestrates the full workflow from code-complete to pushed commit. This skill
combines the `agala-qa-checklist` and `pr-release-summary` skills into a single
end-to-end flow.

## When to Use This Skill

Trigger on ANY of these phrases:

- "push", "push changes", "commit and push", "do the push"
- "ready to push", "branch is ready", "finish and push"
- "תדחוף", "תעשה פוש", "תשלח", "שלח שינויים", "סיים ודחוף", "גמרנו תדחוף"
- After a feature is confirmed working by the user

## Workflow

### Phase 1 — Understand the Changes

```bash
git diff --stat HEAD
git status --short
git log main..HEAD --oneline --no-merges 2>/dev/null || git log --oneline -5
```

Read every modified file listed in `git status` to understand the full scope.

---

### Phase 2 — QA Checklist (load `agala-qa-checklist` skill)

Map changed files to QA sections using the table in `.copilot/skills/agala-qa-checklist/SKILL.md`.

Present the relevant manual test items to the user and **wait for confirmation** that they passed before continuing.

If the user says "looks good", "works", "עובד", "אישור" → proceed to Phase 3.

---

### Phase 3 — Documentation Updates (load `pr-release-summary` skill)

Follow the documentation update workflow in `.copilot/skills/pr-release-summary/SKILL.md`.

For each file in the documentation map, check if this PR's changes affect it:

| File                    | Check                                                     |
| ----------------------- | --------------------------------------------------------- |
| `PROGRESS.md`           | **Always** — add a new step entry                         |
| `NEXT_FEATURES_PLAN.md` | Mark implemented items ✅, update bug statuses            |
| `whatsnew/he-IL`        | Always update with Hebrew user-facing summary             |
| `RELEASE_NOTES_NEXT.md` | Append new user-facing notes                              |
| `QA_CHECKLIST.md`       | Add new tests for new features, update Known Issues table |
| `DATABASE.md`           | Only if schema changed (new tables/columns/policies)      |
| `DATABASE_EXPLAINED.md` | Only if DB design/purpose changed                         |
| `APPLICATION_FLOWS.md`  | Only if data flow or business logic changed               |
| `README.md`             | Only if new user-visible features or new dependencies     |
| `DEVELOPMENT.md`        | Only if setup/commands/conventions changed                |

**Rules:**

- Read each file before editing — never guess existing content
- Match existing style, heading levels, and tone
- Be surgical — only update directly affected sections
- Update "Last updated" dates where present

---

### Phase 4 — Commit Strategy

Group changes into logical commits. Typical splits for this project:

1. **Bug fixes** — one commit per distinct bug fix

   ```
   fix: <short description>

   - Root cause: ...
   - Fix: ...
   ```

2. **Features** — one commit per feature

   ```
   feat: <short description>

   - What: ...
   - How: ...
   ```

3. **Documentation / QA** — one commit for all doc updates

   ```
   docs: update docs, release notes, and QA checklist for v<version>
   ```

4. **DB migrations** — included with the feature commit that requires them

**Commit message format:**

```
<type>: <short imperative description> (<50 chars)

- Bullet detail 1
- Bullet detail 2
- Migration: supabase/migrations/<file>.sql
```

Types: `fix`, `feat`, `docs`, `style`, `refactor`, `chore`

---

### Phase 5 — Execute Git Commands

```bash
# Stage and commit each logical group
git add <files>
git commit -m "<message>"

# Push to current branch
git push origin HEAD
```

After pushing, confirm the branch name and summarize what was pushed.

---

### Phase 6 — Post-Push Summary

Report to the user:

```
✅ Pushed to branch: <branch-name>

Commits pushed:
  <hash> <message>
  <hash> <message>

Documentation updated:
  ✅ PROGRESS.md — Step X
  ✅ whatsnew/he-IL
  ✅ NEXT_FEATURES_PLAN.md
  ⬚ DATABASE.md — no changes
  ...

Next steps:
  - Open/update PR on GitHub if not already open
  - Run the SQL migration in Supabase SQL Editor (if any)
  - Test on device from the pushed build
```

---

## Important Notes

- **Never force-push** (`--force`) without explicit user confirmation
- **Never push directly to `main`** — always push to feature/fix branch
- **Never `--no-verify`** to skip hooks
- If there are merge conflicts, stop and tell the user before doing anything
- SQL migration files are committed to the repo but must be run manually in Supabase
