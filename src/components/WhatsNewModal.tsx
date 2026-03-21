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

type NotesSection = { category: string; items: string[] };

function parseEmbeddedHebrewNotes(text: string): NotesSection[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const sections: NotesSection[] = [];
  let currentCategory = "";
  let currentItems: string[] = [];

  const flush = () => {
    if (!currentCategory || currentItems.length === 0) return;
    sections.push({ category: currentCategory, items: currentItems });
    currentItems = [];
  };

  for (const line of lines) {
    if (line.startsWith("🛒")) continue;

    if (line.startsWith("•")) {
      const item = line.slice(1).trim();
      if (!item) continue;
      if (!currentCategory) currentCategory = "🔄 מה חדש?";
      currentItems.push(item);
      continue;
    }

    flush();
    currentCategory = line;
  }

  flush();

  if (sections.length === 0) {
    return [
      {
        category: "🔄 מה חדש?",
        items: ["שיפורים כלליים ותיקוני באגים"],
      },
    ];
  }

  return sections;
}

export function WhatsNewModal() {
  const [visible, setVisible] = useState(false);
  const [version, setVersion] = useState("");
  const [sections, setSections] = useState<NotesSection[]>([]);

  const check = useCallback(async () => {
    try {
      const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
      const lastSeen = await AsyncStorage.getItem(STORAGE_KEY);
      const extra = (Constants.expoConfig?.extra ?? {}) as Record<
        string,
        unknown
      >;
      const embeddedNotes =
        typeof extra.clientWhatsNewHe === "string"
          ? extra.clientWhatsNewHe
          : "";
      const embeddedVersion =
        typeof extra.clientWhatsNewVersion === "string"
          ? extra.clientWhatsNewVersion
          : "";

      // Already seen this version
      if (lastSeen === currentVersion) return;

      // In-app popup is Hebrew and embedded locally during CI build.
      if (!embeddedNotes || embeddedVersion !== currentVersion) return;

      setSections(parseEmbeddedHebrewNotes(embeddedNotes));
      setVersion(currentVersion);
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
    width: "100%",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: dark.accent,
    marginBottom: 6,
    textAlign: "right",
    writingDirection: "rtl",
  },
  item: {
    fontSize: 14,
    color: dark.text,
    lineHeight: 22,
    paddingStart: 4,
    textAlign: "right",
    writingDirection: "rtl",
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
