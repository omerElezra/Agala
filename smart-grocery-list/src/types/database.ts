export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      households: {
        Row: {
          id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          household_id: string;
          email: string;
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          household_id: string;
          email: string;
          display_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          email?: string;
          display_name?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'users_household_id_fkey';
            columns: ['household_id'];
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          name: string;
          category: string | null;
          is_custom: boolean;
          created_by_household: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category?: string | null;
          is_custom?: boolean;
          created_by_household?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string | null;
          is_custom?: boolean;
          created_by_household?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'products_created_by_household_fkey';
            columns: ['created_by_household'];
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      shopping_list: {
        Row: {
          id: string;
          household_id: string;
          product_id: string;
          quantity: number;
          status: 'active' | 'purchased' | 'snoozed';
          added_at: string;
          purchased_at: string | null;
          snooze_until: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          product_id: string;
          quantity?: number;
          status?: 'active' | 'purchased' | 'snoozed';
          added_at?: string;
          purchased_at?: string | null;
          snooze_until?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          product_id?: string;
          quantity?: number;
          status?: 'active' | 'purchased' | 'snoozed';
          added_at?: string;
          purchased_at?: string | null;
          snooze_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'shopping_list_household_id_fkey';
            columns: ['household_id'];
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shopping_list_product_id_fkey';
            columns: ['product_id'];
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      household_inventory_rules: {
        Row: {
          id: string;
          household_id: string;
          product_id: string;
          ema_days: number;
          confidence_score: number;
          last_purchased_at: string | null;
          auto_add_status: 'auto_add' | 'suggest_only' | 'manual_only';
        };
        Insert: {
          id?: string;
          household_id: string;
          product_id: string;
          ema_days?: number;
          confidence_score?: number;
          last_purchased_at?: string | null;
          auto_add_status?: 'auto_add' | 'suggest_only' | 'manual_only';
        };
        Update: {
          id?: string;
          household_id?: string;
          product_id?: string;
          ema_days?: number;
          confidence_score?: number;
          last_purchased_at?: string | null;
          auto_add_status?: 'auto_add' | 'suggest_only' | 'manual_only';
        };
        Relationships: [
          {
            foreignKeyName: 'household_inventory_rules_household_id_fkey';
            columns: ['household_id'];
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'household_inventory_rules_product_id_fkey';
            columns: ['product_id'];
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_my_household_id: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
