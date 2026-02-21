# Database Schema Document: Smart Grocery List App

## 1. Overview
This document defines the exact PostgreSQL database schema for Supabase. The architecture relies on Row Level Security (RLS) tied to a `household_id` to ensure real-time syncing between users in the same household.

## 2. Core Tables

### Table: `households`
* `id` (uuid, primary key)
* `created_at` (timestamp)

### Table: `users`
* `id` (uuid, primary key, references auth.users)
* `household_id` (uuid, references households.id)
* `email` (text)
* `display_name` (text)

### Table: `products` (Medium-Resolution Catalog)
* `id` (uuid, primary key)
* `name` (text) - e.g., "Yellow Cheese 200g", "Milk 3%"
* `category` (text)
* `is_custom` (boolean, default false) - True if added manually by a user and not part of the global app catalog.
* `created_by_household` (uuid, nullable, references households.id)

### Table: `shopping_list` (The Active & Historical Log)
* `id` (uuid, primary key)
* `household_id` (uuid, references households.id)
* `product_id` (uuid, references products.id)
* `quantity` (integer, default 1)
* `status` (text) - Enum: ['active', 'purchased', 'snoozed']
* `added_at` (timestamp)
* `purchased_at` (timestamp, nullable) - Set when the user ticks the 'V' (Checkout action).
* `snooze_until` (timestamp, nullable) - Set when the user skips/snoozes an AI suggestion to handle bulk purchases or sales.

### Table: `household_inventory_rules` (The AI Prediction State)
* `id` (uuid, primary key)
* `household_id` (uuid, references households.id)
* `product_id` (uuid, references products.id)
* `ema_days` (numeric) - The calculated Exponential Moving Average of days between purchases.
* `confidence_score` (numeric, 0-100) - Drops if user snoozes or deletes an auto-added item.
* `last_purchased_at` (timestamp) - The baseline timestamp for the next prediction.
* `auto_add_status` (text) - Enum: ['auto_add', 'suggest_only', 'manual_only']

## 3. Row Level Security (RLS) Policies
* **Crucial AI Instruction:** The coding agent MUST generate SQL migrations to enable RLS on ALL tables.
* **Logic:** A user can only `SELECT`, `INSERT`, `UPDATE`, or `DELETE` rows where the `household_id` matches their own `household_id` (retrieved from the `users` table via `auth.uid()`).