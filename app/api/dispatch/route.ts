import { NextResponse } from "next/server";
import { authorize, fail, readJson } from "@/lib/apiAuth";
import { asActor, db } from "@/lib/mockDB";

export const dynamic = "force-dynamic";

/**
 * POST /api/dispatch — create a dispatch & delivery challan.
 * Body: { orderId, vehicleNo, driverName, dispatchQty?, driverPhone?, transporter?, ewayBillNo? }
 * dispatchQty (optional) caps the total units loaded; by default all QC-passed stock is loaded.
 */
export async function POST(req: Request) {
  const auth = authorize(req, ["super-admin", "dispatch"]);
  if (auth instanceof NextResponse) return auth;
  const b = await readJson<{ orderId?: string; vehicleNo?: string; driverName?: string; dispatchQty?: number; driverPhone?: string; transporter?: string; ewayBillNo?: string }>(req);
  if (!b?.orderId) return fail("orderId is required");
  const s = db().getState();
  let cap = b.dispatchQty ?? Infinity;
  const items = Object.entries(s.availableToDispatch(b.orderId))
    .map(([productId, avail]) => {
      const qty = Math.max(0, Math.min(avail, cap));
      cap -= qty;
      return { productId, qty };
    })
    .filter((i) => i.qty > 0);
  try {
    const dispatch = asActor(auth.name, auth.role, () =>
      s.createDispatch({ orderId: b.orderId!, items, vehicleNo: b.vehicleNo ?? "", driverName: b.driverName ?? "", driverPhone: b.driverPhone ?? "", transporter: b.transporter ?? "", ewayBillNo: b.ewayBillNo ?? "" })
    );
    return NextResponse.json({ success: true, dispatch });
  } catch (e) {
    return fail(e);
  }
}
