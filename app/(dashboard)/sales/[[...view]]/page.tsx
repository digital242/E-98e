import SalesPortal from "@/modules/sales/SalesPortal";

export default function Page({ params }: { params: { view?: string[] } }) {
  return <SalesPortal view={(params.view ?? []).join("/") || "dashboard"} />;
}
