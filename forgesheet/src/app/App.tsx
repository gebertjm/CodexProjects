import { NavLink, Route, Routes } from "react-router-dom";
import { Hammer, Map, Scroll, ShieldHalf } from "lucide-react";
import { CharacterBuilderPage } from "@/modules/character-builder/CharacterBuilderPage";
import { DmToolsPage } from "@/modules/dm-tools/DmToolsPage";
import { GameboardPage } from "@/modules/gameboard/GameboardPage";
import { ForgeSheetLogo } from "@/modules/assets/logo";

const navItems = [
  { to: "/", label: "Character Builder", icon: Scroll },
  { to: "/dm-tools", label: "DM Tools", icon: ShieldHalf },
  { to: "/gameboard", label: "Gameboard", icon: Map },
];

export const App = () => (
  <div className="safe-theme min-h-screen px-4 py-6 md:px-6">
    <div className="mx-auto max-w-[1600px]">
      <header className="no-print mb-6 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-[#1a1d24] p-5 shadow-forge md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <ForgeSheetLogo />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-forge-sky">ForgeSheet</p>
            <h1 className="font-display text-3xl text-forge-mist">Build heroes. Explain every number.</h1>
          </div>
        </div>
        <nav className="flex flex-wrap gap-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition ${
                  isActive ? "border-forge-ember/60 bg-forge-ember/10 text-forge-mist" : "border-white/10 text-white/70 hover:bg-white/[0.06]"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        {[
          ["Rules-first architecture", "Repository, engine, validation, and UI remain separate by design."],
          ["Legally safe content defaults", "SRD-compatible summaries ship by default. Licensed or homebrew data can be layered later."],
          ["Desktop-ready foundation", "Vite + React + local persistence keep the app easy to wrap with Electron or Tauri later."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-3xl border border-white/10 bg-[#20242c] p-5">
            <Hammer className="h-5 w-5 text-forge-ember" />
            <h2 className="mt-4 text-lg font-semibold text-forge-mist">{title}</h2>
            <p className="mt-2 text-sm text-white/65">{body}</p>
          </div>
        ))}
      </section>

      <Routes>
        <Route path="/" element={<CharacterBuilderPage />} />
        <Route path="/dm-tools" element={<DmToolsPage />} />
        <Route path="/gameboard" element={<GameboardPage />} />
      </Routes>
    </div>
  </div>
);
