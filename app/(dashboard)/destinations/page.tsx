import { TopHeader } from "@/components/top-header"
import { DestinationList } from "@/components/destinations/destination-list"

export default function DestinationsPage() {
  return (
    <div className="flex flex-col">
      <TopHeader title="Destinations" />
      <div className="flex-1 p-6">
        <DestinationList />
      </div>
    </div>
  )
}
