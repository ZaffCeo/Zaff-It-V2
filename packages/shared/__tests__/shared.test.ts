import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatPaise,
  isValidPaise,
  ORDER_STATUS_TRANSITIONS,
  canTransitionOrderStatus,
  type OrderStatus,
} from '../src/types.ts';
import {
  idempotencyKeySchema,
  cartPreviewSchema,
  checkoutCreateOrderSchema,
  addressSchema,
  merchantOrderActionSchema,
  riderOtpSchema,
  adminGeofenceSchema,
} from '../src/validation.ts';

const VALID_UUID_1 = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const VALID_UUID_3 = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

describe('formatPaise', () => {
  it('formats zero and positive integer paise in INR', () => {
    assert.equal(formatPaise(0), '₹0.00');
    assert.equal(formatPaise(5), '₹0.05');
    assert.equal(formatPaise(19900), '₹199.00');
    assert.equal(formatPaise(24950), '₹249.50');
  });

  it('formats large amounts using Indian numbering system', () => {
    assert.equal(formatPaise(10000000), '₹1,00,000.00');
  });

  it('handles negative paise and truncates decimals', () => {
    assert.equal(formatPaise(-1505), '-₹15.05');
    assert.equal(formatPaise(1999.9), '₹19.99');
  });
});

describe('isValidPaise', () => {
  it('accepts non-negative integers', () => {
    assert.equal(isValidPaise(0), true);
    assert.equal(isValidPaise(100), true);
    assert.equal(isValidPaise(49900), true);
  });

  it('rejects floats, negative numbers, NaN, Infinity, and non-numbers', () => {
    assert.equal(isValidPaise(-1), false);
    assert.equal(isValidPaise(19.99), false);
    assert.equal(isValidPaise(Number.NaN), false);
    assert.equal(isValidPaise(Number.POSITIVE_INFINITY), false);
    assert.equal(isValidPaise('19900'), false);
    assert.equal(isValidPaise(null), false);
    assert.equal(isValidPaise(undefined), false);
  });
});

describe('canTransitionOrderStatus state machine', () => {
  it('allows every transition declared in ORDER_STATUS_TRANSITIONS', () => {
    for (const [from, allowedTargets] of Object.entries(ORDER_STATUS_TRANSITIONS) as [
      OrderStatus,
      readonly OrderStatus[],
    ][]) {
      for (const to of allowedTargets) {
        assert.equal(
          canTransitionOrderStatus(from, to),
          true,
          `Expected ${from} -> ${to} to be valid`,
        );
      }
    }
  });

  it('blocks invalid or backward transitions', () => {
    assert.equal(canTransitionOrderStatus('created', 'delivered'), false);
    assert.equal(canTransitionOrderStatus('placed', 'ready_for_pickup'), false);
    assert.equal(canTransitionOrderStatus('picked_up', 'cancelled'), false);
    assert.equal(canTransitionOrderStatus('out_for_delivery', 'cancelled'), false);
    assert.equal(canTransitionOrderStatus('delivered', 'cancelled'), false);
    assert.equal(canTransitionOrderStatus('refunded', 'placed'), false);
    assert.equal(canTransitionOrderStatus('refunded', 'refund_pending'), false);
  });
});

describe('Zod validation schemas', () => {
  it('validates idempotencyKeySchema as UUID', () => {
    assert.equal(idempotencyKeySchema.safeParse(VALID_UUID_1).success, true);
    assert.equal(idempotencyKeySchema.safeParse('not-a-uuid').success, false);
  });

  it('validates cartPreviewSchema and normalizes coupon_code to uppercase', () => {
    const res = cartPreviewSchema.safeParse({
      store_id: VALID_UUID_1,
      address_id: VALID_UUID_2,
      coupon_code: '  makrana20  ',
      items: [{ product_id: VALID_UUID_3, quantity: 2 }],
    });
    assert.equal(res.success, true);
    if (res.success) {
      assert.equal(res.data.coupon_code, 'MAKRANA20');
    }

    const emptyItems = cartPreviewSchema.safeParse({
      store_id: VALID_UUID_1,
      items: [],
    });
    assert.equal(emptyItems.success, false);
  });

  it('validates checkoutCreateOrderSchema payment_method and quantity bounds', () => {
    const valid = checkoutCreateOrderSchema.safeParse({
      store_id: VALID_UUID_1,
      address_id: VALID_UUID_2,
      payment_method: 'cod',
      items: [{ product_id: VALID_UUID_3, quantity: 1 }],
    });
    assert.equal(valid.success, true);

    const invalidMethod = checkoutCreateOrderSchema.safeParse({
      store_id: VALID_UUID_1,
      address_id: VALID_UUID_2,
      payment_method: 'upi_direct',
      items: [{ product_id: VALID_UUID_3, quantity: 1 }],
    });
    assert.equal(invalidMethod.success, false);
  });

  it('validates addressSchema Indian mobile, pincode, and coordinates', () => {
    const valid = addressSchema.safeParse({
      recipient_name: 'Amaan Khan',
      phone: '+919829012345',
      line1: 'Station Road, Ward 12',
      pincode: '341505',
      lat: 27.0397,
      lng: 74.7219,
    });
    assert.equal(valid.success, true);

    const badPin = addressSchema.safeParse({
      recipient_name: 'Amaan Khan',
      phone: '9829012345',
      line1: 'Station Road, Ward 12',
      pincode: '34150',
      lat: 27.0397,
      lng: 74.7219,
    });
    assert.equal(badPin.success, false);
  });

  it('validates merchantOrderActionSchema requires rejection_reason on reject', () => {
    const acceptOk = merchantOrderActionSchema.safeParse({
      order_id: VALID_UUID_1,
      action: 'accept',
    });
    assert.equal(acceptOk.success, true);

    const rejectNoReason = merchantOrderActionSchema.safeParse({
      order_id: VALID_UUID_1,
      action: 'reject',
    });
    assert.equal(rejectNoReason.success, false);

    const rejectWithReason = merchantOrderActionSchema.safeParse({
      order_id: VALID_UUID_1,
      action: 'reject',
      rejection_reason: 'Item out of stock',
    });
    assert.equal(rejectWithReason.success, true);
  });

  it('validates riderOtpSchema and adminGeofenceSchema', () => {
    const riderOk = riderOtpSchema.safeParse({
      delivery_id: VALID_UUID_1,
      action: 'mark_delivered',
      otp: '4821',
      cash_collected_paise: 48000,
    });
    assert.equal(riderOk.success, true);

    const riderBadOtp = riderOtpSchema.safeParse({
      delivery_id: VALID_UUID_1,
      action: 'mark_delivered',
      otp: '12',
    });
    assert.equal(riderBadOtp.success, false);

    const zoneOk = adminGeofenceSchema.safeParse({
      code: 'MAKRANA_CENTRAL',
      name: 'Makrana Central',
      city: 'Makrana',
      center_lat: 27.0397,
      center_lng: 74.7219,
      radius_meters: 5000,
    });
    assert.equal(zoneOk.success, true);
  });
});
