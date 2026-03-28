import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Download,
  Eye,
  ScrollText,
  Shield,
  Sparkles,
  Sword,
  WandSparkles,
} from "lucide-react";
import { defaultDraft } from "@/modules/character-builder/defaults";
import { useActiveDraft, useBuilderStore } from "@/modules/character-builder/store";
import { computeCharacter } from "@/modules/rules-engine/engine";
import { rulesRepository } from "@/modules/rules-engine/repository";
import { abilities, type Skill } from "@/modules/rules-engine/types";
import { Badge, Button, Panel, PanelSoft } from "@/modules/ui/components";

const steps = [
  { id: "identity", label: "Identity" },
  { id: "lineage", label: "Species" },
  { id: "class", label: "Class" },
  { id: "background", label: "Background" },
  { id: "abilities", label: "Abilities" },
  { id: "equipment", label: "Equipment" },
  { id: "spells", label: "Spells" },
  { id: "review", label: "Review" },
] as const;

const skillLabels: Record<Skill, string> = {
  acrobatics: "Acrobatics",
  animalHandling: "Animal Handling",
  arcana: "Arcana",
  athletics: "Athletics",
  deception: "Deception",
  history: "History",
  insight: "Insight",
  intimidation: "Intimidation",
  investigation: "Investigation",
  medicine: "Medicine",
  nature: "Nature",
  perception: "Perception",
  performance: "Performance",
  persuasion: "Persuasion",
  religion: "Religion",
  sleightOfHand: "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
};

const standardArray = [15, 14, 13, 12, 10, 8];

const sectionLead: Record<(typeof steps)[number]["id"], string> = {
  identity: "Set draft metadata and pick guided or expert mode.",
  lineage: "Species drives speed, languages, and innate traits through the repository.",
  class: "Class controls proficiencies, spellcasting, hit die, and feature unlocks.",
  background: "Background ties story to mechanics with skills, languages, and gear.",
  abilities: "Raw scores stay separate from final modifiers for rules transparency.",
  equipment: "Armor and weapon choices update AC and attack math immediately.",
  spells: "Spell support stays class-aware and legally safe by default.",
  review: "Validation, export, and printable summary tools live here."
};

