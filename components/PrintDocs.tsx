"use client";
import type { ReactNode } from "react";
import type { LineItem } from "@/types/erp";
import { amountInWords, fmtDate, fmtINR2, gstSplit, lineAmount, round2 } from "@/lib/calc";
import { useERPStore } from "@/store/erpStore";
import { Btn, Modal } from "./ui";
import { useLookups } from "./useLookups";

function DocShell({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const company = useERPStore((s) => s.company);
  return (
    <Modal
      title={title}
      onClose={onClose}
      wide
      footer={
        <>
          <Btn readOnlySafe onClick={onClose}>Close</Btn>
          <Btn readOnlySafe variant="primary" onClick={() => window.print()}>Print / Save PDF</Btn>
        </>
      }
    >
      <div className="print-area">
        <div className="doc">
          <div className="doc-head">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={company.logoUrl || "/brand/thermodrain-logo.png"} alt={company.brandName} style={{ height: 54, width: "auto" }} />
            </div>
            <div style={{ textAlign: "right" }}>
              <b style={{ fontSize: 14 }}>{company.legalName}</b>
              <div>{company.address}</div>
              <div>GSTIN: {company.gstin} · State: {company.state}</div>
              <div>{company.phone} · {company.email}</div>
              <div>{company.website}</div>
            </div>
          </div>
          <div className="doc-title">{title.toUpperCase()}</div>
          {children}
        </div>
      </div>
    </Modal>
  );
}

function ItemsTable({ items, showAmounts = true }: { items: LineItem[]; showAmounts?: boolean }) {
  const L = useLookups();
  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Description</th>
          <th>HSN</th>
          <th className="num">Qty</th>
          <th>Unit</th>
          {showAmounts && <th className="num">Rate</th>}
          {showAmounts && <th className="num">Disc %</th>}
          {showAmounts && <th className="num">Amount</th>}
        </tr>
      </thead>
      <tbody>
        {items.map((i, k) => {
          const p = L.product(i.productId);
          return (
            <tr key={k}>
              <td>{k + 1}</td>
              <td>
                <b>{p?.name}</b>
                <div style={{ fontSize: 11 }}>{p?.sku} · {p?.size} · {p?.loadClass}</div>
              </td>
              <td>{p?.hsn}</td>
              <td className="num">{i.qty}</td>
              <td>{p?.unit}</td>
              {showAmounts && <td className="num">{fmtINR2(i.rate)}</td>}
              {showAmounts && <td className="num">{i.discountPct || 0}</td>}
              {showAmounts && <td className="num">{fmtINR2(lineAmount(i))}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Totals({ subtotal, customerState }: { subtotal: number; customerState: string }) {
  const company = useERPStore((s) => s.company);
  const t = gstSplit(subtotal, company.state, customerState);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginTop: 10 }}>
      <div style={{ flex: 1 }}>
        <b>Amount in words:</b> {amountInWords(t.total)}
        <div style={{ marginTop: 8 }}>
          <b>Bank:</b> {company.bankName} · A/c {company.bankAccount} · IFSC {company.ifsc}
        </div>
      </div>
      <table style={{ width: 300 }}>
        <tbody>
          <tr><td>Taxable value</td><td className="num">{fmtINR2(subtotal)}</td></tr>
          {t.igst ? (
            <tr><td>IGST 18%</td><td className="num">{fmtINR2(t.igst)}</td></tr>
          ) : (
            <>
              <tr><td>CGST 9%</td><td className="num">{fmtINR2(t.cgst)}</td></tr>
              <tr><td>SGST 9%</td><td className="num">{fmtINR2(t.sgst)}</td></tr>
            </>
          )}
          <tr><td><b>Grand total</b></td><td className="num"><b>{fmtINR2(t.total)}</b></td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Signatures({ left = "Receiver's signature", right }: { left?: string; right?: string }) {
  const company = useERPStore((s) => s.company);
  return (
    <div className="doc-sign">
      <div>{left}</div>
      <div style={{ textAlign: "right" }}>
        For {company.legalName}
        <br />
        <br />
        {right ?? "Authorised signatory"}
      </div>
    </div>
  );
}

export function QuotationDoc({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useERPStore((s) => s.quotations.find((x) => x.id === id));
  const L = useLookups();
  if (!q) return null;
  const c = L.customer(q.customerId);
  return (
    <DocShell title={q.isProforma ? "Proforma Invoice" : "Quotation"} onClose={onClose}>
      <div className="doc-meta">
        <div className="doc-box">
          <b>To</b>
          <div>{c?.name}</div>
          <div>{c?.city}, {c?.state}</div>
          <div>GSTIN: {c?.gstin}</div>
          <div>Kind attn: {c?.contact}</div>
        </div>
        <div className="doc-box">
          <div><b>No:</b> {q.quoteNo}</div>
          <div><b>Date:</b> {fmtDate(q.createdAt)}</div>
          <div><b>Valid till:</b> {fmtDate(q.validTill)}</div>
        </div>
      </div>
      <ItemsTable items={q.items} />
      <Totals subtotal={q.subtotal} customerState={c?.state ?? ""} />
      <div style={{ marginTop: 12 }}>
        <b>Terms:</b> {q.terms || "As agreed"}. Covers and gratings tested to EN 124 / IS 12592 for the stated load class.
      </div>
      <Signatures left="" />
    </DocShell>
  );
}

export function InvoiceDoc({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useERPStore();
  const L = useLookups();
  const inv = s.invoices.find((x) => x.id === id);
  if (!inv) return null;
  const c = L.customer(inv.customerId);
  const o = L.order(inv.orderId);
  const d = s.dispatchOrders.find((x) => x.id === inv.dispatchId);
  return (
    <DocShell title="Tax Invoice" onClose={onClose}>
      <div className="doc-meta">
        <div className="doc-box">
          <b>Bill to / Ship to</b>
          <div>{c?.name}</div>
          <div>{o?.siteAddress}</div>
          <div>{c?.city}, {c?.state}</div>
          <div>GSTIN: {c?.gstin}</div>
        </div>
        <div className="doc-box">
          <div><b>Invoice no:</b> {inv.invoiceNo}</div>
          <div><b>Date:</b> {fmtDate(inv.date)} · <b>Due:</b> {fmtDate(inv.dueDate)}</div>
          <div><b>Order:</b> {o?.orderNo} · <b>Customer PO:</b> {o?.poReference}</div>
          <div><b>Challan:</b> {d?.challanNo} · <b>Vehicle:</b> {d?.vehicleNo}</div>
          <div><b>E-way bill:</b> {d?.ewayBillNo || "—"}</div>
        </div>
      </div>
      <ItemsTable items={inv.items} />
      <Totals subtotal={inv.subtotal} customerState={c?.state ?? ""} />
      <Signatures />
    </DocShell>
  );
}

export function ChallanDoc({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useERPStore();
  const L = useLookups();
  const d = s.dispatchOrders.find((x) => x.id === id);
  if (!d) return null;
  const o = L.order(d.orderId);
  const items = d.items.map((i) => ({ productId: i.productId, qty: i.qty, rate: 0, discountPct: 0 }));
  const weight = round2(d.items.reduce((a, i) => a + (L.product(i.productId)?.weightKg ?? 0) * i.qty, 0));
  return (
    <DocShell title="Delivery Challan & Gate Pass" onClose={onClose}>
      <div className="doc-meta">
        <div className="doc-box">
          <b>Consignee</b>
          <div>{o?.customerName}</div>
          <div>{o?.siteAddress}</div>
          <div>Order {o?.orderNo} · PO {o?.poReference}</div>
        </div>
        <div className="doc-box">
          <div><b>Challan:</b> {d.challanNo}</div>
          <div><b>Gate pass:</b> {d.gatePassNo}</div>
          <div><b>Date:</b> {fmtDate(d.dispatchedAt)}</div>
          <div><b>Vehicle:</b> {d.vehicleNo} · <b>Transporter:</b> {d.transporter || "—"}</div>
          <div><b>Driver:</b> {d.driverName} {d.driverPhone}</div>
          <div><b>E-way bill:</b> {d.ewayBillNo || "—"}</div>
        </div>
      </div>
      <ItemsTable items={items} showAmounts={false} />
      <div style={{ marginTop: 8 }}>Approx. gross weight: <b>{weight} kg</b></div>
      <Signatures left="Received in good condition (sign & stamp)" right="Dispatch / Security" />
    </DocShell>
  );
}

export function PurchaseOrderDoc({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useERPStore();
  const L = useLookups();
  const po = s.purchaseOrders.find((x) => x.id === id);
  if (!po) return null;
  const v = L.vendor(po.vendorId);
  const m = L.material(po.materialId);
  const sub = round2(po.qty * po.rate);
  return (
    <DocShell title="Purchase Order" onClose={onClose}>
      <div className="doc-meta">
        <div className="doc-box">
          <b>Vendor</b>
          <div>{v?.name}</div>
          <div>{v?.city}</div>
          <div>GSTIN: {v?.gstin}</div>
        </div>
        <div className="doc-box">
          <div><b>PO no:</b> {po.poNo}</div>
          <div><b>Date:</b> {fmtDate(po.createdAt)}</div>
          <div><b>Delivery:</b> within {v?.leadTimeDays} days to plant stores</div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Material</th><th className="num">Qty</th><th>Unit</th><th className="num">Rate</th><th className="num">Amount</th></tr>
        </thead>
        <tbody>
          <tr><td>{m?.code} — {m?.name}</td><td className="num">{po.qty}</td><td>{m?.unit}</td><td className="num">{fmtINR2(po.rate)}</td><td className="num">{fmtINR2(sub)}</td></tr>
        </tbody>
      </table>
      <Totals subtotal={sub} customerState={s.company.state} />
      <div style={{ marginTop: 10 }}>Goods are subject to incoming quality inspection. Rejected quantity will be returned against a debit note.</div>
      <Signatures left="" />
    </DocShell>
  );
}

export function PayslipDoc({ batchId, employeeId, onClose }: { batchId: string; employeeId: string; onClose: () => void }) {
  const s = useERPStore();
  const b = s.payrollBatches.find((x) => x.id === batchId);
  const e = s.employees.find((x) => x.id === employeeId);
  const l = b?.lines.find((x) => x.employeeId === employeeId);
  if (!b || !e || !l) return null;
  const ratio = l.grossFixed ? (l.grossEarned - l.otPay) / l.grossFixed : 0;
  const rows: [string, number, string, number][] = [
    ["Basic", e.basic * ratio, "Provident Fund (12%)", l.pf],
    ["HRA", e.hra * ratio, "ESI (0.75%)", l.esi],
    ["Allowances", e.allowances * ratio, "Professional Tax", l.pt],
    ["Overtime", l.otPay, "TDS", l.tds],
    ["", 0, "Loan recovery", l.loan],
  ];
  const ded = l.pf + l.esi + l.pt + l.tds + l.loan;
  return (
    <DocShell title={`Payslip — ${b.month}`} onClose={onClose}>
      <div className="doc-meta">
        <div className="doc-box">
          <div><b>{e.name}</b> ({e.empCode})</div>
          <div>{e.designation}, {e.department}</div>
          <div>Bank A/c: {e.bankAccount}</div>
        </div>
        <div className="doc-box">
          <div><b>Pay period:</b> {b.month}</div>
          <div><b>Payable days:</b> {l.payableDays}</div>
          <div><b>Batch:</b> {b.batchNo} ({b.status.toLowerCase()})</div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Earnings</th><th className="num">Amount</th><th>Deductions</th><th className="num">Amount</th></tr>
        </thead>
        <tbody>
          {rows.map(([a, av, d, dv], i) => (
            <tr key={i}><td>{a}</td><td className="num">{a ? fmtINR2(av) : ""}</td><td>{d}</td><td className="num">{fmtINR2(dv)}</td></tr>
          ))}
          <tr><td><b>Gross earnings</b></td><td className="num"><b>{fmtINR2(l.grossEarned)}</b></td><td><b>Total deductions</b></td><td className="num"><b>{fmtINR2(ded)}</b></td></tr>
        </tbody>
      </table>
      <div style={{ marginTop: 12, fontSize: 14 }}>
        <b>Net pay: {fmtINR2(l.net)}</b> — {amountInWords(l.net)}
      </div>
      <div style={{ marginTop: 20, fontSize: 11 }}>This is a computer-generated payslip.</div>
    </DocShell>
  );
}
