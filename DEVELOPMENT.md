# Agala — Developer Guide

> Technical documentation for developers contributing to the Agala project.
> For user-facing documentation, see [README.md](README.md).

---

## Tech Stack

| Layer            | Technology                                                                                                   |
| :--------------- | :----------------------------------------------------------------------------------------------------------- |
| **Framework**    | [Expo SDK 54](https://expo.dev) + [React Native 0.81](https://reactnative.dev)                               |
| **Navigation**   | [expo-router v6](https://docs.expo.dev/router/introduction/) (file-based routing)                            |
| **State**        | [Zustand v5](https://zustand-demo.pmnd.rs/)                                                                  |
| **Backend / DB** | [Supabase](https://supabase.com) (PostgreSQL + Auth + Realtime + RLS)                                        |
| **Predictions**  | Supabase Edge Functions (Deno)                                                                               |
| **Language**     | [TypeScript 5.9](https://typescriptlang.org)                                                                 |
| **Build / CI**   | [EAS CLI](https://docs.expo.dev/build/introduction/) + [GitHub Actions](https://github.com/features/actions) |
| **OTA Updates**  | [expo-updates](https://docs.expo.dev/versions/latest/sdk/updates/) (RTL first-launch reload)                 |

---

## Prerequisites

- [Node.js](https://nodejs.org) >= 18
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (`npx expo`)
- A [Supabase](https://supabase.com) project (free tier works)

---

## Getting Started

### 1. Clone & Install

```bash
git clone <your-repo-url> Agala
cd Agala
npm install
```

### 2. Configure Supabase

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Copy `.env.example` to `.env` and fill in your keys:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

3. Run the database migrations in the Supabase SQL Editor:
   - **Quick**: Open `ExternalFiles/supabase/RUN_ALL_ONCE.sql` and paste it into the SQL Editor
   - **Step-by-step**: Run each file individually in order:
     1. `00_init_schema.sql` — tables, RLS policies, indexes, realtime publications
     2. `01_schedule_nightly_prediction.sql` — pg_cron + Edge Function trigger
     3. `02_confidence_triggers.sql` — confidence scoring triggers
     4. `03_auth_trigger.sql` — auto-create user profile on sign-up

### 3. Start Development

```bash
# Start Expo dev server
npx expo start

# Platform-specific
npx expo start --ios     # iOS Simulator
npx expo start --android # Android Emulator
npx expo start --web     # Web browser
```

---

## Available Scripts

| Command             | Description                               |
| :------------------ | :---------------------------------------- |
| `npm start`         | Start Expo dev server                     |
| `npm run ios`       | Start on iOS Simulator                    |
| `npm run android`   | Start on Android Emulator                 |
| `npm run web`       | Start in web browser                      |
| `npm run typecheck` | TypeScript type-checking (`tsc --noEmit`) |

---

## Project Structure

```
Agala/
├── app/                         # Expo Router pages (file-based routing)
│   ├── _layout.tsx              # Root layout — auth guard, RTL forcing, dark theme
│   ├── auth.tsx                 # Login / Sign-up screen (visual mode differentiation, verify password, inline banners)
│   ├── (tabs)/
│   │   ├── _layout.tsx          # Tab navigation — 3 tabs, MaterialCommunityIcons exit icon, safe-area tab bar
│   │   ├── index.tsx            # Shopping list — sort chips, collapsible sections, CategorySheet, counter badges
│   │   ├── two.tsx              # Purchase history — date filtering, grouped by date
│   │   └── settings.tsx         # Settings — profile, household, import (file/clipboard/manual)
│   └── item/
│       └── [id].tsx             # Item detail — AI/manual buy cycle, category, stats, clone-on-edit for global products
├── src/
│   ├── components/
│   │   ├── AddProductSheet.tsx   # Add product modal — search, recent, quantity picker
│   │   ├── CategorySheet.tsx     # Category picker bottom sheet — 16 categories with emoji, used for new product & edit flows
│   │   ├── RecommendationLine.tsx # AI recommendation cards — horizontal scroll, urgency colors, animated dismiss
│   │   ├── ShoppingListItem.tsx  # Shopping list row — swipe, qty controls, animated feedback, purchased alignment spacer
│   │   ├── SnoozeSheet.tsx       # Snooze action sheet
│   │   └── WhatsNewModal.tsx     # In-app changelog modal — shows on version update
│   ├── hooks/
│   │   ├── useAuth.ts           # Auth state — session, profile fetch/create, sign-out, refreshProfile
│   │   └── useSpeechRecognition.ts # Voice input hook — expo-speech-recognition, Hebrew, graceful fallback
│   ├── lib/
│   │   └── supabase.ts          # Supabase client — AsyncStorage, SSR-safe
│   ├── store/
│   │   ├── appSettingsStore.ts   # App settings — Zustand + AsyncStorage (showRecommendations, showDepletion, autoAddEnabled)
│   │   └── shoppingListStore.ts  # Zustand store — optimistic updates, realtime, recommendations, depletion tracking
│   ├── types/
│   │   └── database.ts          # Auto-generated Supabase DB types
│   └── utils/
│       └── categoryDetector.ts   # Hebrew category detection (400+ keywords, 16 categories, CATEGORY_EMOJIS + CATEGORIES exports)
├── constants/
│   ├── theme.ts                 # Dark theme — 30+ semantic color tokens (lavender-blue + teal palette)
│   └── Colors.ts                # Legacy color constants
├── components/
│   ├── useColorScheme.ts        # Forced dark mode override (native)
│   └── useColorScheme.web.ts    # Forced dark mode override (web)
├── ExternalFiles/supabase/      # SQL migrations & Edge Functions
│   ├── 00_init_schema.sql       # Tables, RLS, indexes, realtime
│   ├── 01_schedule_nightly_prediction.sql
│   ├── 02_confidence_triggers.sql
│   ├── 03_auth_trigger.sql
│   ├── RUN_ALL_ONCE.sql         # Combined single-paste migration
│   └── functions/
│       └── nightly-prediction/
│           └── index.ts         # Edge Function: nightly EMA recalculation
├── supabase/migrations/         # Additional migrations
│   └── 20260223_create_purchase_history.sql  # purchase_history table + RLS + backfill
├── .env.example                 # Environment variable template
├── package.json
└── tsconfig.json
```

---

## Database Schema

| Table                       | Purpose                                                         |
| :-------------------------- | :-------------------------------------------------------------- |
| `users`                     | User profiles (id, email, display_name, household_id)           |
| `households`                | Household groups for shared lists                               |
| `products`                  | Product catalog (name, category, is_custom)                     |
| `shopping_list`             | Active list items (status: `active` / `purchased` / `snoozed`)  |
| `purchase_history`          | Immutable transaction log — every purchase event with timestamp |
| `household_inventory_rules` | AI predictions (ema_days, confidence_score, auto_add_status)    |

**Row Level Security (RLS)** is enabled — users can only access data belonging to their household.

### Key Fields — `household_inventory_rules`

| Field               | Type        | Description                                                  |
| :------------------ | :---------- | :----------------------------------------------------------- |
| `ema_days`          | `float`     | Predicted buy cycle in days (EMA-calculated or manually set) |
| `confidence_score`  | `int`       | 0–100 prediction confidence                                  |
| `auto_add_status`   | `enum`      | `auto_add` / `suggest_only` / `manual_only`                  |
| `last_purchased_at` | `timestamp` | Used to compute next buy date                                |

---

## AI Buy-Cycle Algorithm

The app predicts when each product needs to be purchased again:

1. **Purchase intervals** — computed from timestamped purchase history
2. **EMA calculation** — `ema = α × latest_interval + (1 − α) × previous_ema` where α = 0.3
3. **Smart defaults** — when no history exists, uses category-based defaults via `getSmartDefaultDays()`:
   | Category | Default Days |
   |:---------|:------------|
   | לחם ומאפים | 3 |
   | פירות וירקות | 4 |
   | מוצרי חלב | 5 |
   | בשר ועוף | 6 |
   | משקאות | 7 |
   | ביצים | 10 |
   | דגנים ואורז | 18 |
   | מוצרים לתינוקות / מזון קפוא | 14 |
   | מוצרי ניקיון / טיפוח אישי | 30 |
   | שימורים ורטבים | 30 |
   | תבלינים ושמנים | 45 |
4. **Confidence** — starts at 50% with 2 purchases, +10% per additional data point (max 100%)
5. **Next buy date** — `last_purchased_at + ema_days`

EMA implementation is in `app/item/[id].tsx` (inline) and also in `ExternalFiles/supabase/functions/nightly-prediction/index.ts` (server-side nightly batch).

---

## Key Architecture Decisions

### Optimistic Updates

`addItem()` in `shoppingListStore.ts` returns synchronously with a `temp-*` ID. The real DB insert happens in a fire-and-forget async block. The temp ID is replaced with the real DB ID once the insert completes.

### Instant Purchases

`checkOffItem()` immediately moves the item to purchased status and inserts a record into `purchase_history`. No undo delay — users can delete history records directly from the history tab if needed.

### Duplicate Prevention

- **Local check**: `items.some(i => i.product_id === productId && i.status === 'active')`
- **DB check**: async query after local check to catch cross-device duplicates
- **Realtime dedup**: `subscribeRealtime` INSERT handler skips items already in local state

### Web Compatibility

| Problem                                                        | Solution                                           |
| :------------------------------------------------------------- | :------------------------------------------------- |
| `Alert.alert()` is no-op on web                                | Inline banner components + `window.confirm()`      |
| `@react-native-community/datetimepicker` doesn't render on web | Web-specific Modal with HTML `<input type="date">` |
| `Clipboard` API differences                                    | `expo-clipboard` with web fallback                 |

### Fallback Profile Creation

If `03_auth_trigger.sql` wasn't applied, `useAuth.ts` → `fetchOrCreateProfile()` auto-creates a household + user profile on first login.

### RTL-First

The app is RTL-first via `I18nManager.forceRTL(true)` in the root layout. This means React Native's layout engine **automatically** handles RTL:

- `flexDirection: 'row'` renders right-to-left
- `marginStart`/`marginEnd` map to the correct physical sides
- Text naturally aligns to the right

**Important:** Do **NOT** add manual RTL overrides like `textAlign: 'right'` or `flexDirection: 'row-reverse'` — these cause double-reversal (back to LTR appearance). The system handles it.

On first install, `I18nManager.isRTL` may still be `false` until a reload occurs. The app uses `expo-updates` → `Updates.reloadAsync()` to automatically reload once when RTL is not yet active.

### Theme System

All colors come from `constants/theme.ts` → `dark` object. No hardcoded colors in components. The theme has 30+ semantic tokens organized by category (backgrounds, text, borders, accent, interactive, chips, inputs, swipe).

---

## Key Files Reference

| File                                  | Lines  | Description                                                                                                     |
| :------------------------------------ | :----- | :-------------------------------------------------------------------------------------------------------------- |
| `src/store/shoppingListStore.ts`      | ~500   | Core state: items, recommendations, optimistic CRUD, realtime, purchase_history logging                             |
| `app/item/[id].tsx`                   | ~1760  | Item detail: AI/manual buy cycle, EMA calc, category picker, purchase stats, clone-on-edit                      |
| `app/(tabs)/index.tsx`                | ~1170  | Main list: sort chips (name/category/recent), CategorySheet, counter badges, collapsible sections               |
| `app/(tabs)/settings.tsx`             | ~650   | Profile editing (refreshProfile), household management, import (file/clipboard/manual)                          |
| `src/components/AddProductSheet.tsx`  | ~580   | Product search, recent products, autofill recommendations, quantity picker                                      |
| `app/(tabs)/two.tsx`                  | ~567   | Purchase history — compact layout, date filtering, delete transactions                                          |
| `src/utils/categoryDetector.ts`       | ~1000+ | 16 Israeli supermarket categories, 400+ Hebrew keywords, `CATEGORY_EMOJIS` + `CATEGORIES` single-source exports |
| `src/components/CategorySheet.tsx`    | ~170   | Category picker bottom sheet — imports `CATEGORIES` from categoryDetector, current selection highlight          |
| `src/components/ShoppingListItem.tsx` | ~355   | List row: animated check-off/reactivate, swipe, qty controls, purchased alignment spacer                        |
| `constants/theme.ts`                  | ~66    | Lavender-blue + teal palette, all semantic color tokens                                                         |

---

## Deploying the Edge Function

```bash
# Install Supabase CLI
npm install -g supabase

# Deploy the nightly prediction function
supabase functions deploy nightly-prediction --no-verify-jwt

# Set secrets in Dashboard: CRON_SECRET
# Then run 01_schedule_nightly_prediction.sql to enable pg_cron schedule
```

---

## Building for Production

### EAS Build Profiles

| Profile      | Platform | Output | Use                         |
| :----------- | :------- | :----- | :-------------------------- |
| `preview`    | Android  | APK    | Testing on physical devices |
| `production` | Android  | AAB    | Google Play submission      |

### Environment Variables (EAS)

Set via `eas env:create` for both `preview` and `production` environments:

| Variable                        | Visibility |
| :------------------------------ | :--------- |
| `EXPO_PUBLIC_SUPABASE_URL`      | plaintext  |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | sensitive  |

### Build Commands

```bash
# Install EAS CLI
npm install -g eas-cli

# Preview APK (for testing)
eas build --platform android --profile preview

# Production AAB (for Play Store)
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android
```

### Asset Guidelines

| Asset               | Size      | Notes                                                                       |
| :------------------ | :-------- | :-------------------------------------------------------------------------- |
| `icon.png`          | 1024x1024 | App icon (iOS + Android fallback)                                           |
| `adaptive-icon.png` | 1024x1024 | Android adaptive icon foreground — logo at 63% centered on `#0F0F1A` canvas |
| `splash-icon.png`   | 1284x2778 | Splash screen — logo at ~35% of width, centered on `#0F0F1A` canvas         |
| `favicon.png`       | 48x48     | Web favicon                                                                 |

---

## CI/CD Pipeline

The project uses a unified GitHub Actions workflow ([`.github/workflows/cicd.yml`](.github/workflows/cicd.yml)) that handles quality checks, versioning, building, and releasing.

### Workflow Triggers

| Trigger                          | What runs                                        |
| :------------------------------- | :----------------------------------------------- |
| **Pull Request → main**          | Quality checks only (typecheck, expo-doctor)     |
| **Push to main** (merge)         | Quality → Version → EAS Build → GitHub Release   |
| **Manual dispatch** (Actions UI) | Same as push, but you specify the version number |

### Pipeline Flow

```
PR opened/updated
  └─► quality ─► typecheck + expo-doctor
        ✓ done (no build, no release)

Push to main (or manual dispatch)
  ├─► quality ─► typecheck + expo-doctor
  ├─► version ─► auto-increment patch (or use manual input)
  ├─► build ──► update app version → EAS Build (Android preview)
  └─► release ► commit version bump → git tag → GitHub Release
              ► write service account key → EAS Submit to Google Play
              ► send Hebrew HTML email notification
```

### Version Management

The app version is **automatically managed** by CI and stays in sync across all layers:

| Location                    | Example  | Managed by                  |
| :-------------------------- | :------- | :-------------------------- |
| `app.json` → `expo.version` | `1.2.3`  | CI (committed back to main) |
| `package.json` → `version`  | `1.2.3`  | CI (committed back to main) |
| Git tag                     | `v1.2.3` | CI (created on release)     |
| Android `versionCode`       | `14`     | EAS remote auto-increment   |

**Auto-increment (default):** On every push to main, the patch version bumps automatically — `v1.0.0` → `v1.0.1` → `v1.0.2`.

**Manual override:** Use the "Run workflow" button in GitHub Actions to set a specific version like `2.0.0` for major/minor releases.

**No-loop protection:** The version bump commit includes `[skip ci]` in the message to prevent re-triggering the workflow.

### Release Notes

GitHub auto-generates release notes from merged PRs. PRs are categorized by labels in [`.github/release.yml`](.github/release.yml):

| Label                         | Category            |
| :---------------------------- | :------------------ |
| `feature`, `enhancement`      | ✨ New Features     |
| `bug`, `fix`                  | 🐛 Bug Fixes        |
| `ui`, `design`                | 🎨 UI / Design      |
| `ai`, `prediction`            | 🧠 AI / Predictions |
| `chore`, `ci`, `dependencies` | ⚙️ Maintenance      |
| `docs`                        | 📝 Documentation    |

PRs labeled `skip-changelog` and bot commits are excluded.

### Required Secrets

Add these in GitHub → Settings → Secrets → Actions:

| Secret                       | Description                                                                         |
| :--------------------------- | :---------------------------------------------------------------------------------- |
| `EXPO_TOKEN`                 | EAS access token ([expo.dev/accounts/settings](https://expo.dev/accounts/settings)) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Google Play API service account JSON key (for `eas submit`)                         |
| `EMAIL_FROM`                 | Gmail address for release notification emails                                       |
| `EMAIL_PASSWORD`             | Gmail App Password for SMTP authentication                                          |
| `EMAIL_TO`                   | Recipient email for release notifications                                           |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request → CI runs quality checks automatically
6. After review & merge → CI auto-builds, auto-versions, and creates a GitHub Release

**PR labels matter!** Add a label (`feature`, `bug`, `ui`, etc.) so the release notes are organized nicely.

---

## Author

**Omer Elezra** — Creator, Designer & Developer

- GitHub: [@omerElezra](https://github.com/omerElezra)

---

## License

This project is private. All rights reserved. © Omer Elezra
