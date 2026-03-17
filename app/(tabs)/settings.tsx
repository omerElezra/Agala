import { dark } from "@/constants/theme";
import { useAuth } from "@/src/hooks/useAuth";
import { supabase } from "@/src/lib/supabase";
import { useAppSettingsStore } from "@/src/store/appSettingsStore";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as StoreReview from "expo-store-review";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SettingsScreen() {
  const { user, signOut, isLoading, refreshProfile } = useAuth();
  const {
    showRecommendations,
    setShowRecommendations,
    showDepletion,
    setShowDepletion,
    autoAddEnabled,
    setAutoAddEnabled,
    loadSettings,
  } = useAppSettingsStore();
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // ── Join household ─────────────────────────────────────────
  const [joinId, setJoinId] = useState("");
  const [joining, setJoining] = useState(false);

  // ── Check for update ───────────────────────────────────
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  // Load persisted settings
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const showBanner = (text: string, type: "success" | "error") => {
    setBanner({ text, type });
    setTimeout(() => setBanner(null), 3_000);
  };

  // ── Update display name ────────────────────────────────────
  const handleSaveName = useCallback(async () => {
    if (!user || !newName.trim()) return;
    setSaving(true);

    const { error } = await supabase
      .from("users")
      .update({ display_name: newName.trim() })
      .eq("id", user.id);

    if (error) {
      showBanner("שגיאה בעדכון השם", "error");
    } else {
      await refreshProfile();
      showBanner("השם עודכן בהצלחה", "success");
      setEditingName(false);
    }
    setSaving(false);
  }, [user, newName, refreshProfile]);

  // ── Copy household ID ──────────────────────────────────────
  const handleCopyHousehold = useCallback(async () => {
    if (!user?.household_id) return;
    try {
      await Clipboard.setStringAsync(user.household_id);
      showBanner("הקוד הועתק ללוח", "success");
    } catch {
      showBanner("שגיאה בהעתקה", "error");
    }
  }, [user?.household_id]);

  // ── Join another household ─────────────────────────────────
  const handleJoinHousehold = useCallback(async () => {
    if (!user || !joinId.trim()) return;
    setJoining(true);

    // Verify the household exists
    const { data: hh, error: hhErr } = await supabase
      .from("households")
      .select("id")
      .eq("id", joinId.trim())
      .single();

    if (hhErr || !hh) {
      showBanner("משק בית לא נמצא — בדקו את הקוד", "error");
      setJoining(false);
      return;
    }

    // Update user to new household
    const { error: updateErr } = await supabase
      .from("users")
      .update({ household_id: joinId.trim() })
      .eq("id", user.id);

    if (updateErr) {
      showBanner("שגיאה בהצטרפות למשק הבית", "error");
    } else {
      showBanner("הצטרפת למשק הבית בהצלחה! הפעילו מחדש", "success");
      setJoinId("");
    }
    setJoining(false);
  }, [user, joinId]);

  // ── Check for app update ───────────────────────────────
  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
    try {
      const res = await fetch(
        "https://api.github.com/repos/omerElezra/Agala/releases/latest",
        { headers: { Accept: "application/vnd.github.v3+json" } },
      );
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      const latestTag: string = (data.tag_name ?? "").replace(/^v/, "");
      if (!latestTag) throw new Error("no tag");

      if (latestTag !== currentVersion && latestTag > currentVersion) {
        showBanner(`גרסה חדשה זמינה: ${latestTag}`, "success");
        const url =
          Platform.OS === "android"
            ? "market://details?id=com.omerelezra.agala"
            : "https://play.google.com/store/apps/details?id=com.omerelezra.agala";
        Linking.openURL(url).catch(() =>
          Linking.openURL(
            "https://play.google.com/store/apps/details?id=com.omerelezra.agala",
          ),
        );
      } else {
        showBanner("האפליקציה מעודכנת לגרסה האחרונה ✓", "success");
      }
    } catch {
      // Fallback: open store so user can check manually
      showBanner("בודק עדכונים בחנות...", "success");
      const url =
        Platform.OS === "android"
          ? "market://details?id=com.omerelezra.agala"
          : "https://play.google.com/store/apps/details?id=com.omerelezra.agala";
      Linking.openURL(url).catch(() =>
        Linking.openURL(
          "https://play.google.com/store/apps/details?id=com.omerelezra.agala",
        ),
      );
    } finally {
      setCheckingUpdate(false);
    }
  }, []);
  if (isLoading || !user) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={dark.accent} />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ── Profile Section ─────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>פרופיל</Text>

          {/* Display name */}
          <View style={styles.row}>
            <Text style={styles.label}>שם תצוגה</Text>
            {editingName ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.nameInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder={user.display_name ?? ""}
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveName}
                  disabled={saving}
                >
                  <Text style={styles.saveBtnText}>
                    {saving ? "..." : "שמור"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setEditingName(false)}
                >
                  <Text style={styles.cancelBtnText}>ביטול</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  setNewName(user.display_name ?? "");
                  setEditingName(true);
                }}
              >
                <Text style={styles.value}>
                  {user.display_name || "—"}{" "}
                  <Text style={styles.editIcon}>✏️</Text>
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Email */}
          <View style={styles.row}>
            <Text style={styles.label}>אימייל</Text>
            <Text style={styles.value}>{user.email}</Text>
          </View>
        </View>

        {/* ── Household Section ────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>משק בית</Text>

          {/* Current household ID */}
          <View style={styles.row}>
            <Text style={styles.label}>קוד משק בית</Text>
            <TouchableOpacity onPress={handleCopyHousehold}>
              <Text style={styles.householdId}>
                {user.household_id?.slice(0, 8)}…{" "}
                <Text style={styles.copyIcon}>📋</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            שתפו את הקוד עם בני המשפחה כדי שיצטרפו לאותה רשימה
          </Text>

          {/* Join another household */}
          <View style={styles.joinSection}>
            <Text style={styles.label}>הצטרפות למשק בית אחר</Text>
            <View style={styles.joinRow}>
              <TextInput
                style={styles.joinInput}
                value={joinId}
                onChangeText={setJoinId}
                placeholder="הדביקו קוד משק בית"
                placeholderTextColor={dark.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[
                  styles.joinBtn,
                  !joinId.trim() && styles.joinBtnDisabled,
                ]}
                onPress={handleJoinHousehold}
                disabled={joining || !joinId.trim()}
              >
                <Text style={styles.joinBtnText}>
                  {joining ? "..." : "הצטרף"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {/* ── Preferences Section ───────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>העדפות</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>תזכורות לקנייה</Text>
              <Text style={styles.settingHint}>
                מציג בראש המסך מה עומד להיגמר — לפני שתצטרכו לחפש
              </Text>
            </View>
            <Switch
              value={showRecommendations}
              onValueChange={setShowRecommendations}
              trackColor={{ false: dark.input, true: dark.success }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>מד מלאי בקטלוג</Text>
              <Text style={styles.settingHint}>
                הצג כמה נשאר מכל מוצר לפי קצב השימוש הרגיל שלכם
              </Text>
            </View>
            <Switch
              value={showDepletion}
              onValueChange={setShowDepletion}
              trackColor={{ false: dark.input, true: dark.success }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>ממלא את העגלה</Text>
              <Text style={styles.settingHint}>
                מוסיף אוטומטית מוצרים לעגלה כשהם עומדים להיגמר — בלי שתצטרכו לזכור
              </Text>
            </View>
            <Switch
              value={autoAddEnabled}
              onValueChange={setAutoAddEnabled}
              trackColor={{ false: dark.input, true: dark.success }}
              thumbColor="#fff"
            />
          </View>
        </View>
        {/* ── App Info Section ─────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>אודות</Text>
          <View style={styles.row}>
            <Text style={styles.label}>גרסה</Text>
            <Text style={styles.value}>
              {Constants.expoConfig?.version ?? "1.0.0"}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>יוצר</Text>
            <Text style={styles.value}>Omer Elezra</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>עיצוב ופיתוח</Text>
            <Text style={[styles.value, { color: dark.accent }]}>
              @OmerElezra
            </Text>
          </View>
        </View>

        {/* ── Check for Update ─────────────────────────────── */}
        <TouchableOpacity
          style={styles.updateBtn}
          onPress={handleCheckUpdate}
          disabled={checkingUpdate}
          activeOpacity={0.8}
        >
          {checkingUpdate ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.updateBtnText}>⬆️ עדכון אפליקציה</Text>
          )}
        </TouchableOpacity>

        {/* ── Rate App (native in-app review) ────────────────── */}
        <TouchableOpacity
          style={styles.rateBtn}
          onPress={async () => {
            try {
              const isAvailable = await StoreReview.isAvailableAsync();
              if (isAvailable) {
                await StoreReview.requestReview();
              } else {
                // Fallback: open store page directly
                const url =
                  Platform.OS === "android"
                    ? "market://details?id=com.omerelezra.agala"
                    : "https://play.google.com/store/apps/details?id=com.omerelezra.agala";
                await Linking.openURL(url).catch(() =>
                  Linking.openURL(
                    "https://play.google.com/store/apps/details?id=com.omerelezra.agala",
                  ),
                );
              }
            } catch {
              // Last resort fallback
              Linking.openURL(
                "https://play.google.com/store/apps/details?id=com.omerelezra.agala",
              );
            }
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.rateBtnText}>⭐ דרגו אותנו ב-Google Play</Text>
        </TouchableOpacity>

        {/* ── Sign Out ────────────────────────────────────────── */}
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>התנתקות</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Popup Banner ──────────────────────────────────────── */}
      <Modal
        visible={!!banner}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setBanner(null)}
      >
        <TouchableOpacity
          style={styles.popupOverlay}
          activeOpacity={1}
          onPress={() => setBanner(null)}
        >
          <View
            style={[
              styles.popupCard,
              banner?.type === "success"
                ? styles.popupSuccess
                : styles.popupError,
            ]}
          >
            <Text style={styles.popupEmoji}>
              {banner?.type === "success" ? "✅" : "❌"}
            </Text>
            <Text style={styles.popupText}>{banner?.text}</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles (Dark mode, RTL-safe) ─────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  popupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  popupCard: {
    backgroundColor: dark.surfaceElevated,
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    borderWidth: 1.5,
  },
  popupSuccess: {
    borderColor: dark.success,
  },
  popupError: {
    borderColor: dark.error,
  },
  popupEmoji: {
    fontSize: 36,
    marginBottom: 12,
  },
  popupText: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: dark.text,
    lineHeight: 24,
  },
  section: {
    backgroundColor: dark.surface,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: dark.border,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: dark.accent,
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: dark.border,
  },
  label: {
    fontSize: 13,
    color: dark.textSecondary,
    marginBottom: 4,
    fontWeight: "600",
  },
  value: {
    fontSize: 16,
    color: dark.text,
    fontWeight: "500",
  },
  editIcon: {
    fontSize: 14,
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  nameInput: {
    flex: 1,
    fontSize: 16,
    padding: 10,
    borderWidth: 1.5,
    borderColor: dark.inputBorder,
    borderRadius: 12,
    backgroundColor: dark.input,
    color: dark.inputText,
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: dark.accent,
    borderRadius: 12,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  cancelBtnText: {
    color: dark.textMuted,
    fontSize: 14,
  },
  householdId: {
    fontSize: 16,
    color: dark.secondary,
    fontWeight: "700",
  },
  copyIcon: {
    fontSize: 14,
  },
  hint: {
    fontSize: 13,
    color: dark.textSecondary,
    marginTop: 8,
    lineHeight: 20,
  },
  joinSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: dark.border,
  },
  joinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  joinInput: {
    flex: 1,
    fontSize: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: dark.inputBorder,
    borderRadius: 12,
    backgroundColor: dark.input,
    color: dark.inputText,
  },
  joinBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    backgroundColor: dark.secondary,
    borderRadius: 12,
  },
  joinBtnDisabled: {
    backgroundColor: dark.surfaceAlt,
  },
  joinBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  updateBtn: {
    backgroundColor: dark.secondary,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  updateBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  rateBtn: {
    backgroundColor: dark.accent,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  rateBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  signOutBtn: {
    backgroundColor: dark.surface,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: dark.error,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: "700",
    color: dark.error,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  settingInfo: {
    flex: 1,
    marginEnd: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: dark.text,
  },
  settingHint: {
    fontSize: 12,
    color: dark.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
});
