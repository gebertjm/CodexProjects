import { Badge, Panel, PanelSoft } from "@/modules/ui/components";

const slices = [
  "Scene loader and map registry",
  "Token roster and ownership model",
  "Grid, range, and movement measurement",
  "Fog of war and line of sight overlays",
  "Combat HUD and initiative strip",
  "Annotations, pings, and DM-only layers",
];

export const GameboardPage = () => (
  <div className="space-y-6">
    <Panel className="overflow-hidden p-8">
      <Badge>Expansion Route</Badge>
      <h1 className="mt-4 font-display text-4xl text-gradient">Interactive Gameboard Shell</h1>
      <p className="mt-3 max-w-3xl text-white/70">
        This route marks the separation between preparation tools and live play. The current shell establishes a place for scene state, token services, overlay systems, and player-versus-DM presentation modes.
      </p>
    </Panel>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {slices.map((slice) => (
        <PanelSoft key={slice} className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-white/45">Reserved Slice</p>
          <h2 className="mt-3 text-xl font-semibold text-forge-mist">{slice}</h2>
        </PanelSoft>
      ))}
    </div>
  </div>
);
