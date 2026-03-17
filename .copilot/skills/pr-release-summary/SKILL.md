---
name: pr-release-summary
description: 'Generate technical and user-facing Hebrew summaries for Pull Requests before merging to main, and update all project documentation. Use when asked to "summarize PR", "prepare release notes", "summarize before push", "what changed", "create PR summary", "write release notes", "update docs", "עדכן תיעוד", or when the user is about to merge or push to main. Produces structured output for GitHub PR, Google Play, and in-app What''s New popup, and updates all relevant MD files.'
metadata:
  version: 1.1.0
  author: Omer Elezra
  language: he
compatibility: Requires access to the Agala workspace. Works with GitHub Copilot in VS Code.
---

# PR Release Summary

Generate two structured summaries for every Pull Request before merging to main, and update all project documentation:

1. **Technical Summary** — for developers (English)
2. **User Summary** — for end-users shown in Google Play and in-app popup (Hebrew)
3. **Documentation Update** — keep all MD files in sync with changes

## When to Use This Skill

- User is about to push/merge a PR to `main`
- User asks to "summarize what changed", "prepare release notes", "write PR description"
- User says "סכם את השינויים" or "תכין סיכום" (Hebrew triggers)
- Before any merge to `main`, proactively offer to generate summaries
- After completing a set of code changes, before commit/push

## Workflow

### Step 1: Gather Changes

Analyze ALL changes in the current branch compared to `main`:

```bash
git diff main --stat
git log main..HEAD --oneline --no-merges
```

Read every changed file to understand the full scope of modifications.

### Step 2: Generate Technical Summary

Write a structured technical summary with these sections:

```markdown
## Technical Summary

### What Changed

- Brief list of all modified files and why

### Architecture Impact

- Any changes to data flow, state management, database schema, or API

### Key Implementation Details

- Important technical decisions, algorithms, or patterns used

### Testing Notes

- What was tested, how to verify, edge cases to watch
```

**Rules:**

- Be specific — reference file paths, function names, component names
- Note any breaking changes or migration steps
- Mention dependencies added or removed
- Keep it factual, no marketing language

### Step 3: Generate User Summary (Hebrew)

Write a user-facing summary in Hebrew for the app's end-users. This text will appear in:

- Google Play "What's New" (`whatsnew/he-IL`, max 500 chars)
- In-app "מה חדש" popup (`WhatsNewModal`)
- GitHub Release body
- Release notification email

**Format:**

```
🛒 עגלה [version] — מה חדש?

[category emoji + name]
• [user-visible change in simple Hebrew]
• [another change]

[another category]
• [change]
```

**Category mapping** (use the relevant ones):
| Prefix | Hebrew Category |
|--------|----------------|
| feat | ✨ תכונות חדשות |
| fix | 🐛 תיקוני באגים |
| ui | 🎨 עיצוב וממשק |
| ai | 🧠 חיזוי חכם |
| perf | ⚡ שיפורי ביצועים |

**Rules:**

- Write from the user's perspective — "הוספנו", "שיפרנו", "תיקנו"
- No technical jargon — no "Zustand", "Supabase", "EMA", "SQL"
- Explain the benefit, not the implementation
- Max 500 characters total (Google Play limit)
- Every bullet should answer "מה זה נותן למשתמש?"

**Example — Technical change vs User summary:**
| Technical | User (Hebrew) |
|-----------|---------------|
| Added `Math.max(rule.last_purchased_at, item.purchased_at)` in fetchRecommendations | תיקנו את הנקודות הצבעוניות — עכשיו מתעדכנות מיד אחרי רכישה |
| Implemented `WhatsNewModal` with GitHub API fetch | הוספנו חלון "מה חדש" שמופיע אחרי עדכון גרסה |
| Changed `activeProductIds` filter from exclusion to inclusion | ההמלצות עכשיו מדויקות יותר ולא מציגות מוצרים שכבר בעגלה |

### Step 4: Write to Files

