"use client";
import type { SalesOrder } from "@/types/erp";
import { fmtDateTime } from "@/lib/calc";

export default function OrderTimeline({ order }: { order: SalesOrder }) {
  const events = [...order.history].reverse();
  return (
    <ul className="timeline">
      {events.map((e, i) => (
        <li key={i}>
          <div className="t-stage">{e.stage.replace(/_/g, " ")}</div>
          <div>{e.note}</div>
          <div className="t-meta">
            {fmtDateTime(e.at)} · {e.actor}
          </div>
        </li>
      ))}
    </ul>
  );
}

const STEPS = ["Order", "Plant", "Planned", "Production", "QC", "Dispatch", "Delivered", "Paid"];

/** Index of the current step in the pipeline for an order. */
function stepIndex(o: SalesOrder): number {
  if (o.workflowStatus === "CLOSED") return 8;
  if (o.dispatchStatus === "DELIVERED") return 7;
  if (o.dispatchStatus !== "PENDING") return 5;
  if (o.qcStatus === "PASSED") return 5;
  if (o.workflowStatus === "QC" || o.qcStatus === "PARTIAL") return 4;
  if (o.productionStatus !== "NOT_STARTED") return 3;
  if (o.planningStatus === "PLANNED") return 2;
  if (o.planningStatus === "PLANT_HEAD_ACCEPTED") return 2;
  return 1;
}

export function OrderPipeline({ order }: { order: SalesOrder }) {
  const idx = stepIndex(order);
  const rejected = order.workflowStatus === "REJECTED";
  return (
    <div className="pipeline" aria-label={`Order stage ${order.workflowStatus}`}>
      {STEPS.map((s, i) => (
        <div key={s} className={`pipe-step ${rejected ? "" : i < idx ? "done" : i === idx ? "current" : ""}`}>
          {s}
        </div>
      ))}
    </div>
  );
}
