"use client";
import { useMemo } from "react";
import { useERPStore } from "@/store/erpStore";

/** Id → record lookups shared by every portal. */
export function useLookups() {
  const products = useERPStore((s) => s.products);
  const materials = useERPStore((s) => s.rawMaterials);
  const customers = useERPStore((s) => s.customers);
  const orders = useERPStore((s) => s.orders);
  const workOrders = useERPStore((s) => s.workOrders);
  const vendors = useERPStore((s) => s.vendors);
  const employees = useERPStore((s) => s.employees);
  return useMemo(() => {
    const map = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]));
    const P = map(products), M = map(materials), C = map(customers), O = map(orders), W = map(workOrders), V = map(vendors), E = map(employees);
    return {
      product: (id: string) => P.get(id),
      productName: (id: string) => {
        const p = P.get(id);
        return p ? `${p.name} — ${p.loadClass}` : id;
      },
      productShort: (id: string) => P.get(id)?.sku ?? id,
      material: (id: string) => M.get(id),
      customer: (id: string) => C.get(id),
      order: (id: string) => O.get(id),
      workOrder: (id: string) => W.get(id),
      vendor: (id: string) => V.get(id),
      employee: (id: string) => E.get(id),
    };
  }, [products, materials, customers, orders, workOrders, vendors, employees]);
}

export type Lookups = ReturnType<typeof useLookups>;
