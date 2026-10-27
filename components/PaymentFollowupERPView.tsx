"use client";
import { useState } from "react";
import type { PaymentConfirmation } from "@/types/erp";
import { fmtDate, fmtINR, round2 } from "@/lib/calc";
import { run } from "@/store/notificationStore";
import { useERPStore } from "@/store/erpStore";
import { Btn, Card, DataTable, Field, Modal, StatusBadge } from "./ui";

/** Payment collection matrix: balance due per order, pending verifications, and logging new receipts. */
export default function PaymentFollowupERPView() {
  const s = useERPStore();
  const [logFor, setLogFor] = useState<string | null>(null);
  const rows = s.orders
    .filter((o) => o.orderType === "STANDARD" && o.planningStatus !== "PLANT_HEAD_REJECTED" && o.paymentStatus !== "FULLY_PAID")
    .map((o) => {
      const pending = s.paymentConfirmations.filter((p) => p.orderId === o.id && p.status === "PENDING").reduce((a, p) => a + p.amount, 0);
      const invoiced = s.invoices.filter((i) => i.orderId === o.id).reduce((a, i) => a + i.total, 0);
      const firstInv = s.invoices.filter((i) => i.orderId === o.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      const overdue = !!firstInv && new Date(firstInv.dueDate) < new Date() && invoiced > o.amountPaid;
      return { o, pending, invoiced, balance: round2(o.grandTotal - o.amountPaid), dueDate: firstInv?.dueDate, overdue };
    });
  return (
    <>
      <Card flush>
        <DataTable
          rowKey={(r) => r.o.id}
          rows={rows}
          empty="All orders are fully paid"
          columns={[
            { header: "Order", render: (r) => <span className="mono">{r.o.orderNo}</span> },
            { header: "Customer", render: (r) => r.o.customerName },
            { header: "Order value", num: true, render: (r) => fmtINR(r.o.grandTotal) },
            { header: "Invoiced", num: true, render: (r) => fmtINR(r.invoiced) },
            { header: "Received", num: true, render: (r) => fmtINR(r.o.amountPaid) },
            { header: "Awaiting verification", num: true, render: (r) => (r.pending ? fmtINR(r.pending) : "—") },
            { header: "Balance", num: true, render: (r) => <b>{fmtINR(r.balance)}</b> },
            { header: "Due", render: (r) => (r.overdue ? <StatusBadge status="OVERDUE" /> : <span className="nowrap">{fmtDate(r.dueDate)}</span>) },
            { header: "", render: (r) => <Btn size="sm" variant="primary" onClick={() => setLogFor(r.o.id)} disabled={r.balance - r.pending <= 0}>Log payment</Btn> },
          ]}
        />
      </Card>
      {logFor && <LogPayment orderId={logFor} onClose={() => setLogFor(null)} />}
    </>
  );
}

function LogPayment({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const s = useERPStore();
  const o = s.orders.find((x) => x.id === orderId)!;
  const pending = s.paymentConfirmations.filter((p) => p.orderId === o.id && p.status === "PENDING").reduce((a, p) => a + p.amount, 0);
  const [amount, setAmount] = useState(round2(o.grandTotal - o.amountPaid - pending));
  const [utr, setUtr] = useState("");
  const [mode, setMode] = useState<PaymentConfirmation["mode"]>("NEFT");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const save = () => {
    if (run(() => s.logPayment({ orderId, amount, utrNumber: utr, mode, paymentDate: date }), "Payment logged — sent to Finance for verification")) onClose();
  };
  return (
    <Modal title={`Log payment · ${o.orderNo}`} onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save}>Log payment</Btn></>}>
      <div className="form-grid">
        <Field label="Amount (₹)"><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
        <Field label="Mode">
          <select value={mode} onChange={(e) => setMode(e.target.value as PaymentConfirmation["mode"])}>
            {["NEFT", "RTGS", "IMPS", "UPI", "CHEQUE"].map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="UTR / cheque no."><input value={utr} onChange={(e) => setUtr(e.target.value)} /></Field>
        <Field label="Payment date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
