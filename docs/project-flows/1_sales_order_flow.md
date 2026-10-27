# 1. Sales order, replacement & return flow

## Lead to order
1. **Lead** — Sales → Leads → *New lead* (`createLead`). Status NEW → CONTACTED → SAMPLE_SENT → QUOTED → WON/LOST.
2. **Sample / trial** — *Sample* on a lead (`createSample`), then dispatched → approved/rejected.
3. **Quotation or proforma invoice** — *Quote* on a lead or Sales → Quotations (`createQuotation`). Prices come from the product master; line discounts up to 50%; 18% GST. A lead becomes a customer record on its first quotation.
4. **Sales order + credit check** — *Convert to order* (`convertQuotationToOrder`). If the customer's open exposure plus this order exceeds the credit limit, the order is put on **CREDIT_HOLD**; Finance → Credit Control → *Release hold* (`releaseCreditHold`).
5. **Plant approval** — Plant Head → Incoming Orders → *Accept* / *Reject* with reason (`acceptOrderByPlantHead`, `rejectOrderByPlantHead`).

## Fulfilment
6. **Planning** — Plant Head → Production Planning → *Plan* (`planOrder`): work orders per product, machine, shift and target date; default qty = ordered + 2% moulding allowance.
7. **Production** — see [material request flow](2_material_request_flow.md), then Production → Record Output (`recordOutput`), which hands the batch to QC.
8. **QC** — QC → Pending → *Inspect* (`recordQc`): dimension, finish and load test against EN 124 (A15 15 kN, B125 125 kN, C250 250 kN, D400 400 kN). Accepted units go to finished goods allocated to the order; rejected units go to the rework log (*Reworked* → back to QC, *Scrap* → remould).
9. **Dispatch** — Dispatch → Ready → *Load vehicle* (`createDispatch`): ships QC-passed units still owed on the order (surplus from the moulding allowance stays in stock). Generates delivery challan + gate pass; e-way bill mandatory above ₹50,000.
10. **Delivery** — Dispatch → In Transit → *Confirm delivery* with POD signatory (`confirmDelivery`).
11. **Tax invoice** — Finance → Tax Invoices → *Generate invoice* (`generateInvoice`), one per dispatch; CGST+SGST if the customer is in the company's state, else IGST.
12. **Payment** — Sales → Payment Follow-up → *Log payment* with UTR (`logPayment`; duplicate UTRs and over-payment are refused). Finance Executive → *Verify* against the bank statement (`verifyFinancePayment`) issues a receipt. The order closes when it is delivered and fully paid.

## Return (RMA)
1. Sales → Returns → *New RMA* on a delivered order (`createRma`), then *Authorise* (`setRmaStatus AUTHORIZED`).
2. Dispatch → Returns Gate Entry → *Receive at gate* (`setRmaStatus RECEIVED`).
3. QC → Returns Audit → *Restock* (to free finished-goods stock) or *Scrap* (`rmaQcDecision`).
4. Then **either** Finance → Credit Notes → *Issue credit note* (`issueCreditNote`, reduces the amount due) **or** Sales → *Replacement order* (`createReplacementOrder`).

## Replacement order
A zero-value sales order linked to the RMA. It skips the credit check and payment, and goes through plant approval, production, QC and dispatch like any other order. No tax invoice is raised.
