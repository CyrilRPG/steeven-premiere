import { OFFSETS, web, yt, type RevisionStrategy } from "@/domain/revision/strategy";

export const physicsStrategy: RevisionStrategy = {
  type: "PHYSICS",
  label: "Physique-Chimie",
  description: "Paul Olivier, flashcards de formules, exercices type bac.",
  requiresExamType: false,
  resourcePreferences: [
    "Paul Olivier (cours et exercices corrigés en vidéo)",
    "Exercices corrigés",
    "Exercices type bac",
    "Annales niveau Première",
  ],
  chapterSchedule: [
    {
      revisionType: "J0",
      offsetDays: OFFSETS.J0,
      title: "Vidéos Paul Olivier : cours + exercices corrigés",
      description:
        "Regarder les vidéos Paul Olivier correspondant au chapitre « {chapter} » : le cours, puis les exercices corrigés.",
      estimatedMinutes: null,
      durationIsEstimate: true,
      resourceQueries: ({ chapterName }) => [
        yt("Paul Olivier — cours", `Paul Olivier ${chapterName} Première cours`),
        yt("Paul Olivier — exercices corrigés", `Paul Olivier ${chapterName} Première exercices corrigés`),
      ],
    },
    {
      revisionType: "J1",
      offsetDays: OFFSETS.J1,
      title: "Vidéos Paul Olivier : exercices uniquement",
      description: "Regarder les vidéos Paul Olivier du chapitre « {chapter} », uniquement les exercices.",
      estimatedMinutes: null,
      durationIsEstimate: true,
      resourceQueries: ({ chapterName }) => [
        yt("Paul Olivier — exercices", `Paul Olivier ${chapterName} Première exercices`),
      ],
    },
    {
      revisionType: "J3",
      offsetDays: OFFSETS.J3,
      title: "Flashcards + formules : créer, réviser, apprendre",
      description:
        "Créer ou réviser les flashcards et les formules du chapitre « {chapter} », puis apprendre les flashcards.",
      estimatedMinutes: null,
      durationIsEstimate: true,
    },
    {
      revisionType: "J7",
      offsetDays: OFFSETS.J7,
      title: "Réviser les flashcards + 30 min de type bac",
      description:
        "Réviser les flashcards de « {chapter} », puis faire au minimum 30 min d'exercices type bac.",
      estimatedMinutes: 45,
      durationIsEstimate: true,
      resourceQueries: ({ chapterName }) => [
        web("Exercices type bac", `${chapterName} Première physique chimie exercices type bac corrigés`),
      ],
    },
    {
      revisionType: "J14",
      offsetDays: OFFSETS.J14,
      title: "Si possible : flashcards + 30 min de type bac",
      description:
        "Si possible : réviser les flashcards de « {chapter} » et faire au minimum 30 min d'exercices type bac.",
      estimatedMinutes: 45,
      durationIsEstimate: true,
      resourceQueries: ({ chapterName }) => [
        web("Exercices type bac", `${chapterName} Première physique chimie exercices type bac corrigés`),
      ],
    },
  ],
  examSchedule: () => [
    {
      revisionType: "J_MINUS_2",
      offsetDays: OFFSETS.J_MINUS_2,
      title: "Revoir les vidéos Paul Olivier + toutes les flashcards",
      description: "Revoir les vidéos Paul Olivier pertinentes sur « {chapter} », puis toutes les flashcards.",
      estimatedMinutes: null,
      durationIsEstimate: true,
      resourceQueries: ({ chapterName }) => [
        yt("Paul Olivier — chapitre", `Paul Olivier ${chapterName} Première`),
      ],
    },
    {
      revisionType: "J_MINUS_1",
      offsetDays: OFFSETS.J_MINUS_1,
      title: "Full exercices type bac",
      description: "Séance entièrement consacrée aux exercices type bac sur « {chapter} ».",
      estimatedMinutes: null,
      durationIsEstimate: true,
      resourceQueries: ({ chapterName }) => [
        web("Exercices type bac", `${chapterName} Première physique chimie exercices type bac corrigés`),
      ],
    },
    {
      revisionType: "EXAM_DAY",
      offsetDays: OFFSETS.EXAM_DAY,
      title: "Contrôle aujourd'hui — révision rapide des flashcards",
      description: "Le matin : révision rapide des flashcards de « {chapter} ». Pas de grosse session.",
      estimatedMinutes: 15,
      durationIsEstimate: true,
    },
  ],
};
