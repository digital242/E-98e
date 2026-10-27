"use client";
import { useMemo, useState } from "react";
import type { SalesOrder } from "@/types/erp";
import { fmtDate, fmtINR, lineAmount } from "@/lib/calc";
import { useERPStore } from "@/store/erpStore";
import { Btn, DataTable, Modal, Search, StatusBadge, Card } from "./ui";
import OrderTimeline, { OrderPipeline } from "./OrderTimeline";
import { useLookups } from "./useLookups";

export function OrderDetailModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const s = useERPStore();
  const L = useLookups();
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return null;
  const wos = s.workOrders.filter((w) => w.orderId === o.id);
  const disp = s.dispatchOrders.filter((d) => d.orderId === o.id);
  const pays = s.paymentConfirmations.filter((p) => p.orderId === o.id);
  const invs = s.invoices.filter((i) => i.orderId === o.id);
  const accepted = (pid: string) => s.finishedGoods.filter((f) => f.orderId === o.id && f.productId === pid).reduce((a, f) => a + f.qty, 0);
  const shipped = (pid: string) => disp.flatMap((d) => d.items).filter((i) => i.productId === pid).reduce((a, i) => a + i.qty, 0);

  return (
    <Modal title={`${o.orderNo} · ${o.customerName}`} onClose={onClose} wide>
      <div className="stack">
        <OrderPipeline order={o} />
        <div className="row">
          <StatusBadge status={o.workflowStatus} />
          <StatusBadge status={o.commercialStatus} />
          <span className="muted">Payment:</span> <StatusBadge status={o.paymentStatus} />
          {o.orderType === "REPLACEMENT" && <StatusBadge status="REPLACEMENT" />}
        </div>
        <div className="grid grid-3">
          <div><small>Customer PO</small><div>{o.poReference || "—"}</div></div>
          <div><small>Delivery by</small><div>{fmtDate(o.deliveryDate)}</div></div>
          <div><small>Order value</small><div><b>{fmtINR(o.grandTotal)}</b> <span className="muted">(paid {fmtINR(o.amountPaid)})</span></div></div>
          <div className="full" style={{ gridColumn: "1 / -1" }}><small>Site</small><div>{o.siteAddress || "—"}</div></div>
        </div>
        <Card title="Items" flush>
          <DataTable
            rowKey={(i) => i.productId}
            rows={o.items}
            columns={[
              { header: "Product", render: (i) => L.productName(i.productId) },
              { header: "Qty", num: true, render: (i) => i.qty },
              { header: "QC passed", num: true, render: (i) => accepted(i.productId) },
              { header: "Dispatched", num: true, render: (i) => shipped(i.productId) },
              { header: "Rate", num: true, render: (i) => fmtINR(i.rate) },
              { header: "Amount", num: true, render: (i) => fmtINR(lineAmount(i)) },
            ]}
          />
        </Card>
        <div className="grid grid-2">
          <Card title="Work orders" flush>
            <DataTable
              rowKey={(w) => w.id}
              rows={wos}
              empty="Not planned yet"
              columns={[
                { header: "WO", render: (w) => <span className="mono">{w.workOrderNo}</span> },
                { header: "Produced", num: true, render: (w) => `${w.producedQty}/${w.plannedQty}` },
                { header: "Status", render: (w) => <StatusBadge status={w.status} /> },
              ]}
            />
          </Card>
          <Card title="Dispatch, invoices & payments" flush>
            <DataTable
              rowKey={(r) => r.key}
              rows={[
                ...disp.map((d) => ({ key: d.id, doc: d.dispatchNo, info: `${d.vehicleNo}`, status: d.status })),
                ...invs.map((i) => ({ key: i.id, doc: i.invoiceNo, info: fmtINR(i.total), status: "INVOICED" })),
                ...pays.map((p) => ({ key: p.id, doc: p.utrNumber, info: fmtINR(p.amount), status: p.status })),
              ]}
              empty="Nothing yet"
              columns={[
                { header: "Document", render: (r) => <span className="mono">{r.doc}</span> },
                { header: "Detail", render: (r) => r.info },
                { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
              ]}
            />
          </Card>
        </div>
        <Card title="Order history">
          <OrderTimeline order={o} />
        </Card>
      </div>
    </Modal>
  );
}

export default function OrdersView({
  orders,
  actions,
  empty,
}: {
  orders: SalesOrder[];
  actions?: (o: SalesOrder) => React.ReactNode;
  empty?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return orders;
    return orders.filter((o) => `${o.orderNo} ${o.customerName} ${o.poReference} ${o.workflowStatus}`.toLowerCase().includes(t));
  }, [orders, q]);
  return (
    <>
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Search order, customer, PO…" />
        <span className="muted">{rows.length} orders</span>
      </div>
      <Card flush>
        <DataTable
          rowKey={(o) => o.id}
          rows={rows}
          empty={empty}
          columns={[
            {
              header: "Order",
              render: (o) => (
                <button className="btn ghost sm mono" style={{ padding: 0 }} onClick={() => setOpen(o.id)}>
                  {o.orderNo}
                </button>
              ),
            },
            { header: "Customer", render: (o) => <>{o.customerName}{o.orderType === "REPLACEMENT" && <div><small>Replacement</small></div>}</> },
            { header: "Value", num: true, render: (o) => fmtINR(o.grandTotal) },
            { header: "Delivery", render: (o) => <span className="nowrap">{fmtDate(o.deliveryDate)}</span> },
            { header: "Stage", render: (o) => <StatusBadge status={o.workflowStatus} /> },
            { header: "Payment", render: (o) => <StatusBadge status={o.paymentStatus} /> },
            {
              header: "",
              render: (o) => (
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  {actions?.(o)}
                  <Btn size="sm" readOnlySafe onClick={() => setOpen(o.id)}>
                    View
                  </Btn>
                </div>
              ),
            },
          ]}
        />
      </Card>
      {open && <OrderDetailModal orderId={open} onClose={() => setOpen(null)} />}
    </>
  );
}
