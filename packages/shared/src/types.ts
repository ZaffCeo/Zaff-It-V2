// ZAFF-IT Canonical Shared Types (matches 001_initial_schema.sql & API_CONTRACTS.md)
// Money is strictly integer paise (1 INR = 100 paise). Timestamps are UTC ISO-8601 strings.

export type UUID = string;
export type ISOTimestamp = string;
export type Paise = number;

export function isValidPaise(value: unknown): value is Paise {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function formatPaise(paise: Paise): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, '0');
  return `${sign}₹${rupees.toLocaleString('en-IN')}.${rem}`;
}

export type PreferredLanguage = 'en' | 'hi' | 'hinglish';
export type UserRole = 'customer' | 'merchant' | 'rider' | 'admin';
export type KycStatus = 'pending' | 'verified' | 'rejected' | 'suspended';
export type FulfillmentType = 'merchant' | 'dark_store';
export type MovementType = 'restock' | 'reserve' | 'release' | 'deduct' | 'adjustment' | 'return';
export type CartStatus = 'active' | 'converted' | 'abandoned';
export type PaymentMethod = 'razorpay' | 'cod';
export type PaymentStatus = 'created' | 'authorized' | 'captured' | 'failed' | 'refund_pending' | 'refunded';
export type RefundStatus = 'pending' | 'processed' | 'failed';
export type LedgerEntryType = 'order_credit' | 'commission_debit' | 'refund_debit' | 'payout_debit' | 'adjustment';
export type LedgerStatus = 'pending' | 'settled' | 'reversed';
export type DiscountType = 'flat_paise' | 'percent_bps';
export type TicketCategory = 'order_issue' | 'payment_refund' | 'missing_item' | 'delivery_delay' | 'account_privacy' | 'other';
export type TicketStatus = 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export type OrderStatus =
  | 'created'
  | 'payment_pending'
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready_for_pickup'
  | 'rider_assigned'
  | 'picked_up'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded';

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  created: ['payment_pending', 'placed', 'cancelled'],
  payment_pending: ['placed', 'cancelled'],
  placed: ['accepted', 'cancelled', 'refund_pending'],
  accepted: ['preparing', 'cancelled', 'refund_pending'],
  preparing: ['ready_for_pickup', 'cancelled', 'refund_pending'],
  ready_for_pickup: ['rider_assigned', 'picked_up', 'cancelled', 'refund_pending'],
  rider_assigned: ['picked_up', 'cancelled', 'refund_pending'],
  picked_up: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: ['refund_pending'],
  cancelled: ['refund_pending'],
  refund_pending: ['refunded'],
  refunded: [],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export type DeliveryTaskStatus =
  | 'unassigned'
  | 'assigned'
  | 'accepted'
  | 'arrived_store'
  | 'picked_up'
  | 'arrived_customer'
  | 'delivered'
  | 'failed'
  | 'cancelled';