1. **Update `RELEASE_NOTES_NEXT.md`** with the user summary (append, don't overwrite — multiple PRs may contribute to one release)
2. **Update `whatsnew/he-IL`** with the latest full user summary (overwrite — always reflects the upcoming release)
3. **Provide the technical summary** for the PR description on GitHub

### Step 5: Update Project Documentation

Review every documentation file and update the sections affected by this PR's changes. **Only modify sections that are directly impacted** — do not rewrite unrelated parts.

#### Documentation File Map

| File                    | Purpose                                                                                    | When to Update                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `README.md`             | Public-facing overview: feature list, screenshots section, tech stack, getting started     | New user-visible features, new dependencies, setup changes                                                                  |
| `PROGRESS.md`           | Build & test progress log with numbered steps                                              | **Always** — add a new sub-step under the current step number documenting what was changed. Update the "Last updated" date. |
| `APPLICATION_FLOWS.md`  | Complete reference for all data flows, business rules, DB operations, UI state transitions | Changes to any flow logic, new flows added, state management changes, new components in a flow                              |
| `DATABASE_EXPLAINED.md` | Why the DB is designed this way — data flows, table purposes, how they work together       | New tables, new columns, changed relationships, new DB operations in flows                                                  |
| `DATABASE.md`           | Database schema reference — tables, columns, types, RLS policies                           | Schema changes: new tables, new columns, altered types, new policies, new indexes                                           |
| `NEXT_FEATURES_PLAN.md` | Product roadmap and upcoming features                                                      | Mark implemented features as done (✅), add new planned features from discussions, update "Revisit & Improve" section       |
| `DEVELOPMENT.md`        | Developer guide — setup, architecture, conventions, commands                               | New setup steps, new scripts, changed build/test commands, new conventions                                                  |
| `PRIVACY_POLICY.md`     | User privacy policy                                                                        | New data collection, new permissions, new third-party services                                                              |

#### Update Rules

1. **Read each file first** — understand the existing structure before editing
2. **Match the existing style** — keep the same heading levels, formatting, and tone
3. **Be surgical** — only modify sections directly affected; don't restructure
4. **Update dates** — change the "Last updated" field where present
5. **PROGRESS.md is mandatory** — every PR adds an entry here. Use the next sub-step number (e.g., if the last entry is Step 15, add Step 16; if the last is 5s, add 5t)
6. **Cross-reference** — if a change affects multiple docs, ensure they're consistent with each other
7. **ExternalFiles/** — these are design documents from planning phase. Only update if the PR fundamentally changes architecture, prediction logic, or database schema described there

#### ExternalFiles (update only when fundamentally relevant)

| File                                                | Update When                                   |
| --------------------------------------------------- | --------------------------------------------- |
| `ExternalFiles/00_Product_Requirements_Document.md` | New major feature that changes product scope  |
| `ExternalFiles/01_TechStack_Architecture.md`        | New dependency, architecture layer change     |
| `ExternalFiles/02_Database_Schema.md`               | Schema changes (new tables, columns)          |
| `ExternalFiles/03_Prediction_Logic.md`              | Changes to EMA, confidence, prediction engine |
| `ExternalFiles/04_UX_and_DataFlow.md`               | New screens, new data flow paths              |
| `ExternalFiles/05_Localization_and_RTL.md`          | New localization, RTL behavior changes        |
| `ExternalFiles/06_Nightly_Prediction.md`            | Changes to the nightly edge function          |
| `ExternalFiles/GooglePlay_Store_Listing.md`         | Changes to store listing text or screenshots  |

### Step 6: Present to User

Show both summaries and documentation updates clearly separated:

```
━━━ סיכום טכני (Technical) ━━━
[technical summary]

━━━ סיכום למשתמש (User-facing · Hebrew) ━━━
[Hebrew user summary]

━━━ תיעוד שעודכן (Documentation) ━━━
✅ PROGRESS.md — added Step X: [brief description]
✅ APPLICATION_FLOWS.md — updated [section name]
✅ README.md — added [feature] to feature list
⬚ DATABASE.md — no changes needed
⬚ DEVELOPMENT.md — no changes needed
[... list all docs, mark ✅ if updated, ⬚ if no change needed]

━━━ פעולות ━━━
✅ Updated RELEASE_NOTES_NEXT.md
✅ Updated whatsnew/he-IL
📋 Copy the technical summary to your PR description
```

## Important Conventions

### Commit Message Format

This project uses conventional commits. When generating summaries, map these prefixes:

- `feat:` → new feature
- `fix:` → bug fix
- `ui:` → UI/design change
- `ai:` → prediction/recommendation logic
- `perf:` → performance improvement
- `refactor:` → code improvement (skip in user summary)
- `chore:` → maintenance (skip in user summary)
- `docs:` → documentation (skip in user summary)

### File Locations

- User summary: `RELEASE_NOTES_NEXT.md` (accumulated) and `whatsnew/he-IL` (latest)
- Technical context: PR description on GitHub
- Release notes generator: `scripts/generate-release-notes.js` (CI fallback — reads git log if `RELEASE_NOTES_NEXT.md` is empty)

### Quality Checklist

Before finalizing summaries:

- [ ] Every user-visible change has a Hebrew bullet point
- [ ] No technical jargon in the user summary
- [ ] Hebrew user summary is ≤ 500 characters
- [ ] Technical summary references specific files/functions
- [ ] Breaking changes are clearly marked (if any)
- [ ] `PROGRESS.md` has a new entry for this PR
- [ ] All affected documentation files are updated
- [ ] "Last updated" dates are current where applicable
- [ ] Cross-references between docs are consistent

## References

- Release notes generator: `scripts/generate-release-notes.js`
- WhatsNew modal: `src/components/WhatsNewModal.tsx`
- CI pipeline: `.github/workflows/cicd.yml`
- Release categories: `.github/release.yml`
- Project docs: `README.md`, `PROGRESS.md`, `APPLICATION_FLOWS.md`, `DATABASE_EXPLAINED.md`, `DATABASE.md`, `NEXT_FEATURES_PLAN.md`, `DEVELOPMENT.md`, `PRIVACY_POLICY.md`
- External design docs: `ExternalFiles/*.md`
