// Auto-generado con: supabase gen types typescript --project-id <id> > src/types/supabase.ts
// No editar manualmente

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
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: "ADMIN" | "MERCADERISTA" | "PROMOTORA";
          created_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          role: "ADMIN" | "MERCADERISTA" | "PROMOTORA";
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: "ADMIN" | "MERCADERISTA" | "PROMOTORA";
          created_at?: string;
        };
      };
      locations: {
        Row: {
          id: string;
          name: string;
          type: "SUPERMERCADO" | "ABASTO" | "BODEGA" | "OTRO";
          sap_code: string;
          address: string | null;
          region: string | null;
          lat: number | null;
          lng: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type: "SUPERMERCADO" | "ABASTO" | "BODEGA" | "OTRO";
          sap_code: string;
          address?: string | null;
          region?: string | null;
          lat?: number | null;
          lng?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          type?: "SUPERMERCADO" | "ABASTO" | "BODEGA" | "OTRO";
          sap_code?: string;
          address?: string | null;
          region?: string | null;
          lat?: number | null;
          lng?: number | null;
          created_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name: string;
          brand: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          brand: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          brand?: string;
          created_at?: string;
        };
      };
      variants: {
        Row: {
          id: string;
          product_id: string;
          name: string;
          type: "UNIDAD" | "BULTO";
          presentation_kg: number;
          units_per_bulk: number;
          image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          name: string;
          type: "UNIDAD" | "BULTO";
          presentation_kg: number;
          units_per_bulk: number;
          image_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          name?: string;
          type?: "UNIDAD" | "BULTO";
          presentation_kg?: number;
          units_per_bulk?: number;
          image_url?: string | null;
          created_at?: string;
        };
      };
      sap_sell_in_records: {
        Row: {
          id: string;
          uploaded_by: string;
          upload_batch_id: string;
          location_id: string;
          variant_id: string;
          quantity_units: number;
          date_of_sale: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          uploaded_by: string;
          upload_batch_id: string;
          location_id: string;
          variant_id: string;
          quantity_units: number;
          date_of_sale: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          uploaded_by?: string;
          upload_batch_id?: string;
          location_id?: string;
          variant_id?: string;
          quantity_units?: number;
          date_of_sale?: string;
          created_at?: string;
        };
      };
      inventory_audits: {
        Row: {
          id: string;
          user_id: string;
          location_id: string;
          variant_id: string;
          zone: "BODEGA" | "ANAQUEL";
          quantity: number;
          unit_price_observed: number | null;
          calculated_value: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          location_id: string;
          variant_id: string;
          zone: "BODEGA" | "ANAQUEL";
          quantity: number;
          unit_price_observed?: number | null;
          calculated_value?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          location_id?: string;
          variant_id?: string;
          zone?: "BODEGA" | "ANAQUEL";
          quantity?: number;
          unit_price_observed?: number | null;
          calculated_value?: number | null;
          created_at?: string;
        };
      };
      promotion_activities: {
        Row: {
          id: string;
          user_id: string;
          location_id: string;
          report_date: string;
          samples_given: number;
          conversions_tracked: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          location_id: string;
          report_date: string;
          samples_given: number;
          conversions_tracked: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          location_id?: string;
          report_date?: string;
          samples_given?: number;
          conversions_tracked?: number;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: "ADMIN" | "MERCADERISTA" | "PROMOTORA";
      location_type: "SUPERMERCADO" | "ABASTO" | "BODEGA" | "OTRO";
      variant_type: "UNIDAD" | "BULTO";
      audit_zone: "BODEGA" | "ANAQUEL";
    };
  };
}
