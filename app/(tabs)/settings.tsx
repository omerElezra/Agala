import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/hooks/useAuth';
import { dark } from '@/constants/theme';
import { detectCategory } from '@/src/utils/categoryDetector';
import { useShoppingListStore } from '@/src/store/shoppingListStore';

export default function SettingsScreen() {
  const { user, signOut, isLoading } = useAuth();
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // ── Join household ─────────────────────────────────────────
  const [joinId, setJoinId] = useState('');
  const [joining, setJoining] = useState(false);

  // ── CSV import ─────────────────────────────────────────────
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { addItem, fetchList } = useShoppingListStore();

  const showBanner = (text: string, type: 'success' | 'error') => {
    setBanner({ text, type });
    setTimeout(() => setBanner(null), 3_000);
  };

  // ── Update display name ────────────────────────────────────
  const handleSaveName = useCallback(async () => {
    if (!user || !newName.trim()) return;
    setSaving(true);

    const { error } = await supabase
      .from('users')
      .update({ display_name: newName.trim() })
      .eq('id', user.id);

    if (error) {
      showBanner('שגיאה בעדכון השם', 'error');
    } else {
      showBanner('השם עודכן בהצלחה', 'success');
      setEditingName(false);
    }
    setSaving(false);
  }, [user, newName]);

  // ── Copy household ID ──────────────────────────────────────
  const handleCopyHousehold = useCallback(async () => {
    if (!user?.household_id) return;
    try {
      await Clipboard.setStringAsync(user.household_id);
      showBanner('הקוד הועתק ללוח', 'success');
    } catch {
      showBanner('שגיאה בהעתקה', 'error');
    }
  }, [user?.household_id]);

  // ── Join another household ─────────────────────────────────
  const handleJoinHousehold = useCallback(async () => {
    if (!user || !joinId.trim()) return;
    setJoining(true);

    // Verify the household exists
    const { data: hh, error: hhErr } = await supabase
      .from('households')
      .select('id')
      .eq('id', joinId.trim())
      .single();

    if (hhErr || !hh) {
      showBanner('משק בית לא נמצא — בדקו את הקוד', 'error');
      setJoining(false);
      return;
    }

    // Update user to new household
    const { error: updateErr } = await supabase
      .from('users')
      .update({ household_id: joinId.trim() })
      .eq('id', user.id);

    if (updateErr) {
      showBanner('שגיאה בהצטרפות למשק הבית', 'error');
    } else {
      showBanner('הצטרפת למשק הבית בהצלחה! הפעילו מחדש', 'success');
      setJoinId('');
    }
    setJoining(false);
  }, [user, joinId]);

  // ── CSV import handler ─────────────────────────────────────
  const handleCsvImport = useCallback(async (csvText: string) => {
    if (!user?.household_id) return;
    setImporting(true);
    setImportResult(null);

    try {
      // Parse CSV: support "name,quantity" or just "name" per line
      const lines = csvText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      // Skip header row if it looks like one
      const firstLine = lines[0]?.toLowerCase() ?? '';
      const startIdx =
        firstLine.includes('name') || firstLine.includes('שם') || firstLine.includes('product')
          ? 1
          : 0;

      let added = 0;
      let skipped = 0;

      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i]!.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
        const name = parts[0];
        if (!name || name.length < 1) continue;

        const quantity = parts[1] ? parseInt(parts[1], 10) || 1 : 1;
        const category = detectCategory(name);

        // Upsert product
        const { data: existingProduct } = await supabase
          .from('products')
          .select('id')
          .eq('name', name)
          .maybeSingle();

        let productId: string;
        if (existingProduct) {
          productId = existingProduct.id;
        } else {
          const { data: newProduct, error: prodErr } = await supabase
            .from('products')
            .insert({ name, category })
            .select('id')
            .single();

          if (prodErr || !newProduct) {
            skipped++;
            continue;
          }
          productId = newProduct.id;
        }

        // Add to shopping list
        const result = addItem(productId, user.household_id, quantity);
        if (result === 'added') {
          added++;
        } else {
          skipped++;
        }
      }

      // Refresh list to get real IDs
      await fetchList(user.household_id);

      const msg = `\u2705 יובאו ${added} פריטים` + (skipped > 0 ? ` (דולגו ${skipped})` : '');
      setImportResult(msg);
      showBanner(msg, 'success');
    } catch (err) {
      console.error('[csv-import]', err);
      showBanner('שגיאה בייבוא הקובץ', 'error');
    } finally {
      setImporting(false);
    }
  }, [user, addItem, fetchList]);

  const handleFileSelect = useCallback(() => {
    if (Platform.OS === 'web') {
      // Create a hidden file input for web
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,text/csv';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const text = ev.target?.result;
          if (typeof text === 'string') {
            handleCsvImport(text);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    } else {
      // Mobile: prompt to paste CSV text
      Alert.alert(
        'ייבוא מ-CSV',
        'העתיקו את תוכן ה-CSV ללוח (שם מוצר בכל שורה) ולחצו "ייבא מלוח"',
        [
          { text: 'ביטול', style: 'cancel' },
          {
            text: 'ייבא מלוח',
            onPress: async () => {
              try {
                const text = await Clipboard.getStringAsync();
                if (text && text.trim().length > 0) {
                  handleCsvImport(text);
                } else {
                  showBanner('הלוח ריק', 'error');
                }
              } catch {
                showBanner('שגיאה בקריאת הלוח', 'error');
              }
            },
          },
        ],
      );
    }
  }, [handleCsvImport]);

  if (isLoading || !user) return null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Banner */}
        {banner && (
          <View
            style={[
              styles.banner,
              banner.type === 'success' ? styles.bannerSuccess : styles.bannerError,
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
                  placeholder={user.display_name ?? ''}
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveName}
                  disabled={saving}
                >
                  <Text style={styles.saveBtnText}>
                    {saving ? '...' : 'שמור'}
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
                  setNewName(user.display_name ?? '');
                  setEditingName(true);
                }}
              >
                <Text style={styles.value}>
                  {user.display_name || '—'}{' '}
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
                {user.household_id?.slice(0, 8)}…{' '}
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
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.joinBtn, !joinId.trim() && styles.joinBtnDisabled]}
                onPress={handleJoinHousehold}
                disabled={joining || !joinId.trim()}
              >
                <Text style={styles.joinBtnText}>
                  {joining ? '...' : 'הצטרף'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── CSV Import Section ──────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ייבוא פריטים</Text>
          <Text style={styles.hint}>
            ייבאו רשימת קניות מקובץ CSV.{'\n'}
            פורמט: שם מוצר בכל שורה, או שם,כמות
          </Text>

          <View style={styles.csvExample}>
            <Text style={styles.csvExampleTitle}>דוגמה:</Text>
            <Text style={styles.csvExampleText}>
              חלב{'\n'}ביצים,2{'\n'}לחם{'\n'}גבינה צהובה,1
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.importBtn, importing && styles.importBtnDisabled]}
            onPress={handleFileSelect}
            disabled={importing}
          >
            <Text style={styles.importBtnText}>
              {importing ? 'מייבא...' : '📥 ייבוא מ-CSV'}
            </Text>
          </TouchableOpacity>

          {importResult && (
            <Text style={styles.importResult}>{importResult}</Text>
          )}
        </View>

        {/* ── App Info Section ─────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>אודות</Text>
          <View style={styles.row}>
            <Text style={styles.label}>גרסה</Text>
            <Text style={styles.value}>1.0.0</Text>
          </View>
        </View>

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
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
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
    fontWeight: '800',
    color: dark.accent,
    marginBottom: 14,
    textAlign: 'right',
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
    textAlign: 'right',
    fontWeight: '600',
  },
  value: {
    fontSize: 16,
    color: dark.text,
    textAlign: 'right',
    fontWeight: '500',
  },
  editIcon: {
    fontSize: 14,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    textAlign: 'right',
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: dark.accent,
    borderRadius: 12,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
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
    fontWeight: '700',
  },
  copyIcon: {
    fontSize: 14,
  },
  hint: {
    fontSize: 13,
    color: dark.textSecondary,
    marginTop: 8,
    lineHeight: 20,
    textAlign: 'right',
  },
  joinSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: dark.border,
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  signOutBtn: {
    backgroundColor: dark.surface,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: dark.error,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '700',
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
    fontWeight: '800',
    color: dark.textSecondary,
    marginBottom: 4,
    textAlign: 'right',
  },
  csvExampleText: {
    fontSize: 13,
    color: dark.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
    textAlign: 'right',
  },
  importBtn: {
    backgroundColor: dark.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  importBtnDisabled: {
    backgroundColor: dark.surfaceAlt,
  },
  importBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  importResult: {
    fontSize: 14,
    color: dark.success,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '700',
  },
});
