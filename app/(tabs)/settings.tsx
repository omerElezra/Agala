import { dark } from "@/constants/theme";
import { useAuth } from "@/src/hooks/useAuth";
import { supabase } from "@/src/lib/supabase";
import { useShoppingListStore } from "@/src/store/shoppingListStore";
import { detectCategory } from "@/src/utils/categoryDetector";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import * as StoreReview from "expo-store-review";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SettingsScreen() {
  const { user, signOut, isLoading, refreshProfile } = useAuth();
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

  // ── Import items ───────────────────────────────────────────
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [manualText, setManualText] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const { addItem, fetchList } = useShoppingListStore();

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

  // ── Import handler (parses lines: "name" or "name,quantity") ──
  const handleImport = useCallback(
    async (text: string) => {
      if (!user?.household_id) return;
      setImporting(true);
      setImportResult(null);

      try {
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        const firstLine = lines[0]?.toLowerCase() ?? "";
        const startIdx =
          firstLine.includes("name") ||
          firstLine.includes("שם") ||
          firstLine.includes("product")
            ? 1
            : 0;

        let added = 0;
        let skipped = 0;

        for (let i = startIdx; i < lines.length; i++) {
          const parts = lines[i]!.split(",").map((p) =>
            p.trim().replace(/^"|"$/g, ""),
          );
          const name = parts[0];
          if (!name || name.length < 1) continue;

          const quantity = parts[1] ? parseInt(parts[1], 10) || 1 : 1;
          const category = detectCategory(name);

          const { data: existingProduct } = await supabase
            .from("products")
            .select("id")
            .eq("name", name)
            .maybeSingle();

          let productId: string;
          if (existingProduct) {
            productId = existingProduct.id;
          } else {
            const { data: newProduct, error: prodErr } = await supabase
              .from("products")
              .insert({ name, category })
              .select("id")
              .single();

            if (prodErr || !newProduct) {
              skipped++;
              continue;
            }
            productId = newProduct.id;
          }

          const result = addItem(productId, user.household_id, quantity);
          if (result === "added") {
            added++;
          } else {
            skipped++;
          }
        }

        await fetchList(user.household_id);

        const msg =
          `\u2705 יובאו ${added} פריטים` +
          (skipped > 0 ? ` (דולגו ${skipped})` : "");
        setImportResult(msg);
        showBanner(msg, "success");
      } catch (err) {
        console.error("[import]", err);
        showBanner("שגיאה בייבוא", "error");
      } finally {
        setImporting(false);
      }
    },
    [user, addItem, fetchList],
  );

  // ── Pick file (CSV / TXT) ──────────────────────────────────
  const handlePickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/plain",
          "text/comma-separated-values",
          "application/csv",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const file = new ExpoFile(asset.uri);
      const content = await file.text();

      if (content && content.trim().length > 0) {
        handleImport(content);
      } else {
        showBanner("הקובץ ריק", "error");
      }
    } catch (err) {
      console.error("[file-pick]", err);
      showBanner("שגיאה בבחירת הקובץ", "error");
    }
  }, [handleImport]);

  // ── Paste from clipboard ───────────────────────────────────
  const handlePasteClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && text.trim().length > 0) {
        handleImport(text);
      } else {
        showBanner("הלוח ריק — העתיקו רשימה קודם", "error");
      }
    } catch {
      showBanner("שגיאה בקריאת הלוח", "error");
    }
  }, [handleImport]);

  // ── Import from manual text input ──────────────────────────
  const handleManualImport = useCallback(() => {
    if (!manualText.trim()) {
      showBanner("הזינו לפחות מוצר אחד", "error");
      return;
    }
    handleImport(manualText);
    setManualText("");
    setShowManualInput(false);
  }, [manualText, handleImport]);

  // ── Check for app update ────────────────────────────────────
  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
      const res = await fetch(
        "https://api.github.com/repos/omerElezra/Agala/releases/latest",
      );
      if (!res.ok) {
        showBanner("שגיאה בבדיקת עדכונים", "error");
        return;
      }
      const data = await res.json();
      const latestVersion = (data.tag_name ?? "").replace(/^v/, "");

      if (!latestVersion) {
        showBanner("לא ניתן לבדוק עדכונים כרגע", "error");
        return;
      }

      if (latestVersion === currentVersion) {
        showBanner("האפליקציה מעודכנת לגרסה האחרונה ✅", "success");
      } else {
        showBanner(`גרסה חדשה זמינה: ${latestVersion}`, "success");
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
      showBanner("שגיאה בבדיקת עדכונים", "error");
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
        {/* Banner */}
        {banner && (
          <View
            style={[
              styles.banner,
              banner.type === "success"
                ? styles.bannerSuccess
                : styles.bannerError,
            ]}
          >
            <Text style={styles.bannerText}>{banner.text}</Text>
          </View>
        )}

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

        {/* ── Import Items Section ─────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ייבוא פריטים</Text>
          <Text style={styles.hint}>
            הוסיפו מוצרים לרשימה מקובץ, מהלוח, או הקלידו ידנית.{"\n"}
            פורמט: שם מוצר בכל שורה, או שם,כמות
          </Text>

          <View style={styles.csvExample}>
            <Text style={styles.csvExampleTitle}>דוגמה:</Text>
            <Text style={styles.csvExampleText}>
              חלב{"\n"}ביצים,2{"\n"}לחם{"\n"}גבינה צהובה,1
            </Text>
          </View>

          {/* Import option buttons */}
          <View style={styles.importOptions}>
            {/* Pick file */}
            <TouchableOpacity
              style={[
                styles.importOptionBtn,
                importing && styles.importBtnDisabled,
              ]}
              onPress={handlePickFile}
              disabled={importing}
              activeOpacity={0.7}
            >
              <Ionicons
                name="document-text-outline"
                size={22}
                color={dark.accent}
              />

              <Text style={styles.importOptionText}>טען מקובץ</Text>
              <Text style={styles.importOptionSub}>CSV, TXT</Text>
            </TouchableOpacity>

            {/* Paste from clipboard */}
            <TouchableOpacity
              style={[
                styles.importOptionBtn,
                importing && styles.importBtnDisabled,
              ]}
              onPress={handlePasteClipboard}
              disabled={importing}
              activeOpacity={0.7}
            >
              <Ionicons
                name="clipboard-outline"
                size={22}
                color={dark.secondary}
              />
              <Text style={styles.importOptionText}>הדבק מהלוח</Text>
              <Text style={styles.importOptionSub}>העתיקו רשימה קודם</Text>
            </TouchableOpacity>
            {/* Manual text input toggle */}
            <TouchableOpacity
              style={[
                styles.importOptionBtn,
                importing && styles.importBtnDisabled,
              ]}
              onPress={() => setShowManualInput((v) => !v)}
              disabled={importing}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={22} color={dark.warning} />
              <Text style={styles.importOptionText}>הקלדה ידנית</Text>
              <Text style={styles.importOptionSub}>הזינו מוצרים בעצמכם</Text>
            </TouchableOpacity>
          </View>

          {/* Manual text area (shown on toggle) */}
          {showManualInput && (
            <View style={styles.manualInputArea}>
              <TextInput
                style={styles.manualTextInput}
                value={manualText}
                onChangeText={setManualText}
                placeholder={"חלב\nביצים,2\nלחם"}
                placeholderTextColor={dark.placeholder}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[
                  styles.importBtn,
                  (!manualText.trim() || importing) && styles.importBtnDisabled,
                ]}
                onPress={handleManualImport}
                disabled={!manualText.trim() || importing}
                activeOpacity={0.8}
              >
                <Text style={styles.importBtnText}>
                  {importing ? "מייבא..." : "📥 ייבא פריטים"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Loading indicator */}
          {importing && (
            <View style={styles.importingRow}>
              <ActivityIndicator size="small" color={dark.accent} />
              <Text style={styles.importingText}>מייבא פריטים...</Text>
            </View>
          )}

          {importResult && (
            <Text style={styles.importResult}>{importResult}</Text>
          )}
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

          {/* Check for update */}
          <TouchableOpacity
            style={styles.updateBtn}
            onPress={handleCheckUpdate}
            disabled={checkingUpdate}
            activeOpacity={0.7}
          >
            {checkingUpdate ? (
              <ActivityIndicator size="small" color={dark.accent} />
            ) : (
              <Ionicons name="cloud-download-outline" size={20} color={dark.accent} />
            )}
            <Text style={styles.updateBtnText}>
              {checkingUpdate ? "בודק עדכונים..." : "בדוק עדכון חדש"}
            </Text>
          </TouchableOpacity>
        </View>

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
  banner: {
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  bannerSuccess: {
    backgroundColor: dark.successBg,
    borderWidth: 1.5,
    borderColor: dark.success,
  },
  bannerError: {
    backgroundColor: dark.errorBg,
    borderWidth: 1.5,
    borderColor: dark.error,
  },
  bannerText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: dark.text,
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
  csvExample: {
    backgroundColor: dark.surfaceAlt,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    marginBottom: 12,
  },
  csvExampleTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: dark.textSecondary,
    marginBottom: 4,
  },
  csvExampleText: {
    fontSize: 13,
    color: dark.textMuted,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 20,
  },
  importOptions: {
    gap: 10,
    marginBottom: 4,
  },
  importOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: dark.background,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.border,
  },
  importOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: dark.text,
  },
  importOptionSub: {
    fontSize: 11,
    color: dark.textSecondary,
    fontWeight: "500",
  },
  manualInputArea: {
    marginTop: 10,
    gap: 10,
  },
  manualTextInput: {
    fontSize: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: dark.inputBorder,
    borderRadius: 14,
    backgroundColor: dark.input,
    color: dark.inputText,
    writingDirection: "rtl",
    minHeight: 120,
  },
  importingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },
  importingText: {
    fontSize: 13,
    color: dark.textSecondary,
    fontWeight: "600",
  },
  importBtn: {
    backgroundColor: dark.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  importBtnDisabled: {
    backgroundColor: dark.surfaceAlt,
  },
  importBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
  importResult: {
    fontSize: 14,
    color: dark.success,
    textAlign: "center",
    marginTop: 10,
    fontWeight: "700",
  },
  updateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 14,
    paddingVertical: 12,
    backgroundColor: dark.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.accent,
  },
  updateBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: dark.accent,
  },
});
