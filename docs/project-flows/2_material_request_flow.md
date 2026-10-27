# 2. Material request flow

1. **Requisition** — Production → Work Orders → *Request material (BOM)* (`createMaterialRequest`). Quantities = BOM per unit × units still to mould. Extra requests (repairs, spillage) via Material Requests → *Additional request*.
2. **HOD approval** — Plant Head → Material Approvals (`approveMaterialRequest` / `rejectMaterialRequest`). Lines more than 5% above BOM are highlighted.
3. **Store check & auto-indent** — Store → Material Issues → *Issue (MIS)* (`issueMaterialRequest`).
   - Enough stock on every line → stock deducted, Material Issue Slip number generated, status ISSUED.
   - Any line short → **nothing is issued**, status SHORTAGE, and an AUTO_SHORTAGE purchase indent is raised for the gap (at least the reorder qty). *Retry issue* once the GRN arrives.
   - After each issue, a material at or below its reorder level gets a MIN_MAX indent automatically.
4. **Acknowledgement** — Production → Material Requests → *Acknowledge receipt* (`acknowledgeMaterial`). Output can only be recorded on a work order that has had material issued.
