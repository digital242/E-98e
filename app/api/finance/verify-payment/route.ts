import { NextResponse } from "next/server";
import { authorize, fail, readJson } from "@/lib/apiAuth";
import { asActor, db } from "@/lib/mockDB";

export const dynamic = "force-dynamic";

/**
 * POST /api/finance/verify-payment — verify a logged customer payment against the bank statement.
 * Body: { orderId, utrNumber, amount } (or { paymentId })
 */
export async function POST(req: Request) {
  const auth = authorize(req, ["super-admin", "finance", "finance-executive"]);
  if (auth instanceof NextResponse) return auth;
  const b = await readJson<{ paymentId?: string; orderId?: string; utrNumber?: string; amount?: number }>(req);
  if (!b) return fail("Invalid JSON body");
  const s = db().getState();
  const p = b.paymentId
    ? s.paymentConfirmations.find((x) => x.id === b.paymentId)
    : s.paymentConfirmations.find((x) => x.orderId === b.orderId && x.utrNumber === (b.utrNumber ?? "").trim().toUpperCase());
  if (!p) return fail("Payment entry not found", 404);
  if (b.amount !== undefined && Math.abs(Number(b.amount) - p.amount) > 0.5) return fail(`Amount ${b.amount} does not match the logged ${p.amount}`);
  try {
    const payment = asActor(auth.name, auth.role, () => s.verifyFinancePayment(p.id));
    const order = db().getState().orders.find((o) => o.id === p.orderId);
    return NextResponse.json({ success: true, verified: true, receiptNo: payment.receiptNo, paymentStatus: order?.paymentStatus });
  } catch (e) {
    return fail(e);
  }
}
