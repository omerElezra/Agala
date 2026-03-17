import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

const STORAGE_KEY = "agala_app_settings";

interface AppSettingsState {
  /** When true, show the "add to cart" toggle in AddProductSheet */
  showAddToCartOption: boolean;
  /** When true, show the recommendation line on the main screen */
  showRecommendations: boolean;
  /** When true, show depletion % + status label on catalog items */
  showDepletion: boolean;
  /** When true, nightly engine can auto-add items to cart */
  autoAddEnabled: boolean;
  isLoaded: boolean;

  loadSettings: () => Promise<void>;
  setShowAddToCartOption: (value: boolean) => void;
  setShowRecommendations: (value: boolean) => void;
  setShowDepletion: (value: boolean) => void;
  setAutoAddEnabled: (value: boolean) => void;
}

/** Persist all settings to AsyncStorage */
function persistSettings(state: AppSettingsState) {
  AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      showAddToCartOption: state.showAddToCartOption,
      showRecommendations: state.showRecommendations,
      showDepletion: state.showDepletion,
      autoAddEnabled: state.autoAddEnabled,
    }),
  );
}

export const useAppSettingsStore = create<AppSettingsState>((set, get) => ({
  showAddToCartOption: false,
  showRecommendations: true,
  showDepletion: true,
  autoAddEnabled: false,
  isLoaded: false,

  loadSettings: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          showAddToCartOption: parsed.showAddToCartOption ?? false,
          showRecommendations: parsed.showRecommendations ?? true,
          showDepletion: parsed.showDepletion ?? true,
          autoAddEnabled: parsed.autoAddEnabled ?? false,
          isLoaded: true,
        });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  setShowAddToCartOption: (value: boolean) => {
    set({ showAddToCartOption: value });
    persistSettings({ ...get(), showAddToCartOption: value });
  },

  setShowRecommendations: (value: boolean) => {
    set({ showRecommendations: value });
    persistSettings({ ...get(), showRecommendations: value });
  },

  setShowDepletion: (value: boolean) => {
    set({ showDepletion: value });
    persistSettings({ ...get(), showDepletion: value });
  },

  setAutoAddEnabled: (value: boolean) => {
    set({ autoAddEnabled: value });
    persistSettings({ ...get(), autoAddEnabled: value });
  },
}));
