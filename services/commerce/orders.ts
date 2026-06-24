/**
 * Cart / order / refund operations for the transactional commerce flow.
 *
 * Prices are snapshotted at add/checkout time (tier/offer-adjusted), so commerce
 * data stays correct even if catalog prices change later. Payments are a mock
 * "payment intent" for the MVP.
 */
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { decrementStock } from "@/services/catalog";
import { refreshAgentLtv } from "@/services/crm";
import {
  cartItems,
  carts,
  orderItems,
  orders,
  refunds,
} from "@/db/commerce/schema";

export async function getOrCreateCart(
  agentDid: string,
  customerRef?: string,
  cartId?: string,
): Promise<string> {
  if (cartId) {
    const [existing] = await db
      .select({ id: carts.id, status: carts.status })
      .from(carts)
      .where(and(eq(carts.id, cartId), eq(carts.agentDid, agentDid)))
      .limit(1);
    if (existing && existing.status === "open") return existing.id;
  }
  const [created] = await db
    .insert(carts)
    .values({ agentDid, customerRef, status: "open" })
    .returning({ id: carts.id });
  return created.id;
}

export async function addToCart(
  cartId: string,
  sku: string,
  qty: number,
  unitPriceSnapshot: number,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.sku, sku)))
    .limit(1);

  if (existing) {
    await db
      .update(cartItems)
      .set({ qty: existing.qty + qty })
      .where(eq(cartItems.id, existing.id));
  } else {
    await db.insert(cartItems).values({
      cartId,
      sku,
      qty,
      unitPriceSnapshot: unitPriceSnapshot.toFixed(2),
    });
  }
}

export async function updateCartItem(
  cartId: string,
  sku: string,
  qty: number,
): Promise<void> {
  if (qty <= 0) {
    await removeFromCart(cartId, sku);
    return;
  }
  await db
    .update(cartItems)
    .set({ qty })
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.sku, sku)));
}

export async function removeFromCart(
  cartId: string,
  sku: string,
): Promise<void> {
  await db
    .delete(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.sku, sku)));
}

export interface CartView {
  cartId: string;
  items: { sku: string; qty: number; unitPrice: number; lineTotal: number }[];
  total: number;
}

export async function viewCart(cartId: string): Promise<CartView> {
  const items = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cartId));

  const mapped = items.map((i) => {
    const unitPrice = Number(i.unitPriceSnapshot);
    return {
      sku: i.sku,
      qty: i.qty,
      unitPrice,
      lineTotal: Math.round(unitPrice * i.qty * 100) / 100,
    };
  });
  const total =
    Math.round(mapped.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
  return { cartId, items: mapped, total };
}

export interface CheckoutResult {
  orderId: string;
  total: number;
  currency: string;
  status: string;
  paymentIntentId: string;
}

/** Create an order from a cart + a mock payment intent (status: pending). */
export async function checkout(
  cartId: string,
  agentDid: string,
  customerRef: string | undefined,
  appliedRules: unknown,
): Promise<CheckoutResult> {
  const cart = await viewCart(cartId);
  if (cart.items.length === 0) {
    throw new Error("cart_empty");
  }

  const paymentIntentId = `pi_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

  const [order] = await db
    .insert(orders)
    .values({
      agentDid,
      customerRef,
      total: cart.total.toFixed(2),
      currency: "USD",
      status: "pending",
      appliedRules: appliedRules ?? [],
      paymentIntentId,
    })
    .returning({ id: orders.id });

  await db.insert(orderItems).values(
    cart.items.map((i) => ({
      orderId: order.id,
      sku: i.sku,
      qty: i.qty,
      unitPrice: i.unitPrice.toFixed(2),
    })),
  );

  await db.update(carts).set({ status: "checked_out" }).where(eq(carts.id, cartId));

  return {
    orderId: order.id,
    total: cart.total,
    currency: "USD",
    status: "pending",
    paymentIntentId,
  };
}

/** Finalize the mock payment: decrement stock, mark paid, refresh agent LTV. */
export async function confirmPurchase(
  orderId: string,
  agentDid: string,
): Promise<{ orderId: string; status: string }> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.agentDid, agentDid)))
    .limit(1);
  if (!order) throw new Error("order_not_found");
  if (order.status !== "pending") {
    return { orderId, status: order.status };
  }

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  for (const item of items) {
    const ok = await decrementStock(item.sku, item.qty);
    if (!ok) {
      throw new Error(`insufficient_stock:${item.sku}`);
    }
  }

  await db.update(orders).set({ status: "paid" }).where(eq(orders.id, orderId));
  await refreshAgentLtv(agentDid);

  return { orderId, status: "paid" };
}

export async function getOrder(orderId: string, agentDid: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.agentDid, agentDid)))
    .limit(1);
  if (!order) return null;
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  return { order, items };
}

export async function listOrders(agentDid: string) {
  return db
    .select()
    .from(orders)
    .where(eq(orders.agentDid, agentDid))
    .orderBy(desc(orders.createdAt));
}

export interface RefundResult {
  refundId: string;
  orderId: string;
  amount: number;
  status: string;
}

/**
 * Request a refund. MVP policy: a refund can be requested for a paid order; it
 * is created in `pending` for owner review. (Refund-window / partial rules to be
 * finalized — see plan §14.)
 */
export async function requestRefund(
  orderId: string,
  agentDid: string,
  reason: string,
): Promise<RefundResult> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.agentDid, agentDid)))
    .limit(1);
  if (!order) throw new Error("order_not_found");
  if (order.status !== "paid") throw new Error("order_not_refundable");

  const [refund] = await db
    .insert(refunds)
    .values({
      orderId,
      amount: order.total,
      reason,
      status: "pending",
    })
    .returning({ id: refunds.id });

  return {
    refundId: refund.id,
    orderId,
    amount: Number(order.total),
    status: "pending",
  };
}
