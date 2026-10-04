
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_actions": {
                  Row: {
                    "applied_changes": Json | null,"created_at": string,"id": string,"inbox_item_id": string | null,"model": string | null,"prompt_version": string | null,"proposed_changes": NonNullable<Json>,"status": Database["public"]['Enums']["ai_action_status"],"tokens_in": number | null,"tokens_out": number | null,"type": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "applied_changes"?: Json | null,"created_at"?: string,"id"?: string,"inbox_item_id"?: string | null,"model"?: string | null,"prompt_version"?: string | null,"proposed_changes"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["ai_action_status"],"tokens_in"?: number | null,"tokens_out"?: number | null,"type": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "applied_changes"?: Json | null,"created_at"?: string,"id"?: string,"inbox_item_id"?: string | null,"model"?: string | null,"prompt_version"?: string | null,"proposed_changes"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["ai_action_status"],"tokens_in"?: number | null,"tokens_out"?: number | null,"type"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_actions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_actions_workspace_id_inbox_item_id_fkey"
      columns: ["workspace_id","inbox_item_id"]
isOneToOne: false
      referencedRelation: "inbox_items"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"clients": {
                  Row: {
                    "color": string | null,"created_at": string,"email": string | null,"hourly_rate_cents": number | null,"id": string,"last_contacted_at": string | null,"name": string,"notes": string | null,"status": Database["public"]['Enums']["client_status"],"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "color"?: string | null,"created_at"?: string,"email"?: string | null,"hourly_rate_cents"?: number | null,"id"?: string,"last_contacted_at"?: string | null,"name": string,"notes"?: string | null,"status"?: Database["public"]['Enums']["client_status"],"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "color"?: string | null,"created_at"?: string,"email"?: string | null,"hourly_rate_cents"?: number | null,"id"?: string,"last_contacted_at"?: string | null,"name"?: string,"notes"?: string | null,"status"?: Database["public"]['Enums']["client_status"],"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"props": NonNullable<Json>,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"props"?: NonNullable<Json>,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"props"?: NonNullable<Json>,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"inbox_items": {
                  Row: {
                    "created_at": string,"id": string,"kind": Database["public"]['Enums']["inbox_kind"],"raw_content": string,"status": Database["public"]['Enums']["inbox_status"],"storage_path": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["inbox_kind"],"raw_content": string,"status"?: Database["public"]['Enums']["inbox_status"],"storage_path"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["inbox_kind"],"raw_content"?: string,"status"?: Database["public"]['Enums']["inbox_status"],"storage_path"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inbox_items_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_items": {
                  Row: {
                    "amount_cents": number,"created_at": string,"description": string,"id": string,"invoice_id": string,"position": number,"quantity": number,"task_id": string | null,"unit_price_cents": number,"workspace_id": string
                  }
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"description": string,"id"?: string,"invoice_id": string,"position"?: number,"quantity": number,"task_id"?: string | null,"unit_price_cents": number,"workspace_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"description"?: string,"id"?: string,"invoice_id"?: string,"position"?: number,"quantity"?: number,"task_id"?: string | null,"unit_price_cents"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_items_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_items_workspace_id_invoice_id_fkey"
      columns: ["workspace_id","invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "invoice_items_workspace_id_task_id_fkey"
      columns: ["workspace_id","task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "client_email": string | null,"client_id": string | null,"client_name": string,"created_at": string,"currency": string,"due_date": string | null,"id": string,"issue_date": string,"notes": string | null,"number": string,"paid_at": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["invoice_status"],"total_cents": number,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "client_email"?: string | null,"client_id"?: string | null,"client_name": string,"created_at"?: string,"currency": string,"due_date"?: string | null,"id"?: string,"issue_date": string,"notes"?: string | null,"number": string,"paid_at"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["invoice_status"],"total_cents"?: number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "client_email"?: string | null,"client_id"?: string | null,"client_name"?: string,"created_at"?: string,"currency"?: string,"due_date"?: string | null,"id"?: string,"issue_date"?: string,"notes"?: string | null,"number"?: string,"paid_at"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["invoice_status"],"total_cents"?: number,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_workspace_id_client_id_fkey"
      columns: ["workspace_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "invoices_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"notes": {
                  Row: {
                    "ai_action_id": string | null,"client_id": string | null,"content": Json | null,"content_text": string,"created_at": string,"id": string,"project_id": string | null,"title": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "ai_action_id"?: string | null,"client_id"?: string | null,"content"?: Json | null,"content_text"?: string,"created_at"?: string,"id"?: string,"project_id"?: string | null,"title"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "ai_action_id"?: string | null,"client_id"?: string | null,"content"?: Json | null,"content_text"?: string,"created_at"?: string,"id"?: string,"project_id"?: string | null,"title"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notes_workspace_id_ai_action_id_fkey"
      columns: ["workspace_id","ai_action_id"]
isOneToOne: false
      referencedRelation: "ai_actions"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "notes_workspace_id_client_id_fkey"
      columns: ["workspace_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "notes_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notes_workspace_id_project_id_fkey"
      columns: ["workspace_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "business_type": string | null,"created_at": string,"display_name": string | null,"id": string,"notification_prefs": NonNullable<Json>,"onboarded_at": string | null,"timezone": string,"tone": string | null,"updated_at": string
                  }
                  Insert: {
                    "business_type"?: string | null,"created_at"?: string,"display_name"?: string | null,"id": string,"notification_prefs"?: NonNullable<Json>,"onboarded_at"?: string | null,"timezone"?: string,"tone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "business_type"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"notification_prefs"?: NonNullable<Json>,"onboarded_at"?: string | null,"timezone"?: string,"tone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"projects": {
                  Row: {
                    "client_id": string | null,"created_at": string,"due_date": string | null,"id": string,"status": Database["public"]['Enums']["project_status"],"summary": string | null,"title": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "client_id"?: string | null,"created_at"?: string,"due_date"?: string | null,"id"?: string,"status"?: Database["public"]['Enums']["project_status"],"summary"?: string | null,"title": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "client_id"?: string | null,"created_at"?: string,"due_date"?: string | null,"id"?: string,"status"?: Database["public"]['Enums']["project_status"],"summary"?: string | null,"title"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_workspace_id_client_id_fkey"
      columns: ["workspace_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "projects_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"push_tokens": {
                  Row: {
                    "created_at": string,"id": string,"last_digest_on": string | null,"platform": string,"token": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_digest_on"?: string | null,"platform": string,"token": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_digest_on"?: string | null,"platform"?: string,"token"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"share_links": {
                  Row: {
                    "created_at": string,"hidden_task_ids": (string)[],"id": string,"last_viewed_at": string | null,"project_id": string,"token": string,"updated_at": string,"view_count": number,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"hidden_task_ids"?: (string)[],"id"?: string,"last_viewed_at"?: string | null,"project_id": string,"token": string,"updated_at"?: string,"view_count"?: number,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"hidden_task_ids"?: (string)[],"id"?: string,"last_viewed_at"?: string | null,"project_id"?: string,"token"?: string,"updated_at"?: string,"view_count"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "share_links_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "share_links_workspace_id_project_id_fkey"
      columns: ["workspace_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "billing_interval": string | null,"created_at": string,"current_period_end": string | null,"plan": string,"provider": string,"provider_customer_id": string | null,"provider_subscription_id": string | null,"status": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "billing_interval"?: string | null,"created_at"?: string,"current_period_end"?: string | null,"plan"?: string,"provider"?: string,"provider_customer_id"?: string | null,"provider_subscription_id"?: string | null,"status"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "billing_interval"?: string | null,"created_at"?: string,"current_period_end"?: string | null,"plan"?: string,"provider"?: string,"provider_customer_id"?: string | null,"provider_subscription_id"?: string | null,"status"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: true
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "ai_action_id": string | null,"client_id": string | null,"completed_at": string | null,"created_at": string,"due_date": string | null,"id": string,"notes": string | null,"parent_task_id": string | null,"position": number,"priority": Database["public"]['Enums']["task_priority"],"project_id": string | null,"source": Database["public"]['Enums']["task_source"],"status": Database["public"]['Enums']["task_status"],"title": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "ai_action_id"?: string | null,"client_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"due_date"?: string | null,"id"?: string,"notes"?: string | null,"parent_task_id"?: string | null,"position"?: number,"priority"?: Database["public"]['Enums']["task_priority"],"project_id"?: string | null,"source"?: Database["public"]['Enums']["task_source"],"status"?: Database["public"]['Enums']["task_status"],"title": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "ai_action_id"?: string | null,"client_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"due_date"?: string | null,"id"?: string,"notes"?: string | null,"parent_task_id"?: string | null,"position"?: number,"priority"?: Database["public"]['Enums']["task_priority"],"project_id"?: string | null,"source"?: Database["public"]['Enums']["task_source"],"status"?: Database["public"]['Enums']["task_status"],"title"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_workspace_id_ai_action_id_fkey"
      columns: ["workspace_id","ai_action_id"]
isOneToOne: false
      referencedRelation: "ai_actions"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "tasks_workspace_id_client_id_fkey"
      columns: ["workspace_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "tasks_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_workspace_id_parent_task_id_fkey"
      columns: ["workspace_id","parent_task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "tasks_workspace_id_project_id_fkey"
      columns: ["workspace_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"time_entries": {
                  Row: {
                    "billable": boolean,"created_at": string,"ended_at": string | null,"id": string,"invoice_id": string | null,"minutes": number | null,"project_id": string | null,"started_at": string,"task_id": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "billable"?: boolean,"created_at"?: string,"ended_at"?: string | null,"id"?: string,"invoice_id"?: string | null,"minutes"?: number | null,"project_id"?: string | null,"started_at": string,"task_id"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "billable"?: boolean,"created_at"?: string,"ended_at"?: string | null,"id"?: string,"invoice_id"?: string | null,"minutes"?: number | null,"project_id"?: string | null,"started_at"?: string,"task_id"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_entries_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entries_workspace_id_invoice_id_fkey"
      columns: ["workspace_id","invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "time_entries_workspace_id_project_id_fkey"
      columns: ["workspace_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "time_entries_workspace_id_task_id_fkey"
      columns: ["workspace_id","task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "created_at": string,"role": Database["public"]['Enums']["member_role"],"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "created_at": string,"currency": string,"id": string,"inbound_token": string,"invoice_details": string | null,"name": string,"next_invoice_number": number,"owner_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"inbound_token"?: string,"invoice_details"?: string | null,"name": string,"next_invoice_number"?: number,"owner_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"inbound_token"?: string,"invoice_details"?: string | null,"name"?: string,"next_invoice_number"?: number,"owner_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "apply_ai_action":
{ Args: { "p_action_id": string,"p_edited"?: boolean,"p_rows": Json }; Returns: Json
                           },
"delete_my_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"is_sample_client_name":
{ Args: { "name": string }; Returns: boolean
                           },
"is_workspace_member":
{ Args: { "ws": string }; Returns: boolean
                           },
"metered_ai_action_type":
{ Args: { "t": string }; Returns: boolean
                           },
"plan_limits":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"record_share_view":
{ Args: { "p_token": string }; Returns: undefined
                           },
"regenerate_inbound_token":
{ Args: { "p_workspace_id": string }; Returns: string
                           },
"reject_ai_action":
{ Args: { "p_action_id": string }; Returns: undefined
                           },
"save_invoice":
{ Args: { "p_invoice": Json,"p_items": Json,"p_time_entry_ids": (string)[] }; Returns: string
                           },
"try_uuid":
{ Args: { "value": string }; Returns: string
                           },
"undo_ai_action":
{ Args: { "p_action_id": string,"p_force"?: boolean }; Returns: Json
                           },
"workspace_is_pro":
{ Args: { "ws": string }; Returns: boolean
                           },
"workspace_usage":
{ Args: { "ws": string }; Returns: Json
                           }
          }
          Enums: {
            "ai_action_status": "proposed"|"accepted"|"rejected"|"edited"|"undone","client_status": "active"|"paused"|"archived","inbox_kind": "text"|"voice"|"email"|"image","inbox_status": "pending"|"processed"|"dismissed","invoice_status": "draft"|"sent"|"paid"|"void","member_role": "owner"|"member","project_status": "active"|"on_hold"|"done"|"archived","task_priority": "none"|"low"|"med"|"high","task_source": "manual"|"ai","task_status": "todo"|"doing"|"done"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "ai_action_status": ["proposed", "accepted", "rejected", "edited", "undone"],"client_status": ["active", "paused", "archived"],"inbox_kind": ["text", "voice", "email", "image"],"inbox_status": ["pending", "processed", "dismissed"],"invoice_status": ["draft", "sent", "paid", "void"],"member_role": ["owner", "member"],"project_status": ["active", "on_hold", "done", "archived"],"task_priority": ["none", "low", "med", "high"],"task_source": ["manual", "ai"],"task_status": ["todo", "doing", "done"]
          }
        }
} as const
