# Architecture & Tech Stack Document: Smart Grocery List App

## 1. Overview
This document defines the strict technology stack and architectural guidelines for the AI-powered grocery list application. The architecture prioritizes a Serverless backend, zero-maintenance infrastructure, and a cross-platform mobile frontend.

## 2. Frontend (Client-Side)
* **Framework:** React Native.
* **Environment/Build:** Expo (Managed Workflow). 
* **Language:** TypeScript (Strict mode enabled).
* **State Management:** `Zustand`. Used strictly for local UI state and optimistic UI updates (e.g., ticking off an item instantly before the server confirms).
* **Routing:** Expo Router (File-based routing).
* **Styling:** React Native StyleSheet or NativeWind (Tailwind for RN). Do not use heavy UI component libraries that bloat the bundle.

## 3. Backend & Database (BaaS)
* **Platform:** Supabase.
* **Database:** PostgreSQL.
* **Authentication:** Supabase Auth (Email/Password or OTP).
* **Realtime Sync:** Supabase Realtime (WebSockets) MUST be used to sync the `Shopping_Events` and active list across all clients subscribed to the same `household_id`.

## 4. Compute & AI Logic (Serverless)
* **Engine:** Supabase Edge Functions (Deno/TypeScript).
* **Execution:** Do not run historical data processing or prediction algorithms on the client device. 
* **Scheduling:** Use `pg_cron` within Supabase PostgreSQL to trigger a nightly Edge Function. This function will run the Exponential Moving Average (EMA) calculations for product consumption and update the "Suggestions/Discovery" table for each household.

## 5. Deployment & CI/CD
* **Build System:** EAS (Expo Application Services).
* **OTA Updates:** Expo Updates configured for deploying over-the-air JavaScript patches without App Store/Play Store reviews.
* **Version Control:** GitHub.
* **Pipeline:** GitHub Actions configured to run type-checks and trigger EAS builds on `main` branch merges.

## 6. Observability
* **Crash Reporting:** Sentry (`@sentry/react-native`).

## 7. Strict Architectural Rules for the AI Agent
1. **Security:** Row Level Security (RLS) MUST be enabled on all Supabase tables. Users can only read/write data where the `household_id` matches their authenticated session.
2. **No Custom Servers:** Do not implement Express.js, NestJS, or any persistent Node.js servers. All backend logic must reside in Edge Functions or Database Triggers.
3. **Resilience:** The app must handle brief offline periods gracefully. Ticking off an item should register locally via Zustand immediately, and sync to Supabase once the network is available.