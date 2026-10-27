import { NextResponse } from "next/server";
import { authorize, fail, readJson } from "@/lib/apiAuth";
import { asActor, db } from "@/lib/mockDB";

export const dynamic = "force-dynamic";

/**
 * POST /api/qc — log a quality inspection.
 * Body: { workOrderId | orderId, acceptedQty, rejectedQty, defects?, loadTestKn?, dimensionCheck?, finishCheck? }
 */
export async function POST(req: Request) {
  const auth = authorize(req, ["super-admin", "admin", "qc"]);
  if (auth instanceof NextResponse) return auth;
  const b = await readJson<{ workOrderId?: string; orderId?: string; acceptedQty?: number; rejectedQty?: number; defects?: string; loadTestKn?: number; dimensionCheck?: boolean; finishCheck?: boolean }>(req);
  if (!b) return fail("Invalid JSON body");
  const s = db().getState();
  const wo = b.workOrderId ? s.workOrders.find((w) => w.id === b.workOrderId) : s.workOrders.find((w) => w.orderId === b.orderId && w.pendingQcQty > 0);
  if (!wo) return fail("No work order with units pending QC", 404);
  const acceptedQty = Number(b.acceptedQty ?? 0);
  const rejectedQty = Number(b.rejectedQty ?? 0);
  try {
    const qcRecord = asActor(auth.name, auth.role, () =>
      s.recordQc({
        woId: wo.id,
        inspectedQty: acceptedQty + rejectedQty,
        acceptedQty,
        dimensionCheck: b.dimensionCheck ?? true,
        finishCheck: b.finishCheck ?? true,
        loadTestKn: Number(b.loadTestKn ?? 0),
        defects: b.defects ?? "",
      })
    );
    return NextResponse.json({ success: true, qcRecord });
  } catch (e) {
    return fail(e);
  }
}
