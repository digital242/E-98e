import PlantHeadPortal from "@/modules/plant-head/PlantHeadPortal";

export default function Page({ params }: { params: { view?: string[] } }) {
  return <PlantHeadPortal view={(params.view ?? []).join("/") || "dashboard"} />;
}
