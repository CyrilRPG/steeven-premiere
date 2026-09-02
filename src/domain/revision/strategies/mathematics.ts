import { OFFSETS, web, yt, type RevisionStrategy } from "@/domain/revision/strategy";

export const mathematicsStrategy: RevisionStrategy = {
  type: "MATHEMATICS",
  label: "Mathématiques",
  description: "Yvan Monka, Math et Tiques, annales niveau Première.",
  requiresExamType: false,
  resourcePreferences: [
    "Yvan Monka (cours et exercices corrigés en vidéo)",
    "Math et Tiques (exercices corrigés)",
    "Annales et sujets niveau Première",
    "Exercices type bac",
  ],
  chapterSchedule: [
    {
      revisionType: "J0",
      offsetDays: OFFSETS.J0,
      title: "Vidéos Yvan Monka : cours + exercices corrigés",
      description:
        "Regarder les ressources Yvan Monka correspondant au chapitre « {chapter} » : le cours, puis les exercices corrigés.",
      estimatedMinutes: null,
      durationIsEstimate: true,
      resourceQueries: ({ chapterName }) => [
        yt("Yvan Monka — cours", `Yvan Monka ${chapterName} Première cours`),
        yt("Yvan Monka — exercices corrigés", `Yvan Monka ${chapterName} Première exercices corrigés`),
      ],
    },
    {
      revisionType: "J1",
      offsetDays: OFFSETS.J1,
      title: "Vidéos Yvan Monka : exercices uniquement",
      description: "Regarder les vidéos Yvan Monka du chapitre « {chapter} », uniquement les exercices.",
      estimatedMinutes: null,
      durationIsEstimate: true,
      resourceQueries: ({ chapterName }) => [
        yt("Yvan Monka — exercices", `Yvan Monka ${chapterName} Première exercices`),
      ],
    },
    {
      revisionType: "J3",
      offsetDays: OFFSETS.J3,
      title: "Environ 1 h d'exercices corrigés Math et Tiques",
      description: "Faire environ 1 h d'exercices corrigés Math et Tiques sur le chapitre « {chapter} ».",
      estimatedMinutes: 60,
      durationIsEstimate: true,
      resourceQueries: ({ chapterName }) => [
        web("Math et Tiques — exercices corrigés", `Math et Tiques ${chapterName} Première exercices corrigés`),
      ],
    },
    {
      revisionType: "J7",
      offsetDays: OFFSETS.J7,
      title: "Annales / sujets niveau Première",
      description: "Faire des sujets et annales niveau Première correspondant au chapitre « {chapter} ».",
      estimatedMinutes: null,
      durationIsEstimate: true,
      resourceQueries: ({ chapterName }) => [
        web("Annales / sujets Première", `${chapterName} Première exercices annales sujet bac`),
      ],
    },
    {
      revisionType: "J14",
      offsetDays: OFFSETS.J14,
      title: "Annales / sujets niveau Première",
      description: "Faire des sujets et annales niveau Première correspondant au chapitre « {chapter} ».",
      estimatedMinutes: null,
      durationIsEstimate: true,
      resourceQueries: ({ chapterName }) => [
        web("Annales / sujets Première", `${chapterName} Première exercices annales sujet bac`),
      ],
    },
  ],
  examSchedule: () => [
    {
      revisionType: "J_MINUS_2",
      offsetDays: OFFSETS.J_MINUS_2,
      title: "2 h d'annales bac corrigées",
      description:
        "Faire 2 h d'annales bac corrigées sur « {chapter} », de préférence avec correction vidéo.",
      estimatedMinutes: 120,
      durationIsEstimate: false,
      resourceQueries: ({ chapterName }) => [
        yt("Annales corrigées en vidéo", `${chapterName} annale bac corrigée vidéo`),
        web("Annales bac corrigées", `${chapterName} Première annales bac corrigées`),
      ],
    },
    {
      revisionType: "J_MINUS_1",
      offsetDays: OFFSETS.J_MINUS_1,
      title: "2 h d'annales",
      description: "Faire 2 h d'annales sur « {chapter} ».",
      estimatedMinutes: 120,
      durationIsEstimate: false,
      resourceQueries: ({ chapterName }) => [
        web("Annales bac", `${chapterName} Première annales bac`),
      ],
    },
  ],
};
