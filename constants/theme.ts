/**
 * Dark-first theme constants for Agala.
 * Matches the main.html reference design — deep midnight + purple accent.
 */

export const dark = {
  // ── Backgrounds ─────────────────────────────────────────────
  background: "#0F0F1A", // deep midnight  (--bg-color)
  surface: "#1A1A2E", // cards, sections (--surface-color)
  surfaceHighlight: "#252542", // hover / pressed (--surface-highlight)
  surfaceDark: "#131323", // inset controls  (--surface-dark)
  surfaceElevated: "#232342", // modals, elevated cards
  surfaceAlt: "#2A2A4A", // alternate rows
  sectionBg: "#0F0F1A", // section header backgrounds

  // ── Text ────────────────────────────────────────────────────
  text: "#FFFFFF", // primary white   (--text-primary)
  textSecondary: "#94A3B8", // muted slate     (--text-secondary)
  textMuted: "#5B5875", // muted purple-gray
  textOnAccent: "#ffffff", // text on accent-colored buttons

  // ── Borders ─────────────────────────────────────────────────
  border: "#252542", // matches surfaceHighlight
  borderLight: "#232342", // subtle border

  // ── Accent colors ──────────────────────────────────────────
  accent: "#6C5DD3", // purple          (--primary-accent)
  accentDark: "#5A4CBF", // deeper purple (pressed states)
  accentSoft: "#6C5DD322", // purple with low opacity
  secondary: "#4ECDC4", // teal — secondary accent
  secondaryDark: "#38B2A8", // deeper teal
  success: "#4ADE80", // bright green    (--success-color)
  successBg: "#0D2818", // green tinted background
  error: "#FB7185", // rose            (--error-color)
  errorBg: "#3B1320", // rose tinted background
  warning: "#FFD93D", // warm golden yellow
  warningBg: "#2D2206", // golden tinted background
  info: "#6CB4EE", // sky blue
  infoBg: "#0C2D6B", // blue tinted background

  // ── Purchased / Done ─────────────────────────────────────────
  purchased: "#5B5875", // muted gray for purchased items
  purchasedBg: "#16162A", // very subtle dark bg for purchased
  purchasedCheck: "#3D3D5C", // dim gray for checkbox

  // ── Interactive ─────────────────────────────────────────────
  fab: "#6C5DD3", // purple FAB
  fabShadow: "#6C5DD344", // purple glow
  checkbox: "#94A3B8", // unchecked checkbox border (textSecondary)
  checkboxChecked: "#3D3D5C", // dim gray — purchased

  // ── Chips ───────────────────────────────────────────────────
  chip: "#1E1E3A", // deep indigo chip bg
  chipBorder: "#3D3D6B", // chip border
  chipText: "#D4CCE8", // light lavender chip text
  chipAccent: "#4ECDC4", // teal chip highlight

  // ── Inputs ──────────────────────────────────────────────────
  input: "#1A1A2E", // same as surface
  inputBorder: "#252542", // matches surfaceHighlight
  inputText: "#FFFFFF", // input text
  placeholder: "#64748B", // slate placeholder (slate-500)
  inputFocus: "#6C5DD3", // focused — accent purple

  // ── Swipe ─────────────────────────────────────────────────
  swipeOrange: "#FFD93D", // golden snooze action

  // ── Card-specific (main.html design) ──────────────────────
  cardRadius: 16, // rounded-2xl equivalent
  cardRadiusSm: 12, // rounded-xl equivalent
};
