import StorePortal from "@/modules/store/StorePortal";

export default function Page({ params }: { params: { view?: string[] } }) {
  return <StorePortal view={(params.view ?? []).join("/") || "dashboard"} />;
}
