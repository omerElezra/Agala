---
name: agala-qa-checklist
description: >
  Pre-push and pre-release QA validation for the Agala grocery app. Use when
  asked to "test before push", "validate changes", "run QA checklist",
  "בדוק לפני פוש", "תריץ צ'קליסט", "check before release", "pre-push validation",
  or when validating specific changed files. Also used as Phase 2 of the
  push-changes skill. Do NOT use alone for "push changes" — use push-changes skill.
metadata:
  version: 1.1.0
  author: Copilot
compatibility: Agala workspace only. Requires QA_CHECKLIST.md in the project root.
---

# Agala QA Checklist Skill

Validates code changes against the project QA checklist before pushing or releasing.

## When to Use This Skill

- Before pushing code changes (`git push`)
- Before creating a release build
- When the user asks to "validate", "test", or "check" their changes
- After fixing a bug, to verify no regressions
- When reviewing a PR

## Workflow

### Step 1: Identify Changed Files

Run `git diff --name-only HEAD` (or `git diff --name-only main..HEAD` for branch comparison) to determine which files were modified.

### Step 2: Map Changes to QA Sections

Use this mapping to determine which checklist sections are relevant:

| Changed File(s)                         | QA Sections to Run                                                  |
| --------------------------------------- | ------------------------------------------------------------------- |
| `app/auth.tsx`                          | §1 Authentication                                                   |
| `app/(tabs)/index.tsx`                  | §2 Search & Add, §3 Cart & Catalog, §4 Recommendations, Quick Smoke |
| `src/components/SearchBar.tsx`          | §2 Search & Add                                                     |
| `src/components/AddProductSheet.tsx`    | §2 Search & Add                                                     |
| `src/components/ShoppingListItem.tsx`   | §3 Cart & Catalog                                                   |
| `src/components/RecommendationLine.tsx` | §4 Recommendations                                                  |
| `src/components/CategorySheet.tsx`      | §2 Search & Add (category flow)                                     |
| `src/components/SnoozeSheet.tsx`        | §3 Cart Actions (swipe/snooze)                                      |
| `app/item/[id].tsx`                     | §5 Item Detail                                                      |
| `app/(tabs)/two.tsx`                    | §6 Purchase History                                                 |
| `app/(tabs)/settings.tsx`               | §7 Settings                                                         |
| `src/store/shoppingListStore.ts`        | §2 Search & Add, §3 Cart & Catalog, §4 Recommendations, Quick Smoke |
| `src/store/appSettingsStore.ts`         | §7 Settings (toggles)                                               |
| `src/hooks/useSpeechRecognition.ts`     | §2 Voice Input                                                      |
| `src/utils/categoryDetector.ts`         | §2 Add New Item (category detection)                                |
| `constants/theme.ts`                    | §8 Dark Mode                                                        |
| `app/_layout.tsx`                       | §8 RTL, Navigation                                                  |
| `app/(tabs)/_layout.tsx`                | §8 Navigation, Tab bar                                              |

If **multiple sections** are affected, run all of them.

If the change is broadly impactful (store, layout, theme), **always include the Quick Smoke Test**.

### Step 3: Read the Checklist

Read `QA_CHECKLIST.md` from the project root. Extract the relevant sections identified in Step 2.

### Step 4: Present the Checklist

Show the user the relevant test items they should validate manually on their device. Format as a numbered action list they can work through.

### Step 5: Check for New Test Gaps

After the user confirms their changes work, check if the new feature/fix needs **new test items** added to `QA_CHECKLIST.md`:

1. Does the change introduce a new user-visible feature? → Add tests for it.
2. Does the change fix a bug? → Add a regression test to the "Known Issues" table.
3. Does the change modify an existing flow? → Verify existing tests still cover it; update if needed.

If new tests are needed, **add them to QA_CHECKLIST.md** in the appropriate section.

### Step 6: Update Known Issues Table

If the change fixes a known issue from the table, update its status from "Open" to "Fixed" with the version number.

## Quick Reference: Critical Regression Tests

These must ALWAYS pass before any push:

1. **Search + Add new item** → button visible, no crash
2. **Clear search** → full list appears, no blank screen
3. **Check off item** → moves to catalog
4. **Recommendations** → show/hide based on toggle
5. **Settings** → screen loads, toggles work
6. **Navigation** → all screen transitions work without crash

## Adding Tests for New Features

When a new feature is developed, the developer (or Copilot) should:

1. Identify all user-facing actions the feature introduces
2. Add checkbox items (`- [ ]`) under the correct screen section in `QA_CHECKLIST.md`
3. If the feature is critical-path, add it to the Quick Smoke Test section
4. If there are known edge cases or device-specific issues, add to the Known Issues table
