import { OFFSETS, web, type RevisionStrategy } from "@/domain/revision/strategy";

export const SVT_WRITING_TIPS =
  "Mettre toutes les connaissances pertinentes qui répondent au sujet. Montrer au maximum les connaissances maîtrisées sans partir hors sujet.";

const SCHEMAS = "Savoir refaire les schémas importants du chapitre.";

export const svtStrategy: RevisionStrategy = {
  type: "SVT",
  label: "SVT",
  description: "Synthèse, flashcards exhaustives, types bac, schémas.",
  requiresExamType: false,
  resourcePreferences: ["Exercices type bac", "Annales niveau Première", "Schémas bilans"],
  chapterSchedule: [
    {
      revisionType: "J0",
      offsetDays: OFFSETS.J0,
      title: "Synthèse/diapo + flashcards exhaustives",
      description:
        "Créer une diapo ou une synthèse exploitable du cours « {chapter} » (éventuellement via NotebookLM), créer des flashcards exhaustives, puis les apprendre.",
      estimatedMinutes: null,
      durationIsEstimate: true,
    },
    {
      revisionType: "J1",
      offsetDays: OFFSETS.J1,
      title: "Relire la synthèse + réviser les flashcards",
      description: "Relire la diapo/synthèse de « {chapter} » et réviser les flashcards.",
      estimatedMinutes: null,
      durationIsEstimate: true,
    },
    {
      revisionType: "J3",
      offsetDays: OFFSETS.J3,
      title: "Réviser les flashcards",
      description: "Réviser les flashcards de « {chapter} ».",
      estimatedMinutes: null,
      durationIsEstimate: true,
    },
    {
      revisionType: "J7",
      offsetDays: OFFSETS.J7,
      title: "Réviser les flashcards + essayer un type bac",
      description: "Réviser les flashcards de « {chapter} », puis essayer un exercice type bac.",
      estimatedMinutes: null,
      durationIsEstimate: true,
      resourceQueries: ({ chapterName }) => [
        web("Exercices type bac SVT", `${chapterName} SVT Première exercice type bac corrigé`),
      ],
    },
    {
      revisionType: "J14",
      offsetDays: OFFSETS.J14,
      title: "Réviser les flashcards + types bac",
      description: "Réviser les flashcards de « {chapter} », puis faire des exercices type bac.",
      estimatedMinutes: null,
      durationIsEstimate: true,
      resourceQueries: ({ chapterName }) => [
        web("Exercices type bac SVT", `${chapterName} SVT Première exercice type bac corrigé`),
      ],
    },
  ],
  examSchedule: () => [
    {
      revisionType: "J_MINUS_2",
      offsetDays: OFFSETS.J_MINUS_2,
      title: "Flashcards + plusieurs types bac + schémas",
      description: `Réviser les flashcards de « {chapter} », faire plusieurs exercices type bac. ${SCHEMAS}`,
      estimatedMinutes: null,
      durationIsEstimate: true,
      resourceQueries: ({ chapterName }) => [
        web("Exercices type bac SVT", `${chapterName} SVT Première exercice type bac corrigé`),
      ],
    },
    {
      revisionType: "J_MINUS_1",
      offsetDays: OFFSETS.J_MINUS_1,
      title: "Flashcards + types bac + schémas",
      description: `Réviser les flashcards de « {chapter} », faire des exercices type bac. ${SCHEMAS}`,
      estimatedMinutes: null,
      durationIsEstimate: true,
    },
    {
      revisionType: "EXAM_DAY",
      offsetDays: OFFSETS.EXAM_DAY,
      title: "Contrôle aujourd'hui — révision rapide des flashcards",
      description: `Révision rapide des flashcards de « {chapter} ». Rappel rédaction : ${SVT_WRITING_TIPS}`,
      estimatedMinutes: 15,
      durationIsEstimate: true,
    },
  ],
};
