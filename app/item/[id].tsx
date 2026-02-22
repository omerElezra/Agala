import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/hooks/useAuth';
import { useShoppingListStore } from '@/src/store/shoppingListStore';
import { dark } from '@/constants/theme';
import type { Database } from '@/src/types/database';
import { CATEGORY_NAMES, getSmartDefaultDays } from '@/src/utils/categoryDetector';

type ShoppingListRow = Database['public']['Tables']['shopping_list']['Row'];
type ProductRow = Database['public']['Tables']['products']['Row'];
type InventoryRuleRow = Database['public']['Tables']['household_inventory_rules']['Row'];

interface PurchaseRecord {
  id: string;
  purchased_at: string | null;
  quantity: number;
}

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  // ── Data state ─────────────────────────────────────────────
  const [item, setItem] = useState<ShoppingListRow | null>(null);
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [rule, setRule] = useState<InventoryRuleRow | null>(null);
  const [history, setHistory] = useState<PurchaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Editable fields ────────────────────────────────────────
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editEmaDays, setEditEmaDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editEmaDaysManual, setEditEmaDaysManual] = useState<number>(7);
  const [creatingRule, setCreatingRule] = useState(false);
  const [resettingAI, setResettingAI] = useState(false);
  const [showManualEdit, setShowManualEdit] = useState(false);
  const [applyingManual, setApplyingManual] = useState(false);
  const [banner, setBanner] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);
  const removeItem = useShoppingListStore((s) => s.removeItem);

  const showBanner = (text: string, type: 'success' | 'error') => {
    setBanner({ text, type });
    setTimeout(() => setBanner(null), 3_000);
  };

  // ── Fetch all data ─────────────────────────────────────────
  useEffect(() => {
    if (!id || !user?.household_id) return;

    (async () => {
      setIsLoading(true);

      // 1. Fetch the shopping list item + product
      const { data: listItem, error: listErr } = await supabase
        .from('shopping_list')
        .select('*, product:products(*)')
        .eq('id', id)
        .single();

      if (listErr || !listItem) {
        console.error('[ItemDetail] fetch item error:', listErr?.message);
        setIsLoading(false);
        return;
      }

      const sl = listItem as ShoppingListRow & { product: ProductRow | null };
      setItem(sl);
      setProduct(sl.product);
      setEditName(sl.product?.name ?? '');
      setEditCategory(sl.product?.category ?? null);
      setEditQuantity(sl.quantity);

      // 2. Fetch inventory rule for this product (time-to-buy data)
      let hasRule = false;
      if (sl.product_id) {
        const { data: ruleData } = await supabase
          .from('household_inventory_rules')
          .select('*')
          .eq('household_id', user.household_id)
          .eq('product_id', sl.product_id)
          .single();

        if (ruleData) {
          hasRule = true;
          const r = ruleData as InventoryRuleRow;
          setRule(r);
          setEditEmaDays(r.ema_days);
        }
      }

      // 3. Fetch purchase history for this product
      const { data: historyData } = await supabase
        .from('shopping_list')
        .select('id, purchased_at, quantity')
        .eq('household_id', user.household_id)
        .eq('product_id', sl.product_id)
        .eq('status', 'purchased')
        .order('purchased_at', { ascending: false })
        .limit(20);

      const purchaseHistory = (historyData ?? []) as PurchaseRecord[];
      setHistory(purchaseHistory);

      // Auto-create rule if none exists
      if (!hasRule && sl.product_id) {
        const dates = purchaseHistory
          .map((h) => (h.purchased_at ? new Date(h.purchased_at).getTime() : null))
          .filter((t): t is number => t !== null)
          .sort((a, b) => a - b);

        // Smart default: use category-based typical buy cycle
        const detectedCategory = sl.product?.category ?? null;
        let emaDays = getSmartDefaultDays(detectedCategory);
        let confidence = 0;
        let status: 'suggest_only' | 'manual_only' = 'suggest_only';

        if (dates.length >= 2) {
          const intervals: number[] = [];
          for (let i = 1; i < dates.length; i++) {
            intervals.push((dates[i]! - dates[i - 1]!) / (1000 * 60 * 60 * 24));
          }
          const alpha = 0.3;
          let ema = intervals[0]!;
          for (let i = 1; i < intervals.length; i++) {
            ema = alpha * intervals[i]! + (1 - alpha) * ema;
          }
          emaDays = Math.max(1, Math.round(ema * 10) / 10);
          confidence = Math.min(100, Math.round(50 + intervals.length * 10));
        }

        const { data: newRule } = await supabase
          .from('household_inventory_rules')
          .insert({
            household_id: user.household_id,
            product_id: sl.product_id,
            ema_days: emaDays,
            confidence_score: confidence,
            auto_add_status: status,
          })
          .select('*')
          .single();

        if (newRule) {
          setRule(newRule as InventoryRuleRow);
          setEditEmaDays(newRule.ema_days);
        }
      }

      setIsLoading(false);
    })();
  }, [id, user?.household_id]);

  // ── Next buy prediction ────────────────────────────────────
  const nextBuyDate = useMemo(() => {
    if (!rule?.last_purchased_at || !rule.ema_days) return null;
    const last = new Date(rule.last_purchased_at);
    const next = new Date(last);
    next.setDate(next.getDate() + Math.round(rule.ema_days));
    return next;
  }, [rule]);

  const nextBuyLabel = useMemo(() => {
    if (!nextBuyDate) return 'אין מספיק נתונים';
    const now = new Date();
    const diffMs = nextBuyDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `לפני ${Math.abs(diffDays)} ימים (איחור)`;
    if (diffDays === 0) return 'היום!';
    if (diffDays === 1) return 'מחר';
    return `בעוד ${diffDays} ימים`;
  }, [nextBuyDate]);

  // ── Save changes ───────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!item || !product) return;
    setSaving(true);

    // Update product name + category
    const updates: { name?: string; category?: string | null } = {};
    if (editName.trim() && editName.trim() !== product.name) {
      updates.name = editName.trim();
    }
    if (editCategory !== product.category) {
      updates.category = editCategory;
    }
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', product.id);

      if (error) {
        showBanner('שגיאה בעדכון המוצר', 'error');
        setSaving(false);
        return;
      }
    }

    // Update quantity on shopping list item
    if (editQuantity !== item.quantity) {
      const { error } = await supabase
        .from('shopping_list')
        .update({ quantity: editQuantity })
        .eq('id', item.id);

      if (error) {
        showBanner('שגיאה בעדכון הכמות', 'error');
        setSaving(false);
        return;
      }
    }

    showBanner('נשמר בהצלחה ✓', 'success');
    setSaving(false);
  }, [item, product, editName, editCategory, editQuantity]);

  // ── Delete item ────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!item) return;

    if (Platform.OS === 'web') {
      // Alert.alert is a no-op on web — use window.confirm
      const ok = window.confirm('האם למחוק את הפריט מהרשימה?');
      if (!ok) return;
      setDeleting(true);
      await removeItem(item.id);
      router.back();
    } else {
      Alert.alert(
        'מחיקת פריט',
        'האם למחוק את הפריט מהרשימה?',
        [
          { text: 'ביטול', style: 'cancel' },
          {
            text: 'מחק',
            style: 'destructive',
            onPress: async () => {
              setDeleting(true);
              await removeItem(item.id);
              router.back();
            },
          },
        ],
      );
    }
  }, [item, removeItem, router]);

  // ── Create inventory rule (time to buy) ────────────────────
  const handleCreateRule = useCallback(async (mode: 'manual' | 'ai') => {
    if (!item || !user?.household_id) return;
    setCreatingRule(true);

    // Smart default based on category instead of hardcoded 7
    const detectedCategory = product?.category ?? null;
    let emaDays = mode === 'manual' ? editEmaDaysManual : getSmartDefaultDays(detectedCategory);
    let confidence = 0;
    let status: 'manual_only' | 'suggest_only' = mode === 'manual' ? 'manual_only' : 'suggest_only';

    if (mode === 'ai' && history.length >= 2) {
      // Compute EMA from purchase history
      const dates = history
        .map((h) => (h.purchased_at ? new Date(h.purchased_at).getTime() : null))
        .filter((t): t is number => t !== null)
        .sort((a, b) => a - b);

      const intervals: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i]! - dates[i - 1]!) / (1000 * 60 * 60 * 24));
      }

      const alpha = 0.3;
      let ema = intervals[0]!;
      for (let i = 1; i < intervals.length; i++) {
        ema = alpha * intervals[i]! + (1 - alpha) * ema;
      }

      emaDays = Math.max(1, Math.round(ema * 10) / 10);
      confidence = Math.min(100, Math.round(50 + intervals.length * 10));
      status = 'suggest_only';
    }

    const { data, error } = await supabase
      .from('household_inventory_rules')
      .insert({
        household_id: user.household_id,
        product_id: item.product_id,
        ema_days: emaDays,
        confidence_score: confidence,
        auto_add_status: status,
      })
      .select('*')
      .single();

    if (error) {
      showBanner('שגיאה ביצירת מחזור קנייה', 'error');
    } else if (data) {
      setRule(data as InventoryRuleRow);
      setEditEmaDays(data.ema_days);
      showBanner(
        mode === 'ai'
          ? `🤖 AI חישב מחזור: ${emaDays} ימים ✓`
          : 'מחזור הקנייה נוצר בהצלחה ✓',
        'success',
      );
    }
    setCreatingRule(false);
  }, [item, user?.household_id, editEmaDaysManual, history]);

  // ── Apply manual ema_days change ───────────────────────────
  const handleApplyManual = useCallback(async () => {
    if (!rule || editEmaDays == null || editEmaDays === rule.ema_days) return;
    setApplyingManual(true);

    const { error } = await supabase
      .from('household_inventory_rules')
      .update({ ema_days: editEmaDays, auto_add_status: 'manual_only' })
      .eq('id', rule.id);

    if (error) {
      showBanner('שגיאה בעדכון מחזור הקנייה', 'error');
    } else {
      setRule({ ...rule, ema_days: editEmaDays, auto_add_status: 'manual_only' });
      showBanner(`מחזור עודכן ל-${editEmaDays} ימים ✓`, 'success');
    }
    setApplyingManual(false);
  }, [rule, editEmaDays]);

  // ── Switch to manual mode (toggle) ─────────────────────────
  const handleApplyManualSwitch = useCallback(async () => {
    if (!rule || rule.auto_add_status === 'manual_only') return;

    const { error } = await supabase
      .from('household_inventory_rules')
      .update({ auto_add_status: 'manual_only' })
      .eq('id', rule.id);

    if (error) {
      showBanner('שגיאה במעבר למצב ידני', 'error');
    } else {
      setRule({ ...rule, auto_add_status: 'manual_only' });
      setEditEmaDays(rule.ema_days);
      showBanner('מצב ידני מופעל ✓', 'success');
    }
  }, [rule]);

  // ── Reset to AI control ────────────────────────────────────
  const handleResetToAI = useCallback(async () => {
    if (!rule) return;
    setResettingAI(true);

    // Try to recalculate from history if possible
    const dates = history
      .map((h) => (h.purchased_at ? new Date(h.purchased_at).getTime() : null))
      .filter((t): t is number => t !== null)
      .sort((a, b) => a - b);

    let newEmaDays = rule.ema_days; // fallback: keep current value
    let confidence = rule.confidence_score;
    let infoMsg = '';

    if (dates.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i]! - dates[i - 1]!) / (1000 * 60 * 60 * 24));
      }
      const alpha = 0.3;
      let ema = intervals[0]!;
      for (let i = 1; i < intervals.length; i++) {
        ema = alpha * intervals[i]! + (1 - alpha) * ema;
      }
      newEmaDays = Math.max(1, Math.round(ema * 10) / 10);
      confidence = Math.min(100, Math.round(50 + intervals.length * 10));
      infoMsg = `🤖 AI חישב: כל ${newEmaDays} ימים ✓`;
    } else {
      // Not enough data — keep ema_days, just switch mode
      confidence = Math.max(10, confidence);
      infoMsg = '🤖 AI מופעל — ילמד מהרכישות הבאות ✓';
    }

    const { error } = await supabase
      .from('household_inventory_rules')
      .update({
        ema_days: newEmaDays,
        auto_add_status: 'suggest_only',
        confidence_score: confidence,
      })
      .eq('id', rule.id);

    if (error) {
      showBanner('שגיאה באיפוס לחיזוי AI', 'error');
    } else {
      setRule({ ...rule, ema_days: newEmaDays, auto_add_status: 'suggest_only', confidence_score: confidence });
      setEditEmaDays(newEmaDays);
      setShowManualEdit(false);
      showBanner(infoMsg, 'success');
    }
    setResettingAI(false);
  }, [rule, history]);

  // ── Computed buy-cycle stats from history ───────────────────
  const buyCycleStats = useMemo(() => {
    const dates = history
      .map((h) => (h.purchased_at ? new Date(h.purchased_at).getTime() : null))
      .filter((t): t is number => t !== null)
      .sort((a, b) => a - b);

    if (dates.length < 2) return null;

    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push((dates[i]! - dates[i - 1]!) / (1000 * 60 * 60 * 24));
    }

    const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const min = Math.min(...intervals);
    const max = Math.max(...intervals);
    const totalQty = history.reduce((s, h) => s + h.quantity, 0);

    return {
      purchaseCount: history.length,
      totalQty,
      avgDays: Math.round(avg * 10) / 10,
      minDays: Math.round(min * 10) / 10,
      maxDays: Math.round(max * 10) / 10,
      intervalCount: intervals.length,
    };
  }, [history]);

  // ── Format date for history ────────────────────────────────
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('he-IL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ── Loading / Error states ─────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={dark.accent} />
      </View>
    );
  }

  if (!item || !product) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>הפריט לא נמצא</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: product.name,
          headerStyle: { backgroundColor: dark.surface },
          headerTintColor: dark.text,
          headerTitleStyle: { fontWeight: '700' },
        }}
      />

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

          {/* ── Product Name ──────────────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>שם המוצר</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="שם המוצר"
              placeholderTextColor={dark.placeholder}
            />
            {/* Category picker */}
            <Text style={styles.categoryLabel}>קטגוריה</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              <View style={styles.categoryRow}>
                <TouchableOpacity
                  style={[
                    styles.categoryChip,
                    editCategory === null && styles.categoryChipActive,
                  ]}
                  onPress={() => setEditCategory(null)}
                >
                  <Text style={[
                    styles.categoryChipText,
                    editCategory === null && styles.categoryChipTextActive,
                  ]}>ללא</Text>
                </TouchableOpacity>
                {CATEGORY_NAMES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryChip,
                      editCategory === cat && styles.categoryChipActive,
                    ]}
                    onPress={() => setEditCategory(cat)}
                  >
                    <Text style={[
                      styles.categoryChipText,
                      editCategory === cat && styles.categoryChipTextActive,
                    ]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* ── Quantity ───────────────────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>כמות</Text>
            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setEditQuantity((q) => Math.max(1, q - 1))}
              >
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{editQuantity}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setEditQuantity((q) => q + 1)}
              >
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Time to Buy (EMA) ─────────────────────────────── */}
          {rule && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {rule.auto_add_status === 'manual_only'
                ? 'מחזור קנייה — ✏️ ידני'
                : 'מחזור קנייה — 🤖 AI'}
            </Text>

            {/* AI / Manual toggle switch */}
            <View style={styles.modeSwitchRow}>
              <TouchableOpacity
                style={[
                  styles.modeSwitchBtn,
                  rule.auto_add_status !== 'manual_only' && styles.modeSwitchBtnActive,
                ]}
                onPress={() => {
                  if (rule.auto_add_status === 'manual_only') {
                    handleResetToAI();
                  }
                }}
                disabled={resettingAI || rule.auto_add_status !== 'manual_only'}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.modeSwitchText,
                  rule.auto_add_status !== 'manual_only' && styles.modeSwitchTextActive,
                ]}>{resettingAI ? '...' : '🤖 AI'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeSwitchBtn,
                  rule.auto_add_status === 'manual_only' && styles.modeSwitchBtnActive,
                ]}
                onPress={() => {
                  if (rule.auto_add_status !== 'manual_only') {
                    setShowManualEdit(true);
                    setEditEmaDays(rule.ema_days);
                    handleApplyManualSwitch();
                  }
                }}
                disabled={rule.auto_add_status === 'manual_only'}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.modeSwitchText,
                  rule.auto_add_status === 'manual_only' && styles.modeSwitchTextActive,
                ]}>✏️ ידני</Text>
              </TouchableOpacity>
            </View>

            {/* AI mode — show info */}
            {rule.auto_add_status !== 'manual_only' && (
              <View style={styles.aiInfoBox}>
                <Text style={styles.aiInfoDesc}>
                  {buyCycleStats
                    ? `🤖 AI חישב: כל ${rule.ema_days.toFixed(1)} ימים (לפי ${buyCycleStats.purchaseCount} רכישות)`
                    : `🤖 AI לומד — עדיין אין מספיק רכישות.\nכרגע מוגדר ${rule.ema_days} ימים. ככל שתקנו, החיזוי ישתפר.`}
                </Text>
              </View>
            )}

            {/* Stats from purchase history */}
            {buyCycleStats && rule.auto_add_status !== 'manual_only' && (
              <View style={styles.aiStatsBox}>
                <Text style={styles.aiStatsTitle}>📊 סטטיסטיקות</Text>
                <View style={styles.aiStatGrid}>
                  <View style={styles.aiStatItem}>
                    <Text style={styles.aiStatNum}>{buyCycleStats.purchaseCount}</Text>
                    <Text style={styles.aiStatLabel}>רכישות</Text>
                  </View>
                  <View style={styles.aiStatItem}>
                    <Text style={styles.aiStatNum}>{buyCycleStats.avgDays}</Text>
                    <Text style={styles.aiStatLabel}>ממוצע ימים</Text>
                  </View>
                  <View style={styles.aiStatItem}>
                    <Text style={styles.aiStatNum}>{buyCycleStats.minDays}–{buyCycleStats.maxDays}</Text>
                    <Text style={styles.aiStatLabel}>טווח</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Manual mode — days picker */}
            {rule.auto_add_status === 'manual_only' && (
              <>
                <View style={styles.aiInfoBox}>
                  <Text style={styles.aiInfoDesc}>
                    ✏️ מחזור ידני: כל {rule.ema_days.toFixed(1)} ימים
                  </Text>
                </View>
                <View style={styles.emaEditRowCompact}>
                  <Text style={styles.emaEditLabelCompact}>ימים:</Text>
                  <TouchableOpacity
                    style={styles.qtyBtnTiny}
                    onPress={() =>
                      setEditEmaDays((d) => Math.max(1, (d ?? rule.ema_days) - 1))
                    }
                  >
                    <Text style={styles.qtyBtnTextTiny}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.emaValueCompact}>
                    {editEmaDays ?? rule.ema_days}
                  </Text>
                  <TouchableOpacity
                    style={styles.qtyBtnTiny}
                    onPress={() =>
                      setEditEmaDays((d) => (d ?? rule.ema_days) + 1)
                    }
                  >
                    <Text style={styles.qtyBtnTextTiny}>+</Text>
                  </TouchableOpacity>

                  {/* Apply button */}
                  <TouchableOpacity
                    style={[
                      styles.applyBtn,
                      (editEmaDays == null || editEmaDays === rule.ema_days || applyingManual) &&
                        styles.applyBtnDisabled,
                    ]}
                    onPress={handleApplyManual}
                    disabled={editEmaDays == null || editEmaDays === rule.ema_days || applyingManual}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.applyBtnText}>
                      {applyingManual ? '...' : 'אישור'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
          )}

          {/* ── Next Buy Prediction ────────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>מתי לקנות שוב?</Text>
            <View style={styles.predictionBox}>
              <Text style={styles.predictionEmoji}>📅</Text>
              <View>
                <Text style={styles.predictionLabel}>{nextBuyLabel}</Text>
                {nextBuyDate && (
                  <Text style={styles.predictionDate}>
                    {nextBuyDate.toLocaleDateString('he-IL', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </Text>
                )}
              </View>
            </View>
            {rule?.last_purchased_at && (
              <Text style={styles.lastPurchased}>
                קנייה אחרונה: {formatDate(rule.last_purchased_at)}
              </Text>
            )}
          </View>

          {/* ── Purchase History ────────────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              היסטוריית רכישות ({history.length})
            </Text>
            {history.length === 0 ? (
              <Text style={styles.noDataText}>אין היסטוריית רכישות</Text>
            ) : (
              history.map((h) => (
                <View key={h.id} style={styles.historyRow}>
                  <Text style={styles.historyDate}>
                    {formatDate(h.purchased_at)}
                  </Text>
                  {h.quantity > 1 && (
                    <Text style={styles.historyQty}>×{h.quantity}</Text>
                  )}
                </View>
              ))
            )}
          </View>

          {/* ── Save Button ────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>
              {saving ? 'שומר...' : 'שמור שינויים'}
            </Text>
          </TouchableOpacity>

          {/* ── Delete Button ──────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.deleteBtn, deleting && styles.saveBtnDisabled]}
            onPress={handleDelete}
            disabled={deleting}
            activeOpacity={0.8}
          >
            <Text style={styles.deleteBtnText}>
              {deleting ? 'מוחק...' : '🗑️ מחק פריט'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </>
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: dark.background,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  errorText: {
    fontSize: 16,
    color: dark.error,
    marginBottom: 16,
    textAlign: 'right',
  },
  backBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: dark.surface,
    borderRadius: 10,
  },
  backBtnText: {
    color: dark.accent,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'right',
  },

  // ── Banner ────────────────────────────────────────────────
  banner: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  bannerSuccess: {
    backgroundColor: dark.successBg,
    borderWidth: 1,
    borderColor: dark.success,
  },
  bannerError: {
    backgroundColor: dark.errorBg,
    borderWidth: 1,
    borderColor: dark.error,
  },
  bannerText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: dark.text,
  },

  // ── Cards ─────────────────────────────────────────────────
  card: {
    backgroundColor: dark.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: dark.borderLight,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: dark.textSecondary,
    marginBottom: 12,
    textAlign: 'right',
  },
  category: {
    fontSize: 13,
    color: dark.textSecondary,
    marginTop: 8,
    textAlign: 'right',
  },
  categoryLabel: {
    fontSize: 13,
    color: dark.textMuted,
    marginTop: 10,
    marginBottom: 6,
    textAlign: 'right',
    fontWeight: '600',
  },
  categoryScroll: {
    maxHeight: 36,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 6,
    paddingEnd: 2,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: dark.surfaceAlt,
    borderWidth: 1,
    borderColor: dark.borderLight,
  },
  categoryChipActive: {
    backgroundColor: dark.accent,
    borderColor: dark.accent,
  },
  categoryChipText: {
    fontSize: 12,
    color: dark.textMuted,
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  // ── Input ─────────────────────────────────────────────────
  input: {
    fontSize: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: dark.inputBorder,
    borderRadius: 10,
    backgroundColor: dark.input,
    color: dark.inputText,
    textAlign: 'right',
  },

  // ── Quantity ──────────────────────────────────────────────
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: dark.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnSmall: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: dark.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '700',
    lineHeight: 22,
  },
  qtyValue: {
    fontSize: 28,
    fontWeight: '700',
    color: dark.text,
    minWidth: 40,
    textAlign: 'center',
  },

  // ── Stats ─────────────────────────────────────────────────
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: dark.borderLight,
  },
  statLabel: {
    fontSize: 14,
    color: dark.textSecondary,
    textAlign: 'right',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: dark.text,
    textAlign: 'right',
  },

  // ── EMA edit (compact) ────────────────────────────────────
  emaEditRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: dark.borderLight,
  },
  emaEditLabelCompact: {
    fontSize: 12,
    color: dark.textMuted,
    fontWeight: '600',
    textAlign: 'right',
  },
  emaValueCompact: {
    fontSize: 15,
    fontWeight: '700',
    color: dark.text,
    minWidth: 24,
    textAlign: 'center',
  },
  qtyBtnTiny: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: dark.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dark.border,
  },
  qtyBtnTextTiny: {
    fontSize: 15,
    color: dark.textSecondary,
    fontWeight: '700',
    lineHeight: 17,
  },
  noDataText: {
    fontSize: 14,
    color: dark.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  overrideHint: {
    fontSize: 12,
    color: dark.warning,
    textAlign: 'center',
    marginTop: 8,
  },

  // ── AI info box ───────────────────────────────────────────
  aiInfoBox: {
    backgroundColor: dark.infoBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: dark.accent,
  },
  aiInfoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: dark.accent,
    textAlign: 'right',
    marginBottom: 4,
  },
  aiInfoDesc: {
    fontSize: 12,
    color: dark.textSecondary,
    textAlign: 'right',
    lineHeight: 18,
  },

  // ── Confidence bar ────────────────────────────────────────
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confidenceBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: dark.surfaceAlt,
    overflow: 'hidden',
  },
  confidenceBarFill: {
    height: 6,
    borderRadius: 3,
  },

  // ── AI stats box ──────────────────────────────────────────
  aiStatsBox: {
    backgroundColor: dark.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  aiStatsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: dark.textSecondary,
    textAlign: 'right',
    marginBottom: 10,
  },
  aiStatGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  aiStatItem: {
    alignItems: 'center',
    minWidth: 60,
  },
  aiStatNum: {
    fontSize: 18,
    fontWeight: '700',
    color: dark.accent,
  },
  aiStatLabel: {
    fontSize: 11,
    color: dark.textMuted,
    marginTop: 2,
  },

  // ── Reset to AI button ────────────────────────────────────
  resetAIBtn: {
    backgroundColor: dark.infoBg,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: dark.accent,
  },
  resetAIBtnText: {
    color: dark.accent,
    fontSize: 15,
    fontWeight: '700',
  },

  // ── Mode switch (AI / Manual) ─────────────────────────────
  modeSwitchRow: {
    flexDirection: 'row',
    marginTop: 12,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: dark.border,
  },
  modeSwitchBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: dark.surfaceAlt,
  },
  modeSwitchBtnActive: {
    backgroundColor: dark.accent,
  },
  modeSwitchText: {
    fontSize: 13,
    fontWeight: '600',
    color: dark.textMuted,
  },
  modeSwitchTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  // ── Apply button (inline) ────────────────────────────────
  applyBtn: {
    backgroundColor: dark.success,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginStart: 6,
  },
  applyBtnDisabled: {
    opacity: 0.4,
  },
  applyBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Prediction ────────────────────────────────────────────
  predictionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: dark.surfaceAlt,
    borderRadius: 12,
    padding: 14,
  },
  predictionEmoji: {
    fontSize: 28,
  },
  predictionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: dark.accent,
    textAlign: 'right',
  },
  predictionDate: {
    fontSize: 13,
    color: dark.textSecondary,
    marginTop: 2,
    textAlign: 'right',
  },
  lastPurchased: {
    fontSize: 13,
    color: dark.textMuted,
    marginTop: 10,
    textAlign: 'right',
  },

  // ── History ───────────────────────────────────────────────
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: dark.borderLight,
  },
  historyDate: {
    fontSize: 14,
    color: dark.text,
    textAlign: 'right',
  },
  historyQty: {
    fontSize: 13,
    color: dark.accent,
    fontWeight: '600',
  },

  // ── Create rule button ────────────────────────────────────
  createRuleBtn: {
    backgroundColor: dark.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  createRuleBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // ── Save button ───────────────────────────────────────────
  saveBtn: {
    backgroundColor: dark.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Delete button ─────────────────────────────────────────
  deleteBtn: {
    backgroundColor: dark.errorBg,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: dark.error,
  },
  deleteBtnText: {
    color: dark.error,
    fontSize: 16,
    fontWeight: '700',
  },
});
