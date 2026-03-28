import repositoryData from "../../../rules/core/repository.json";
import type {
  Background,
  CharacterClass,
  Feat,
  Item,
  RulesRepository,
  Subclass,
  Species,
  Spell,
} from "@/modules/rules-engine/types";

export const rulesRepository = repositoryData as RulesRepository;

export const getSpeciesById = (id: string): Species | undefined =>
  rulesRepository.species.find((entry) => entry.id === id);

export const getClassById = (id: string): CharacterClass | undefined =>
  rulesRepository.classes.find((entry) => entry.id === id);

export const getSubclassById = (id: string): Subclass | undefined =>
  rulesRepository.subclasses.find((entry) => entry.id === id);

export const getBackgroundById = (id: string): Background | undefined =>
  rulesRepository.backgrounds.find((entry) => entry.id === id);

export const getFeatById = (id: string): Feat | undefined =>
  rulesRepository.feats.find((entry) => entry.id === id);

export const getItemById = (id: string): Item | undefined =>
  rulesRepository.items.find((entry) => entry.id === id);

export const getSpellById = (id: string): Spell | undefined =>
  rulesRepository.spells.find((entry) => entry.id === id);
