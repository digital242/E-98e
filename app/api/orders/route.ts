import { NextResponse } from "next/server";
import { authorize, fail, readJson } from "@/lib/apiAuth";
import { asActor, db } from "@/lib/mockDB";

export const dynamic = "force-dynamic";

/** GET /api/orders — list orders (optionally ?status=WORKFLOW_STATUS). */
export async function GET(req: Request) {
  const auth = authorize(req, ["super-admin", "admin", "sales", "plant-head", "finance", "finance-executive", "dispatch"]);
  if (auth instanceof NextResponse) return auth;
  const status = new URL(req.url).searchParams.get("status");
  const orders = db().getState().orders.filter((o) => !status || o.workflowStatus === status);
  return NextResponse.json({ success: true, orders });
}

/**
 * PATCH /api/orders — update an order's workflow status.
 * Body: { orderId, status: "PLANT_HEAD_ACCEPTED" | "PLANT_HEAD_REJECTED" | "CREDIT_RELEASED", notes? }
 */
export async function PATCH(req: Request) {
  const auth = authorize(req, ["super-admin", "admin", "sales", "plant-head", "finance"]);
  if (auth instanceof NextResponse) return auth;
  const body = await readJson<{ orderId?: string; status?: string; notes?: string }>(req);
  if (!body?.orderId || !body.status) return fail("orderId and status are required");
  const s = db().getState();
  try {
    asActor(auth.name, auth.role, () => {
      if (body.status === "PLANT_HEAD_ACCEPTED") {
        if (!["plant-head", "super-admin", "admin"].includes(auth.role)) throw new Error("Only the Plant Head can accept orders");
        s.acceptOrderByPlantHead(body.orderId!, body.notes ?? "");
      } else if (body.status === "PLANT_HEAD_REJECTED") {
        if (!["plant-head", "super-admin", "admin"].includes(auth.role)) throw new Error("Only the Plant Head can reject orders");
        s.rejectOrderByPlantHead(body.orderId!, body.notes ?? "");
      } else if (body.status === "CREDIT_RELEASED") {
        if (!["finance", "super-admin"].includes(auth.role)) throw new Error("Only Finance can release a credit hold");
        s.releaseCreditHold(body.orderId!);
      } else throw new Error(`Unsupported status ${body.status}`);
    });
  } catch (e) {
    return fail(e);
  }
  return NextResponse.json({ success: true, order: db().getState().orders.find((o) => o.id === body.orderId) });
}
