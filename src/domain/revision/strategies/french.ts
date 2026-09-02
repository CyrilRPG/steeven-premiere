import { OFFSETS, type RevisionStrategy, type TaskTemplate } from "@/domain/revision/strategy";

const bookTasks: TaskTemplate[] = [
  {
    revisionType: "J_MINUS_3",
    offsetDays: OFFSETS.J_MINUS_3,
    title: "Travailler l'œuvre avec Claude : résumé, personnages, moments clés",
    description:
      "Travailler « {chapter} » avec Claude : le résumé de l'œuvre, les personnages, les événements et moments importants.",
    estimatedMinutes: null,
    durationIsEstimate: true,
  },
  {
    revisionType: "J_MINUS_2",
    offsetDays: OFFSETS.J_MINUS_2,
    title: "Travailler l'œuvre avec Claude : thèmes, interprétation, passages",
    description:
      "Travailler « {chapter} » avec Claude : les thèmes, la morale / l'interprétation, les éléments essentiels à connaître et les passages importants.",
    estimatedMinutes: null,
    durationIsEstimate: true,
  },
  {
    revisionType: "J_MINUS_1",
    offsetDays: OFFSETS.J_MINUS_1,
    title: "Revoir l'essentiel + passage préféré justifié",
    description:
      "Revoir l'essentiel de « {chapter} » (résumé, personnages, thèmes, passages importants) et préparer un passage préféré avec une justification possible.",
    estimatedMinutes: null,
    durationIsEstimate: true,
  },
];

function writingTasks(kind: "commentaire" | "dissertation"): TaskTemplate[] {
  const method = kind === "commentaire" ? "la méthode du commentaire" : "la méthode de la dissertation";
  const subject = kind === "commentaire" ? "un texte / sujet d'entraînement" : "un sujet de dissertation";
  const work = kind === "commentaire" ? "le commentaire" : "la dissertation";
  return [
    {
      revisionType: "J_MINUS_3",
      offsetDays: OFFSETS.J_MINUS_3,
      title: `Réviser ${method}, demander ${subject} à Claude, rédiger`,
      description: `1. Réviser ${method}. 2. Demander à Claude ${subject} sur « {chapter} ». 3. Faire ${work}.`,
      estimatedMinutes: null,
      durationIsEstimate: true,
    },
    {
      revisionType: "J_MINUS_2",
      offsetDays: OFFSETS.J_MINUS_2,
      title: `Envoyer ${work} à Claude : correction + conseils précis`,
      description: `4. Envoyer ${work} à Claude. 5. Demander une correction et identifier les erreurs. 6. Demander des conseils précis pour progresser.`,
      estimatedMinutes: null,
      durationIsEstimate: true,
    },
    {
      revisionType: "J_MINUS_1",
      offsetDays: OFFSETS.J_MINUS_1,
      title: `Nouvel entraînement : ${kind} complet + correction`,
      description: `Demander un nouveau sujet à Claude, rédiger ${work} en appliquant les conseils reçus, puis demander une correction. L'objectif est de beaucoup pratiquer la rédaction.`,
      estimatedMinutes: null,
      durationIsEstimate: true,
    },
  ];
}

export const frenchStrategy: RevisionStrategy = {
  type: "FRENCH",
  label: "Français",
  description: "Méthode selon le type de contrôle : livre/œuvre, commentaire ou dissertation, à partir de J-3.",
  requiresExamType: true,
  resourcePreferences: [],
  chapterSchedule: [],
  examSchedule: ({ frenchType }) => {
    switch (frenchType) {
      case "BOOK":
        return bookTasks;
      case "COMMENTARY":
        return writingTasks("commentaire");
      case "DISSERTATION":
        return writingTasks("dissertation");
      default:
        return [];
    }
  },
};
