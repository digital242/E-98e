import { NextResponse } from "next/server";
import { authorize, fail, readJson } from "@/lib/apiAuth";
import { asActor, db } from "@/lib/mockDB";
import { addDays } from "@/lib/calc";

export const dynamic = "force-dynamic";

/**
 * POST /api/production — plan an accepted order into work orders, or activate a work order.
 * Body: { orderId, plannedQty?, machine, shift } | { workOrderId, action: "activate" }
 */
export async function POST(req: Request) {
  const auth = authorize(req, ["super-admin", "plant-head", "production"]);
  if (auth instanceof NextResponse) return auth;
  const body = await readJson<{ orderId?: string; workOrderId?: string; action?: string; plannedQty?: number; machine?: string; shift?: "A" | "B" | "C"; targetDate?: string }>(req);
  if (!body) return fail("Invalid JSON body");
  const s = db().getState();
  try {
    if (body.workOrderId && body.action === "activate") {
      asActor(auth.name, auth.role, () => s.activateWorkOrder(body.workOrderId!));
      return NextResponse.json({ success: true, workOrder: db().getState().workOrders.find((w) => w.id === body.workOrderId) });
    }
    if (!body.orderId || !body.machine) return fail("orderId and machine are required");
    if (auth.role === "production") return fail("Only the Plant Head can plan orders", 403);
    const order = s.orders.find((o) => o.id === body.orderId);
    if (!order) return fail("Order not found", 404);
    const lines = order.items.map((i) => ({
      productId: i.productId,
      plannedQty: order.items.length === 1 && body.plannedQty ? body.plannedQty : i.qty,
      machine: body.machine!,
      shift: body.shift ?? "A",
      targetDate: body.targetDate ?? addDays(new Date().toISOString(), 5).slice(0, 10),
    }));
    const workOrders = asActor(auth.name, auth.role, () => s.planOrder(order.id, lines));
    return NextResponse.json({ success: true, workOrder: workOrders[0], workOrders });
  } catch (e) {
    return fail(e);
  }
}
