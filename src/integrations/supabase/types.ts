export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      venue_csv_imports: {
        Row: {
          created_at: string
          filename: string
          id: string
          search_type: string
          status: string
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          search_type?: string
          status?: string
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          search_type?: string
          status?: string
        }
        Relationships: []
      }
      venue_images: {
        Row: {
          alt_text: string
          created_at: string
          id: string
          image_url: string
          search_id: string | null
          venue_name: string
        }
        Insert: {
          alt_text: string
          created_at?: string
          id?: string
          image_url: string
          search_id?: string | null
          venue_name: string
        }
        Update: {
          alt_text?: string
          created_at?: string
          id?: string
          image_url?: string
          search_id?: string | null
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_images_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "venue_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_import_items: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          import_id: string
          search_id: string | null
          search_type: string
          status: string
          venue_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          import_id: string
          search_id?: string | null
          search_type?: string
          status?: string
          venue_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          import_id?: string
          search_id?: string | null
          search_type?: string
          status?: string
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_import_items_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "venue_csv_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_import_items_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "venue_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_searches: {
        Row: {
          address: string | null
          amenities: string[] | null
          contact_details: Json | null
          created_at: string
          description: string | null
          download_count: number | null
          hotel_details: Json | null
          hotel_id: string | null
          id: string
          room_count: number | null
          search_type: string
          venue_name: string
          website: string | null
        }
        Insert: {
          address?: string | null
          amenities?: string[] | null
          contact_details?: Json | null
          created_at?: string
          description?: string | null
          download_count?: number | null
          hotel_details?: Json | null
          hotel_id?: string | null
          id?: string
          room_count?: number | null
          search_type?: string
          venue_name: string
          website?: string | null
        }
        Update: {
          address?: string | null
          amenities?: string[] | null
          contact_details?: Json | null
          created_at?: string
          description?: string | null
          download_count?: number | null
          hotel_details?: Json | null
          hotel_id?: string | null
          id?: string
          room_count?: number | null
          search_type?: string
          venue_name?: string
          website?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