export const CharacterBuilderPage = () => {
  const draft = useActiveDraft();
  const { updateDraft, createDraft, resetActiveDraft, setMode, drafts, selectDraft } = useBuilderStore();
  const [activeStep, setActiveStep] = useState<(typeof steps)[number]["id"]>("identity");
  const computation = useMemo(() => computeCharacter(draft), [draft]);
  const characterClass = computation.characterClass;
  const availableSubclasses = rulesRepository.subclasses.filter((subclass) => subclass.classId === draft.classId);
  const background = computation.background;
  const availableSpells = rulesRepository.spells.filter((spell) => spell.classes.includes(draft.classId));

  const exportJson = () => {
    const payload = JSON.stringify({ draft, computation }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${draft.name.toLowerCase().replace(/\s+/g, "-") || "forgesheet-character"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const skillOptions = characterClass?.skillChoices.options ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
      <Panel className="no-print p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">Character Library</p>
            <h2 className="font-display text-2xl text-forge-mist">Drafts</h2>
          </div>
          <Button className="bg-forge-ember/20" onClick={createDraft}>
            New
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {drafts.map((entry) => (
            <button
              key={entry.id}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                draft.id === entry.id
                  ? "border-forge-ember/70 bg-forge-ember/10"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
              onClick={() => selectDraft(entry.id)}
            >
              <div className="flex items-center justify-between">
                <strong>{entry.name}</strong>
                <Badge>{entry.level === 1 ? "Level 1" : `Level ${entry.level}`}</Badge>
              </div>
              <p className="mt-1 text-sm text-white/65">
                {rulesRepository.species.find((species) => species.id === entry.speciesId)?.name} {rulesRepository.classes.find((klass) => klass.id === entry.classId)?.name}
              </p>
            </button>
          ))}
        </div>
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">Builder Mode</p>
            <Badge>{draft.mode}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className={draft.mode === "guided" ? "bg-white/10" : ""} onClick={() => setMode("guided")}>
              Guided
            </Button>
            <Button className={draft.mode === "expert" ? "bg-white/10" : ""} onClick={() => setMode("expert")}>
              Expert
            </Button>
          </div>
          <Button className="w-full" onClick={() => updateDraft(() => defaultDraft())}>
            Quick Load Sample
          </Button>
          <Button className="w-full" onClick={resetActiveDraft}>
            Reset Active Draft
          </Button>
        </div>
      </Panel>

      <div className="space-y-6">
        <Panel className="overflow-hidden">
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-forge-sky">ForgeSheet Character Builder</p>
                <h1 className="font-display text-4xl text-gradient">{draft.name}</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/70">
                  Rules-backed character creation with inspectable calculations, legal-safe SRD starter content, and expansion points for DM tools and a future live board.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="bg-white/10" onClick={exportJson}>
                  <Download className="mr-2 h-4 w-4" /> Export JSON
                </Button>
                <Button className="bg-white/10" onClick={() => window.print()}>
                  <Eye className="mr-2 h-4 w-4" /> Print Sheet
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="no-print space-y-2">
              {steps.map((step) => (
                <button
                  key={step.id}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${
                    activeStep === step.id
                      ? "border-forge-ember/60 bg-forge-ember/10"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                  onClick={() => setActiveStep(step.id)}
                >
                  <span>{step.label}</span>
                  {activeStep === step.id ? <CheckCircle2 className="h-4 w-4 text-forge-ember" /> : null}
                </button>
              ))}
            </div>

            <div className="space-y-6">
              <PanelSoft className="p-4 text-sm text-white/75">
                <p className="font-medium text-forge-mist">{sectionLead[activeStep]}</p>
              </PanelSoft>

              {activeStep === "identity" ? (
                <section className="grid gap-4 md:grid-cols-2">
                  <EditorField label="Character name">
                    <input value={draft.name} onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))} />
                  </EditorField>
                  <EditorField label="Alignment">
                    <input value={draft.alignment} onChange={(event) => updateDraft((current) => ({ ...current, alignment: event.target.value }))} />
                  </EditorField>
                  <EditorField label="Level">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={draft.level}
                      onChange={(event) => updateDraft((current) => ({ ...current, level: Math.min(20, Math.max(1, Number(event.target.value) || 1)) }))}
                    />
                  </EditorField>
                  <EditorField label="Experience">
                    <input type="number" min={0} value={draft.experience} onChange={(event) => updateDraft((current) => ({ ...current, experience: Number(event.target.value) || 0 }))} />
                  </EditorField>
                  <EditorField label="Creation method">
                    <select value={draft.creationMethod} onChange={(event) => updateDraft((current) => ({ ...current, creationMethod: event.target.value as typeof draft.creationMethod }))}>
                      <option value="standard-array">Standard Array</option>
                      <option value="point-buy">Point Buy Shell</option>
                    </select>
                  </EditorField>
                  <EditorField label="Notes">
                    <textarea rows={4} value={draft.notes} onChange={(event) => updateDraft((current) => ({ ...current, notes: event.target.value }))} />
                  </EditorField>
                </section>
              ) : null}

              {activeStep === "lineage" ? (
                <section className="grid gap-4 md:grid-cols-2">
                  <EditorField label="Species">
                    <select value={draft.speciesId} onChange={(event) => updateDraft((current) => ({ ...current, speciesId: event.target.value }))}>
                      {rulesRepository.species.map((species) => (
                        <option key={species.id} value={species.id}>
                          {species.name}
                        </option>
                      ))}
                    </select>
                  </EditorField>
                  <PanelSoft className="p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/45">Trait Summary</p>
                    <ul className="mt-3 space-y-2 text-sm text-white/75">
                      {computation.species?.traits.map((trait) => (
                        <li key={trait.short}>{trait.short}</li>
                      ))}
                    </ul>
                  </PanelSoft>
                </section>
              ) : null}

              {activeStep === "class" ? (
                <section className="space-y-4">
                  <EditorField label="Class">
                    <select
                      value={draft.classId}
                      onChange={(event) => {
                        const nextClassId = event.target.value;
                        const nextSubclassId = rulesRepository.subclasses.find((subclass) => subclass.classId === nextClassId)?.id ?? "";
                        updateDraft((current) => ({ ...current, classId: nextClassId, subclassId: nextSubclassId, selectedSpells: [] }));
                      }}
                    >
                      {rulesRepository.classes.map((klass) => (
                        <option key={klass.id} value={klass.id}>
                          {klass.name}
                        </option>
                      ))}
                    </select>
                  </EditorField>
                  <EditorField label="Subclass">
                    <select value={draft.subclassId} onChange={(event) => updateDraft((current) => ({ ...current, subclassId: event.target.value }))}>
                      {availableSubclasses.map((subclass) => (
                        <option key={subclass.id} value={subclass.id}>
                          {subclass.name}
                        </option>
                      ))}
                    </select>
                  </EditorField>
                  <div className="grid gap-4 md:grid-cols-2">
                    {skillOptions.map((option) => {
                      const selected = draft.selectedSkills.includes(option.id as Skill);
                      return (
                        <label key={option.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                          <input
                            checked={selected}
                            type="checkbox"
                            onChange={() =>
                              updateDraft((current) => {
                                const next = selected
                                  ? current.selectedSkills.filter((entry) => entry !== option.id)
                                  : [...current.selectedSkills, option.id as Skill].slice(-characterClass!.skillChoices.choose);
                                return { ...current, selectedSkills: next };
                              })
                            }
                          />
                          <span>{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {activeStep === "background" ? (
                <section className="grid gap-4 md:grid-cols-2">
                  <EditorField label="Background">
                    <select value={draft.backgroundId} onChange={(event) => updateDraft((current) => ({ ...current, backgroundId: event.target.value }))}>
                      {rulesRepository.backgrounds.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                  </EditorField>
                  <PanelSoft className="p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/45">Background Benefits</p>
                    <p className="mt-3 text-sm text-white/75">Skills: {background?.skillProficiencies?.map((skill) => skillLabels[skill]).join(", ") || "None"}</p>
                    <p className="mt-2 text-sm text-white/75">Tools: {background?.toolProficiencies?.join(", ") || "None"}</p>
                    <p className="mt-2 text-sm text-white/75">Trait: {background?.trait.short ?? "Choose a background"}</p>
                  </PanelSoft>
                  <PanelSoft className="p-4 md:col-span-2">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/45">Feat Library</p>
                    <p className="mt-2 text-sm text-white/65">
                      Feats are available as a legal-safe shell. Select one if you are using optional feat rules or variant human.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {rulesRepository.feats.map((feat) => {
                        const selected = draft.selectedFeatIds.includes(feat.id);
                        return (
                          <label key={feat.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium text-forge-mist">{feat.name}</span>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() =>
                                  updateDraft((current) => ({
                                    ...current,
                                    selectedFeatIds: selected
                                      ? current.selectedFeatIds.filter((entry) => entry !== feat.id)
                                      : [...current.selectedFeatIds, feat.id].slice(-1),
                                  }))
                                }
                              />
                            </div>
                            <p className="mt-2 text-xs text-white/55">{feat.summary.short}</p>
                          </label>
                        );
                      })}
                    </div>
                  </PanelSoft>
                </section>
              ) : null}

              {activeStep === "abilities" ? (
                <section className="grid gap-3 md:grid-cols-3">
                  {abilities.map((ability, index) => (
                    <PanelSoft key={ability} className="p-4">
                      <p className="text-xs uppercase tracking-[0.26em] text-white/45">{ability}</p>
                      <select
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
                        value={draft.abilityScores[ability]}
                        onChange={(event) =>
                          updateDraft((current) => ({
                            ...current,
                            abilityScores: { ...current.abilityScores, [ability]: Number(event.target.value) },
                          }))
                        }
                      >
                        {(draft.creationMethod === "standard-array" ? standardArray : [8, 10, 12, 13, 14, 15]).map((score) => (
                          <option key={`${ability}-${score}-${index}`} value={score}>
                            {score}
                          </option>
                        ))}
                      </select>
                      <p className="mt-3 text-sm text-white/65">
                        Final: {draft.abilityScores[ability] + (computation.species?.abilityBonuses?.[ability] ?? 0)} | Modifier: {computation.modifiers[ability] >= 0 ? "+" : ""}
                        {computation.modifiers[ability]}
                      </p>
                    </PanelSoft>
                  ))}
                </section>
              ) : null}

              {activeStep === "equipment" ? (
                <section className="grid gap-4 md:grid-cols-2">
                  <EditorField label="Armor">
                    <select value={draft.equippedArmorId} onChange={(event) => updateDraft((current) => ({ ...current, equippedArmorId: event.target.value }))}>
                      {rulesRepository.items.filter((item) => item.kind === "armor").map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </EditorField>
                  <EditorField label="Weapon">
                    <select value={draft.equippedWeaponId} onChange={(event) => updateDraft((current) => ({ ...current, equippedWeaponId: event.target.value }))}>
                      {rulesRepository.items.filter((item) => item.kind === "weapon").map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </EditorField>
                </section>
              ) : null}

              {activeStep === "spells" ? (
                <section className="space-y-4">
                  {characterClass?.spellcasting.progression === "none" ? (
                    <PanelSoft className="p-4 text-sm text-white/75">This class does not cast spells in the starter dataset.</PanelSoft>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {availableSpells.map((spell) => {
                        const selected = draft.selectedSpells.includes(spell.id);
                        return (
                          <label key={spell.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex items-center justify-between">
                              <strong>{spell.name}</strong>
                              <input
                                checked={selected}
                                type="checkbox"
                                onChange={() =>
                                  updateDraft((current) => ({
                                    ...current,
                                    selectedSpells: selected ? current.selectedSpells.filter((entry) => entry !== spell.id) : [...current.selectedSpells, spell.id],
                                  }))
                                }
                              />
                            </div>
                            <p className="mt-2 text-sm text-white/70">{spell.school} {spell.level === 0 ? "Cantrip" : `Level ${spell.level}`}</p>
                            <p className="mt-2 text-sm text-white/60">{spell.text.short}</p>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </section>
              ) : null}

              {activeStep === "review" ? (
                <section className="grid gap-4 md:grid-cols-2">
                  <PanelSoft className="p-5">
                    <div className="flex items-center gap-2 text-forge-mist">
                      <ScrollText className="h-4 w-4" />
                      <h3 className="font-display text-xl">Validation</h3>
                    </div>
                    <div className="mt-4 space-y-3">
                      {computation.validation.map((issue) => (
                        <div key={`${issue.field}-${issue.message}`} className="rounded-2xl border border-white/10 bg-black/15 p-3">
                          <div className="flex items-center gap-2 text-sm">
                            <AlertTriangle className="h-4 w-4 text-forge-ember" />
                            <strong>{issue.severity.toUpperCase()}</strong>
                          </div>
                          <p className="mt-2 text-sm text-white/75">{issue.message}</p>
                          <p className="mt-1 text-xs text-white/45">{issue.source}</p>
                        </div>
                      ))}
                    </div>
                  </PanelSoft>
                  <PanelSoft className="print-panel p-5">
                    <div className="flex items-center gap-2 text-forge-mist">
                      <BookOpen className="h-4 w-4" />
                      <h3 className="font-display text-xl">Summary Sheet</h3>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <SummaryTile icon={<Shield className="h-4 w-4" />} label="Armor Class" value={String(computation.armorClass.final)} />
                      <SummaryTile icon={<Sparkles className="h-4 w-4" />} label="HP" value={String(computation.hitPoints.final)} />
                      <SummaryTile icon={<Sword className="h-4 w-4" />} label="Initiative" value={String(computation.initiative.final)} />
                      <SummaryTile icon={<WandSparkles className="h-4 w-4" />} label="Passive Perception" value={String(computation.passivePerception.final)} />
                    </div>
                    {computation.feats.length ? <p className="mt-4 text-sm text-white/70">Feats: {computation.feats.join(", ")}</p> : null}
                    <p className="mt-4 text-sm text-white/70">{computation.features.join(" | ")}</p>
                  </PanelSoft>
                </section>
              ) : null}
            </div>
          </div>
        </Panel>
      </div>

      <Panel className="print-panel p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">Rules Inspector</p>
            <h2 className="font-display text-2xl text-forge-mist">Why These Values?</h2>
          </div>
          <Badge>Explainable</Badge>
        </div>
        <div className="mt-4 space-y-4 scrollbar-thin max-h-[78vh] overflow-y-auto pr-2">
          <InspectorCard label="Armor Class" value={String(computation.armorClass.final)} formula={computation.armorClass.formula} explanations={computation.armorClass.explanations} />
          <InspectorCard label="Hit Points" value={String(computation.hitPoints.final)} formula={computation.hitPoints.formula} explanations={computation.hitPoints.explanations} />
          <InspectorCard label="Proficiency Bonus" value={String(computation.proficiencyBonus.final)} formula={computation.proficiencyBonus.formula} explanations={computation.proficiencyBonus.explanations} />
          {computation.spellSaveDc ? <InspectorCard label="Spell Save DC" value={String(computation.spellSaveDc.final)} formula={computation.spellSaveDc.formula} explanations={computation.spellSaveDc.explanations} /> : null}
          {computation.attacks.map((attack) => (
            <PanelSoft key={attack.name} className="p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-white/45">Attack</p>
              <div className="mt-2 flex items-center justify-between">
                <strong>{attack.name}</strong>
                <Badge>+{attack.toHit} to hit</Badge>
              </div>
              <p className="mt-2 text-sm text-white/70">{attack.damage}</p>
              <p className="mt-1 text-xs text-white/45">{attack.source}</p>
            </PanelSoft>
          ))}
          <PanelSoft className="p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">Skills</p>
            <div className="mt-3 grid gap-2">
              {Object.entries(computation.skills).map(([skill, value]) => (
                <div key={skill} className="flex items-center justify-between rounded-2xl bg-black/10 px-3 py-2 text-sm">
                  <span>{skillLabels[skill as Skill]}</span>
                  <span>{Number(value.final) >= 0 ? "+" : ""}{value.final}</span>
                </div>
              ))}
            </div>
          </PanelSoft>
        </div>
      </Panel>
    </div>
  );
};

const EditorField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-medium text-white/75">{label}</span>
    <div className="[&_input]:w-full [&_input]:rounded-2xl [&_input]:border [&_input]:border-white/10 [&_input]:bg-black/20 [&_input]:px-3 [&_input]:py-3 [&_select]:w-full [&_select]:rounded-2xl [&_select]:border [&_select]:border-white/10 [&_select]:bg-black/20 [&_select]:px-3 [&_select]:py-3 [&_textarea]:w-full [&_textarea]:rounded-2xl [&_textarea]:border [&_textarea]:border-white/10 [&_textarea]:bg-black/20 [&_textarea]:px-3 [&_textarea]:py-3">
      {children}
    </div>
  </label>
);

const InspectorCard = ({
  label,
  value,
  formula,
  explanations,
}: {
  label: string;
  value: string;
  formula: string;
  explanations: { label: string; value: string | number; source: string; note?: string }[];
}) => (
  <PanelSoft className="p-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-white/45">{label}</p>
        <h3 className="mt-1 text-2xl font-semibold text-forge-mist">{value}</h3>
      </div>
      <Badge>{formula}</Badge>
    </div>
    <div className="mt-4 space-y-3">
      {explanations.map((entry) => (
        <div key={`${entry.label}-${entry.source}`} className="rounded-2xl bg-black/10 px-3 py-3 text-sm">
          <div className="flex items-center justify-between">
            <strong>{entry.label}</strong>
            <span>{entry.value}</span>
          </div>
          <p className="mt-1 text-xs text-white/45">{entry.source}</p>
          {entry.note ? <p className="mt-1 text-xs text-white/55">{entry.note}</p> : null}
        </div>
      ))}
    </div>
  </PanelSoft>
);

const SummaryTile = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="rounded-2xl bg-black/10 p-3">
    <div className="flex items-center gap-2 text-white/65">
      {icon}
      <span>{label}</span>
    </div>
    <p className="mt-2 text-2xl font-semibold text-forge-mist">{value}</p>
  </div>
);
