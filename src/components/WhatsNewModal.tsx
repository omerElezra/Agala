import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import React, { useCallback, useEffect, useState } from "react";
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { dark } from "@/constants/theme";

const STORAGE_KEY = "whats_new_last_seen_version";
const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/omerElezra/Agala/releases/latest";

/**
 * Map conventional-commit prefixes to Hebrew category headers.
 * Mirrors scripts/generate-release-notes.js for consistency.
 */
const PREFIX_MAP: Record<string, string | null> = {
  feat: "✨ תכונות חדשות",
  fix: "🐛 תיקוני באגים",
  ui: "🎨 עיצוב וממשק",
  ai: "🧠 חיזוי חכם",
  perf: "⚡ שיפורי ביצועים",
  refactor: "♻️ שיפורים",
  docs: null,
  chore: null,
  ci: null,
  test: null,
};

/** Parse a GitHub release body (markdown bullet list) into categorised items */
function parseReleaseBody(
  body: string,
): { category: string; items: string[] }[] {
  const lines = body.split("\n").filter((l) => l.trim());
  const buckets: Record<string, string[]> = {};

  for (const line of lines) {
    // GitHub auto-generated notes: "* commit msg by @user in #123"
    const m = line.match(/^\*\s+(.+?)(?:\s+by\s+@|$)/);
    if (!m) continue;
    const msg = m[1]?.trim() ?? "";

    const prefixMatch = msg.match(/^(\w+)(?:\([^)]*\))?:\s*(.+)/);
    if (prefixMatch) {
      const type = (prefixMatch[1] ?? "").toLowerCase();
      const text = (prefixMatch[2] ?? "").trim();
      const label = PREFIX_MAP[type];
      if (label === null) continue;
      if (label) {
        (buckets[label] ||= []).push(text);
        continue;
      }
    }
    // Skip chore-like
    if (/^(chore|ci|test|merge|bump)/i.test(msg)) continue;
    (buckets["🔄 שינויים נוספים"] ||= []).push(msg);
  }

  return Object.entries(buckets).map(([category, items]) => ({
    category,
    items,
  }));
}

export function WhatsNewModal() {
  const [visible, setVisible] = useState(false);
  const [version, setVersion] = useState("");
  const [sections, setSections] = useState<
    { category: string; items: string[] }[]
  >([]);

  const check = useCallback(async () => {
    try {
      const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
      const lastSeen = await AsyncStorage.getItem(STORAGE_KEY);

      // Already seen this version
      if (lastSeen === currentVersion) return;

      const res = await fetch(GITHUB_RELEASES_URL, {
        headers: { Accept: "application/vnd.github.v3+json" },
      });
      if (!res.ok) return;

      const data = await res.json();
      const tagVersion: string = (data.tag_name ?? "").replace(/^v/, "");
      const body: string = data.body ?? "";

      // Only show if the release tag matches our current app version
      if (tagVersion !== currentVersion) return;

      const parsed = parseReleaseBody(body);
      if (parsed.length === 0) {
        // Even with no structured notes, show a generic message
        setSections([
          {
            category: "🔄 מה חדש?",
            items: ["שיפורים כלליים ותיקוני באגים"],
          },
        ]);
      } else {
        setSections(parsed);
      }

      setVersion(tagVersion);
      setVisible(true);
    } catch {
      // Silent fail — don't block the app
    }
  }, []);

  useEffect(() => {
    // Small delay to let the app settle before checking
    const timer = setTimeout(check, 1500);
    return () => clearTimeout(timer);
  }, [check]);

  const dismiss = useCallback(async () => {
    setVisible(false);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, version);
    } catch {
      // ignore
    }
  }, [version]);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <Text style={styles.emoji}>🛒</Text>
          <Text style={styles.title}>עגלה {version}</Text>
          <Text style={styles.subtitle}>מה חדש בגרסה הזו?</Text>

          {/* Content */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {sections.map((sec) => (
              <View key={sec.category} style={styles.section}>
                <Text style={styles.sectionTitle}>{sec.category}</Text>
                {sec.items.map((item, i) => (
                  <Text key={i} style={styles.item}>
                    • {item}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>

          {/* Dismiss button */}
          <TouchableOpacity
            style={styles.button}
            onPress={dismiss}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>מעולה, בואו נתחיל! 🚀</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: dark.surface,
    borderRadius: 22,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    maxHeight: "75%",
    borderWidth: 1.5,
    borderColor: dark.accent,
    alignItems: "center",
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: dark.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: dark.textSecondary,
    marginBottom: 16,
  },
  scroll: {
    width: "100%",
    maxHeight: 260,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: dark.accent,
    marginBottom: 6,
  },
  item: {
    fontSize: 14,
    color: dark.text,
    lineHeight: 22,
    paddingStart: 4,
  },
  button: {
    backgroundColor: dark.accent,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 16,
    width: "100%",
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
});
