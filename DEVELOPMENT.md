# Agala — Developer Guide

> Technical documentation for developers contributing to the Agala project.
> For user-facing documentation, see [README.md](README.md).

---

## Tech Stack

| Layer | Technology |
|:------|:-----------|
| **Framework** | [Expo SDK 54](https://expo.dev) + [React Native 0.81](https://reactnative.dev) |
| **Navigation** | [expo-router v6](https://docs.expo.dev/router/introduction/) (file-based routing) |
| **State** | [Zustand v5](https://zustand-demo.pmnd.rs/) |
| **Backend / DB** | [Supabase](https://supabase.com) (PostgreSQL + Auth + Realtime + RLS) |
| **Predictions** | Supabase Edge Functions (Deno) |
| **Language** | [TypeScript 5.9](https://typescriptlang.org) |
| **Error Tracking** | *(planned)* |

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

| Command | Description |
|:--------|:-----------|
| `npm start` | Start Expo dev server |
| `npm run ios` | Start on iOS Simulator |
| `npm run android` | Start on Android Emulator |
| `npm run web` | Start in web browser |

---

## Project Structure

```
Agala/
├── app/                         # Expo Router pages (file-based routing)
│   ├── _layout.tsx              # Root layout — auth guard, RTL forcing, dark theme
│   ├── auth.tsx                 # Login / Sign-up screen (inline banners, web-safe)
│   ├── (tabs)/
│   │   ├── _layout.tsx          # Tab navigation — 3 tabs with FontAwesome icons
│   │   ├── index.tsx            # Shopping list — sort modes, collapsible sections, FAB
│   │   ├── two.tsx              # Purchase history — date filtering, grouped by date
│   │   └── settings.tsx         # Settings — profile, household, CSV import
│   └── item/
│       └── [id].tsx             # Item detail — AI/manual buy cycle, category, stats
├── src/
│   ├── components/
│   │   ├── AddProductSheet.tsx   # Add product modal — search, recent, quantity picker
│   │   ├── ShoppingListItem.tsx  # Shopping list row — swipe, qty controls, animated feedback
│   │   ├── SnoozeSheet.tsx       # Snooze action sheet
│   │   └── SuggestionChips.tsx   # AI suggestion chips
│   ├── hooks/
│   │   └── useAuth.ts           # Auth state — session, profile fetch/create, sign-out
│   ├── lib/
│   │   └── supabase.ts          # Supabase client — AsyncStorage, SSR-safe
│   ├── store/
│   │   └── shoppingListStore.ts  # Zustand store — optimistic updates, realtime, offline queue
│   ├── types/
│   │   └── database.ts          # Auto-generated Supabase DB types
│   └── utils/
│       └── categoryDetector.ts   # Hebrew category detection (400+ keywords, 16 Israeli supermarket categories)
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

| Table | Purpose |
|:------|:--------|
| `users` | User profiles (id, email, display_name, household_id) |
| `households` | Household groups for shared lists |
| `products` | Product catalog (name, category, is_custom) |
| `shopping_list` | Active list items (status: `active` / `purchased` / `snoozed`) |
| `purchase_history` | Immutable transaction log — every purchase event with timestamp |
| `household_inventory_rules` | AI predictions (ema_days, confidence_score, auto_add_status) |

**Row Level Security (RLS)** is enabled — users can only access data belonging to their household.

### Key Fields — `household_inventory_rules`

| Field | Type | Description |
|:------|:-----|:-----------|
| `ema_days` | `float` | Predicted buy cycle in days (EMA-calculated or manually set) |
| `confidence_score` | `int` | 0–100 prediction confidence |
| `auto_add_status` | `enum` | `auto_add` / `suggest_only` / `manual_only` |
| `last_purchased_at` | `timestamp` | Used to compute next buy date |

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
| Problem | Solution |
|:--------|:---------|
| `Alert.alert()` is no-op on web | Inline banner components + `window.confirm()` |
| `@react-native-community/datetimepicker` doesn't render on web | Web-specific Modal with HTML `<input type="date">` |
| `Clipboard` API differences | `expo-clipboard` with web fallback |

### Fallback Profile Creation
If `03_auth_trigger.sql` wasn't applied, `useAuth.ts` → `fetchOrCreateProfile()` auto-creates a household + user profile on first login.

### RTL-First
All styling uses logical properties:
- `marginStart` / `marginEnd` instead of `marginLeft` / `marginRight`
- `paddingStart` / `paddingEnd` instead of `paddingLeft` / `paddingRight`
- `textAlign: 'right'` on all Hebrew text
- `I18nManager.forceRTL(true)` in root layout

### Theme System
All colors come from `constants/theme.ts` → `dark` object. No hardcoded colors in components. The theme has 30+ semantic tokens organized by category (backgrounds, text, borders, accent, interactive, chips, inputs, swipe).

---

## Key Files Reference

| File | Lines | Description |
|:-----|:------|:-----------|
| `src/store/shoppingListStore.ts` | ~500 | Core state: items, suggestions, optimistic CRUD, realtime, purchase_history logging |
| `app/item/[id].tsx` | ~1257 | Item detail: AI/manual buy cycle, EMA calc, category picker, purchase stats, delete |
| `app/(tabs)/settings.tsx` | ~603 | Profile editing, household management, CSV import/parse |
| `src/components/AddProductSheet.tsx` | ~580 | Product search, recent products, autofill recommendations, quantity picker |
| `app/(tabs)/two.tsx` | ~565 | Purchase history transaction log with date filtering + delete |
| `app/(tabs)/index.tsx` | ~495 | Main list: sort modes, collapsible purchased, suggestions, FAB |
| `src/utils/categoryDetector.ts` | ~400 | 16 Israeli supermarket categories, 400+ Hebrew keywords |
| `src/components/ShoppingListItem.tsx` | ~355 | List row: animated check-off/reactivate flash, swipe gestures |
| `constants/theme.ts` | ~66 | Lavender-blue + teal palette, all semantic color tokens |

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

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure
eas build:configure

# Build
eas build --platform ios --profile preview
eas build --platform android --profile preview

# Submit
eas submit --platform ios
eas submit --platform android
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## Author

**Omer Elezra** — Creator, Designer & Developer

- GitHub: [@omerElezra](https://github.com/omerElezra)

---

## License

This project is private. All rights reserved. © Omer Elezra
