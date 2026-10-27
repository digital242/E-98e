import ProductionPortal from "@/modules/production/ProductionPortal";

export default function Page({ params }: { params: { view?: string[] } }) {
  return <ProductionPortal view={(params.view ?? []).join("/") || "dashboard"} />;
}
