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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_transfers: {
        Row: {
          amount: number
          date: string
          from_account_id: string
          id: string
          imported_transaction_ids: Json | null
          notes: string | null
          organization_id: string
          to_account_id: string
        }
        Insert: {
          amount?: number
          date: string
          from_account_id: string
          id?: string
          imported_transaction_ids?: Json | null
          notes?: string | null
          organization_id: string
          to_account_id: string
        }
        Update: {
          amount?: number
          date?: string
          from_account_id?: string
          id?: string
          imported_transaction_ids?: Json | null
          notes?: string | null
          organization_id?: string
          to_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          at: string
          id: string
          label: string
          organization_id: string
          staff_id: string | null
          tone: string
        }
        Insert: {
          at?: string
          id?: string
          label: string
          organization_id: string
          staff_id?: string | null
          tone?: string
        }
        Update: {
          at?: string
          id?: string
          label?: string
          organization_id?: string
          staff_id?: string | null
          tone?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_periods: {
        Row: {
          amount: number
          base_amount: number
          created_at: string
          due_at: string
          due_time: string | null
          external_invoice_id: string | null
          fee_amount: number
          id: string
          metadata: Json | null
          organization_id: string
          period_end: string
          period_start: string
          rental_id: string
          source: string
          status: string
          tax_amount: number
        }
        Insert: {
          amount?: number
          base_amount?: number
          created_at?: string
          due_at: string
          due_time?: string | null
          external_invoice_id?: string | null
          fee_amount?: number
          id?: string
          metadata?: Json | null
          organization_id: string
          period_end: string
          period_start: string
          rental_id: string
          source?: string
          status?: string
          tax_amount?: number
        }
        Update: {
          amount?: number
          base_amount?: number
          created_at?: string
          due_at?: string
          due_time?: string | null
          external_invoice_id?: string | null
          fee_amount?: number
          id?: string
          metadata?: Json | null
          organization_id?: string
          period_end?: string
          period_start?: string
          rental_id?: string
          source?: string
          status?: string
          tax_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_periods_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_accounts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          location_id: string | null
          name: string
          opening_balance: number
          organization_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          location_id?: string | null
          name: string
          opening_balance?: number
          organization_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          location_id?: string | null
          name?: string
          opening_balance?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_entries: {
        Row: {
          amount: number
          cash_account_id: string
          created_at: string
          entry_type: string
          expense_id: string | null
          id: string
          notes: string | null
          organization_id: string
        }
        Insert: {
          amount?: number
          cash_account_id: string
          created_at?: string
          entry_type: string
          expense_id?: string | null
          id?: string
          notes?: string | null
          organization_id: string
        }
        Update: {
          amount?: number
          cash_account_id?: string
          created_at?: string
          entry_type?: string
          expense_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_entries_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_entries_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expense_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_pro_integration_configs: {
        Row: {
          billing_event_sync_enabled: boolean
          connection_status: string
          created_at: string
          customer_sync_enabled: boolean
          default_sync_enabled: boolean
          enabled: boolean
          external_location_id: string | null
          id: string
          last_error_at: string | null
          last_error_message: string | null
          last_successful_sync_at: string | null
          organization_id: string
          payment_sync_enabled: boolean
          updated_at: string
          webhook_secret_status: string
        }
        Insert: {
          billing_event_sync_enabled?: boolean
          connection_status?: string
          created_at?: string
          customer_sync_enabled?: boolean
          default_sync_enabled?: boolean
          enabled?: boolean
          external_location_id?: string | null
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_successful_sync_at?: string | null
          organization_id: string
          payment_sync_enabled?: boolean
          updated_at?: string
          webhook_secret_status?: string
        }
        Update: {
          billing_event_sync_enabled?: boolean
          connection_status?: string
          created_at?: string
          customer_sync_enabled?: boolean
          default_sync_enabled?: boolean
          enabled?: boolean
          external_location_id?: string | null
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_successful_sync_at?: string | null
          organization_id?: string
          payment_sync_enabled?: boolean
          updated_at?: string
          webhook_secret_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_pro_integration_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_rate_limits: {
        Row: {
          bucket_key: string
          count: number
          updated_at: string
        }
        Insert: {
          bucket_key: string
          count?: number
          updated_at?: string
        }
        Update: {
          bucket_key?: string
          count?: number
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          customer_source: string
          customer_status: string
          date_of_birth: string | null
          drivers_license_back_path: string | null
          drivers_license_expiry: string | null
          drivers_license_front_path: string | null
          drivers_license_number: string | null
          drivers_license_state: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          external_id: string | null
          first_name: string
          id: string
          insurance_company: string | null
          insurance_document_path: string | null
          insurance_expiry: string | null
          insurance_policy_number: string | null
          last_name: string
          notes: string
          organization_id: string
          phone: string
          state: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          customer_source?: string
          customer_status?: string
          date_of_birth?: string | null
          drivers_license_back_path?: string | null
          drivers_license_expiry?: string | null
          drivers_license_front_path?: string | null
          drivers_license_number?: string | null
          drivers_license_state?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          external_id?: string | null
          first_name: string
          id?: string
          insurance_company?: string | null
          insurance_document_path?: string | null
          insurance_expiry?: string | null
          insurance_policy_number?: string | null
          last_name: string
          notes?: string
          organization_id: string
          phone?: string
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          customer_source?: string
          customer_status?: string
          date_of_birth?: string | null
          drivers_license_back_path?: string | null
          drivers_license_expiry?: string | null
          drivers_license_front_path?: string | null
          drivers_license_number?: string | null
          drivers_license_state?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          external_id?: string | null
          first_name?: string
          id?: string
          insurance_company?: string | null
          insurance_document_path?: string | null
          insurance_expiry?: string | null
          insurance_policy_number?: string | null
          last_name?: string
          notes?: string
          organization_id?: string
          phone?: string
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_claim_events: {
        Row: {
          actor_is_system: boolean
          actor_user_id: string | null
          created_at: string
          damage_claim_id: string
          event_type: string
          id: string
          new_value: string | null
          note: string | null
          old_value: string | null
          organization_id: string
        }
        Insert: {
          actor_is_system?: boolean
          actor_user_id?: string | null
          created_at?: string
          damage_claim_id: string
          event_type: string
          id?: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
          organization_id: string
        }
        Update: {
          actor_is_system?: boolean
          actor_user_id?: string | null
          created_at?: string
          damage_claim_id?: string
          event_type?: string
          id?: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "damage_claim_events_damage_claim_id_fkey"
            columns: ["damage_claim_id"]
            isOneToOne: false
            referencedRelation: "damage_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_claim_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_claims: {
        Row: {
          actual_repair_cost: number | null
          approved_repair_cost: number | null
          assigned_user_id: string | null
          blocks_vehicle_use: boolean
          claim_number: string
          claim_status: string
          closed_at: string | null
          closed_by_user_id: string | null
          created_at: string
          customer_charge_amount: number | null
          customer_id: string | null
          customer_responsibility_percent: number | null
          damage_date: string | null
          damage_source: string
          description: string
          discovered_at: string
          discovered_by_user_id: string | null
          estimated_repair_cost: number | null
          external_reference: string | null
          id: string
          incident_id: string | null
          inspection_id: string | null
          insurance_claim_id: string | null
          insurance_recovery_amount: number | null
          location_id: string | null
          maintenance_work_order_id: string | null
          metadata: Json | null
          organization_id: string
          other_recovery_amount: number | null
          pre_existing: string | null
          rental_id: string | null
          reservation_id: string | null
          responsibility_status: string
          responsible_party_type: string | null
          severity: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          actual_repair_cost?: number | null
          approved_repair_cost?: number | null
          assigned_user_id?: string | null
          blocks_vehicle_use?: boolean
          claim_number: string
          claim_status?: string
          closed_at?: string | null
          closed_by_user_id?: string | null
          created_at?: string
          customer_charge_amount?: number | null
          customer_id?: string | null
          customer_responsibility_percent?: number | null
          damage_date?: string | null
          damage_source?: string
          description?: string
          discovered_at?: string
          discovered_by_user_id?: string | null
          estimated_repair_cost?: number | null
          external_reference?: string | null
          id?: string
          incident_id?: string | null
          inspection_id?: string | null
          insurance_claim_id?: string | null
          insurance_recovery_amount?: number | null
          location_id?: string | null
          maintenance_work_order_id?: string | null
          metadata?: Json | null
          organization_id: string
          other_recovery_amount?: number | null
          pre_existing?: string | null
          rental_id?: string | null
          reservation_id?: string | null
          responsibility_status?: string
          responsible_party_type?: string | null
          severity?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          actual_repair_cost?: number | null
          approved_repair_cost?: number | null
          assigned_user_id?: string | null
          blocks_vehicle_use?: boolean
          claim_number?: string
          claim_status?: string
          closed_at?: string | null
          closed_by_user_id?: string | null
          created_at?: string
          customer_charge_amount?: number | null
          customer_id?: string | null
          customer_responsibility_percent?: number | null
          damage_date?: string | null
          damage_source?: string
          description?: string
          discovered_at?: string
          discovered_by_user_id?: string | null
          estimated_repair_cost?: number | null
          external_reference?: string | null
          id?: string
          incident_id?: string | null
          inspection_id?: string | null
          insurance_claim_id?: string | null
          insurance_recovery_amount?: number | null
          location_id?: string | null
          maintenance_work_order_id?: string | null
          metadata?: Json | null
          organization_id?: string
          other_recovery_amount?: number | null
          pre_existing?: string | null
          rental_id?: string | null
          reservation_id?: string | null
          responsibility_status?: string
          responsible_party_type?: string | null
          severity?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "damage_claims_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_claims_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_evidence: {
        Row: {
          captured_at: string | null
          created_at: string
          damage_claim_id: string
          description: string | null
          evidence_type: string
          id: string
          inspection_photo_id: string | null
          organization_id: string
          storage_path: string
          uploaded_by_user_id: string | null
          voided_at: string | null
        }
        Insert: {
          captured_at?: string | null
          created_at?: string
          damage_claim_id: string
          description?: string | null
          evidence_type: string
          id?: string
          inspection_photo_id?: string | null
          organization_id: string
          storage_path: string
          uploaded_by_user_id?: string | null
          voided_at?: string | null
        }
        Update: {
          captured_at?: string | null
          created_at?: string
          damage_claim_id?: string
          description?: string | null
          evidence_type?: string
          id?: string
          inspection_photo_id?: string | null
          organization_id?: string
          storage_path?: string
          uploaded_by_user_id?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damage_evidence_damage_claim_id_fkey"
            columns: ["damage_claim_id"]
            isOneToOne: false
            referencedRelation: "damage_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_evidence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_insurance_claims: {
        Row: {
          adjuster_contact: string | null
          adjuster_name: string | null
          approved_amount: number | null
          approved_at: string | null
          claim_reference: string
          claim_status: string
          claimed_amount: number | null
          created_at: string
          damage_claim_id: string
          deductible_amount: number | null
          filed_at: string | null
          id: string
          insurer_name: string
          notes: string | null
          organization_id: string
          paid_amount: number | null
          paid_at: string | null
          policy_reference: string | null
        }
        Insert: {
          adjuster_contact?: string | null
          adjuster_name?: string | null
          approved_amount?: number | null
          approved_at?: string | null
          claim_reference: string
          claim_status?: string
          claimed_amount?: number | null
          created_at?: string
          damage_claim_id: string
          deductible_amount?: number | null
          filed_at?: string | null
          id?: string
          insurer_name: string
          notes?: string | null
          organization_id: string
          paid_amount?: number | null
          paid_at?: string | null
          policy_reference?: string | null
        }
        Update: {
          adjuster_contact?: string | null
          adjuster_name?: string | null
          approved_amount?: number | null
          approved_at?: string | null
          claim_reference?: string
          claim_status?: string
          claimed_amount?: number | null
          created_at?: string
          damage_claim_id?: string
          deductible_amount?: number | null
          filed_at?: string | null
          id?: string
          insurer_name?: string
          notes?: string | null
          organization_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          policy_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damage_insurance_claims_damage_claim_id_fkey"
            columns: ["damage_claim_id"]
            isOneToOne: false
            referencedRelation: "damage_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_insurance_claims_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_recoveries: {
        Row: {
          amount: number
          created_at: string
          damage_claim_id: string
          date: string
          deposit_transaction_id: string | null
          id: string
          insurance_claim_id: string | null
          ledger_transaction_id: string | null
          notes: string | null
          organization_id: string
          recovery_type: string
          reversed_at: string | null
          source_reference: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          damage_claim_id: string
          date: string
          deposit_transaction_id?: string | null
          id?: string
          insurance_claim_id?: string | null
          ledger_transaction_id?: string | null
          notes?: string | null
          organization_id: string
          recovery_type: string
          reversed_at?: string | null
          source_reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          damage_claim_id?: string
          date?: string
          deposit_transaction_id?: string | null
          id?: string
          insurance_claim_id?: string | null
          ledger_transaction_id?: string | null
          notes?: string | null
          organization_id?: string
          recovery_type?: string
          reversed_at?: string | null
          source_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damage_recoveries_damage_claim_id_fkey"
            columns: ["damage_claim_id"]
            isOneToOne: false
            referencedRelation: "damage_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_recoveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_history_events: {
        Row: {
          amount: number
          created_at: string
          deposit_id: string
          event_type: string
          id: string
          notes: string | null
          organization_id: string
          payment_method: string | null
          reason: string | null
          related_transaction_id: string | null
          staff_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          deposit_id: string
          event_type: string
          id?: string
          notes?: string | null
          organization_id: string
          payment_method?: string | null
          reason?: string | null
          related_transaction_id?: string | null
          staff_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          deposit_id?: string
          event_type?: string
          id?: string
          notes?: string | null
          organization_id?: string
          payment_method?: string | null
          reason?: string | null
          related_transaction_id?: string | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposit_history_events_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "security_deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_history_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          current_value: number
          organization_id: string
          sequence_type: string
          year: number
        }
        Insert: {
          current_value?: number
          organization_id: string
          sequence_type: string
          year: number
        }
        Update: {
          current_value?: number
          organization_id?: string
          sequence_type?: string
          year?: number
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          active: boolean
          created_at: string
          default_scope: string | null
          id: string
          name: string
          organization_id: string
          parent_category_id: string | null
          type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_scope?: string | null
          id?: string
          name: string
          organization_id: string
          parent_category_id?: string | null
          type: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_scope?: string | null
          id?: string
          name?: string
          organization_id?: string
          parent_category_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_line_items: {
        Row: {
          amount: number
          category_id: string | null
          description: string | null
          expense_id: string
          id: string
          notes: string | null
          organization_id: string
          vehicle_id: string | null
          work_order_id: string | null
        }
        Insert: {
          amount?: number
          category_id?: string | null
          description?: string | null
          expense_id: string
          id?: string
          notes?: string | null
          organization_id: string
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          description?: string | null
          expense_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_line_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_line_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expense_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_line_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_receipts: {
        Row: {
          amount: number | null
          expense_id: string
          file_name: string
          id: string
          mime_type: string
          note: string | null
          organization_id: string
          receipt_type: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
          vendor_id: string | null
          voided_at: string | null
        }
        Insert: {
          amount?: number | null
          expense_id: string
          file_name: string
          id?: string
          mime_type?: string
          note?: string | null
          organization_id: string
          receipt_type?: string
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
          vendor_id?: string | null
          voided_at?: string | null
        }
        Update: {
          amount?: number | null
          expense_id?: string
          file_name?: string
          id?: string
          mime_type?: string
          note?: string | null
          organization_id?: string
          receipt_type?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
          vendor_id?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_receipts_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expense_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_reimbursements: {
        Row: {
          amount: number
          approved_at: string | null
          expense_id: string
          id: string
          notes: string | null
          organization_id: string
          paid_at: string | null
          payee_type: string
          payee_user_id: string | null
          payment_method: string | null
          requested_at: string | null
          status: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          expense_id: string
          id?: string
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          payee_type: string
          payee_user_id?: string | null
          payment_method?: string | null
          requested_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          expense_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          payee_type?: string
          payee_user_id?: string | null
          payment_method?: string | null
          requested_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_reimbursements_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expense_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_reimbursements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          description: string
          entered_at: string
          entered_by_user_id: string | null
          expense_category_id: string
          expense_number: string
          expense_subcategory_id: string | null
          id: string
          location_id: string | null
          maintenance_work_order_id: string | null
          memo: string | null
          metadata: Json | null
          no_receipt_reason: string | null
          organization_id: string
          ownership_context: string | null
          paid_by_type: string
          paid_by_user_id: string | null
          payment_method: string | null
          payment_source: string | null
          receipt_required: boolean
          receipt_status: string
          reimbursement_status: string | null
          rental_id: string | null
          reversal_of: string | null
          source: string
          status: string
          transaction_date: string
          updated_at: string
          vehicle_id: string | null
          vendor_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          description: string
          entered_at?: string
          entered_by_user_id?: string | null
          expense_category_id: string
          expense_number: string
          expense_subcategory_id?: string | null
          id?: string
          location_id?: string | null
          maintenance_work_order_id?: string | null
          memo?: string | null
          metadata?: Json | null
          no_receipt_reason?: string | null
          organization_id: string
          ownership_context?: string | null
          paid_by_type?: string
          paid_by_user_id?: string | null
          payment_method?: string | null
          payment_source?: string | null
          receipt_required?: boolean
          receipt_status?: string
          reimbursement_status?: string | null
          rental_id?: string | null
          reversal_of?: string | null
          source?: string
          status?: string
          transaction_date: string
          updated_at?: string
          vehicle_id?: string | null
          vendor_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          description?: string
          entered_at?: string
          entered_by_user_id?: string | null
          expense_category_id?: string
          expense_number?: string
          expense_subcategory_id?: string | null
          id?: string
          location_id?: string | null
          maintenance_work_order_id?: string | null
          memo?: string | null
          metadata?: Json | null
          no_receipt_reason?: string | null
          organization_id?: string
          ownership_context?: string | null
          paid_by_type?: string
          paid_by_user_id?: string | null
          payment_method?: string | null
          payment_source?: string | null
          receipt_required?: boolean
          receipt_status?: string
          reimbursement_status?: string | null
          rental_id?: string | null
          reversal_of?: string | null
          source?: string
          status?: string
          transaction_date?: string
          updated_at?: string
          vehicle_id?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_transactions_expense_category_id_fkey"
            columns: ["expense_category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_entity_references: {
        Row: {
          created_at: string
          entity_type: string
          external_id: string
          external_parent_id: string | null
          id: string
          internal_id: string
          metadata: Json | null
          organization_id: string
          status: string
          system: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          external_id: string
          external_parent_id?: string | null
          id?: string
          internal_id: string
          metadata?: Json | null
          organization_id: string
          status?: string
          system: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          external_id?: string
          external_parent_id?: string | null
          id?: string
          internal_id?: string
          metadata?: Json | null
          organization_id?: string
          status?: string
          system?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_entity_references_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      file_objects: {
        Row: {
          bucket: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          file_name: string
          id: string
          mime_type: string
          organization_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          bucket: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          file_name: string
          id?: string
          mime_type?: string
          organization_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          file_name?: string
          id?: string
          mime_type?: string
          organization_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_objects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          account_subtype: string | null
          account_type: string
          active: boolean
          created_at: string
          currency: string
          external_account_id: string | null
          id: string
          institution_name: string | null
          last_four: string | null
          name: string
          opening_balance: number | null
          organization_id: string
          source: string | null
          updated_at: string
        }
        Insert: {
          account_subtype?: string | null
          account_type: string
          active?: boolean
          created_at?: string
          currency?: string
          external_account_id?: string | null
          id?: string
          institution_name?: string | null
          last_four?: string | null
          name: string
          opening_balance?: number | null
          organization_id: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          account_subtype?: string | null
          account_type?: string
          active?: boolean
          created_at?: string
          currency?: string
          external_account_id?: string | null
          id?: string
          institution_name?: string | null
          last_four?: string | null
          name?: string
          opening_balance?: number | null
          organization_id?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_statements: {
        Row: {
          closing_balance: number | null
          financial_account_id: string
          id: string
          import_batch_id: string | null
          imported_at: string
          imported_by_user_id: string | null
          notes: string | null
          opening_balance: number | null
          organization_id: string
          reconciliation_status: string
          source_file_name: string | null
          statement_end_date: string
          statement_start_date: string
        }
        Insert: {
          closing_balance?: number | null
          financial_account_id: string
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          imported_by_user_id?: string | null
          notes?: string | null
          opening_balance?: number | null
          organization_id: string
          reconciliation_status?: string
          source_file_name?: string | null
          statement_end_date: string
          statement_start_date: string
        }
        Update: {
          closing_balance?: number | null
          financial_account_id?: string
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          imported_by_user_id?: string | null
          notes?: string | null
          opening_balance?: number | null
          organization_id?: string
          reconciliation_status?: string
          source_file_name?: string | null
          statement_end_date?: string
          statement_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_statements_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_statements_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_statements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_financial_periods: {
        Row: {
          collections: number | null
          created_at: string
          expenses: number | null
          granularity: string
          id: string
          import_batch_id: string | null
          net_profit: number | null
          notes: string | null
          organization_id: string
          period_end: string
          period_start: string
          rental_count: number | null
          revenue: number
          source_system: string
          vehicle_count: number | null
        }
        Insert: {
          collections?: number | null
          created_at?: string
          expenses?: number | null
          granularity: string
          id?: string
          import_batch_id?: string | null
          net_profit?: number | null
          notes?: string | null
          organization_id: string
          period_end: string
          period_start: string
          rental_count?: number | null
          revenue?: number
          source_system: string
          vehicle_count?: number | null
        }
        Update: {
          collections?: number | null
          created_at?: string
          expenses?: number | null
          granularity?: string
          id?: string
          import_batch_id?: string | null
          net_profit?: number | null
          notes?: string | null
          organization_id?: string
          period_end?: string
          period_start?: string
          rental_count?: number | null
          revenue?: number
          source_system?: string
          vehicle_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "historical_financial_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          entity_id: string | null
          organization_id: string
          request_key: string
          scope: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          organization_id: string
          request_key: string
          scope: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          organization_id?: string
          request_key?: string
          scope?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          error_count: number
          id: string
          import_type: string
          imported_at: string
          imported_by_user_id: string
          metadata: Json | null
          organization_id: string
          rollback_status: string
          row_count: number
          skipped_count: number
          source_file_name: string | null
          source_name: string
          success_count: number
          warning_count: number
        }
        Insert: {
          error_count?: number
          id?: string
          import_type: string
          imported_at?: string
          imported_by_user_id: string
          metadata?: Json | null
          organization_id: string
          rollback_status?: string
          row_count?: number
          skipped_count?: number
          source_file_name?: string | null
          source_name: string
          success_count?: number
          warning_count?: number
        }
        Update: {
          error_count?: number
          id?: string
          import_type?: string
          imported_at?: string
          imported_by_user_id?: string
          metadata?: Json | null
          organization_id?: string
          rollback_status?: string
          row_count?: number
          skipped_count?: number
          source_file_name?: string | null
          source_name?: string
          success_count?: number
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          description: string
          direction: string
          external_transaction_id: string | null
          financial_account_id: string
          id: string
          import_batch_id: string
          import_fingerprint: string
          match_status: string
          merchant_name: string | null
          normalized_description: string | null
          organization_id: string
          posted_date: string | null
          raw_data: Json | null
          reference: string | null
          review_status: string
          running_balance: number | null
          statement_id: string | null
          transaction_date: string
          transaction_type: string | null
          transfer_status: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          description: string
          direction: string
          external_transaction_id?: string | null
          financial_account_id: string
          id?: string
          import_batch_id: string
          import_fingerprint: string
          match_status?: string
          merchant_name?: string | null
          normalized_description?: string | null
          organization_id: string
          posted_date?: string | null
          raw_data?: Json | null
          reference?: string | null
          review_status?: string
          running_balance?: number | null
          statement_id?: string | null
          transaction_date: string
          transaction_type?: string | null
          transfer_status?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          description?: string
          direction?: string
          external_transaction_id?: string | null
          financial_account_id?: string
          id?: string
          import_batch_id?: string
          import_fingerprint?: string
          match_status?: string
          merchant_name?: string | null
          normalized_description?: string | null
          organization_id?: string
          posted_date?: string | null
          raw_data?: Json | null
          reference?: string | null
          review_status?: string
          running_balance?: number | null
          statement_id?: string | null
          transaction_date?: string
          transaction_type?: string | null
          transfer_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imported_transactions_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_transactions_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "financial_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          attempts: number
          caused_by_event_id: string | null
          created_at: string
          direction: string
          entity_id: string | null
          entity_type: string | null
          error_code: string | null
          error_message: string | null
          event_key: string
          event_type: string
          external_entity_id: string | null
          id: string
          integration: string
          last_attempt_at: string | null
          organization_id: string
          origin_event_id: string | null
          origin_system: string
          payload: Json
          processed_at: string | null
          schema_version: number
          status: string
        }
        Insert: {
          attempts?: number
          caused_by_event_id?: string | null
          created_at?: string
          direction: string
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          error_message?: string | null
          event_key: string
          event_type: string
          external_entity_id?: string | null
          id?: string
          integration: string
          last_attempt_at?: string | null
          organization_id: string
          origin_event_id?: string | null
          origin_system?: string
          payload: Json
          processed_at?: string | null
          schema_version?: number
          status?: string
        }
        Update: {
          attempts?: number
          caused_by_event_id?: string | null
          created_at?: string
          direction?: string
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          error_message?: string | null
          event_key?: string
          event_type?: string
          external_entity_id?: string | null
          id?: string
          integration?: string
          last_attempt_at?: string | null
          organization_id?: string
          origin_event_id?: string | null
          origin_system?: string
          payload?: Json
          processed_at?: string | null
          schema_version?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_review_items: {
        Row: {
          candidate_entity_ids: Json | null
          created_at: string
          event_id: string
          id: string
          organization_id: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          review_type: string
          severity: string
          status: string
        }
        Insert: {
          candidate_entity_ids?: Json | null
          created_at?: string
          event_id: string
          id?: string
          organization_id: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_type: string
          severity?: string
          status?: string
        }
        Update: {
          candidate_entity_ids?: Json | null
          created_at?: string
          event_id?: string
          id?: string
          organization_id?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_type?: string
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_review_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "integration_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_review_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_settlements: {
        Row: {
          created_at: string
          expenses: number
          finalized_at: string | null
          finalized_by: string | null
          gross_revenue: number
          id: string
          investor_amount: number
          investor_id: string
          notes: string | null
          operator_amount: number
          organization_id: string
          paid_at: string | null
          pairing_id: string | null
          period_end: string
          period_start: string
          status: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          expenses?: number
          finalized_at?: string | null
          finalized_by?: string | null
          gross_revenue?: number
          id?: string
          investor_amount?: number
          investor_id: string
          notes?: string | null
          operator_amount?: number
          organization_id: string
          paid_at?: string | null
          pairing_id?: string | null
          period_end: string
          period_start: string
          status?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          expenses?: number
          finalized_at?: string | null
          finalized_by?: string | null
          gross_revenue?: number
          id?: string
          investor_amount?: number
          investor_id?: string
          notes?: string | null
          operator_amount?: number
          organization_id?: string
          paid_at?: string | null
          pairing_id?: string | null
          period_end?: string
          period_start?: string
          status?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investor_settlements_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_settlements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_vehicles: {
        Row: {
          basis: string | null
          compensation_type: string
          created_at: string
          custom_terms: string | null
          effective_date: string
          end_date: string | null
          fixed_amount: number | null
          fixed_frequency: string | null
          guaranteed_during_downtime: boolean | null
          guaranteed_when_not_rented: boolean | null
          id: string
          investor_id: string
          notes: string | null
          organization_id: string
          percentage: number | null
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          basis?: string | null
          compensation_type: string
          created_at?: string
          custom_terms?: string | null
          effective_date: string
          end_date?: string | null
          fixed_amount?: number | null
          fixed_frequency?: string | null
          guaranteed_during_downtime?: boolean | null
          guaranteed_when_not_rented?: boolean | null
          id?: string
          investor_id: string
          notes?: string | null
          organization_id: string
          percentage?: number | null
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          basis?: string | null
          compensation_type?: string
          created_at?: string
          custom_terms?: string | null
          effective_date?: string
          end_date?: string | null
          fixed_amount?: number | null
          fixed_frequency?: string | null
          guaranteed_during_downtime?: boolean | null
          guaranteed_when_not_rented?: boolean | null
          id?: string
          investor_id?: string
          notes?: string | null
          organization_id?: string
          percentage?: number | null
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_vehicles_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_vehicles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_vehicles_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      investors: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string
          email: string
          external_id: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          partner_type: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string
          external_id?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          partner_type?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string
          external_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          partner_type?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string
          id: string
          is_default: boolean
          name: string
          organization_id: string
          phone: string
          timezone: string
        }
        Insert: {
          address?: string
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          phone?: string
          timezone?: string
        }
        Update: {
          address?: string
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          phone?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_receipts: {
        Row: {
          amount: number | null
          file_name: string
          id: string
          mime_type: string
          note: string | null
          organization_id: string
          receipt_type: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
          vendor_id: string | null
          work_order_id: string
        }
        Insert: {
          amount?: number | null
          file_name: string
          id?: string
          mime_type?: string
          note?: string | null
          organization_id: string
          receipt_type?: string
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
          vendor_id?: string | null
          work_order_id: string
        }
        Update: {
          amount?: number | null
          file_name?: string
          id?: string
          mime_type?: string
          note?: string | null
          organization_id?: string
          receipt_type?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
          vendor_id?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_receipts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_vendors: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          postal: string | null
          state: string | null
          updated_at: string
          vendor_type: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          postal?: string | null
          state?: string | null
          updated_at?: string
          vendor_type?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          postal?: string | null
          state?: string | null
          updated_at?: string
          vendor_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_vendors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_work_order_events: {
        Row: {
          actor_is_system: boolean
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          new_value: string | null
          note: string | null
          old_value: string | null
          organization_id: string
          work_order_id: string
        }
        Insert: {
          actor_is_system?: boolean
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
          organization_id: string
          work_order_id: string
        }
        Update: {
          actor_is_system?: boolean
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
          organization_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_work_order_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_work_order_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_work_orders: {
        Row: {
          actual_cost: number | null
          actual_ready_at: string | null
          actual_start_at: string | null
          assigned_user_id: string | null
          blocks_vehicle_use: boolean
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          damage_claim_id: string | null
          description: string
          diagnosis: string | null
          downtime_ended_at: string | null
          downtime_started_at: string | null
          estimated_cost: number | null
          expected_ready_at: string | null
          fuel_level_in: number | null
          id: string
          internal_notes: string | null
          labor_cost: number | null
          location_id: string | null
          maintenance_type: string
          next_service_due_date: string | null
          next_service_due_odometer: number | null
          notes: string | null
          odometer_in: number | null
          odometer_out: number | null
          opened_at: string
          opened_by_user_id: string
          organization_id: string
          other_cost: number | null
          parts_cost: number | null
          priority: string
          reported_issue: string | null
          scheduled_start_at: string | null
          source: string
          status: string
          tax_cost: number | null
          title: string
          updated_at: string
          vehicle_id: string
          vendor_id: string | null
          work_order_number: string
          work_performed: string | null
        }
        Insert: {
          actual_cost?: number | null
          actual_ready_at?: string | null
          actual_start_at?: string | null
          assigned_user_id?: string | null
          blocks_vehicle_use?: boolean
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          damage_claim_id?: string | null
          description?: string
          diagnosis?: string | null
          downtime_ended_at?: string | null
          downtime_started_at?: string | null
          estimated_cost?: number | null
          expected_ready_at?: string | null
          fuel_level_in?: number | null
          id?: string
          internal_notes?: string | null
          labor_cost?: number | null
          location_id?: string | null
          maintenance_type?: string
          next_service_due_date?: string | null
          next_service_due_odometer?: number | null
          notes?: string | null
          odometer_in?: number | null
          odometer_out?: number | null
          opened_at?: string
          opened_by_user_id: string
          organization_id: string
          other_cost?: number | null
          parts_cost?: number | null
          priority?: string
          reported_issue?: string | null
          scheduled_start_at?: string | null
          source?: string
          status?: string
          tax_cost?: number | null
          title: string
          updated_at?: string
          vehicle_id: string
          vendor_id?: string | null
          work_order_number: string
          work_performed?: string | null
        }
        Update: {
          actual_cost?: number | null
          actual_ready_at?: string | null
          actual_start_at?: string | null
          assigned_user_id?: string | null
          blocks_vehicle_use?: boolean
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          damage_claim_id?: string | null
          description?: string
          diagnosis?: string | null
          downtime_ended_at?: string | null
          downtime_started_at?: string | null
          estimated_cost?: number | null
          expected_ready_at?: string | null
          fuel_level_in?: number | null
          id?: string
          internal_notes?: string | null
          labor_cost?: number | null
          location_id?: string | null
          maintenance_type?: string
          next_service_due_date?: string | null
          next_service_due_odometer?: number | null
          notes?: string | null
          odometer_in?: number | null
          odometer_out?: number | null
          opened_at?: string
          opened_by_user_id?: string
          organization_id?: string
          other_cost?: number | null
          parts_cost?: number | null
          priority?: string
          reported_issue?: string | null
          scheduled_start_at?: string | null
          source?: string
          status?: string
          tax_cost?: number | null
          title?: string
          updated_at?: string
          vehicle_id?: string
          vendor_id?: string | null
          work_order_number?: string
          work_performed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_work_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "maintenance_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_import_batches: {
        Row: {
          error_count: number
          id: string
          import_type: string
          imported_at: string
          imported_by_user_id: string
          metadata: Json | null
          organization_id: string
          rollback_status: string
          row_count: number
          skipped_count: number
          source_file_name: string | null
          source_name: string
          success_count: number
          warning_count: number
        }
        Insert: {
          error_count?: number
          id?: string
          import_type: string
          imported_at?: string
          imported_by_user_id: string
          metadata?: Json | null
          organization_id: string
          rollback_status?: string
          row_count?: number
          skipped_count?: number
          source_file_name?: string | null
          source_name: string
          success_count?: number
          warning_count?: number
        }
        Update: {
          error_count?: number
          id?: string
          import_type?: string
          imported_at?: string
          imported_by_user_id?: string
          metadata?: Json | null
          organization_id?: string
          rollback_status?: string
          row_count?: number
          skipped_count?: number
          source_file_name?: string | null
          source_name?: string
          success_count?: number
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "migration_import_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_issues: {
        Row: {
          batch_id: string
          code: string
          entity_type: string | null
          id: string
          message: string
          organization_id: string
          resolution: string | null
          resolved_at: string | null
          row_number: number | null
          severity: string
        }
        Insert: {
          batch_id: string
          code: string
          entity_type?: string | null
          id?: string
          message: string
          organization_id: string
          resolution?: string | null
          resolved_at?: string | null
          row_number?: number | null
          severity: string
        }
        Update: {
          batch_id?: string
          code?: string
          entity_type?: string | null
          id?: string
          message?: string
          organization_id?: string
          resolution?: string | null
          resolved_at?: string | null
          row_number?: number | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_issues_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "migration_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_issues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempt_count: number
          channel: string
          created_at: string
          destination: string | null
          failed_at: string | null
          failure_reason: string | null
          id: string
          last_attempt_at: string | null
          notification_id: string
          organization_id: string
          provider: string | null
          provider_message_id: string | null
          recipient_user_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          attempt_count?: number
          channel: string
          created_at?: string
          destination?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          notification_id: string
          organization_id: string
          provider?: string | null
          provider_message_id?: string | null
          recipient_user_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempt_count?: number
          channel?: string
          created_at?: string
          destination?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          notification_id?: string
          organization_id?: string
          provider?: string | null
          provider_message_id?: string | null
          recipient_user_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          category: string
          connect_pro_enabled: boolean
          email_enabled: boolean
          in_app_enabled: boolean
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          connect_pro_enabled?: boolean
          email_enabled?: boolean
          in_app_enabled?: boolean
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          connect_pro_enabled?: boolean
          email_enabled?: boolean
          in_app_enabled?: boolean
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          actor_user_id: string | null
          archived_at: string | null
          category: string
          created_at: string
          dedupe_key: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          expires_at: string | null
          id: string
          message: string
          metadata: Json | null
          notification_type: string
          organization_id: string
          priority: string
          read_at: string | null
          recipient_user_id: string
          source_event: string
          source_event_id: string | null
          title: string
        }
        Insert: {
          action_url?: string | null
          actor_user_id?: string | null
          archived_at?: string | null
          category: string
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          notification_type: string
          organization_id: string
          priority?: string
          read_at?: string | null
          recipient_user_id: string
          source_event: string
          source_event_id?: string | null
          title: string
        }
        Update: {
          action_url?: string | null
          actor_user_id?: string | null
          archived_at?: string | null
          category?: string
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          notification_type?: string
          organization_id?: string
          priority?: string
          read_at?: string | null
          recipient_user_id?: string
          source_event?: string
          source_event_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          role_id: string | null
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          organization_id: string
          role_id?: string | null
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          role_id?: string | null
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          joined_at: string | null
          organization_id: string
          role_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          organization_id: string
          role_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          organization_id?: string
          role_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          slug: string | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          name: string
          slug?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          slug?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      partnership_expense_rules: {
        Row: {
          category: string
          deduct_before_split: boolean
          id: string
          notes: string | null
          organization_id: string
          pairing_id: string
          responsible_party: string | null
          treatment: string
        }
        Insert: {
          category: string
          deduct_before_split?: boolean
          id?: string
          notes?: string | null
          organization_id: string
          pairing_id: string
          responsible_party?: string | null
          treatment: string
        }
        Update: {
          category?: string
          deduct_before_split?: boolean
          id?: string
          notes?: string | null
          organization_id?: string
          pairing_id?: string
          responsible_party?: string | null
          treatment?: string
        }
        Relationships: [
          {
            foreignKeyName: "partnership_expense_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_expense_rules_pairing_id_fkey"
            columns: ["pairing_id"]
            isOneToOne: false
            referencedRelation: "investor_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          billing_period_id: string | null
          created_at: string
          id: string
          obligation_transaction_id: string | null
          organization_id: string
          payment_transaction_id: string
        }
        Insert: {
          amount?: number
          billing_period_id?: string | null
          created_at?: string
          id?: string
          obligation_transaction_id?: string | null
          organization_id: string
          payment_transaction_id: string
        }
        Update: {
          amount?: number
          billing_period_id?: string | null
          created_at?: string
          id?: string
          obligation_transaction_id?: string | null
          organization_id?: string
          payment_transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_billing_period_id_fkey"
            columns: ["billing_period_id"]
            isOneToOne: false
            referencedRelation: "billing_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_obligation_transaction_id_fkey"
            columns: ["obligation_transaction_id"]
            isOneToOne: false
            referencedRelation: "rental_ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "rental_ledger_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          id: string
          label: string
          module: string
        }
        Insert: {
          code: string
          id?: string
          label: string
          module: string
        }
        Update: {
          code?: string
          id?: string
          label?: string
          module?: string
        }
        Relationships: []
      }
      poc_customers: {
        Row: {
          email: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          email?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          email?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poc_customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "poc_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      poc_memberships: {
        Row: {
          id: string
          org_id: string
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          org_id: string
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          org_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poc_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "poc_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      poc_orgs: {
        Row: {
          id: string
          name: string
          slug: string | null
        }
        Insert: {
          id: string
          name: string
          slug?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string | null
        }
        Relationships: []
      }
      poc_reservations: {
        Row: {
          customer_id: string | null
          end_date: string
          id: string
          org_id: string
          start_date: string
          status: string
          vehicle_id: string | null
        }
        Insert: {
          customer_id?: string | null
          end_date: string
          id?: string
          org_id: string
          start_date: string
          status?: string
          vehicle_id?: string | null
        }
        Update: {
          customer_id?: string | null
          end_date?: string
          id?: string
          org_id?: string
          start_date?: string
          status?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poc_reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "poc_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poc_reservations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "poc_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poc_reservations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "poc_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      poc_vehicles: {
        Row: {
          id: string
          license_plate: string
          make: string
          model: string
          org_id: string
        }
        Insert: {
          id?: string
          license_plate: string
          make: string
          model: string
          org_id: string
        }
        Update: {
          id?: string
          license_plate?: string
          make?: string
          model?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poc_vehicles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "poc_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string
          email: string
          first_name: string
          id: string
          last_name: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          email?: string
          first_name?: string
          id: string
          last_name?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      reconciliation_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          event_type: string
          id: string
          note: string | null
          organization_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          event_type: string
          id?: string
          note?: string | null
          organization_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          event_type?: string
          id?: string
          note?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_matches: {
        Row: {
          allocated_amount: number
          confidence: string | null
          created_at: string
          created_by: string | null
          id: string
          imported_transaction_id: string
          match_method: string
          notes: string | null
          organization_id: string
          target_id: string | null
          target_type: string
          voided_at: string | null
        }
        Insert: {
          allocated_amount?: number
          confidence?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          imported_transaction_id: string
          match_method: string
          notes?: string | null
          organization_id: string
          target_id?: string | null
          target_type: string
          voided_at?: string | null
        }
        Update: {
          allocated_amount?: number
          confidence?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          imported_transaction_id?: string
          match_method?: string
          notes?: string | null
          organization_id?: string
          target_id?: string | null
          target_type?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_matches_imported_transaction_id_fkey"
            columns: ["imported_transaction_id"]
            isOneToOne: false
            referencedRelation: "imported_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_ledger_transactions: {
        Row: {
          amount: number
          billing_period: string | null
          category: string
          charge_group_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          deposit_id: string | null
          description: string
          direction: string
          effective_date: string
          external_payment_id: string | null
          external_transaction_id: string | null
          id: string
          integration_event_id: string | null
          invoice_id: string | null
          metadata: Json | null
          notes: string | null
          organization_id: string
          payment_method: string | null
          payment_source: string | null
          processor: string | null
          related_transaction_id: string | null
          rental_id: string
          reservation_id: string | null
          status: string
          tender_method: string | null
          transaction_type: string
          vehicle_id: string | null
        }
        Insert: {
          amount?: number
          billing_period?: string | null
          category: string
          charge_group_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          deposit_id?: string | null
          description?: string
          direction: string
          effective_date: string
          external_payment_id?: string | null
          external_transaction_id?: string | null
          id?: string
          integration_event_id?: string | null
          invoice_id?: string | null
          metadata?: Json | null
          notes?: string | null
          organization_id: string
          payment_method?: string | null
          payment_source?: string | null
          processor?: string | null
          related_transaction_id?: string | null
          rental_id: string
          reservation_id?: string | null
          status?: string
          tender_method?: string | null
          transaction_type: string
          vehicle_id?: string | null
        }
        Update: {
          amount?: number
          billing_period?: string | null
          category?: string
          charge_group_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deposit_id?: string | null
          description?: string
          direction?: string
          effective_date?: string
          external_payment_id?: string | null
          external_transaction_id?: string | null
          id?: string
          integration_event_id?: string | null
          invoice_id?: string | null
          metadata?: Json | null
          notes?: string | null
          organization_id?: string
          payment_method?: string | null
          payment_source?: string | null
          processor?: string | null
          related_transaction_id?: string | null
          rental_id?: string
          reservation_id?: string | null
          status?: string
          tender_method?: string | null
          transaction_type?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_ledger_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_ledger_transactions_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_vehicle_exchanges: {
        Row: {
          created_at: string
          effective_date: string
          id: string
          new_mileage_out: number
          new_vehicle_id: string
          old_mileage_in: number
          old_vehicle_id: string
          organization_id: string
          rate_change: Json | null
          reason: string
          rental_id: string
        }
        Insert: {
          created_at?: string
          effective_date: string
          id?: string
          new_mileage_out?: number
          new_vehicle_id: string
          old_mileage_in?: number
          old_vehicle_id: string
          organization_id: string
          rate_change?: Json | null
          reason?: string
          rental_id: string
        }
        Update: {
          created_at?: string
          effective_date?: string
          id?: string
          new_mileage_out?: number
          new_vehicle_id?: string
          old_mileage_in?: number
          old_vehicle_id?: string
          organization_id?: string
          rate_change?: Json | null
          reason?: string
          rental_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_vehicle_exchanges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_vehicle_exchanges_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      rentals: {
        Row: {
          actual_return_date: string | null
          actual_return_time: string | null
          agreement_number: string
          amount_paid: number
          balance_due: number
          billing_config: Json | null
          checkout_date: string | null
          checkout_time: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          deposit_amount: number
          discount: number
          external_agreement_id: string | null
          fees: number
          fuel_in: number | null
          fuel_out: number | null
          grace_period: number
          id: string
          imported_legacy_rental: boolean | null
          late_fee: number
          late_fee_applied: boolean
          migration_cutover_at: string | null
          mileage_in: number | null
          mileage_out: number | null
          next_payment_due: string | null
          organization_id: string
          payment_cutoff_time: string | null
          pricing_snapshot: Json | null
          rate_amount: number
          rate_type: string
          rental_origin: string | null
          reservation_id: string | null
          scheduled_return_date: string
          scheduled_return_time: string | null
          status: string
          subtotal: number
          tax: number
          updated_at: string
          vehicle_id: string
          weekly_payment_day: string | null
          weeks_rented: number
        }
        Insert: {
          actual_return_date?: string | null
          actual_return_time?: string | null
          agreement_number: string
          amount_paid?: number
          balance_due?: number
          billing_config?: Json | null
          checkout_date?: string | null
          checkout_time?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          deposit_amount?: number
          discount?: number
          external_agreement_id?: string | null
          fees?: number
          fuel_in?: number | null
          fuel_out?: number | null
          grace_period?: number
          id?: string
          imported_legacy_rental?: boolean | null
          late_fee?: number
          late_fee_applied?: boolean
          migration_cutover_at?: string | null
          mileage_in?: number | null
          mileage_out?: number | null
          next_payment_due?: string | null
          organization_id: string
          payment_cutoff_time?: string | null
          pricing_snapshot?: Json | null
          rate_amount?: number
          rate_type?: string
          rental_origin?: string | null
          reservation_id?: string | null
          scheduled_return_date: string
          scheduled_return_time?: string | null
          status?: string
          subtotal?: number
          tax?: number
          updated_at?: string
          vehicle_id: string
          weekly_payment_day?: string | null
          weeks_rented?: number
        }
        Update: {
          actual_return_date?: string | null
          actual_return_time?: string | null
          agreement_number?: string
          amount_paid?: number
          balance_due?: number
          billing_config?: Json | null
          checkout_date?: string | null
          checkout_time?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deposit_amount?: number
          discount?: number
          external_agreement_id?: string | null
          fees?: number
          fuel_in?: number | null
          fuel_out?: number | null
          grace_period?: number
          id?: string
          imported_legacy_rental?: boolean | null
          late_fee?: number
          late_fee_applied?: boolean
          migration_cutover_at?: string | null
          mileage_in?: number | null
          mileage_out?: number | null
          next_payment_due?: string | null
          organization_id?: string
          payment_cutoff_time?: string | null
          pricing_snapshot?: Json | null
          rate_amount?: number
          rate_type?: string
          rental_origin?: string | null
          reservation_id?: string | null
          scheduled_return_date?: string
          scheduled_return_time?: string | null
          status?: string
          subtotal?: number
          tax?: number
          updated_at?: string
          vehicle_id?: string
          weekly_payment_day?: string | null
          weeks_rented?: number
        }
        Relationships: [
          {
            foreignKeyName: "rentals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          amount_paid: number
          converted_to_rental_id: string | null
          created_at: string
          created_by: string | null
          created_by_name: string
          customer_id: string | null
          deposit_amount: number
          deposit_status: string
          end_date: string
          ghl_opportunity_id: string | null
          id: string
          organization_id: string
          pricing_snapshot: Json | null
          renter_email: string
          renter_name: string
          renter_phone: string
          source: string
          start_date: string
          status: string
          total_price: number
          vehicle_id: string
        }
        Insert: {
          amount_paid?: number
          converted_to_rental_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          customer_id?: string | null
          deposit_amount?: number
          deposit_status?: string
          end_date: string
          ghl_opportunity_id?: string | null
          id?: string
          organization_id: string
          pricing_snapshot?: Json | null
          renter_email?: string
          renter_name: string
          renter_phone?: string
          source?: string
          start_date: string
          status?: string
          total_price?: number
          vehicle_id: string
        }
        Update: {
          amount_paid?: number
          converted_to_rental_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          customer_id?: string | null
          deposit_amount?: number
          deposit_status?: string
          end_date?: string
          ghl_opportunity_id?: string | null
          id?: string
          organization_id?: string
          pricing_snapshot?: Json | null
          renter_email?: string
          renter_name?: string
          renter_phone?: string
          source?: string
          start_date?: string
          status?: string
          total_price?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_code: string
          role_id: string
        }
        Insert: {
          permission_code: string
          role_id: string
        }
        Update: {
          permission_code?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          id: string
          is_system: boolean
          name: string
          organization_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          organization_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      security_deposits: {
        Row: {
          applied_amount: number
          collected_amount: number
          collected_at: string | null
          completed_at: string | null
          created_at: string
          currency: string
          customer_id: string
          forfeited_amount: number
          id: string
          notes: string | null
          organization_id: string
          policy_id: string | null
          refund_due_at: string | null
          refunded_amount: number
          rental_id: string | null
          required_amount: number
          reservation_id: string | null
          source_snapshot: Json | null
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          applied_amount?: number
          collected_amount?: number
          collected_at?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          forfeited_amount?: number
          id?: string
          notes?: string | null
          organization_id: string
          policy_id?: string | null
          refund_due_at?: string | null
          refunded_amount?: number
          rental_id?: string | null
          required_amount?: number
          reservation_id?: string | null
          source_snapshot?: Json | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          applied_amount?: number
          collected_amount?: number
          collected_at?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          forfeited_amount?: number
          id?: string
          notes?: string | null
          organization_id?: string
          policy_id?: string | null
          refund_due_at?: string | null
          refunded_amount?: number
          rental_id?: string | null
          required_amount?: number
          reservation_id?: string | null
          source_snapshot?: Json | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_deposits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_deposits_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      task_events: {
        Row: {
          actor_is_system: boolean
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          new_value: string | null
          note: string | null
          old_value: string | null
          organization_id: string
          task_id: string
        }
        Insert: {
          actor_is_system?: boolean
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
          organization_id: string
          task_id: string
        }
        Update: {
          actor_is_system?: boolean
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
          organization_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_notes: {
        Row: {
          author_user_id: string
          created_at: string
          id: string
          organization_id: string
          task_id: string
          text: string
        }
        Insert: {
          author_user_id: string
          created_at?: string
          id?: string
          organization_id: string
          task_id: string
          text: string
        }
        Update: {
          author_user_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          task_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_notes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_by_user_id: string | null
          assigned_to_user_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_user_id: string | null
          category: string
          completed_at: string | null
          completed_by_user_id: string | null
          created_at: string
          created_by_user_id: string | null
          dedupe_key: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          id: string
          location_id: string | null
          notes: string | null
          organization_id: string
          priority: string
          source_event: string | null
          source_type: string
          status: string
          tags: Json | null
          task_number: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_by_user_id?: string | null
          assigned_to_user_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          category?: string
          completed_at?: string | null
          completed_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          dedupe_key?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          organization_id: string
          priority?: string
          source_event?: string | null
          source_type?: string
          status?: string
          tags?: Json | null
          task_number: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_by_user_id?: string | null
          assigned_to_user_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          category?: string
          completed_at?: string | null
          completed_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          dedupe_key?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          organization_id?: string
          priority?: string
          source_event?: string | null
          source_type?: string
          status?: string
          tags?: Json | null
          task_number?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_classes: {
        Row: {
          active: boolean
          created_at: string
          daily_rate: number
          deposit_amount: number
          id: string
          minimum_rental_duration: number
          name: string
          organization_id: string
          updated_at: string
          vehicle_type: string
          weekly_rate: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_rate?: number
          deposit_amount?: number
          id?: string
          minimum_rental_duration?: number
          name: string
          organization_id: string
          updated_at?: string
          vehicle_type?: string
          weekly_rate?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_rate?: number
          deposit_amount?: number
          id?: string
          minimum_rental_duration?: number
          name?: string
          organization_id?: string
          updated_at?: string
          vehicle_type?: string
          weekly_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_classes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string
          current_mileage: number
          daily_rate: number
          deposit_amount: number
          deposit_override: boolean | null
          external_id: string | null
          id: string
          insurance_expiry: string | null
          insurance_policy_number: string | null
          license_plate: string
          location: string
          make: string
          min_rental_days_override: number | null
          model: string
          organization_id: string
          owner_display_name: string | null
          owner_entity_id: string | null
          ownership_effective_date: string | null
          ownership_notes: string | null
          ownership_type: string | null
          pricing_override: boolean | null
          purchase_date: string | null
          purchase_price: number
          registration_expiry: string | null
          status: string
          updated_at: string
          vehicle_class_id: string | null
          vehicle_type: string
          vin: string
          weekly_rate: number
          year: number
        }
        Insert: {
          created_at?: string
          current_mileage?: number
          daily_rate?: number
          deposit_amount?: number
          deposit_override?: boolean | null
          external_id?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_policy_number?: string | null
          license_plate?: string
          location?: string
          make: string
          min_rental_days_override?: number | null
          model: string
          organization_id: string
          owner_display_name?: string | null
          owner_entity_id?: string | null
          ownership_effective_date?: string | null
          ownership_notes?: string | null
          ownership_type?: string | null
          pricing_override?: boolean | null
          purchase_date?: string | null
          purchase_price?: number
          registration_expiry?: string | null
          status?: string
          updated_at?: string
          vehicle_class_id?: string | null
          vehicle_type?: string
          vin: string
          weekly_rate?: number
          year: number
        }
        Update: {
          created_at?: string
          current_mileage?: number
          daily_rate?: number
          deposit_amount?: number
          deposit_override?: boolean | null
          external_id?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_policy_number?: string | null
          license_plate?: string
          location?: string
          make?: string
          min_rental_days_override?: number | null
          model?: string
          organization_id?: string
          owner_display_name?: string | null
          owner_entity_id?: string | null
          ownership_effective_date?: string | null
          ownership_notes?: string | null
          ownership_type?: string | null
          pricing_override?: boolean | null
          purchase_date?: string | null
          purchase_price?: number
          registration_expiry?: string | null
          status?: string
          updated_at?: string
          vehicle_class_id?: string | null
          vehicle_type?: string
          vin?: string
          weekly_rate?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_permission: {
        Args: { org_id: string; perm_code: string }
        Returns: boolean
      }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      next_document_number: {
        Args: {
          org_id: string
          prefix: string
          sequence_type: string
          year_value: number
        }
        Returns: string
      }
      poc_is_member: { Args: { org_id: string }; Returns: boolean }
      post_payment: {
        Args: {
          p_amount: number
          p_created_by: string
          p_external_payment_id: string
          p_external_transaction_id: string
          p_method: string
          p_org_id: string
          p_payment_source: string
          p_processor: string
          p_reference: string
          p_rental_id: string
          p_request_key: string
          p_tender_method: string
        }
        Returns: {
          duplicate: boolean
          payment_id: string
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
