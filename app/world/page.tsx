import { WorldView } from "@/components/world/world-view";
import { BypassToggle } from "@/components/bypass-toggle";

export default function WorldPage() {
  return (
    <main className="world-theme min-h-screen flex flex-col">
      <div className="flex-1">
        <WorldView />
      </div>
      <BypassToggle />
    </main>
  );
}
