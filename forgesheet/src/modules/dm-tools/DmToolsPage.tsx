import { CalendarDays, Layers3, NotebookPen, Swords, Users } from "lucide-react";
import { Badge, Panel, PanelSoft } from "@/modules/ui/components";

const cards = [
  ["Campaign Dashboard", "Session health, party threads, clocks, and active arcs.", CalendarDays],
  ["Encounter Builder", "CR-aware shell for future rules-backed encounter math.", Swords],
  ["NPC Manager", "Reusable stat blocks, motives, factions, and relationship tags.", Users],
  ["Lore Wiki", "Linked notes, places, handouts, and discoverability tools.", NotebookPen],
  ["Initiative + Overlays", "Bridge point between planning tools and the live board.", Layers3],
] as const;

export const DmToolsPage = () => (
  <div className="space-y-6">
    <Panel className="p-8">
      <Badge>Planned Module</Badge>
      <h1 className="mt-4 font-display text-4xl text-gradient">DM Tools Shell</h1>
      <p className="mt-3 max-w-3xl text-white/70">
        ForgeSheet reserves this module for campaign planning, encounter design, NPC management, and session tooling. The routes exist now so shared assets, rules services, and state boundaries stay clean as the app grows.
      </p>
    </Panel>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map(([title, body, Icon]) => (
        <PanelSoft key={title} className="p-5">
          <Icon className="h-6 w-6 text-forge-ember" />
          <h2 className="mt-4 text-xl font-semibold text-forge-mist">{title}</h2>
          <p className="mt-2 text-sm text-white/65">{body}</p>
        </PanelSoft>
      ))}
    </div>
  </div>
);
