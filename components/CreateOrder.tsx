"use client";
import { useState } from "react";
import { addDays, fmtINR } from "@/lib/calc";
import { run } from "@/store/notificationStore";
import { useERPStore } from "@/store/erpStore";
import { customerOutstanding } from "@/store/domains/shared";
import { Btn, Field, Modal } from "./ui";

/** Converts an accepted quotation into a sales order, with a live credit-limit check. */
export default function CreateOrder({ quotationId, onClose }: { quotationId: string; onClose: () => void }) {
  const s = useERPStore();
  const q = s.quotations.find((x) => x.id === quotationId);
  const [poReference, setPo] = useState("");
  const [siteAddress, setSite] = useState("");
  const [deliveryDate, setDate] = useState(addDays(new Date().toISOString(), 14).slice(0, 10));
  if (!q) return null;
  const c = s.customers.find((x) => x.id === q.customerId)!;
  const exposure = customerOutstanding(s, c.id) + q.grandTotal;
  const over = exposure > c.creditLimit;
  const save = () => {
    const o = run(() => s.convertQuotationToOrder({ quotationId, poReference, siteAddress, deliveryDate }), (r) =>
      r.commercialStatus === "CREDIT_HOLD" ? `${r.orderNo} created — on credit hold for Finance` : `${r.orderNo} created and sent to Plant Head`
    );
    if (o) onClose();
  };
  return (
    <Modal title={`Confirm sales order from ${q.quoteNo}`} onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save}>Create sales order</Btn></>}>
      <div className="stack">
        <div className="row"><b>{c.name}</b><span className="muted">· {fmtINR(q.grandTotal)}</span></div>
        <div className={`readonly-banner`} style={{ background: over ? "var(--bad-soft)" : "var(--ok-soft)", color: over ? "var(--bad)" : "var(--ok)" }}>
          Credit check: exposure {fmtINR(exposure)} of limit {fmtINR(c.creditLimit)} — {over ? "order will go on CREDIT HOLD until Finance releases it" : "OK"}
        </div>
        <div className="form-grid">
          <Field label="Customer PO / LOI reference"><input value={poReference} onChange={(e) => setPo(e.target.value)} /></Field>
          <Field label="Required delivery date"><input type="date" value={deliveryDate} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Site / delivery address" full><textarea value={siteAddress} onChange={(e) => setSite(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}
