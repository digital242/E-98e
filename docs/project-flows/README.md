# Business process flows

| # | Flow | Roles |
|---|---|---|
| 1 | [Sales order, replacement & return](1_sales_order_flow.md) | Sales, Finance, Plant Head, Production, Store, QC, Dispatch, Finance Executive |
| 2 | [Material request](2_material_request_flow.md) | Production, Plant Head, Store |
| 3 | [Purchase indent & procure-to-pay](3_purchase_indent_flow.md) | Store, Plant Head, Finance |
| 4 | [HR salary preparation](4_hr_salary_prep_flow.md) | HR, Finance |

Each step names the screen and the store action that performs it (`store/domains/*`).

```
Sales ──orders──▶ Plant Head ──work orders──▶ Production ──requests──▶ Store
                                                 │
                                         moulded batches
                                                 ▼
                                                QC ──passed──▶ Finished goods ──▶ Dispatch ──POD──▶ Finance
   ▲                                                                                                 │
   └──────────────────────────────────────── payment receipts ◀──────────────────────────────────────┘
```
