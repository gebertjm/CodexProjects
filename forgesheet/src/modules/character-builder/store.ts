import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultDraft, normalizeDraft } from "@/modules/character-builder/defaults";
import type { BuilderMode, CharacterDraft } from "@/modules/rules-engine/types";

type BuilderState = {
  drafts: CharacterDraft[];
  activeDraftId: string;
  createDraft: () => void;
  selectDraft: (id: string) => void;
  updateDraft: (updater: (draft: CharacterDraft) => CharacterDraft) => void;
  resetActiveDraft: () => void;
  setMode: (mode: BuilderMode) => void;
};

const initialDraft = defaultDraft();

export const useBuilderStore = create<BuilderState>()(
  persist(
    (set, get) => ({
      drafts: [initialDraft],
      activeDraftId: initialDraft.id,
      createDraft: () =>
        set((state) => {
          const next = defaultDraft();
          return {
            drafts: [next, ...state.drafts],
            activeDraftId: next.id,
          };
        }),
      selectDraft: (id) => set({ activeDraftId: id }),
      updateDraft: (updater) =>
        set((state) => ({
          drafts: state.drafts.map((draft) =>
            draft.id === state.activeDraftId ? normalizeDraft(updater(normalizeDraft(draft))) : normalizeDraft(draft),
          ),
        })),
      resetActiveDraft: () =>
        set((state) => ({
          drafts: state.drafts.map((draft) =>
            draft.id === state.activeDraftId ? defaultDraft() : draft,
          ),
        })),
      setMode: (mode) =>
        get().updateDraft((draft) => ({
          ...draft,
          mode,
        })),
    }),
    {
      name: "forgesheet-builder",
      merge: (persistedState, currentState) => {
        const typedState = persistedState as Partial<BuilderState> | undefined;
        const drafts = typedState?.drafts?.map((draft) => normalizeDraft(draft)) ?? currentState.drafts;
        const activeDraftId = typedState?.activeDraftId ?? currentState.activeDraftId;
        return {
          ...currentState,
          ...typedState,
          drafts,
          activeDraftId,
        };
      },
    },
  ),
);

export const useActiveDraft = () => {
  const activeDraft = useBuilderStore((state) => state.drafts.find((draft) => draft.id === state.activeDraftId) ?? state.drafts[0]);
  return useMemo(() => normalizeDraft(activeDraft), [activeDraft]);
};
