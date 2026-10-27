"use client";
import { useMemo, useState } from "react";
import type { LineItem } from "@/types/erp";
import { fmtINR, lineAmount, orderTotals } from "@/lib/calc";
import { run } from "@/store/notificationStore";
import { useERPStore } from "@/store/erpStore";
import { Btn, Field, Modal } from "./ui";

/** Quotation & pricing engine: catalogue price list, line discounts, live GST totals. */
export default function CreateQuotation({ onClose, leadId, onCreated }: { onClose: () => void; leadId?: string; onCreated?: (id: string) => void }) {
  const s = useERPStore();
  const lead = s.leads.find((l) => l.id === leadId);
  const [customerId, setCustomerId] = useState(lead?.customerId ?? s.customers[0]?.id ?? "");
  const [items, setItems] = useState<LineItem[]>([{ productId: s.products[0].id, qty: 1, rate: s.products[0].price, discountPct: 0 }]);
  const [validDays, setValidDays] = useState(15);
  const [terms, setTerms] = useState("50% advance, balance before dispatch. Ex-works, freight extra.");
  const [isProforma, setIsProforma] = useState(false);
  const totals = useMemo(() => orderTotals(items), [items]);
  const customer = s.customers.find((c) => c.id === customerId);

  const update = (i: number, patch: Partial<LineItem>) => setItems(items.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const changeProduct = (i: number, productId: string) => update(i, { productId, rate: s.products.find((p) => p.id === productId)?.price ?? 0 });

  const ensureCustomer = () => {
    if (lead && !lead.customerId) {
      const c = run(() => s.convertLeadToCustomer(lead.id, "", 300000));
      return c?.id;
    }
    return customerId;
  };

  const save = () => {
    const cid = ensureCustomer();
    if (!cid) return;
    const q = run(() => s.createQuotation({ customerId: cid, leadId, items, validDays, terms, isProforma }), (r) => `${r.quoteNo} created`);
    if (q) {
      onCreated?.(q.id);
      onClose();
    }
  };

  return (
    <Modal title={isProforma ? "New proforma invoice" : "New quotation"} wide onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save}>Save & send</Btn></>}>
      <div className="stack">
        <div className="form-grid">
          {lead && !lead.customerId ? (
            <Field label="Customer" hint="A customer record will be created from this lead">
              <input value={`${lead.company} (${lead.city}, ${lead.state})`} disabled />
            </Field>
          ) : (
            <Field label="Customer" hint={customer ? `Credit limit ${fmtINR(customer.creditLimit)} · ${customer.state}` : undefined}>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                {s.customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.city}</option>)}
              </select>
            </Field>
          )}
          <Field label="Valid for (days)"><input type="number" min={1} value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} /></Field>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Rate (₹)</th><th className="num">Disc %</th><th className="num">Amount</th><th /></tr></thead>
            <tbody>
              {items.map((l, i) => (
                <tr key={i}>
                  <td style={{ minWidth: 260 }}>
                    <select value={l.productId} onChange={(e) => changeProduct(i, e.target.value)}>
                      {s.products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name} · {p.loadClass}</option>)}
                    </select>
                  </td>
                  <td className="num"><input type="number" min={1} style={{ width: 80 }} value={l.qty} onChange={(e) => update(i, { qty: Number(e.target.value) })} /></td>
                  <td className="num"><input type="number" min={0} style={{ width: 110 }} value={l.rate} onChange={(e) => update(i, { rate: Number(e.target.value) })} /></td>
                  <td className="num"><input type="number" min={0} max={50} style={{ width: 70 }} value={l.discountPct} onChange={(e) => update(i, { discountPct: Number(e.target.value) })} /></td>
                  <td className="num">{fmtINR(lineAmount(l))}</td>
                  <td><button className="btn ghost sm" onClick={() => setItems(items.filter((_, k) => k !== i))} disabled={items.length === 1} aria-label="Remove line">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row">
          <Btn size="sm" onClick={() => setItems([...items, { productId: s.products[0].id, qty: 1, rate: s.products[0].price, discountPct: 0 }])}>+ Add line</Btn>
          <div className="grow" />
          <span className="muted">Subtotal {fmtINR(totals.subtotal)} · GST 18% {fmtINR(totals.taxTotal)} ·</span> <b>Total {fmtINR(totals.grandTotal)}</b>
        </div>
        <div className="form-grid">
          <Field label="Payment & delivery terms" full><textarea value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
          <label className="check"><input type="checkbox" checked={isProforma} onChange={(e) => setIsProforma(e.target.checked)} /> Issue as Proforma Invoice (for advance payment)</label>
        </div>
      </div>
    </Modal>
  );
}