export interface Profile {
  id: UUID;
  full_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  preferred_language: PreferredLanguage;
  is_active: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface UserRoleRecord {
  id: UUID;
  user_id: UUID;
  role: UserRole;
  is_active: boolean;
  granted_by: UUID | null;
  created_at: ISOTimestamp;
}

export interface Address {
  id: UUID;
  user_id: UUID;
  label: string;
  recipient_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  is_default: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface ServiceZone {
  id: UUID;
  code: string;
  name: string;
  city: string;
  state: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  geojson_polygon: Record<string, unknown> | null;
  base_delivery_fee_paise: Paise;
  free_delivery_threshold_paise: Paise;
  is_active: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface Merchant {
  id: UUID;
  owner_user_id: UUID | null;
  business_name: string;
  legal_name: string | null;
  gstin: string | null;
  fssai_license: string | null;
  phone: string;
  email: string | null;
  kyc_status: KycStatus;
  commission_bps: number;
  is_active: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface Store {
  id: UUID;
  merchant_id: UUID;
  service_zone_id: UUID;
  name: string;
  slug: string;
  fulfillment_type: FulfillmentType;
  address_line1: string;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  phone: string;
  is_open: boolean;
  opens_at: string;
  closes_at: string;
  prep_time_minutes: number;
  min_order_paise: Paise;
  is_active: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface Category {
  id: UUID;
  parent_id: UUID | null;
  name: string;
  slug: string;
  icon_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface Product {
  id: UUID;
  category_id: UUID;
  sku: string;
  barcode: string | null;
  name: string;
  slug: string;
  brand: string | null;
  description: string | null;
  unit_label: string;
  image_url: string | null;
  gst_bps: number;
  is_veg: boolean;
  is_active: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface StoreProduct {
  id: UUID;
  store_id: UUID;
  product_id: UUID;
  mrp_paise: Paise;
  selling_price_paise: Paise;
  max_qty_per_order: number;
  is_available: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface Inventory {
  id: UUID;
  store_product_id: UUID;
  store_id: UUID;
  on_hand_qty: number;
  reserved_qty: number;
  available_to_sell: number;
  low_stock_threshold: number;
  updated_at: ISOTimestamp;
}

export interface InventoryMovement {
  id: UUID;
  inventory_id: UUID;
  store_product_id: UUID;
  order_id: UUID | null;
  movement_type: MovementType;
  qty_delta: number;
  on_hand_after: number;
  reserved_after: number;
  reason: string | null;
  actor_id: UUID | null;
  created_at: ISOTimestamp;
}

export interface Cart {
  id: UUID;
  user_id: UUID;
  store_id: UUID;
  coupon_code: string | null;
  status: CartStatus;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface CartItem {
  id: UUID;
  cart_id: UUID;
  store_product_id: UUID;
  qty: number;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface Order {
  id: UUID;
  order_number: string;
  customer_id: UUID;
  store_id: UUID;
  service_zone_id: UUID;
  delivery_address_id: UUID | null;
  delivery_address_snapshot: Record<string, unknown>;
  fulfillment_type: FulfillmentType;
  status: OrderStatus;
  payment_method: PaymentMethod;
  subtotal_paise: Paise;
  tax_paise: Paise;
  delivery_fee_paise: Paise;
  discount_paise: Paise;
  total_paise: Paise;
  coupon_code: string | null;
  idempotency_key: string;
  cancellation_reason: string | null;
  cancelled_by: UUID | null;
  placed_at: ISOTimestamp | null;
  delivered_at: ISOTimestamp | null;
  cancelled_at: ISOTimestamp | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface OrderItem {
  id: UUID;
  order_id: UUID;
  store_product_id: UUID;
  product_id: UUID;
  product_name_snapshot: string;
  unit_label_snapshot: string;
  qty: number;
  mrp_paise: Paise;
  unit_price_paise: Paise;
  gst_bps: number;
  tax_paise: Paise;
  line_total_paise: Paise;
  created_at: ISOTimestamp;
}

export interface Payment {
  id: UUID;
  order_id: UUID;
  customer_id: UUID;
  idempotency_key: string;
  provider: PaymentMethod;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  amount_paise: Paise;
  currency: 'INR';
  status: PaymentStatus;
  webhook_verified: boolean;
  webhook_payload: Record<string, unknown> | null;
  verified_at: ISOTimestamp | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface Refund {
  id: UUID;
  payment_id: UUID;
  order_id: UUID;
  razorpay_refund_id: string | null;
  amount_paise: Paise;
  reason: string;
  status: RefundStatus;
  idempotency_key: string;
  initiated_by: UUID | null;
  processed_at: ISOTimestamp | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface SettlementLedgerEntry {
  id: UUID;
  merchant_id: UUID;
  store_id: UUID;
  order_id: UUID | null;
  entry_type: LedgerEntryType;
  gross_amount_paise: Paise;
  commission_paise: Paise;
  net_amount_paise: Paise;
  status: LedgerStatus;
  payout_reference: string | null;
  settled_at: ISOTimestamp | null;
  created_at: ISOTimestamp;
}

export interface DeliveryTask {
  id: UUID;
  order_id: UUID;
  store_id: UUID;
  rider_id: UUID | null;
  status: DeliveryTaskStatus;
  pickup_otp: string | null;
  delivery_otp: string | null;
  distance_meters: number | null;
  rider_payout_paise: Paise;
  assigned_at: ISOTimestamp | null;
  picked_up_at: ISOTimestamp | null;
  delivered_at: ISOTimestamp | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface RiderLocation {
  id: UUID;
  rider_id: UUID;
  delivery_task_id: UUID | null;
  lat: number;
  lng: number;
  heading: number | null;
  speed_mps: number | null;
  accuracy_meters: number | null;
  recorded_at: ISOTimestamp;
}

export interface Promotion {
  id: UUID;
  code: string;
  title: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  max_discount_paise: Paise | null;
  min_order_paise: Paise;
  service_zone_id: UUID | null;
  store_id: UUID | null;
  usage_limit: number | null;
  used_count: number;
  starts_at: ISOTimestamp;
  ends_at: ISOTimestamp;
  is_active: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface SupportTicket {
  id: UUID;
  ticket_number: string;
  user_id: UUID;
  order_id: UUID | null;
  category: TicketCategory;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to: UUID | null;
  resolved_at: ISOTimestamp | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface AuditLog {
  id: UUID;
  actor_id: UUID | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: UUID | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: ISOTimestamp;
}

export interface FeatureFlag {
  key: string;
  is_enabled: boolean;
  int_value: number | null;
  text_value: string | null;
  json_value: Record<string, unknown> | null;
  description: string | null;
  updated_by: UUID | null;
  updated_at: ISOTimestamp;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'PAYMENT_SIGNATURE_INVALID'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INSUFFICIENT_STOCK'
  | 'IDEMPOTENCY_CONFLICT'
  | 'OUT_OF_SERVICE_ZONE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
    request_id: string;
  };
}
