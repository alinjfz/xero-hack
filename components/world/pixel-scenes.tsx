"use client";

import type { WorldHealth, WorldSnapshot } from "@/lib/world-summary";
import type { WorldId } from "@/lib/world-tags";

export type HotspotId = "door" | "mailbox" | "shed" | "window" | "counter" | "office" | "delivery" | "sign";

export type Hotspot = {
  id: HotspotId;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const HOUSE_HOTSPOTS: Hotspot[] = [
  { id: "door", label: "Front door", x: 42, y: 48, width: 16, height: 22 },
  { id: "mailbox", label: "Mailbox", x: 12, y: 62, width: 12, height: 14 },
  { id: "shed", label: "Garden shed", x: 72, y: 58, width: 18, height: 16 },
  { id: "window", label: "Window", x: 58, y: 42, width: 12, height: 10 },
];

const BIZ_HOTSPOTS: Hotspot[] = [
  { id: "counter", label: "Shop counter", x: 38, y: 52, width: 24, height: 18 },
  { id: "office", label: "Back office", x: 10, y: 40, width: 16, height: 18 },
  { id: "delivery", label: "Delivery bay", x: 72, y: 56, width: 18, height: 16 },
  { id: "sign", label: "Signboard", x: 34, y: 24, width: 28, height: 12 },
];

type SceneProps = {
  world: WorldSnapshot;
  onHotspot: (hotspot: HotspotId) => void;
};

function healthSky(health: WorldHealth) {
  if (health === "stormy") {
    return "from-[#6d7f96] to-[#4f5d70]";
  }

  if (health === "cloudy") {
    return "from-[#9ec5e8] to-[#c8def0]";
  }

  return "from-[#8fd3ff] to-[#dff3ff]";
}

function PixelScene({
  worldId,
  label,
  health,
  buildingEmoji,
  accent,
  hotspots,
  onHotspot,
}: {
  worldId: WorldId;
  label: string;
  health: WorldHealth;
  buildingEmoji: string;
  accent: string;
  hotspots: Hotspot[];
  onHotspot: (hotspot: HotspotId) => void;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border-2 border-[#5c4a32] bg-[#efe2c5] shadow-[0_8px_0_#5c4a32]">
      <div className={`relative aspect-[4/3] bg-gradient-to-b ${healthSky(health)}`}>
        {health === "stormy" ? <div className="world-rain pointer-events-none absolute inset-0 opacity-50" /> : null}
        {health === "cloudy" ? <div className="world-cloud pointer-events-none absolute left-[18%] top-[12%] h-8 w-16 rounded-full bg-white/70" /> : null}
        {health === "sunny" && worldId === "home" ? <div className="world-smoke pointer-events-none absolute left-[48%] top-[28%] h-8 w-3" /> : null}

        <div className="absolute inset-x-[10%] bottom-[18%] h-[8%] rounded-full bg-[#4a7a45]/35 blur-md" />

        <div
          className="absolute bottom-[22%] left-1/2 flex -translate-x-1/2 flex-col items-center"
          style={{ imageRendering: "pixelated" }}
        >
          <div
            className={`mb-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#2f2418] ${accent}`}
          >
            {label}
          </div>
          <div className="text-6xl drop-shadow-[0_4px_0_rgba(0,0,0,0.15)]">{buildingEmoji}</div>
          {health === "stormy" && worldId === "biz" ? (
            <div className="mt-1 rounded bg-[#7d2f2f] px-2 py-0.5 text-[10px] font-bold text-white">CLOSED</div>
          ) : null}
          {health === "sunny" && worldId === "biz" ? (
            <div className="world-sign mt-1 rounded bg-[#f0c14b] px-2 py-0.5 text-[10px] font-bold text-[#4a341f]">OPEN</div>
          ) : null}
        </div>

        {hotspots.map((spot) => (
          <button
            key={spot.id}
            type="button"
            aria-label={spot.label}
            className="absolute rounded-md border-2 border-dashed border-white/0 bg-white/0 transition hover:border-white/70 hover:bg-white/15 focus:border-white/90 focus:bg-white/20"
            style={{
              left: `${spot.x}%`,
              top: `${spot.y}%`,
              width: `${spot.width}%`,
              height: `${spot.height}%`,
            }}
            onClick={() => onHotspot(spot.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function HouseScene({ world, onHotspot }: SceneProps) {
  return (
    <PixelScene
      worldId="home"
      label="Rental house"
      health={world.health}
      buildingEmoji="🏡"
      accent="bg-[#f6d7b0]"
      hotspots={HOUSE_HOTSPOTS}
      onHotspot={onHotspot}
    />
  );
}

export function BusinessScene({ world, onHotspot }: SceneProps) {
  return (
    <PixelScene
      worldId="biz"
      label="Small business"
      health={world.health}
      buildingEmoji="🏪"
      accent="bg-[#ffd6a5]"
      hotspots={BIZ_HOTSPOTS}
      onHotspot={onHotspot}
    />
  );
}

export { HOUSE_HOTSPOTS, BIZ_HOTSPOTS };
