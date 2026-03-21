#!/usr/bin/env node
/**
 * generate-release-notes.js
 *
 * Priority: reads curated notes from RELEASE_NOTES_NEXT.md (written by Copilot
 * pr-release-summary skill). Falls back to git-log parsing if that file is empty.
 *
 * Usage:  node scripts/generate-release-notes.js [version]
 * Output: writes to whatsnew/he-IL and prints JSON to stdout for CI
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const version = args[0] || "0.0.0";
const embedInApp = args.includes("--embed-in-app");

// Map conventional-commit prefixes to Hebrew categories
const CATEGORY_MAP = {
  feat: "✨ תכונות חדשות",
  fix: "🐛 תיקוני באגים",
  ui: "🎨 עיצוב וממשק",
  ai: "🧠 חיזוי חכם",
  perf: "⚡ שיפורי ביצועים",
  refactor: "♻️ שיפורים",
  docs: "📝 תיעוד",
  chore: null, // skip
  ci: null, // skip
  test: null, // skip
};

function getCommitsSinceLastTag() {
  try {
    const tags = execSync("git tag -l 'v*' --sort=-v:refname", {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);

    // The current tag (not yet pushed) is v{version}
    // We want commits between the previous tag and HEAD
    const prevTag = tags.find((t) => t !== `v${version}`) || "";
    const range = prevTag ? `${prevTag}..HEAD` : "HEAD~20..HEAD";

    const log = execSync(`git log ${range} --pretty=format:"%s" --no-merges`, {
      encoding: "utf8",
    });
    return log.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function categorize(commits) {
  const buckets = {};
  const other = [];

  for (const msg of commits) {
    // Match "type: message" or "type(scope): message"
    const m = msg.match(/^(\w+)(?:\([^)]*\))?:\s*(.+)/);
    if (m) {
      const type = m[1].toLowerCase();
      const text = m[2].trim();
      const label = CATEGORY_MAP[type];
      if (label === null) continue; // explicitly skipped
      if (label) {
        (buckets[label] ||= []).push(text);
      } else {
        other.push(text);
      }
    } else {
      // Non-conventional commit — skip chore-like messages
      if (/^(chore|ci|test|merge|bump)/i.test(msg)) continue;
      other.push(msg);
    }
  }

  if (other.length > 0) {
    buckets["🔄 שינויים נוספים"] = other;
  }

  return buckets;
}

function buildHebrew(buckets) {
  const lines = [`🛒 עגלה ${version} — מה חדש?`, ""];

  for (const [category, items] of Object.entries(buckets)) {
    lines.push(category);
    for (const item of items) {
      lines.push(`• ${item}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function buildHtml(buckets) {
  let html = "";
  for (const [category, items] of Object.entries(buckets)) {
    html += `<h3 style="color: #8b9fe8; margin: 16px 0 8px;">${category}</h3>\n<ul style="color: #c0c0d8; line-height: 1.7; padding-right: 20px;">\n`;
    for (const item of items) {
      html += `  <li>${item}</li>\n`;
    }
    html += `</ul>\n`;
  }
  return html || '<p style="color: #c0c0d8;">שיפורים כלליים ותיקוני באגים</p>';
}

// ── Try curated notes first (written by Copilot skill) ────────
function readCuratedNotes() {
  try {
    const filePath = path.join(process.cwd(), "RELEASE_NOTES_NEXT.md");
    const raw = fs.readFileSync(filePath, "utf8");
    // Strip the header/comments — content starts after the "---" separator
    const parts = raw.split(/^---$/m);
    const content = (
      parts.length > 1 ? parts.slice(1).join("---") : raw
    ).trim();
    // Filter out HTML comments and empty lines
    const lines = content
      .split("\n")
      .filter((l) => !l.startsWith("<!--") && !l.startsWith("-->") && l.trim());
    return lines.length > 0 ? lines.join("\n") : "";
  } catch {
    return "";
  }
}

/** Convert curated plain-text Hebrew notes to HTML */
function curatedToHtml(text) {
  let html = "";
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Category headers (emoji + text, no bullet)
    if (/^[✨🐛🎨🧠⚡♻️🔄🛒]/.test(trimmed) && !trimmed.startsWith("•")) {
      html += `<h3 style="color: #8b9fe8; margin: 16px 0 8px;">${trimmed}</h3>\n`;
    } else if (trimmed.startsWith("•")) {
      // Bullet items — wrap in list if not already
      if (
        !html.endsWith("</ul>\n") &&
        !html.endsWith(
          '<ul style="color: #c0c0d8; line-height: 1.7; padding-right: 20px;">\n',
        )
      ) {
        html += `<ul style="color: #c0c0d8; line-height: 1.7; padding-right: 20px;">\n`;
      }
      html += `  <li>${trimmed.slice(1).trim()}</li>\n`;
    } else {
      // Close any open list
      if (html.includes("<ul") && !html.endsWith("</ul>\n")) {
        html += `</ul>\n`;
      }
      html += `<p style="color: #c0c0d8;">${trimmed}</p>\n`;
    }
  }
  // Close trailing list
  if (html.includes("<ul") && !html.endsWith("</ul>\n")) {
    html += `</ul>\n`;
  }
  return html || '<p style="color: #c0c0d8;">שיפורים כלליים ותיקוני באגים</p>';
}

// ── Main ──────────────────────────────────────────────────────
const curated = readCuratedNotes();

let hebrewNotes;
let htmlNotes;

if (curated) {
  // Use curated notes from RELEASE_NOTES_NEXT.md
  hebrewNotes = curated.startsWith("🛒")
    ? curated
    : `🛒 עגלה ${version} — מה חדש?\n\n${curated}`;
  htmlNotes = curatedToHtml(curated);
} else {
  // Fallback: parse git log
  const commits = getCommitsSinceLastTag();
  const buckets = categorize(commits);
  const hasContent = Object.keys(buckets).length > 0;
  hebrewNotes = hasContent
    ? buildHebrew(buckets)
    : `🛒 עגלה ${version}\n• שיפורים כלליים ותיקוני באגים`;
  htmlNotes = hasContent
    ? buildHtml(buckets)
    : '<p style="color: #c0c0d8;">שיפורים כלליים ותיקוני באגים</p>';
}

// Write Google Play whatsnew (max 500 chars)
const whatsnewDir = path.join(process.cwd(), "whatsnew");
fs.mkdirSync(whatsnewDir, { recursive: true });
fs.writeFileSync(
  path.join(whatsnewDir, "he-IL"),
  hebrewNotes.slice(0, 500) + "\n",
);

if (embedInApp) {
  try {
    const appJsonPath = path.join(process.cwd(), "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));

    appJson.expo = appJson.expo || {};
    appJson.expo.extra = appJson.expo.extra || {};
    appJson.expo.extra.clientWhatsNewVersion = version;
    appJson.expo.extra.clientWhatsNewHe = hebrewNotes.slice(0, 500);

    fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + "\n");
  } catch {
    // Keep script resilient in CI/local usage.
  }
}

// Output JSON for CI to consume
const output = {
  text: hebrewNotes,
  html: htmlNotes,
};
console.log(JSON.stringify(output));
