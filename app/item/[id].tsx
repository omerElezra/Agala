import { dark } from "@/constants/theme";
import { useAuth } from "@/src/hooks/useAuth";
import { supabase } from "@/src/lib/supabase";
import { useShoppingListStore } from "@/src/store/shoppingListStore";
import type { Database } from "@/src/types/database";
import {
    CATEGORIES,
    getSmartDefaultDays,
    normalizeCategory,
} from "@/src/utils/categoryDetector";
import { Ionicons } from "@expo/vector-icons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ShoppingListRow = Database["public"]["Tables"]["shopping_list"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type InventoryRuleRow =
  Database["public"]["Tables"]["household_inventory_rules"]["Row"];

interface PurchaseRecord {
  id: string;
  purchased_at: string | null;
  quantity: number;
}

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const categoryScrollRef = useRef<ScrollView>(null);

  // ── Data state ─────────────────────────────────────────────
  const [item, setItem] = useState<ShoppingListRow | null>(null);
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [rule, setRule] = useState<InventoryRuleRow | null>(null);
  const [history, setHistory] = useState<PurchaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Editable fields ────────────────────────────────────────
  const [editName, setEditName] = useState("");
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
    type: "success" | "error";
  } | null>(null);
  const removeItem = useShoppingListStore((s) => s.removeItem);

  const showBanner = (text: string, type: "success" | "error") => {
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
        .from("shopping_list")
        .select("*, product:products(*)")
        .eq("id", id)
        .single();

      if (listErr || !listItem) {
        console.error("[ItemDetail] fetch item error:", listErr?.message);
        setIsLoading(false);
        return;
      }

      const sl = listItem as ShoppingListRow & { product: ProductRow | null };
      setItem(sl);
      setProduct(sl.product);
      setEditName(sl.product?.name ?? "");
      setEditCategory(
        sl.product?.category ? normalizeCategory(sl.product.category) : null,
      );
      setEditQuantity(sl.quantity);

      // 2. Fetch inventory rule for this product (time-to-buy data)
      let hasRule = false;
      if (sl.product_id) {
        const { data: ruleData } = await supabase
          .from("household_inventory_rules")
          .select("*")
          .eq("household_id", user.household_id)
          .eq("product_id", sl.product_id)
          .single();

        if (ruleData) {
          hasRule = true;
          const r = ruleData as InventoryRuleRow;
          setRule(r);
          setEditEmaDays(r.ema_days);
        }
      }

      // 3. Fetch purchase history for this product from purchase_history table
      const { data: historyData } = await supabase
        .from("purchase_history")
        .select("id, purchased_at, quantity")
        .eq("household_id", user.household_id)
        .eq("product_id", sl.product_id)
        .order("purchased_at", { ascending: false })
        .limit(20);

      const purchaseHistory = (historyData ?? []) as PurchaseRecord[];
      setHistory(purchaseHistory);

      // Auto-create rule if none exists
      if (!hasRule && sl.product_id) {
        // ema_days is always per 1 item — normalise intervals by qty
        const sorted = purchaseHistory
          .filter((h) => h.purchased_at)
          .map((h) => ({
            ts: new Date(h.purchased_at!).getTime(),
            qty: h.quantity || 1,
          }))
          .sort((a, b) => a.ts - b.ts);

        // Smart default: use category-based typical buy cycle
        const detectedCategory = sl.product?.category ?? null;
        let emaDays = getSmartDefaultDays(detectedCategory);
        let confidence = 0;
        let status: "suggest_only" | "manual_only" = "suggest_only";

        if (sorted.length >= 2) {
          const intervals: number[] = [];
          for (let i = 1; i < sorted.length; i++) {
            const rawDays =
              (sorted[i]!.ts - sorted[i - 1]!.ts) / (1000 * 60 * 60 * 24);
            intervals.push(rawDays / sorted[i - 1]!.qty); // per 1 item
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
          .from("household_inventory_rules")
          .insert({
            household_id: user.household_id,
            product_id: sl.product_id,
            ema_days: emaDays,
            confidence_score: confidence,
            auto_add_status: status,
          })
          .select("*")
          .single();

        if (newRule) {
          setRule(newRule as InventoryRuleRow);
          setEditEmaDays(newRule.ema_days);
        }
      }

      setIsLoading(false);
    })();
  }, [id, user?.household_id]);

  const purchaseDates = useMemo(() => {
    return history
      .map((h) => (h.purchased_at ? new Date(h.purchased_at).getTime() : null))
      .filter((t): t is number => t !== null)
      .sort((a, b) => a - b);
  }, [history]);

  // ema_days is always per 1 item.
  // Each raw interval is divided by the quantity bought at the start
  // of that interval so the cycle represents a single-unit consumption rate.
  const historyEmaDays = useMemo(() => {
    const sorted = history
      .filter((h) => h.purchased_at)
      .map((h) => ({
        ts: new Date(h.purchased_at!).getTime(),
        qty: h.quantity || 1,
      }))
      .sort((a, b) => a.ts - b.ts);

    if (sorted.length < 2) return null;

    // Per-item intervals: raw_days / qty bought (consumed during interval)
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const rawDays =
        (sorted[i]!.ts - sorted[i - 1]!.ts) / (1000 * 60 * 60 * 24);
      intervals.push(rawDays / sorted[i - 1]!.qty);
    }

    const alpha = 0.3;
    let ema = intervals[0]!;
    for (let i = 1; i < intervals.length; i++) {
      ema = alpha * intervals[i]! + (1 - alpha) * ema;
    }
    return Math.max(1, ema);
  }, [history]);

  const lastPurchaseMs = useMemo(() => {
    if (purchaseDates.length > 0)
      return purchaseDates[purchaseDates.length - 1]!;
    if (rule?.last_purchased_at)
      return new Date(rule.last_purchased_at).getTime();
    return null;
  }, [purchaseDates, rule?.last_purchased_at]);

  // effectiveCycleDays = base EMA cycle per 1 item (single unit).
  // Multiply by lastPurchaseQuantity for the actual expected interval.
  const effectiveCycleDays = useMemo(() => {
    if (rule?.auto_add_status === "manual_only") {
      return rule?.ema_days && rule.ema_days > 0 ? rule.ema_days : null;
    }

    if (rule?.ema_days && rule.ema_days > 0) return rule.ema_days;
    if (historyEmaDays) return historyEmaDays;
    return null;
  }, [rule?.auto_add_status, rule?.ema_days, historyEmaDays]);

  // ── Last purchase quantity (for quantity × cycle modifier) ──
  const lastPurchaseQuantity = useMemo(() => {
    if (history.length === 0) return 1;
    // history is sorted desc (most recent first)
    return history[0]?.quantity ?? 1;
  }, [history]);

  // ── Next buy prediction ────────────────────────────────────
  // NextDate = lastPurchase + (ema_days × quantity)
  // Buying 3 units means they last 3× longer before next purchase.
  const nextBuyDate = useMemo(() => {
    if (!lastPurchaseMs || !effectiveCycleDays) return null;
    const adjustedDays = effectiveCycleDays * lastPurchaseQuantity;
    const next = new Date(lastPurchaseMs);
    next.setDate(next.getDate() + Math.round(adjustedDays));
    return next;
  }, [lastPurchaseMs, effectiveCycleDays, lastPurchaseQuantity]);

  const nextBuyLabel = useMemo(() => {
    if (!nextBuyDate) return "אין מספיק נתונים";
    const now = new Date();
    const diffMs = nextBuyDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `לפני ${Math.abs(diffDays)} ימים (איחור)`;
    if (diffDays === 0) return "היום!";
    if (diffDays === 1) return "מחר";
    return `בעוד ${diffDays} ימים`;
  }, [nextBuyDate]);

  // ── Progress bar ratio (elapsed / adjusted frequency, clamped 0–100%) ──
  const progressRatio = useMemo(() => {
    if (!lastPurchaseMs || !effectiveCycleDays || effectiveCycleDays <= 0)
      return null;
    const adjustedDays = effectiveCycleDays * lastPurchaseQuantity;
    const elapsedDays = (Date.now() - lastPurchaseMs) / (1000 * 60 * 60 * 24);
    return Math.min(1, Math.max(0, elapsedDays / adjustedDays));
  }, [lastPurchaseMs, effectiveCycleDays, lastPurchaseQuantity]);

  const progressColor = useMemo(() => {
    if (progressRatio === null) return dark.accent;
    if (progressRatio >= 1) return dark.error; // overdue
    if (progressRatio >= 0.8) return dark.warning; // close to due
    return dark.secondary; // on track
  }, [progressRatio]);

  const depletionPercent = useMemo(() => {
    if (progressRatio === null) return null;
    return Math.round(progressRatio * 100);
  }, [progressRatio]);

  // ── Save changes ───────────────────────────────────────────
  const fetchList = useShoppingListStore((s) => s.fetchList);

  const handleSave = useCallback(async () => {
    if (!item || !product) return;
    setSaving(true);

    let productToUse = product;

    // Update product name + category
    const wantNameChange = editName.trim() && editName.trim() !== product.name;
    const wantCategoryChange = editCategory !== product.category;

    if (wantNameChange || wantCategoryChange) {
      // If the product is global (not owned by this household), we must
      // create a new custom product and re-link the shopping list item.
      // RLS blocks updates to products not owned by the user's household.
      const isOwnProduct =
        product.is_custom &&
        product.created_by_household === user?.household_id;

      if (isOwnProduct) {
        // Direct update on own custom product
        const updates: { name?: string; category?: string | null } = {};
        if (wantNameChange) updates.name = editName.trim();
        if (wantCategoryChange) updates.category = editCategory;

        const { data: updatedProduct, error } = await supabase
          .from("products")
          .update(updates)
          .eq("id", product.id)
          .select()
          .single();

        if (error || !updatedProduct) {
          showBanner("שגיאה בעדכון המוצר", "error");
          setSaving(false);
          return;
        }
        productToUse = updatedProduct as ProductRow;
      } else {
        // Global or foreign product → create a new custom product,
        // then re-point the shopping list item to it.
        const { data: newProduct, error: createErr } = await supabase
          .from("products")
          .insert({
            name: wantNameChange ? editName.trim() : product.name,
            category: wantCategoryChange ? editCategory : product.category,
            is_custom: true,
            created_by_household: user?.household_id ?? null,
          })
          .select()
          .single();

        if (createErr || !newProduct) {
          showBanner("שגיאה ביצירת מוצר מותאם", "error");
          setSaving(false);
          return;
        }

        // Re-link shopping list item to the new product
        const { error: relinkErr } = await supabase
          .from("shopping_list")
          .update({ product_id: newProduct.id })
          .eq("id", item.id)
          .select()
          .single();

        if (relinkErr) {
          showBanner("שגיאה בעדכון הקישור למוצר", "error");
          setSaving(false);
          return;
        }

        productToUse = newProduct as ProductRow;
      }
    }

    // Update quantity on shopping list item
    if (editQuantity !== item.quantity) {
      const { data: updatedItem, error } = await supabase
        .from("shopping_list")
        .update({ quantity: editQuantity })
        .eq("id", item.id)
        .select()
        .single();

      if (error || !updatedItem) {
        showBanner("שגיאה בעדכון הכמות", "error");
        setSaving(false);
        return;
      }
    }

    // Refresh the store so the main list reflects the changes
    if (user?.household_id) {
      await fetchList(user.household_id);
    }

    showBanner("השינויים נשמרו בהצלחה ✓", "success");
    setSaving(false);
    // Short delay so user sees success banner before navigating back
    setTimeout(() => router.back(), 600);
  }, [
    item,
    product,
    editName,
    editCategory,
    editQuantity,
    user?.household_id,
    fetchList,
    router,
  ]);

  // ── Delete item ────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!item) return;

    if (Platform.OS === "web") {
      // Alert.alert is a no-op on web — use window.confirm
      const ok = window.confirm("האם למחוק את הפריט מהרשימה?");
      if (!ok) return;
      setDeleting(true);
      await removeItem(item.id);
      router.back();
    } else {
      Alert.alert("מחיקת פריט", "האם למחוק את הפריט מהרשימה?", [
        { text: "ביטול", style: "cancel" },
        {
          text: "מחק",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            await removeItem(item.id);
            router.back();
          },
        },
      ]);
    }
  }, [item, removeItem, router]);

  // ── Create inventory rule (time to buy) ────────────────────
  const handleCreateRule = useCallback(
    async (mode: "manual" | "ai") => {
      if (!item || !user?.household_id) return;
      setCreatingRule(true);

      // Smart default based on category instead of hardcoded 7
      const detectedCategory = product?.category ?? null;
      let emaDays =
        mode === "manual"
          ? editEmaDaysManual
          : getSmartDefaultDays(detectedCategory);
      let confidence = 0;
      let status: "manual_only" | "suggest_only" =
        mode === "manual" ? "manual_only" : "suggest_only";

      if (mode === "ai" && history.length >= 2) {
        // Per-item EMA: normalise each interval by quantity bought
        const sorted = history
          .filter((h) => h.purchased_at)
          .map((h) => ({
            ts: new Date(h.purchased_at!).getTime(),
            qty: h.quantity || 1,
          }))
          .sort((a, b) => a.ts - b.ts);

        if (sorted.length >= 2) {
          const intervals: number[] = [];
          for (let i = 1; i < sorted.length; i++) {
            const rawDays =
              (sorted[i]!.ts - sorted[i - 1]!.ts) / (1000 * 60 * 60 * 24);
            intervals.push(rawDays / sorted[i - 1]!.qty); // per 1 item
          }

          const alpha = 0.3;
          let ema = intervals[0]!;
          for (let i = 1; i < intervals.length; i++) {
            ema = alpha * intervals[i]! + (1 - alpha) * ema;
          }

          emaDays = Math.max(1, Math.round(ema * 10) / 10);
          confidence = Math.min(100, Math.round(50 + intervals.length * 10));
        }
        status = "suggest_only";
      }

      const { data, error } = await supabase
        .from("household_inventory_rules")
        .insert({
          household_id: user.household_id,
          product_id: item.product_id,
          ema_days: emaDays,
          confidence_score: confidence,
          auto_add_status: status,
        })
        .select("*")
        .single();

      if (error) {
        showBanner("שגיאה ביצירת מחזור קנייה", "error");
      } else if (data) {
        setRule(data as InventoryRuleRow);
        setEditEmaDays(data.ema_days);
        showBanner(
          mode === "ai"
            ? `🤖 AI חישב מחזור: ${emaDays} ימים (ליחידה) ✓`
            : "מחזור הקנייה נוצר בהצלחה ✓",
          "success",
        );
      }
      setCreatingRule(false);
    },
    [item, user?.household_id, editEmaDaysManual, history],
  );

  // ── Apply manual ema_days change ───────────────────────────
  const handleApplyManual = useCallback(async () => {
    if (!rule || editEmaDays == null || editEmaDays === rule.ema_days) return;
    setApplyingManual(true);

    const { error } = await supabase
      .from("household_inventory_rules")
      .update({ ema_days: editEmaDays, auto_add_status: "manual_only" })
      .eq("id", rule.id);

    if (error) {
      showBanner("שגיאה בעדכון מחזור הקנייה", "error");
    } else {
      setRule({
        ...rule,
        ema_days: editEmaDays,
        auto_add_status: "manual_only",
      });
      showBanner(`מחזור עודכן ל-${editEmaDays} ימים ✓`, "success");
    }
    setApplyingManual(false);
  }, [rule, editEmaDays]);

  // ── Switch to manual mode (toggle) ─────────────────────────
  const handleApplyManualSwitch = useCallback(async () => {
    if (!rule || rule.auto_add_status === "manual_only") return;

    const { error } = await supabase
      .from("household_inventory_rules")
      .update({ auto_add_status: "manual_only" })
      .eq("id", rule.id);

    if (error) {
      showBanner("שגיאה במעבר למצב ידני", "error");
    } else {
      setRule({ ...rule, auto_add_status: "manual_only" });
      setEditEmaDays(rule.ema_days);
      showBanner("מצב ידני מופעל ✓", "success");
    }
  }, [rule]);

  // ── Reset to AI control ────────────────────────────────────
  const handleResetToAI = useCallback(async () => {
    if (!rule) return;
    setResettingAI(true);

    // ema_days is always per 1 item — normalise intervals by qty
    const sorted = history
      .filter((h) => h.purchased_at)
      .map((h) => ({
        ts: new Date(h.purchased_at!).getTime(),
        qty: h.quantity || 1,
      }))
      .sort((a, b) => a.ts - b.ts);

    let newEmaDays = rule.ema_days; // fallback: keep current value
    let confidence = rule.confidence_score;
    let infoMsg = "";

    if (sorted.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const rawDays =
          (sorted[i]!.ts - sorted[i - 1]!.ts) / (1000 * 60 * 60 * 24);
        intervals.push(rawDays / sorted[i - 1]!.qty); // per 1 item
      }
      const alpha = 0.3;
      let ema = intervals[0]!;
      for (let i = 1; i < intervals.length; i++) {
        ema = alpha * intervals[i]! + (1 - alpha) * ema;
      }
      newEmaDays = Math.max(1, Math.round(ema * 10) / 10);
      confidence = Math.min(100, Math.round(50 + intervals.length * 10));
      infoMsg = `🤖 AI חישב: כל ${newEmaDays} ימים (ליחידה) ✓`;
    } else {
      // Not enough data — keep ema_days, just switch mode
      confidence = Math.max(10, confidence);
      infoMsg = "🤖 AI מופעל — ילמד מהרכישות הבאות ✓";
    }

    const { error } = await supabase
      .from("household_inventory_rules")
      .update({
        ema_days: newEmaDays,
        auto_add_status: "suggest_only",
        confidence_score: confidence,
      })
      .eq("id", rule.id);

    if (error) {
      showBanner("שגיאה באיפוס לחיזוי AI", "error");
    } else {
      setRule({
        ...rule,
        ema_days: newEmaDays,
        auto_add_status: "suggest_only",
        confidence_score: confidence,
      });
      setEditEmaDays(newEmaDays);
      setShowManualEdit(false);
      showBanner(infoMsg, "success");
    }
    setResettingAI(false);
  }, [rule, history]);

  // ── Computed buy-cycle stats from history ───────────────────
  // All interval-based stats are normalised per 1 item.
  const buyCycleStats = useMemo(() => {
    if (history.length === 0) return null;

    // Sorted ascending with quantity for per-item normalisation
    const sorted = history
      .filter((h) => h.purchased_at)
      .map((h) => ({
        ts: new Date(h.purchased_at!).getTime(),
        qty: h.quantity || 1,
      }))
      .sort((a, b) => a.ts - b.ts);

    const totalQty = history.reduce((s, h) => s + h.quantity, 0);

    // Last purchase date (most recent)
    const lastPurchaseDate =
      sorted.length > 0 ? new Date(sorted[sorted.length - 1]!.ts) : null;

    // Days since last purchase
    const daysSinceLast = lastPurchaseDate
      ? Math.round(
          (Date.now() - lastPurchaseDate.getTime()) / (1000 * 60 * 60 * 24),
        )
      : null;

    // If fewer than 2 purchases, return basic stats only
    if (sorted.length < 2) {
      return {
        purchaseCount: history.length,
        totalQty,
        avgDays: null as number | null,
        monthlyRate: null as number | null,
        daysSinceLast,
        lastPurchaseDate,
        consistency: null as string | null,
      };
    }

    // Per-item intervals: raw_days / qty bought at start of each interval
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const rawDays =
        (sorted[i]!.ts - sorted[i - 1]!.ts) / (1000 * 60 * 60 * 24);
      intervals.push(rawDays / sorted[i - 1]!.qty); // per 1 item
    }

    const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;

    // Monthly purchase rate (transactions, not items)
    const spanDays =
      (sorted[sorted.length - 1]!.ts - sorted[0]!.ts) / (1000 * 60 * 60 * 24);
    const monthlyRate =
      spanDays > 0
        ? Math.round((history.length / spanDays) * 30 * 10) / 10
        : null;

    // Consistency: coefficient of variation of per-item intervals
    const variance =
      intervals.reduce((s, v) => s + (v - avg) ** 2, 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const cv = avg > 0 ? stdDev / avg : 0;
    let consistency: string;
    if (cv < 0.2) consistency = "קבוע מאוד";
    else if (cv < 0.4) consistency = "יציב";
    else if (cv < 0.7) consistency = "משתנה";
    else consistency = "לא קבוע";

    return {
      purchaseCount: history.length,
      totalQty,
      avgDays: Math.round(avg * 10) / 10,
      monthlyRate,
      daysSinceLast,
      lastPurchaseDate,
      consistency,
    };
  }, [history]);

  const lastPurchaseAgoLabel = useMemo(() => {
    const days = buyCycleStats?.daysSinceLast;
    if (days === null || days === undefined) return "—";
    if (days === 0) return "היום";
    if (days === 1) return "אתמול";
    return `לפני ${days} ימים`;
  }, [buyCycleStats?.daysSinceLast]);

  // ── Format date for history ────────────────────────────────
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("he-IL", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
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
          headerTitleAlign: "center",
          headerTitleStyle: { fontWeight: "700" },
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              activeOpacity={0.6}
            >
              <Ionicons name="arrow-back" size={24} color={dark.text} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View
              style={{
                flexDirection: "row",
                direction: "ltr",
                alignItems: "center",
                gap: 8,
                paddingStart: 4,
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  signOut().catch(() => {});
                }}
                style={{ padding: 2 }}
                activeOpacity={0.6}
              >
                <MaterialCommunityIcons
                  name="exit-run"
                  size={22}
                  color={dark.textSecondary}
                />
              </TouchableOpacity>
              {user?.display_name ? (
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: dark.textSecondary,
                  }}
                >
                  {user.display_name}
                </Text>
              ) : null}
            </View>
          ),
        }}
      />

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
            <ScrollView
              ref={categoryScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              onContentSizeChange={() => {
                categoryScrollRef.current?.scrollToEnd({ animated: false });
              }}
            >
              <View style={styles.categoryRow}>
                <TouchableOpacity
                  style={[
                    styles.categoryChip,
                    editCategory === null && styles.categoryChipActive,
                  ]}
                  onPress={() => setEditCategory(null)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      editCategory === null && styles.categoryChipTextActive,
                    ]}
                  >
                    ללא
                  </Text>
                </TouchableOpacity>
                {CATEGORIES.map(({ name, emoji }) => (
                  <TouchableOpacity
                    key={name}
                    style={[
                      styles.categoryChip,
                      editCategory === name && styles.categoryChipActive,
                    ]}
                    onPress={() => setEditCategory(name)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        editCategory === name && styles.categoryChipTextActive,
                      ]}
                    >
                      {emoji} {name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* ── Quantity (compact row) ─────────────────────────── */}
          <View style={styles.qtyCard}>
            <Text style={styles.qtyCardLabel}>כמות ברירת מחדל</Text>
            <View style={styles.qtyCompactRow}>
              <TouchableOpacity
                style={styles.qtyBtnCompact}
                onPress={() => setEditQuantity((q) => Math.max(1, q - 1))}
              >
                <Ionicons name="remove" size={18} color={dark.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.qtyValueCompact}>{editQuantity}</Text>
              <TouchableOpacity
                style={styles.qtyBtnCompact}
                onPress={() => setEditQuantity((q) => q + 1)}
              >
                <Ionicons name="add" size={18} color={dark.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════
              חיזוי קנייה — unified prediction card
              ══════════════════════════════════════════════════════ */}
          {rule && (
            <View style={styles.predCard}>
              {/* ── Header row: title + toggle ── */}
              <View style={styles.predHeader}>
                <View style={styles.predTitleRow}>
                  <Ionicons name="sparkles" size={20} color={dark.accent} />
                  <Text style={styles.predTitleText}>חיזוי קנייה</Text>
                </View>
                {/* AI / Manual pill toggle */}
                <View style={styles.pillToggle}>
                  <TouchableOpacity
                    style={[
                      styles.pillBtn,
                      rule.auto_add_status !== "manual_only" &&
                        styles.pillBtnActive,
                    ]}
                    onPress={() => {
                      if (rule.auto_add_status === "manual_only")
                        handleResetToAI();
                    }}
                    disabled={
                      resettingAI || rule.auto_add_status !== "manual_only"
                    }
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        rule.auto_add_status !== "manual_only" &&
                          styles.pillTextActive,
                      ]}
                    >
                      {resettingAI ? "..." : "AI"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.pillBtn,
                      rule.auto_add_status === "manual_only" &&
                        styles.pillBtnActive,
                    ]}
                    onPress={() => {
                      if (rule.auto_add_status !== "manual_only") {
                        setShowManualEdit(true);
                        setEditEmaDays(rule.ema_days);
                        handleApplyManualSwitch();
                      }
                    }}
                    disabled={rule.auto_add_status === "manual_only"}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        rule.auto_add_status === "manual_only" &&
                          styles.pillTextActive,
                      ]}
                    >
                      ידני
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── AI mode inner rows ── */}
              {rule.auto_add_status !== "manual_only" && (
                <View style={styles.innerRows}>
                  {/* Row: Estimated Frequency */}
                  <View style={styles.innerRow}>
                    <View
                      style={[
                        styles.iconSquare,
                        { backgroundColor: "rgba(139,159,232,0.1)" },
                      ]}
                    >
                      <Ionicons
                        name="time-outline"
                        size={22}
                        color={dark.accent}
                      />
                    </View>
                    <View style={styles.innerRowText}>
                      <Text style={styles.innerRowLabel}>תדירות משוערת</Text>
                      <Text style={styles.innerRowValue}>
                        כל{" "}
                        {rule.ema_days % 1 === 0
                          ? rule.ema_days
                          : rule.ema_days.toFixed(1)}{" "}
                        ימים
                      </Text>
                      <Text style={styles.innerRowSub}>
                        {buyCycleStats
                          ? `ליחידה · מבוסס על ${buyCycleStats.purchaseCount} רכישות (${buyCycleStats.totalQty} יח')${lastPurchaseQuantity > 1 ? ` · ×${lastPurchaseQuantity} כמות` : ""}`
                          : "ליחידה · ברירת מחדל לפי קטגוריה — ילמד מהרכישות הבאות"}
                      </Text>
                    </View>
                  </View>

                  {/* Row: Next Buy Prediction */}
                  <View style={styles.innerRow}>
                    <View
                      style={[
                        styles.iconSquare,
                        { backgroundColor: "rgba(72,174,109,0.1)" },
                      ]}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={22}
                        color={dark.success}
                      />
                    </View>
                    <View style={styles.innerRowText}>
                      <Text style={styles.innerRowLabel}>הקנייה הבאה</Text>
                      <Text
                        style={[styles.innerRowValue, { color: dark.success }]}
                      >
                        {nextBuyLabel}
                      </Text>
                      {nextBuyDate && (
                        <Text style={styles.innerRowSub}>
                          {nextBuyDate.toLocaleDateString("he-IL", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}
                        </Text>
                      )}
                    </View>
                    {/* Progress bar at bottom of this row */}
                    {progressRatio !== null && (
                      <View style={styles.innerRowProgress}>
                        <View style={styles.innerProgressBg}>
                          <View
                            style={[
                              styles.innerProgressFill,
                              {
                                width: `${Math.round(progressRatio * 100)}%`,
                                backgroundColor: progressColor,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Row: Stats summary */}
                  {buyCycleStats && (
                    <View style={styles.innerRow}>
                      <View
                        style={[
                          styles.iconSquare,
                          { backgroundColor: "rgba(78,205,196,0.1)" },
                        ]}
                      >
                        <Ionicons
                          name="stats-chart-outline"
                          size={22}
                          color={dark.secondary}
                        />
                      </View>
                      <View style={styles.innerRowText}>
                        <Text style={styles.innerRowLabel}>סיכום קניות</Text>
                        <View style={styles.miniStatRow}>
                          <View style={styles.miniStat}>
                            <Text style={styles.miniStatNum}>
                              {depletionPercent !== null
                                ? `${depletionPercent}%`
                                : "—"}
                            </Text>
                            <Text style={styles.miniStatLabel}>
                              עומד להיגמר
                            </Text>
                          </View>
                          <View style={styles.miniStatDivider} />
                          <View style={styles.miniStat}>
                            <Text style={styles.miniStatNum}>
                              {buyCycleStats.totalQty}
                            </Text>
                            <Text style={styles.miniStatLabel}>יח' נקנו</Text>
                          </View>
                          <View style={styles.miniStatDivider} />
                          <View style={styles.miniStat}>
                            <Text style={styles.miniStatNum}>
                              {lastPurchaseAgoLabel}
                            </Text>
                            <Text style={styles.miniStatLabel}>
                              קנייה אחרונה
                            </Text>
                          </View>
                        </View>
                        {buyCycleStats.consistency && (
                          <Text style={styles.consistencyInline}>
                            דפוס: {buyCycleStats.consistency}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* ── Manual mode ── */}
              {rule.auto_add_status === "manual_only" && (
                <View style={styles.innerRows}>
                  <View style={styles.innerRow}>
                    <TouchableOpacity
                      style={[
                        styles.iconSquare,
                        { backgroundColor: "rgba(139,159,232,0.1)" },
                      ]}
                      onPress={() => {
                        if (!showManualEdit) {
                          setEditEmaDays(rule.ema_days);
                          setShowManualEdit(true);
                        } else {
                          // Save and close
                          if (
                            editEmaDays != null &&
                            editEmaDays !== rule.ema_days
                          ) {
                            handleApplyManual();
                          }
                          setShowManualEdit(false);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={showManualEdit ? "checkmark" : "create-outline"}
                        size={22}
                        color={dark.accent}
                      />
                    </TouchableOpacity>
                    <View style={styles.innerRowText}>
                      {/* מחזור ידני — per 1 item; multiply by qty for actual interval */}
                      <Text style={styles.innerRowLabel}>מחזור ידני</Text>
                      {!showManualEdit ? (
                        <Text style={styles.innerRowValue}>
                          כל{" "}
                          {rule.ema_days % 1 === 0
                            ? rule.ema_days
                            : rule.ema_days.toFixed(1)}{" "}
                          ימים
                        </Text>
                      ) : (
                        <View style={styles.manualEditInline}>
                          <Text style={styles.innerRowValue}>כל </Text>
                          <TouchableOpacity
                            style={styles.qtyBtnTiny}
                            onPress={() =>
                              setEditEmaDays((d) =>
                                Math.max(1, (d ?? rule.ema_days) - 1),
                              )
                            }
                          >
                            <Text style={styles.qtyBtnTextTiny}>−</Text>
                          </TouchableOpacity>
                          <Text
                            style={[
                              styles.innerRowValue,
                              { minWidth: 28, textAlign: "center" },
                            ]}
                          >
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
                          <Text style={styles.innerRowValue}> ימים</Text>
                        </View>
                      )}
                      <Text style={styles.innerRowSub}>
                        {showManualEdit
                          ? "ליחידה · לחץ על ✓ לשמירה"
                          : lastPurchaseQuantity > 1
                            ? `ליחידה · קנייה אחרונה ×${lastPurchaseQuantity} → ${Math.round(rule.ema_days * lastPurchaseQuantity)} ימים`
                            : "ליחידה · לחץ על העט לעריכה"}
                      </Text>
                    </View>
                  </View>

                  {/* Row: Next Buy Prediction */}
                  <View style={styles.innerRow}>
                    <View
                      style={[
                        styles.iconSquare,
                        { backgroundColor: "rgba(72,174,109,0.1)" },
                      ]}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={22}
                        color={dark.success}
                      />
                    </View>
                    <View style={styles.innerRowText}>
                      <Text style={styles.innerRowLabel}>הקנייה הבאה</Text>
                      <Text
                        style={[styles.innerRowValue, { color: dark.success }]}
                      >
                        {nextBuyLabel}
                      </Text>
                      {nextBuyDate && (
                        <Text style={styles.innerRowSub}>
                          {nextBuyDate.toLocaleDateString("he-IL", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}
                        </Text>
                      )}
                    </View>
                    {progressRatio !== null && (
                      <View style={styles.innerRowProgress}>
                        <View style={styles.innerProgressBg}>
                          <View
                            style={[
                              styles.innerProgressFill,
                              {
                                width: `${Math.round(progressRatio * 100)}%`,
                                backgroundColor: progressColor,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Row: Stats summary */}
                  {buyCycleStats && (
                    <View style={styles.innerRow}>
                      <View
                        style={[
                          styles.iconSquare,
                          { backgroundColor: "rgba(78,205,196,0.1)" },
                        ]}
                      >
                        <Ionicons
                          name="stats-chart-outline"
                          size={22}
                          color={dark.secondary}
                        />
                      </View>
                      <View style={styles.innerRowText}>
                        <Text style={styles.innerRowLabel}>סיכום קניות</Text>
                        <View style={styles.miniStatRow}>
                          <View style={styles.miniStat}>
                            <Text style={styles.miniStatNum}>
                              {depletionPercent !== null
                                ? `${depletionPercent}%`
                                : "—"}
                            </Text>
                            <Text style={styles.miniStatLabel}>
                              עומד להיגמר
                            </Text>
                          </View>
                          <View style={styles.miniStatDivider} />
                          <View style={styles.miniStat}>
                            <Text style={styles.miniStatNum}>
                              {buyCycleStats.totalQty}
                            </Text>
                            <Text style={styles.miniStatLabel}>יח' נקנו</Text>
                          </View>
                          <View style={styles.miniStatDivider} />
                          <View style={styles.miniStat}>
                            <Text style={styles.miniStatNum}>
                              {lastPurchaseAgoLabel}
                            </Text>
                            <Text style={styles.miniStatLabel}>
                              קנייה אחרונה
                            </Text>
                          </View>
                        </View>
                        {buyCycleStats.consistency && (
                          <Text style={styles.consistencyInline}>
                            דפוס: {buyCycleStats.consistency}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* ── Last purchase + info footer ── */}
              {rule?.last_purchased_at && (
                <Text style={styles.lastPurchasedFooter}>
                  קנייה אחרונה: {formatDate(rule.last_purchased_at)}
                </Text>
              )}

              {rule.auto_add_status !== "manual_only" && (
                <View style={styles.infoFooter}>
                  <Ionicons
                    name="information-circle-outline"
                    size={14}
                    color={dark.textSecondary}
                  />
                  <Text style={styles.infoFooterText}>
                    המערכת לומדת ומשתפרת עם כל קנייה
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Save Button ────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>
              {saving ? "שומר..." : "שמור שינויים"}
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
              {deleting ? "מוחק..." : "🗑️ מחק פריט"}
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
    alignItems: "center",
    justifyContent: "center",
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
    fontWeight: "600",
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    backgroundColor: dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.border,
  },
  backBtnText: {
    color: dark.accent,
    fontSize: 15,
    fontWeight: "700",
  },

  // ── Banner ────────────────────────────────────────────────
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

  // ── Cards ─────────────────────────────────────────────────
  card: {
    backgroundColor: dark.surface,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: dark.border,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: dark.text,
    marginBottom: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  category: {
    fontSize: 13,
    color: dark.secondary,
    marginTop: 8,
    fontWeight: "500",
  },
  categoryLabel: {
    fontSize: 13,
    color: dark.textMuted,
    marginTop: 10,
    marginBottom: 6,
    fontWeight: "700",
  },
  categoryScroll: {
    maxHeight: 36,
  },
  categoryRow: {
    flexDirection: "row",
    gap: 8,
    paddingEnd: 2,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: dark.surfaceAlt,
    borderWidth: 1.5,
    borderColor: dark.border,
  },
  categoryChipActive: {
    backgroundColor: dark.accent,
    borderColor: dark.accent,
  },
  categoryChipText: {
    fontSize: 12,
    color: dark.textMuted,
    fontWeight: "600",
  },
  categoryChipTextActive: {
    color: "#fff",
    fontWeight: "800",
  },

  // ── Input ─────────────────────────────────────────────────
  input: {
    fontSize: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: dark.inputBorder,
    borderRadius: 14,
    backgroundColor: dark.input,
    color: dark.inputText,
    writingDirection: "rtl",
  },

  // ── Quantity (compact row) ──────────────────────────────
  qtyCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: dark.border,
  },
  qtyCardLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: dark.text,
  },
  qtyCompactRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: dark.background,
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: dark.border,
  },
  qtyBtnCompact: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyValueCompact: {
    fontSize: 18,
    fontWeight: "800",
    color: dark.text,
    minWidth: 32,
    textAlign: "center",
  },

  // ── Manual edit inline ────────────────────────────────────
  manualEditInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  qtyBtnTiny: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: dark.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: dark.border,
  },
  qtyBtnTextTiny: {
    fontSize: 15,
    color: dark.textSecondary,
    fontWeight: "800",
    lineHeight: 17,
  },
  // ── Prediction card (חיזוי קנייה) ─────────────────────────
  predCard: {
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: dark.border,
  },
  predHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  predTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  predTitleText: {
    fontSize: 17,
    fontWeight: "700",
    color: dark.text,
  },
  pillToggle: {
    flexDirection: "row",
    backgroundColor: dark.surfaceAlt,
    borderRadius: 8,
    padding: 3,
  },
  pillBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: "center",
  },
  pillBtnActive: {
    backgroundColor: dark.accent,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
    color: dark.textSecondary,
  },
  pillTextActive: {
    color: "#fff",
    fontWeight: "700",
  },

  // ── Inner rows (icon + text) ──────────────────────────────
  innerRows: {
    gap: 12,
  },
  innerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: dark.background,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${dark.border}80`,
    position: "relative",
    overflow: "hidden",
  },
  iconSquare: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  innerRowText: {
    flex: 1,
  },
  innerRowLabel: {
    fontSize: 12,
    color: dark.textSecondary,
    fontWeight: "500",
  },
  innerRowValue: {
    fontSize: 17,
    fontWeight: "700",
    color: dark.text,
    marginTop: 2,
  },
  innerRowSub: {
    fontSize: 11,
    color: dark.textSecondary,
    marginTop: 2,
  },

  // ── Progress bar inside inner row ─────────────────────────
  innerRowProgress: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  innerProgressBg: {
    height: 3,
    backgroundColor: dark.surfaceAlt,
  },
  innerProgressFill: {
    height: 3,
  },

  // ── Mini stats row (inside stats inner row) ───────────────
  miniStatRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 0,
  },
  miniStat: {
    flex: 1,
    alignItems: "center",
  },
  miniStatNum: {
    fontSize: 16,
    fontWeight: "800",
    color: dark.accent,
    textAlign: "right",
  },
  miniStatLabel: {
    fontSize: 10,
    color: dark.textMuted,
    marginTop: 1,
    fontWeight: "500",
  },
  miniStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: dark.border,
  },
  consistencyInline: {
    fontSize: 11,
    color: dark.textSecondary,
    marginTop: 6,
    fontWeight: "500",
  },

  // ── Last purchase footer ──────────────────────────────────
  lastPurchasedFooter: {
    fontSize: 12,
    color: dark.textMuted,
    marginTop: 14,
    textAlign: "right",
  },

  // ── Info footer (inside prediction card) ──────────────────
  infoFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 14,
    backgroundColor: `${dark.background}80`,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  infoFooterText: {
    fontSize: 11,
    color: dark.textSecondary,
    fontWeight: "500",
  },

  // ── (prediction styles moved into predCard inner rows) ────

  // ── Create rule button ────────────────────────────────────
  createRuleBtn: {
    backgroundColor: dark.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  createRuleBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },

  // ── Save button ───────────────────────────────────────────
  saveBtn: {
    backgroundColor: dark.accent,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 6,
    shadowColor: dark.fabShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
  },

  // ── Delete button ─────────────────────────────────────────
  deleteBtn: {
    backgroundColor: dark.errorBg,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: dark.error,
  },
  deleteBtnText: {
    color: dark.error,
    fontSize: 16,
    fontWeight: "800",
  },
});
