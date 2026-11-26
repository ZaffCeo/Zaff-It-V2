import { z } from 'zod';

const uuidSchema = z.string().uuid();
const nonNegIntPaise = z.number().int().nonnegative();
const indianPhoneSchema = z
  .string()
  .trim()
  .regex(/^(\+91)?[6-9][0-9]{9}$/, 'Invalid Indian mobile number');

export const idempotencyKeySchema = z
  .string()
  .uuid('Idempotency-Key must be a valid UUID');

export const cartLineItemSchema = z.object({
  product_id: uuidSchema,
  quantity: z.number().int().min(1).max(50),
});

export const cartPreviewSchema = z.object({
  store_id: uuidSchema,
  address_id: uuidSchema.optional(),
  coupon_code: z.string().trim().min(1).max(32).toUpperCase().optional().nullable(),
  items: z.array(cartLineItemSchema).min(1).max(100),
});

export const checkoutCreateOrderSchema = z.object({
  store_id: uuidSchema,
  address_id: uuidSchema,
  payment_method: z.enum(['razorpay', 'cod']),
  coupon_code: z.string().trim().min(1).max(32).toUpperCase().optional().nullable(),
  delivery_instructions: z.string().trim().max(300).optional().nullable(),
  items: z.array(cartLineItemSchema).min(1).max(100),
});

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(40).default('Home'),
  recipient_name: z.string().trim().min(1).max(100),
  phone: indianPhoneSchema,
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  landmark: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(2).max(80).default('Makrana'),
  state: z.string().trim().min(2).max(80).default('Rajasthan'),
  pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Pincode must be 6 digits'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  is_default: z.boolean().optional().default(false),
});

export const merchantOrderActionSchema = z
  .object({
    order_id: uuidSchema,
    action: z.enum(['accept', 'reject', 'mark_packing', 'mark_ready_for_pickup']),
    rejection_reason: z.string().trim().min(3).max(250).optional().nullable(),
  })
  .refine(
    (data) => data.action !== 'reject' || (data.rejection_reason && data.rejection_reason.length >= 3),
    {
      message: 'rejection_reason is required when rejecting an order',
      path: ['rejection_reason'],
    },
  );

export const riderOtpSchema = z.object({
  delivery_id: uuidSchema,
  action: z.enum(['mark_picked_up', 'mark_delivered']),
  otp: z.string().trim().regex(/^[0-9]{4,6}$/, 'OTP must be 4 to 6 digits'),
  cash_collected_paise: nonNegIntPaise.optional(),
});

const coordinatePairSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

export const adminGeofenceSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_-]+$/i, 'Zone code must be alphanumeric with _ or -')
    .optional(),
  name: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80).default('Rajasthan'),
  center_lat: z.number().min(-90).max(90),
  center_lng: z.number().min(-180).max(180),
  radius_meters: z.number().int().positive().max(100_000),
  base_delivery_fee_paise: nonNegIntPaise.default(2000),
  free_delivery_threshold_paise: nonNegIntPaise.default(19900),
  is_active: z.boolean().default(true),
  geojson_polygon: z
    .object({
      type: z.literal('Polygon'),
      coordinates: z.array(z.array(coordinatePairSchema).min(4)).min(1),
    })
    .optional()
    .nullable(),
});

export type CartPreviewInput = z.infer<typeof cartPreviewSchema>;
export type CheckoutCreateOrderInput = z.infer<typeof checkoutCreateOrderSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type MerchantOrderActionInput = z.infer<typeof merchantOrderActionSchema>;
export type RiderOtpInput = z.infer<typeof riderOtpSchema>;
export type AdminGeofenceInput = z.infer<typeof adminGeofenceSchema>;
