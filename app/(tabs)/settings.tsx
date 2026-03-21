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
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Generate a random 6-char alphanumeric invite code */
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

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
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  // ── Household invite & members ─────────────────────────────
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [householdName, setHouseholdName] = useState("");
  const [editingHouseholdName, setEditingHouseholdName] = useState(false);
  const [savingHouseholdName, setSavingHouseholdName] = useState(false);
  const [members, setMembers] = useState<
    { id: string; display_name: string | null; email: string }[]
  >([]);
  const [leaving, setLeaving] = useState(false);

  // ── Check for update ───────────────────────────────────
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  // Load persisted settings
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // ── Load household data (name, members, existing invite) ──
  useEffect(() => {
    if (!user?.household_id) return;
    // Fetch household name
    supabase
      .from("households")
      .select("name")
      .eq("id", user.household_id)
      .single()
      .then(({ data }) => {
        setHouseholdName(data?.name ?? "");
      });
    // Fetch members
    supabase
      .from("users")
      .select("id, display_name, email")
      .eq("household_id", user.household_id)
      .then(({ data }) => {
        if (data) setMembers(data);
      });
    // Fetch existing active invite
    supabase
      .from("household_invites")
      .select("code")
      .eq("household_id", user.household_id)
      .gt("expires_at", new Date().toISOString())
      .gt("uses_remaining", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0 && data[0]) setInviteCode(data[0].code);
      });
  }, [user?.household_id]);

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

  // ── Save household name ──────────────────────────────────
  const handleSaveHouseholdName = useCallback(async () => {
    if (!user?.household_id || !householdName.trim()) return;
    setSavingHouseholdName(true);
    const { error } = await supabase
      .from("households")
      .update({ name: householdName.trim() })
      .eq("id", user.household_id);
    if (error) {
      showBanner("שגיאה בעדכון שם משק הבית", "error");
    } else {
      showBanner("שם משק הבית עודכן", "success");
      setEditingHouseholdName(false);
    }
    setSavingHouseholdName(false);
  }, [user?.household_id, householdName]);

  // ── Create invite code ─────────────────────────────────────
  const handleCreateInvite = useCallback(async () => {
    if (!user?.household_id) return;
    setCreatingInvite(true);
    const code = generateInviteCode();
    const { error } = await supabase.from("household_invites").insert({
      household_id: user.household_id,
      code,
      created_by: user.id,
    });
    if (error) {
      showBanner("שגיאה ביצירת קוד הזמנה", "error");
    } else {
      setInviteCode(code);
    }
    setCreatingInvite(false);
  }, [user?.household_id, user?.id]);

  // ── Share invite ───────────────────────────────────────────
  const handleShareInvite = useCallback(async () => {
    const code = inviteCode;
    if (!code) return;
    const hhName = householdName.trim() || "המשפחה";
    const message =
      `🛒 הצטרפו לרשימת הקניות של ${hhName} באפליקציית עגלה!\n\n` +
      `קוד הזמנה: ${code}\n\n` +
      `הורידו את האפליקציה והכניסו את הקוד בהגדרות → הצטרפות למשק בית`;
    try {
      await Share.share({ message });
    } catch {
      // User cancelled share
    }
  }, [inviteCode, householdName]);

  // ── Copy invite code ───────────────────────────────────────
  const handleCopyInvite = useCallback(async () => {
    if (!inviteCode) return;
    try {
      await Clipboard.setStringAsync(inviteCode);
      showBanner("קוד ההזמנה הועתק ללוח", "success");
    } catch {
      showBanner("שגיאה בהעתקה", "error");
    }
  }, [inviteCode]);

  // ── Join another household via invite code ─────────────────
  const handleJoinHousehold = useCallback(async () => {
    if (!user || !joinCode.trim()) return;
    setJoining(true);

    const code = joinCode.trim().toUpperCase();

    // Validate format: 6 alphanumeric characters
    if (!/^[A-Z0-9]{4,8}$/i.test(code)) {
      showBanner("קוד הזמנה לא תקין — בדקו את הקוד", "error");
      setJoining(false);
      return;
    }

    // Call RPC to join via invite code
    const { data: raw, error } = await supabase.rpc("join_household_by_code", {
      invite_code: code,
    });
    const result = raw as unknown as
      | { success: true; household_name: string | null }
      | { success: false; error: string }
      | null;

    if (error || !result?.success) {
      const errMsg =
        result && !result.success && result.error === "INVITE_NOT_FOUND"
          ? "קוד הזמנה לא נמצא או פג תוקף"
          : result && !result.success && result.error === "ALREADY_MEMBER"
            ? "אתם כבר חברים במשק בית זה"
            : "שגיאה בהצטרפות למשק הבית";
      showBanner(errMsg, "error");
    } else {
      const hhName = result.household_name ? ` "${result.household_name}"` : "";
      showBanner(`הצטרפת למשק הבית${hhName} בהצלחה! 🏠`, "success");
      setJoinCode("");
      // Clear stale state before refresh loads new household data
      setInviteCode(null);
      setMembers([]);
      setHouseholdName("");
      // Refresh profile + reload data without app restart
      await refreshProfile();
    }
    setJoining(false);
  }, [user, joinCode, refreshProfile]);

  // ── Leave household ────────────────────────────────────
  const handleLeaveHousehold = useCallback(() => {
    if (!user) return;

    // Can't leave if you're the only member — already solo
    if (members.length <= 1) {
      showBanner("אתם כבר לבד במשק הבית — אין צורך לעזוב", "error");
      return;
    }

    Alert.alert(
      "עזיבת משק הבית",
      `עזיבה תיצור עבורכם משק בית חדש וריק.\nשאר ${members.length - 1} החברים ישארו ברשימה הנוכחית.`,
      [
        { text: "ביטול", style: "cancel" },
        {
          text: "עזוב",
          style: "destructive",
          onPress: async () => {
            setLeaving(true);
            const { data: raw, error } = await supabase.rpc("leave_household");
            const result = raw as unknown as { success: boolean } | null;
            if (error || !result?.success) {
              showBanner("שגיאה ביציאה ממשק הבית", "error");
            } else {
              setInviteCode(null);
              setHouseholdName("");
              setMembers([]);
              await refreshProfile();
              showBanner("עברתם למשק בית חדש 🏠", "success");
            }
            setLeaving(false);
          },
        },
      ],
    );
  }, [user, members, refreshProfile]);

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
    <SafeAreaView style={styles.container} edges={[]}>
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

          {/* Household name */}
          <View style={styles.row}>
            <Text style={styles.label}>שם משק הבית</Text>
            {editingHouseholdName ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.nameInput}
                  value={householdName}
                  onChangeText={setHouseholdName}
                  placeholder="הבית של כהן"
                  placeholderTextColor={dark.placeholder}
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveHouseholdName}
                  disabled={savingHouseholdName}
                >
                  <Text style={styles.saveBtnText}>
                    {savingHouseholdName ? "..." : "שמור"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setEditingHouseholdName(false)}
                >
                  <Text style={styles.cancelBtnText}>ביטול</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setEditingHouseholdName(true)}>
                <Text style={styles.value}>
                  {householdName || "—"} <Text style={styles.editIcon}>✏️</Text>
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Invite code */}
          <View style={styles.inviteSection}>
            <Text style={styles.label}>קוד הזמנה</Text>
            {inviteCode ? (
              <View style={styles.inviteRow}>
                <TouchableOpacity onPress={handleCopyInvite}>
                  <Text style={styles.inviteCodeText}>
                    {inviteCode} <Text style={styles.copyIcon}>📋</Text>
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.shareBtn}
                  onPress={handleShareInvite}
                >
                  <Text style={styles.shareBtnText}>שתף הזמנה 📤</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.createInviteBtn}
                onPress={handleCreateInvite}
                disabled={creatingInvite}
              >
                <Text style={styles.createInviteBtnText}>
                  {creatingInvite ? "..." : "צור קוד הזמנה ✉️"}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={styles.hint}>
              שתפו את קוד ההזמנה עם בני המשפחה כדי שיצטרפו לאותה רשימה
            </Text>
          </View>

          {/* Members */}
          {members.length > 0 && (
            <View style={styles.membersSection}>
              <Text style={styles.label}>חברי משק הבית ({members.length})</Text>
              {members.map((m) => (
                <View key={m.id} style={styles.memberRow}>
                  <Text style={styles.memberName}>
                    {m.display_name || m.email || "—"}
                  </Text>
                  {m.id === user.id && (
                    <Text style={styles.memberYou}>(את/ה)</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Join another household */}
          <View style={styles.joinSection}>
            <Text style={styles.label}>הצטרפות למשק בית אחר</Text>
            <View style={styles.joinRow}>
              <TextInput
                style={styles.joinInput}
                value={joinCode}
                onChangeText={setJoinCode}
                placeholder="הכניסו קוד הזמנה"
                placeholderTextColor={dark.placeholder}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
              />
              <TouchableOpacity
                style={[
                  styles.joinBtn,
                  !joinCode.trim() && styles.joinBtnDisabled,
                ]}
                onPress={handleJoinHousehold}
                disabled={joining || !joinCode.trim()}
              >
                <Text style={styles.joinBtnText}>
                  {joining ? "..." : "הצטרף"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Leave household */}
          <TouchableOpacity
            style={styles.leaveBtn}
            onPress={handleLeaveHousehold}
            disabled={leaving}
            activeOpacity={0.7}
          >
            <Text style={styles.leaveBtnText}>
              {leaving ? "..." : "🚪 עזוב משק הבית"}
            </Text>
          </TouchableOpacity>
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
                מוסיף אוטומטית מוצרים לעגלה כשהם עומדים להיגמר — בלי שתצטרכו
                לזכור
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
  inviteSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: dark.border,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    flexWrap: "wrap",
  },
  inviteCodeText: {
    fontSize: 22,
    color: dark.accent,
    fontWeight: "800",
    letterSpacing: 3,
  },
  shareBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: dark.success,
    borderRadius: 12,
  },
  shareBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  createInviteBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: dark.accent,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  createInviteBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  leaveBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: dark.error,
    alignSelf: "flex-start",
  },
  leaveBtnText: {
    color: dark.error,
    fontWeight: "700",
    fontSize: 14,
  },
  membersSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: dark.border,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
  },
  memberName: {
    fontSize: 15,
    color: dark.text,
    fontWeight: "500",
  },
  memberYou: {
    fontSize: 13,
    color: dark.textSecondary,
    fontWeight: "400",
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
