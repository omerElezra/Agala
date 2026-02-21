# UX & Data Flow Document: Smart Grocery List App

## 1. Overview
This document strictly defines the User Experience (UX), UI layout, and client-side data flow. The primary design principle is "Zero Friction": checking off items must be instantaneous, and interacting with AI suggestions must not interrupt the physical shopping experience.

## 2. Main Screens & UI Layout

### 2.1 The Main Dashboard (Active List)
This is a single-screen app layout. The dashboard is divided into three distinct vertical sections:
1. **Suggestions/Discovery (Top):** Items with a `confidence_score` between 50-84. 
   * *UI element:* Horizontal scrolling chips or a compact list. 
   * *Action:* One-tap "+" to move it to the Active List (Boosts AI confidence).
2. **Active List - Auto-Added (Middle):** Items the AI added (Score >= 85).
   * *UI element:* Standard list items with a visual indicator (e.g., "✨ Auto-Added").
3. **Active List - Manually Added (Bottom):** Items the user typed in manually.

### 2.2 The "Check-Off" Interaction (The 'V')
* **Action:** Tapping the 'V' checkbox next to an item.
* **Immediate UX (Optimistic Update):** Use `Zustand` to immediately strike through the text and move the item to a temporary "Purchased (Undo)" section at the very bottom of the screen.
* **Debounce & Server Sync:** Wait 5 seconds. If the user does not tap "Undo", fire the `UPDATE` mutation to Supabase to change the status to `purchased` and set `purchased_at = NOW()`.
* **Realtime Sync:** Once the database confirms the update, Supabase Realtime pushes the state to all other household devices to remove the item from their active views.

### 2.3 The "Snooze / Skip" Interaction
* **Action:** Swiping left on an Auto-Added item or a Suggestion.
* **UI Prompt:** A native bottom sheet opens immediately asking: "When do you need this?"
* **Options:**
   * `In 1 Week` (Sets `snooze_until` = +7 days)
   * `In 2 Weeks` (Sets `snooze_until` = +14 days)
   * `Remove / Not Needed` (Triggers AI confidence penalty, removes item)
* **UX Rule:** Snoozed items disappear entirely from the main view until their `snooze_until` date passes.

## 3. Client-Side State Management (Zustand)
Do not fetch from Supabase on every render.
1. On app load, fetch the active list and load it into the Zustand store.
2. Subscribe to Supabase Realtime channel for the user's `household_id`.
3. When a WebSocket message arrives (e.g., partner checked off milk), update the Zustand store directly. The React Native UI will reactively re-render.

## 4. Edge Cases & Error Handling
* **Offline Mode:** If the user loses connection in the supermarket, Zustand must queue the 'V' actions locally. When network is restored, push the queued `purchased_at` timestamps to Supabase in a batch.
* **Multiplayer Conflict:** If User A and User B both tap 'V' on the same item within milliseconds, the backend `shopping_list` table must handle it gracefully (first write wins, second write is ignored as the status is already 'purchased').