# Agala — QA Checklist

> Manual testing checklist to validate before pushing changes and releasing a new version.
> Run through the relevant sections after every code change.
> Mark items with `[x]` as you verify them.
> Last updated: 2026-03-18

---

## How to Use

1. **Before every push** — run the [Quick Smoke Test](#quick-smoke-test-before-every-push) (5 min)
2. **Before a release build** — run the [Full Release Checklist](#full-release-checklist) (30 min)
3. **After changing a specific screen** — run only that screen's section
4. **Add new tests** — when you build a new feature, add its test cases to the relevant section

---

## Quick Smoke Test (Before Every Push)

> Run this every time before `git push`. Covers the most critical paths.

### App Launch & Auth
- [ ] App launches without crash
- [ ] Existing session loads — home screen appears with data

### Search & Add Item (🔴 Regression-prone)
- [ ] Type a **new** item name in search → "הוסף [name] לרשימה" button visible
- [ ] Tap "הוסף" → item added to cart (no white screen / crash)
- [ ] Clear search bar (X button) → full list reappears (no blank screen)
- [ ] Type an **existing** item name → item appears in filtered results
- [ ] Add item with no auto-detected category → CategorySheet opens → pick category → item created

### Cart Actions
- [ ] Tap item in cart → checked off, moves to catalog
- [ ] Tap item in catalog → reactivated, moves back to cart

### Recommendations
- [ ] Recommendation line visible (if data exists and toggle is on)
- [ ] Tap "הוסף" on recommendation → added to cart, card animates out
- [ ] Tap "דלג" → card dismissed, next card appears

### Settings
- [ ] Settings screen loads without black screen
- [ ] Toggles (AI recommendations, depletion) persist after app restart

### Navigation
- [ ] Home → Item Detail → Back → no crash
- [ ] Home → History → Home → no crash
- [ ] Home → Settings → Home → no crash

---

## Full Release Checklist

### 1. Authentication

#### Login
- [ ] Valid email + password → app loads home screen
- [ ] Wrong password → red error banner: "אימייל או סיסמה לא נכונים"
- [ ] Non-existent email → error banner
- [ ] Rate-limited login → appropriate Hebrew error message

#### Signup
- [ ] Valid signup (email + password + confirm + display name) → account created
- [ ] Password < 6 chars → "הסיסמה חייבת להכיל לפחות 6 תווים"
- [ ] Mismatched passwords → "הסיסמאות אינן תואמות"
- [ ] Mode toggle (login ↔ signup) → fields clear/appear correctly
- [ ] Placeholder text visible in dark mode

---

### 2. Home Screen — Search & Add

#### Search Bar
- [ ] Type text → live filtering on cart + catalog by name and category
- [ ] Clear (X) button → full list restored
- [ ] Search resets on screen focus (navigate away and back)

#### Add New Item
- [ ] Search for non-existent item → "הוסף [name] לרשימה" button appears
- [ ] Tap add → item created with auto-detected category
- [ ] If no category detected → CategorySheet opens → pick → item created
- [ ] Cancel CategorySheet → nothing added, search state preserved
- [ ] Duplicate name → item not added twice

#### Voice Input
- [ ] Mic icon visible (native build only; hidden in Expo Go)
- [ ] Tap mic → permission prompt (first time) → listening state active
- [ ] Speak Hebrew → text appears in search field
- [ ] Mic button toggles listening on/off

---

### 3. Home Screen — Cart & Catalog

#### Cart Section (עגלה שלי)
- [ ] Section header shows item count badge
- [ ] Collapse/expand toggle (▲/▼) works
- [ ] Sort chips: שם, קטגוריה, שונה לאחרונה — all functional
- [ ] Sort direction toggle (↑/↓) on active chip
- [ ] Check off item → moves to catalog, purchase_history row created
- [ ] Swipe item → SnoozeSheet opens

#### Catalog Section (הקטלוג שלי)
- [ ] Section header shows item count badge
- [ ] Collapse/expand toggle works
- [ ] Sort chips: שם, קטגוריה, שונה לאחרונה, עומד להיגמר
- [ ] Depletion % labels visible (when toggle on): לך תקנה / תכף נגמר / חצי קלאץ' / יש, אל תדאג / יש בשפע / הרגע קנינו
- [ ] Tap catalog item → reactivates to cart
- [ ] Tap product info area → navigates to item detail

#### Sticky Headers
- [ ] Cart header pins while scrolling cart items
- [ ] Catalog header pins while scrolling catalog items
- [ ] Headers have opaque background (no content bleed-through)

#### Empty States
- [ ] No items at all → "🛒 הרשימה ריקה!" message
- [ ] No recommendations → recommendation line hidden

---

### 4. Recommendations Line

- [ ] Visible when `showRecommendations` toggle is on AND candidates exist
- [ ] Hidden during active search
- [ ] Cards show: product name, urgency dot (red/orange/yellow/green), label
- [ ] "הוסף" → adds to cart, animates out, replaced by next candidate
- [ ] "דלג" → dismissed for session, replaced by next candidate
- [ ] Animation: fade + scale over 250ms
- [ ] Checking off an item → removes from recommendations immediately

---

### 5. Item Detail Screen

#### Display
- [ ] Product name, category (emoji + name), quantity displayed
- [ ] Purchase history list (dates + quantities)
- [ ] Buy cycle info: "כל X ימים" + countdown + progress bar

#### Edit
- [ ] Edit product name → saves to DB
- [ ] Edit category via CategorySheet → saves (or clones if global product)
- [ ] Change quantity (+/- buttons) → saves

#### AI / Manual Mode
- [ ] Toggle AI ↔ Manual → predictions recalculate immediately
- [ ] Manual: custom frequency days input → saves
- [ ] AI: shows EMA based on purchase history
- [ ] "איפוס למצב AI" → recalculates from history

#### Delete
- [ ] Tap delete → confirmation dialog
- [ ] Confirm → item removed, navigate back to home
- [ ] Cancel → nothing happens

#### Clone-on-Edit (Global Products)
- [ ] Edit a global product (is_custom=false) → auto-clones as custom
- [ ] Original global product unchanged
- [ ] Shopping list item re-linked to clone

---

### 6. Purchase History Screen

- [ ] All purchases displayed, grouped by date (היום / אתמול / date)
- [ ] Pull-to-refresh works
- [ ] Date filter bar: הכל / היום / שבוע / חודש / תאריך
- [ ] Custom date picker works (native on mobile, HTML input on web)
- [ ] "הוסף שוב" button → re-adds item to cart
- [ ] Empty state → appropriate message

---

### 7. Settings Screen

#### Profile
- [ ] Display name shown, editable → saves to DB
- [ ] Household ID displayed → copy to clipboard works

#### Join Household (משק בית משותף)
- [ ] Paste valid household UUID → tap "צרף" → joins household
- [ ] Invalid UUID format → "קוד משק בית לא תקין"
- [ ] Valid UUID but non-existent → error message shown
- [ ] RLS: verify join actually works from a different account (🔴 known issue)

#### Toggles
- [ ] 🤖 AI מזהה מה חסר (showRecommendations) → hides/shows recommendation line
- [ ] מד מלאי בקטלוג (showDepletion) → hides/shows depletion labels
- [ ] 🤖 AI ממלא את העגלה (autoAddEnabled) → controls nightly auto-add
- [ ] All toggles persist across app restart (AsyncStorage)

#### Import (הוספה מרובה)
- [ ] Tap import icon in search bar → import sheet opens
- [ ] File picker option → select file → items imported
- [ ] Clipboard paste → items imported
- [ ] Manual text input → type items → imported
- [ ] Success feedback: "✅ יובאו X פריטים"
- [ ] Deduplication works

#### Other
- [ ] "דרגו אותנו" → native review sheet or Play Store fallback
- [ ] "בדוק עדכונים" → compares version, shows result
- [ ] "התנתק" → logs out, returns to auth screen

---

### 8. Cross-Cutting Concerns

#### RTL & Hebrew
- [ ] All text right-aligned throughout the app
- [ ] Tab bar labels in Hebrew
- [ ] Sort chips, buttons, inputs all RTL-oriented
- [ ] Swipe gestures work correctly in RTL

#### Dark Mode
- [ ] All screens use `dark.*` theme colors
- [ ] No hardcoded white/light backgrounds
- [ ] Placeholder text visible on dark inputs

#### Performance
- [ ] Scroll performance smooth with 100+ items
- [ ] No lag on sort mode change
- [ ] FlatList uses proper key extraction

#### Realtime Sync
- [ ] Add item on Device A → appears on Device B (same household)
- [ ] Check off item → syncs across devices
- [ ] Pull-to-refresh fetches latest data

#### Error Handling
- [ ] Network offline → items cached, queue flushed on reconnect
- [ ] Supabase errors → user-facing Hebrew error banners
- [ ] No silent failures on critical paths

---

## Known Issues (Watch For Regressions)

| Issue | Since | Status | Test |
|-------|-------|--------|------|
| Search add button missing (recs blocking ListEmpty) | v1.0.10 | Fixed | Search new item → add button visible |
| White screen crash on add (Fabric addViewAt) | v1.0.10 | Fixed | Add item → clear search → no crash |
| Household join fails (RLS blocks SELECT) | v1.0.9 | Open | Join from different account → should succeed |
| Mic doesn't auto-stop | v1.0.9 | Open | Speak → wait → recording should stop automatically |

---

## Adding New Tests

When you build a new feature:

1. Add test cases under the relevant screen section above
2. Add any new known issues to the regression table
3. If the feature touches multiple screens, add tests to each
4. Update the Quick Smoke Test if the feature is critical-path
5. Run the Quick Smoke Test before pushing

---
