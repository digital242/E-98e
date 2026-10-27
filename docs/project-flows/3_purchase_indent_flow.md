# 3. Purchase indent & procure-to-pay flow

1. **Indent** — raised automatically (AUTO_SHORTAGE from a material issue, MIN_MAX at reorder level) or manually from Store → Purchase Indents (`raiseManualIndent`). An open automatic indent for the same material is topped up rather than duplicated.
2. **Approval** — Plant Head → Indent Approvals (`approveIndent` / `rejectIndent`).
3. **RFQ & vendor selection** — Finance → Purchase Orders → *Compare & raise PO*: comparison statement of vendor rates (L1 marked), lead time and rating; negotiated rate can be edited.
4. **Purchase order** — `createPurchaseOrder`; printable PO.
5. **Gate entry** — Store → Gate Entry & GRN → *Gate entry* (`recordGateEntry`); goods held in quarantine.
6. **Incoming QC & GRN** — *QC & GRN* (`receiveGoods`): received vs accepted qty, vendor bill number and amount. Accepted qty is added to stock (weighted-average cost updated); rejected qty gets a debit note; the indent is closed.
7. **3-way match & payment** — Finance → Vendor Payments → *Pay* (`payVendor`): PO rate × GRN accepted qty + GST must match the vendor bill within 1%, otherwise payment is blocked.
