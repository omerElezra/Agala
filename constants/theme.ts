/**
 * Dark-first theme constants for Agala.
 * Warm, vibrant palette — coral + teal accents for a fresh grocery-app feel.
 */

export const dark = {
  // ── Backgrounds ─────────────────────────────────────────────
  background: '#0F0F1A',         // deep midnight
  surface: '#1A1A2E',            // cards, sections, sheets
  surfaceElevated: '#232342',    // modals, elevated cards
  surfaceAlt: '#2A2A4A',         // alternate rows, pressed states
  sectionBg: '#0F0F1A',          // section header backgrounds

  // ── Text ────────────────────────────────────────────────────
  text: '#F0EFF4',               // warm white
  textSecondary: '#9896A8',      // lavender-gray
  textMuted: '#5B5875',          // muted purple-gray
  textOnAccent: '#ffffff',       // text on accent-colored buttons

  // ── Borders ─────────────────────────────────────────────────
  border: '#2E2E52',             // standard border / divider
  borderLight: '#232342',        // subtle border

  // ── Accent colors ──────────────────────────────────────────
  accent: '#8B9FE8',             // soft lavender-blue — primary accent
  accentDark: '#7088D8',         // deeper blue (pressed states)
  accentSoft: '#8B9FE822',       // lavender with low opacity
  secondary: '#4ECDC4',          // teal — secondary accent
  secondaryDark: '#38B2A8',      // deeper teal
  success: '#48ae6d',            // vibrant green (for banners)
  successBg: '#0D2818',          // green tinted background
  error: '#E8596E',              // soft rose — errors
  errorBg: '#3B1320',            // rose tinted background
  warning: '#FFD93D',            // warm golden yellow
  warningBg: '#2D2206',          // golden tinted background
  info: '#6CB4EE',               // sky blue
  infoBg: '#0C2D6B',             // blue tinted background

  // ── Purchased / Done ─────────────────────────────────────────
  purchased: '#5B5875',          // muted gray for purchased items
  purchasedBg: '#16162A',        // very subtle dark bg for purchased
  purchasedCheck: '#3D3D5C',     // dim gray for checkbox

  // ── Interactive ─────────────────────────────────────────────
  fab: '#8B9FE8',                // soft lavender FAB
  fabShadow: '#8B9FE844',        // lavender glow
  checkbox: '#5B5875',           // unchecked checkbox border
  checkboxChecked: '#3D3D5C',    // dim gray — purchased (not eye-catching)

  // ── Chips ───────────────────────────────────────────────────
  chip: '#1E1E3A',               // deep indigo chip bg
  chipBorder: '#3D3D6B',         // chip border
  chipText: '#D4CCE8',           // light lavender chip text
  chipAccent: '#4ECDC4',         // teal chip highlight

  // ── Inputs ──────────────────────────────────────────────────
  input: '#141422',              // input field background
  inputBorder: '#2E2E52',        // input field border
  inputText: '#F0EFF4',          // input text
  placeholder: '#5B5875',        // placeholder text
  inputFocus: '#8B9FE8',         // focused input border

  // ── Swipe ─────────────────────────────────────────────────
  swipeOrange: '#FFD93D',        // golden snooze action
};
