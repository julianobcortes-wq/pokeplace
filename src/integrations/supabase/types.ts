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
      account_deletion_requests: {
        Row: {
          created_at: string
          reason: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          reason?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          reason?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      card_sets: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          release_date: string | null
          series: string | null
          source: string
          symbol_url: string | null
          total: number | null
        }
        Insert: {
          created_at?: string
          id: string
          logo_url?: string | null
          name: string
          release_date?: string | null
          series?: string | null
          source?: string
          symbol_url?: string | null
          total?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          release_date?: string | null
          series?: string | null
          source?: string
          symbol_url?: string | null
          total?: number | null
        }
        Relationships: []
      }
      cards: {
        Row: {
          artist: string | null
          created_at: string
          id: string
          image_large: string | null
          image_small: string | null
          name: string
          number: string
          rarity: string | null
          set_id: string
          source: string
          subtypes: string[] | null
          supertype: string | null
          types: string[] | null
        }
        Insert: {
          artist?: string | null
          created_at?: string
          id: string
          image_large?: string | null
          image_small?: string | null
          name: string
          number: string
          rarity?: string | null
          set_id: string
          source?: string
          subtypes?: string[] | null
          supertype?: string | null
          types?: string[] | null
        }
        Update: {
          artist?: string | null
          created_at?: string
          id?: string
          image_large?: string | null
          image_small?: string | null
          name?: string
          number?: string
          rarity?: string | null
          set_id?: string
          source?: string
          subtypes?: string[] | null
          supertype?: string | null
          types?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "card_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_entries: {
        Row: {
          card_id: string
          created_at: string
          id: string
          kind: string
          quantity: number
          target_price: number | null
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          kind: string
          quantity?: number
          target_price?: number | null
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          kind?: string
          quantity?: number
          target_price?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_entries_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_messages: {
        Row: {
          body: string
          created_at: string
          dispute_id: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          dispute_id: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dispute_id?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_messages_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          buyer_id: string
          created_at: string
          description: string
          id: string
          order_id: string
          order_item_id: string
          reason: string
          resolution_amount: number | null
          resolution_note: string | null
          resolved_at: string | null
          seller_deadline: string
          seller_id: string
          status: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          description: string
          id?: string
          order_id: string
          order_item_id: string
          reason: string
          resolution_amount?: number | null
          resolution_note?: string | null
          resolved_at?: string | null
          seller_deadline?: string
          seller_id: string
          status?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          description?: string
          id?: string
          order_id?: string
          order_item_id?: string
          reason?: string
          resolution_amount?: number | null
          resolution_note?: string | null
          resolved_at?: string | null
          seller_deadline?: string
          seller_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          description: string
          key: string
        }
        Insert: {
          description: string
          key: string
        }
        Update: {
          description?: string
          key?: string
        }
        Relationships: []
      }
      listing_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          card_id: string
          created_at: string
          id: string
          listing_id: string
          question: string
          seller_id: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          card_id: string
          created_at?: string
          id?: string
          listing_id: string
          question: string
          seller_id: string
          user_id: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          card_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          question?: string
          seller_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_questions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_questions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_questions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          card_id: string
          condition: string
          created_at: string
          currency: string
          finish: string
          grade: string | null
          grade_company: string | null
          graded: boolean
          id: string
          language: string
          notes: string | null
          photo_paths: string[]
          photos: string[]
          price: number
          quantity: number
          seller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          card_id: string
          condition: string
          created_at?: string
          currency?: string
          finish?: string
          grade?: string | null
          grade_company?: string | null
          graded?: boolean
          id?: string
          language?: string
          notes?: string | null
          photo_paths?: string[]
          photos?: string[]
          price: number
          quantity: number
          seller_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          card_id?: string
          condition?: string
          created_at?: string
          currency?: string
          finish?: string
          grade?: string | null
          grade_company?: string | null
          graded?: boolean
          id?: string
          language?: string
          notes?: string | null
          photo_paths?: string[]
          photos?: string[]
          price?: number
          quantity?: number
          seller_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          code: string
          commerce_enabled: boolean
          currency: string
          language: string
          name: string
        }
        Insert: {
          code: string
          commerce_enabled?: boolean
          currency: string
          language: string
          name: string
        }
        Update: {
          code?: string
          commerce_enabled?: boolean
          currency?: string
          language?: string
          name?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          card_id: string
          commission_amount: number
          commission_rate: number
          delivered_at: string | null
          id: string
          listing_id: string
          order_id: string
          quantity: number
          seller_amount: number
          seller_id: string
          shipped_at: string | null
          shipping_carrier: string | null
          status: string
          tracking_code: string | null
          unit_price: number
        }
        Insert: {
          card_id: string
          commission_amount: number
          commission_rate: number
          delivered_at?: string | null
          id?: string
          listing_id: string
          order_id: string
          quantity: number
          seller_amount: number
          seller_id: string
          shipped_at?: string | null
          shipping_carrier?: string | null
          status?: string
          tracking_code?: string | null
          unit_price: number
        }
        Update: {
          card_id?: string
          commission_amount?: number
          commission_rate?: number
          delivered_at?: string | null
          id?: string
          listing_id?: string
          order_id?: string
          quantity?: number
          seller_amount?: number
          seller_id?: string
          shipped_at?: string | null
          shipping_carrier?: string | null
          status?: string
          tracking_code?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          order_id: string
          seller_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          order_id: string
          seller_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          order_id?: string
          seller_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_messages_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_shipments: {
        Row: {
          amount: number
          order_id: string
          seller_id: string
        }
        Insert: {
          amount?: number
          order_id: string
          seller_id: string
        }
        Update: {
          amount?: number
          order_id?: string
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_shipments_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string
          cancelled_at: string | null
          commission_total: number
          created_at: string
          currency: string
          expires_at: string | null
          id: string
          seller_total: number
          ship_address: string | null
          ship_city: string | null
          ship_name: string | null
          ship_state: string | null
          ship_zip: string | null
          shipping_total: number
          status: string
          subtotal: number
        }
        Insert: {
          buyer_id: string
          cancelled_at?: string | null
          commission_total: number
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          seller_total: number
          ship_address?: string | null
          ship_city?: string | null
          ship_name?: string | null
          ship_state?: string | null
          ship_zip?: string | null
          shipping_total?: number
          status?: string
          subtotal: number
        }
        Update: {
          buyer_id?: string
          cancelled_at?: string | null
          commission_total?: number
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          seller_total?: number
          ship_address?: string | null
          ship_city?: string | null
          ship_name?: string | null
          ship_state?: string | null
          ship_zip?: string | null
          shipping_total?: number
          status?: string
          subtotal?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          environment: string
          id: string
          order_id: string
          provider: string
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          environment: string
          id?: string
          order_id: string
          provider: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          environment?: string
          id?: string
          order_id?: string
          provider?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          id: string
          pix_key: string
          processed_at: string | null
          seller_id: string
          status: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string
          id?: string
          pix_key: string
          processed_at?: string | null
          seller_id: string
          status?: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          pix_key?: string
          processed_at?: string | null
          seller_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_entitlements: {
        Row: {
          entitlement_key: string
          plan_id: string
        }
        Insert: {
          entitlement_key: string
          plan_id: string
        }
        Update: {
          entitlement_key?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_entitlements_entitlement_key_fkey"
            columns: ["entitlement_key"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "plan_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_prices: {
        Row: {
          active: boolean
          amount: number | null
          currency: string
          id: string
          interval: string
          market_code: string
          plan_id: string
        }
        Insert: {
          active?: boolean
          amount?: number | null
          currency: string
          id?: string
          interval: string
          market_code: string
          plan_id: string
        }
        Update: {
          active?: boolean
          amount?: number | null
          currency?: string
          id?: string
          interval?: string
          market_code?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_prices_market_code_fkey"
            columns: ["market_code"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "plan_prices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          audience: string
          id: string
          name: string
          sort: number
        }
        Insert: {
          audience: string
          id: string
          name: string
          sort?: number
        }
        Update: {
          audience?: string
          id?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      price_observations: {
        Row: {
          amount: number
          card_id: string
          condition: string
          currency: string
          finish: string
          grade: string | null
          grade_company: string | null
          graded: boolean
          id: string
          ingested_at: string
          language: string
          market_code: string
          observed_at: string
          price_type: string
          source: string
          source_url: string | null
        }
        Insert: {
          amount: number
          card_id: string
          condition?: string
          currency: string
          finish?: string
          grade?: string | null
          grade_company?: string | null
          graded?: boolean
          id?: string
          ingested_at?: string
          language?: string
          market_code: string
          observed_at: string
          price_type: string
          source: string
          source_url?: string | null
        }
        Update: {
          amount?: number
          card_id?: string
          condition?: string
          currency?: string
          finish?: string
          grade?: string | null
          grade_company?: string | null
          graded?: boolean
          id?: string
          ingested_at?: string
          language?: string
          market_code?: string
          observed_at?: string
          price_type?: string
          source?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_observations_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_market_code_fkey"
            columns: ["market_code"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["code"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          currency: string
          display_name: string | null
          id: string
          language: string
          market_code: string
        }
        Insert: {
          created_at?: string
          currency?: string
          display_name?: string | null
          id: string
          language?: string
          market_code?: string
        }
        Update: {
          created_at?: string
          currency?: string
          display_name?: string | null
          id?: string
          language?: string
          market_code?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          admin_note: string | null
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      seller_reviews: {
        Row: {
          buyer_id: string
          comment: string | null
          created_at: string
          id: string
          order_id: string
          rating_packaging: number
          rating_service: number
          rating_shipping: number
          replied_at: string | null
          reply: string | null
          seller_id: string
        }
        Insert: {
          buyer_id: string
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          rating_packaging: number
          rating_service: number
          rating_shipping: number
          replied_at?: string | null
          reply?: string | null
          seller_id: string
        }
        Update: {
          buyer_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          rating_packaging?: number
          rating_service?: number
          rating_shipping?: number
          replied_at?: string | null
          reply?: string | null
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_reviews_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_status_log: {
        Row: {
          actor_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["seller_status"] | null
          id: string
          note: string | null
          seller_id: string
          to_status: Database["public"]["Enums"]["seller_status"]
        }
        Insert: {
          actor_id: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["seller_status"] | null
          id?: string
          note?: string | null
          seller_id: string
          to_status: Database["public"]["Enums"]["seller_status"]
        }
        Update: {
          actor_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["seller_status"] | null
          id?: string
          note?: string | null
          seller_id?: string
          to_status?: Database["public"]["Enums"]["seller_status"]
        }
        Relationships: [
          {
            foreignKeyName: "seller_status_log_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          bio: string | null
          categories: string[]
          city: string
          contact_email: string
          country: string
          cover_url: string | null
          created_at: string
          document: string
          id: string
          is_official: boolean
          logo_url: string | null
          monthly_volume: string | null
          operation_type: string | null
          person_type: string
          phone: string | null
          return_policy: string | null
          sales_history: string | null
          shipping_policy: string | null
          slug: string
          state: string
          status: Database["public"]["Enums"]["seller_status"]
          store_name: string
          terms_accepted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          categories?: string[]
          city: string
          contact_email: string
          country?: string
          cover_url?: string | null
          created_at?: string
          document: string
          id?: string
          is_official?: boolean
          logo_url?: string | null
          monthly_volume?: string | null
          operation_type?: string | null
          person_type: string
          phone?: string | null
          return_policy?: string | null
          sales_history?: string | null
          shipping_policy?: string | null
          slug: string
          state: string
          status?: Database["public"]["Enums"]["seller_status"]
          store_name: string
          terms_accepted_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          categories?: string[]
          city?: string
          contact_email?: string
          country?: string
          cover_url?: string | null
          created_at?: string
          document?: string
          id?: string
          is_official?: boolean
          logo_url?: string | null
          monthly_volume?: string | null
          operation_type?: string | null
          person_type?: string
          phone?: string | null
          return_policy?: string | null
          sales_history?: string | null
          shipping_policy?: string | null
          slug?: string
          state?: string
          status?: Database["public"]["Enums"]["seller_status"]
          store_name?: string
          terms_accepted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shipping_profiles: {
        Row: {
          flat_fee: number
          free_over: number | null
          handling_days: number
          origin_zip: string | null
          pickup_available: boolean
          seller_id: string
          updated_at: string
        }
        Insert: {
          flat_fee?: number
          free_over?: number | null
          handling_days?: number
          origin_zip?: string | null
          pickup_available?: boolean
          seller_id: string
          updated_at?: string
        }
        Update: {
          flat_fee?: number
          free_over?: number | null
          handling_days?: number
          origin_zip?: string | null
          pickup_available?: boolean
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_profiles_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string
          environment: string | null
          id: string
          plan_id: string
          provider: string | null
          status: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end: string
          environment?: string | null
          id?: string
          plan_id: string
          provider?: string | null
          status: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          environment?: string | null
          id?: string
          plan_id?: string
          provider?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string
          id: string
          order_id: string | null
          status: string
          subject: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          order_id?: string | null
          status?: string
          subject: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          order_id?: string | null
          status?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_process_payout: {
        Args: { _note: string; _payout_id: string; _status: string }
        Returns: undefined
      }
      admin_resolve_dispute: {
        Args: {
          _amount: number
          _dispute_id: string
          _note: string
          _outcome: string
        }
        Returns: undefined
      }
      admin_review_report: {
        Args: { _note: string; _report_id: string; _status: string }
        Returns: undefined
      }
      admin_set_seller_status: {
        Args: {
          _note: string
          _official?: boolean
          _seller_id: string
          _status: Database["public"]["Enums"]["seller_status"]
        }
        Returns: undefined
      }
      admin_set_setting: {
        Args: { _key: string; _value: number }
        Returns: undefined
      }
      answer_question: {
        Args: { _answer: string; _question_id: string }
        Returns: undefined
      }
      ask_question: {
        Args: { _listing_id: string; _question: string }
        Returns: undefined
      }
      cancel_order: { Args: { _order_id: string }; Returns: undefined }
      confirm_item_received: { Args: { _item_id: string }; Returns: undefined }
      confirm_test_payment: { Args: { _order_id: string }; Returns: undefined }
      expire_unpaid_orders: { Args: never; Returns: number }
      get_card_offers: {
        Args: { _card_id: string }
        Returns: {
          city: string
          completed_sales: number
          condition: string
          currency: string
          finish: string
          grade: string
          grade_company: string
          graded: boolean
          is_official: boolean
          language: string
          listing_id: string
          logo_url: string
          notes: string
          price: number
          quantity: number
          rating: number
          reviews: number
          seller_id: string
          state: string
          store_name: string
          store_slug: string
        }[]
      }
      get_card_trends: {
        Args: { _ids: string[] }
        Returns: {
          card_id: string
          change_pct: number
          currency: string
          is_demo: boolean
          last_price: number
          points: number[]
        }[]
      }
      get_listing_sellers: {
        Args: { _ids: string[] }
        Returns: {
          city: string
          is_official: boolean
          listing_id: string
          logo_url: string
          seller_id: string
          state: string
          store_name: string
          store_slug: string
        }[]
      }
      get_marketplace_financials: {
        Args: never
        Returns: {
          commission: number
          gmv: number
          paid_orders: number
          seller_total: number
          test_orders: number
        }[]
      }
      get_price_history: {
        Args: { _card_id: string; _days?: number }
        Returns: {
          amount: number
          condition: string
          currency: string
          finish: string
          graded: boolean
          language: string
          locked: boolean
          market_code: string
          observed_at: string
          price_type: string
          source: string
        }[]
      }
      get_public_seller: {
        Args: { _slug: string }
        Returns: {
          bio: string
          city: string
          country: string
          cover_url: string
          created_at: string
          id: string
          is_official: boolean
          logo_url: string
          return_policy: string
          shipping_policy: string
          slug: string
          state: string
          store_name: string
        }[]
      }
      get_seller_balance: {
        Args: { _seller_id: string }
        Returns: {
          available: number
          paid_out: number
          pending: number
          requested: number
        }[]
      }
      get_seller_reputation: {
        Args: { _seller_id: string }
        Returns: {
          cancelled: number
          completed_sales: number
          level: string
          rating: number
          reviews: number
          total_items: number
        }[]
      }
      get_seller_sales: {
        Args: never
        Returns: {
          is_live_paid: boolean
          item_id: string
        }[]
      }
      get_seller_trust: {
        Args: { _seller_id: string }
        Returns: {
          cancelled: number
          completed_sales: number
          level: string
          packaging_rating: number
          rating: number
          reviews: number
          service_rating: number
          shipping_rating: number
          total_items: number
        }[]
      }
      has_entitlement: {
        Args: { _key: string; _user: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved_seller: { Args: { _seller_id: string }; Returns: boolean }
      is_order_buyer: { Args: { _order_id: string }; Returns: boolean }
      is_real_completed_order: { Args: { _order_id: string }; Returns: boolean }
      list_public_sellers: {
        Args: { _limit?: number }
        Returns: {
          active_listings: number
          city: string
          completed_sales: number
          id: string
          is_official: boolean
          logo_url: string
          rating: number
          reviews: number
          slug: string
          state: string
          store_name: string
        }[]
      }
      mark_item_shipped: {
        Args: { _carrier: string; _item_id: string; _tracking: string }
        Returns: undefined
      }
      mask_contacts: { Args: { _t: string }; Returns: string }
      notify: {
        Args: { _body: string; _link: string; _title: string; _user: string }
        Returns: undefined
      }
      open_dispute: {
        Args: { _description: string; _item_id: string; _reason: string }
        Returns: string
      }
      open_support_ticket: {
        Args: {
          _body: string
          _category: string
          _order_id?: string
          _subject: string
        }
        Returns: string
      }
      owns_seller: { Args: { _seller_id: string }; Returns: boolean }
      place_order: { Args: { _items: Json; _ship: Json }; Returns: string }
      release_order_stock: { Args: { _order_id: string }; Returns: undefined }
      reply_dispute: {
        Args: { _body: string; _dispute_id: string; _escalate?: boolean }
        Returns: undefined
      }
      reply_review: {
        Args: { _reply: string; _review_id: string }
        Returns: undefined
      }
      request_payout: {
        Args: { _amount: number; _pix_key: string; _seller_id: string }
        Returns: string
      }
      seller_in_order: { Args: { _order_id: string }; Returns: boolean }
      send_order_message: {
        Args: { _body: string; _order_id: string; _seller_id: string }
        Returns: undefined
      }
      shipping_fee: {
        Args: { _seller_id: string; _subtotal: number }
        Returns: number
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_review: {
        Args: {
          _comment: string
          _order_id: string
          _packaging: number
          _seller_id: string
          _service: number
          _shipping: number
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "seller" | "buyer"
      seller_status:
        | "draft"
        | "submitted"
        | "info_requested"
        | "approved"
        | "rejected"
        | "suspended"
        | "blocked"
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
    Enums: {
      app_role: ["admin", "seller", "buyer"],
      seller_status: [
        "draft",
        "submitted",
        "info_requested",
        "approved",
        "rejected",
        "suspended",
        "blocked",
      ],
    },
  },
} as const
