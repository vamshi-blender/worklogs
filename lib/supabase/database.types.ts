export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      memory_audit_log: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entity_id: number
          entity_type: string
          id: number
          new_record: Json | null
          old_record: Json | null
          operation: string
          subject_user_id: string | null
          tenant_id: number
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entity_id: number
          entity_type: string
          id?: never
          new_record?: Json | null
          old_record?: Json | null
          operation: string
          subject_user_id?: string | null
          tenant_id: number
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: number
          entity_type?: string
          id?: never
          new_record?: Json | null
          old_record?: Json | null
          operation?: string
          subject_user_id?: string | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "memory_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "memory_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_external_identities: {
        Row: {
          created_at: string
          display_name: string
          email: string
          external_tenant_id: string
          external_user_id: string
          id: number
          last_seen_at: string
          metadata: Json
          provider: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          email?: string
          external_tenant_id: string
          external_user_id: string
          id?: never
          last_seen_at?: string
          metadata?: Json
          provider: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          external_tenant_id?: string
          external_user_id?: string
          id?: never
          last_seen_at?: string
          metadata?: Json
          provider?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_external_identities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "memory_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_tenant_members: {
        Row: {
          created_at: string
          role: string
          tenant_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          tenant_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          tenant_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "memory_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_tenants: {
        Row: {
          created_at: string
          id: number
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      pms_value_rule_evidence: {
        Row: {
          created_at: string
          evidence_key: string
          example_input: string
          example_output: string
          id: number
          identity_id: number | null
          outcome: string
          rule_id: number
          source: string
          tenant_id: number
        }
        Insert: {
          created_at?: string
          evidence_key: string
          example_input: string
          example_output: string
          id?: never
          identity_id?: number | null
          outcome: string
          rule_id: number
          source?: string
          tenant_id: number
        }
        Update: {
          created_at?: string
          evidence_key?: string
          example_input?: string
          example_output?: string
          id?: never
          identity_id?: number | null
          outcome?: string
          rule_id?: number
          source?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "pms_value_rule_evidence_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "memory_external_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_value_rule_evidence_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pms_value_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_value_rule_evidence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "memory_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_value_rules: {
        Row: {
          confidence: number
          contradiction_count: number
          created_at: string
          created_by_identity_id: number | null
          evidence_count: number
          field_name: string
          id: number
          input_kind: string
          input_label: string
          input_label_normalized: string | null
          last_verified_at: string | null
          lookup_name: string
          metadata: Json
          output_prefix: string
          output_suffix: string
          project_key: string
          project_key_normalized: string | null
          source: string
          status: string
          superseded_by: number | null
          tenant_id: number
          updated_at: string
          verified_by: string | null
        }
        Insert: {
          confidence?: number
          contradiction_count?: number
          created_at?: string
          created_by_identity_id?: number | null
          evidence_count?: number
          field_name: string
          id?: never
          input_kind: string
          input_label?: string
          input_label_normalized?: string | null
          last_verified_at?: string | null
          lookup_name: string
          metadata?: Json
          output_prefix?: string
          output_suffix?: string
          project_key?: string
          project_key_normalized?: string | null
          source?: string
          status?: string
          superseded_by?: number | null
          tenant_id: number
          updated_at?: string
          verified_by?: string | null
        }
        Update: {
          confidence?: number
          contradiction_count?: number
          created_at?: string
          created_by_identity_id?: number | null
          evidence_count?: number
          field_name?: string
          id?: never
          input_kind?: string
          input_label?: string
          input_label_normalized?: string | null
          last_verified_at?: string | null
          lookup_name?: string
          metadata?: Json
          output_prefix?: string
          output_suffix?: string
          project_key?: string
          project_key_normalized?: string | null
          source?: string
          status?: string
          superseded_by?: number | null
          tenant_id?: number
          updated_at?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_value_rules_created_by_identity_id_fkey"
            columns: ["created_by_identity_id"]
            isOneToOne: false
            referencedRelation: "memory_external_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_value_rules_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "pms_value_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_value_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "memory_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_term_mappings: {
        Row: {
          alias: string
          alias_normalized: string | null
          canonical_value: string
          canonical_value_normalized: string | null
          confidence: number
          created_at: string
          created_by: string | null
          created_by_identity_id: number | null
          evidence_count: number
          field_name: string
          id: number
          last_verified_at: string | null
          lookup_name: string
          metadata: Json
          project_key: string
          project_key_normalized: string | null
          source: string
          status: string
          superseded_by: number | null
          tenant_id: number
          updated_at: string
          verified_by: string | null
        }
        Insert: {
          alias: string
          alias_normalized?: string | null
          canonical_value: string
          canonical_value_normalized?: string | null
          confidence?: number
          created_at?: string
          created_by?: string | null
          created_by_identity_id?: number | null
          evidence_count?: number
          field_name: string
          id?: never
          last_verified_at?: string | null
          lookup_name: string
          metadata?: Json
          project_key?: string
          project_key_normalized?: string | null
          source?: string
          status?: string
          superseded_by?: number | null
          tenant_id: number
          updated_at?: string
          verified_by?: string | null
        }
        Update: {
          alias?: string
          alias_normalized?: string | null
          canonical_value?: string
          canonical_value_normalized?: string | null
          confidence?: number
          created_at?: string
          created_by?: string | null
          created_by_identity_id?: number | null
          evidence_count?: number
          field_name?: string
          id?: never
          last_verified_at?: string | null
          lookup_name?: string
          metadata?: Json
          project_key?: string
          project_key_normalized?: string | null
          source?: string
          status?: string
          superseded_by?: number | null
          tenant_id?: number
          updated_at?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_term_mappings_created_by_identity_id_fkey"
            columns: ["created_by_identity_id"]
            isOneToOne: false
            referencedRelation: "memory_external_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_term_mappings_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "pms_term_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_term_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "memory_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_memories: {
        Row: {
          confidence: number
          context_tags: string[]
          created_at: string
          expires_at: string | null
          id: number
          kind: string
          last_confirmed_at: string | null
          memory_key: string
          memory_key_normalized: string | null
          memory_value: string
          metadata: Json
          source: string
          status: string
          superseded_by: number | null
          tenant_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number
          context_tags?: string[]
          created_at?: string
          expires_at?: string | null
          id?: never
          kind: string
          last_confirmed_at?: string | null
          memory_key: string
          memory_key_normalized?: string | null
          memory_value: string
          metadata?: Json
          source?: string
          status?: string
          superseded_by?: number | null
          tenant_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          context_tags?: string[]
          created_at?: string
          expires_at?: string | null
          id?: never
          kind?: string
          last_confirmed_at?: string | null
          memory_key?: string
          memory_key_normalized?: string | null
          memory_value?: string
          metadata?: Json
          source?: string
          status?: string
          superseded_by?: number | null
          tenant_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_memories_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "user_memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_memories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "memory_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      record_pms_value_rule_observation: {
        Args: {
          p_evidence_key: string
          p_example_input: string
          p_example_output: string
          p_field_name: string
          p_identity_id: number
          p_input_kind: string
          p_input_label: string
          p_lookup_name: string
          p_metadata?: Json
          p_output_prefix: string
          p_output_suffix: string
          p_project_key: string
          p_source?: string
          p_tenant_id: number
        }
        Returns: {
          confidence: number
          contradiction_count: number
          evidence_count: number
          observation: string
          rule_id: number
          status: string
        }[]
      }
      record_pms_mapping_candidate: {
        Args: {
          p_alias: string
          p_canonical_value: string
          p_field_name: string
          p_identity_id: number
          p_lookup_name: string
          p_metadata?: Json
          p_project_key?: string
          p_source?: string
          p_tenant_id: number
        }
        Returns: {
          accepted: boolean
          canonical_value: string
          confidence: number
          evidence_count: number
          mapping_id: number
          status: string
        }[]
      }
      resolve_external_memory_identity: {
        Args: {
          p_display_name?: string
          p_email?: string
          p_external_tenant_id: string
          p_external_user_id: string
          p_metadata?: Json
          p_provider: string
          p_tenant_name: string
        }
        Returns: {
          identity_id: number
          tenant_id: number
        }[]
      }
      resolve_pms_term: {
        Args: {
          p_field_name: string
          p_limit?: number
          p_lookup_name: string
          p_project_key?: string
          p_tenant_id: number
          p_user_value: string
        }
        Returns: {
          alias: string
          canonical_value: string
          confidence: number
          last_verified_at: string
          mapping_id: number
          project_key: string
          score: number
          status: string
        }[]
      }
      search_user_memories: {
        Args: {
          p_kinds?: string[]
          p_limit?: number
          p_query: string
          p_tenant_id: number
          p_user_id: string
        }
        Returns: {
          confidence: number
          context_tags: string[]
          expires_at: string
          kind: string
          last_confirmed_at: string
          memory_id: number
          memory_key: string
          memory_value: string
          score: number
          status: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
