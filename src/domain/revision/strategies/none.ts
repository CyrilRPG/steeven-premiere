import type { RevisionStrategy } from "@/domain/revision/strategy";

/** Custom subjects: no automatic method. Exams can still be tracked (result Oui/Non). */
export const noneStrategy: RevisionStrategy = {
  type: "NONE",
  label: "Aucune stratégie automatique",
  description: "Aucune tâche générée automatiquement. Les contrôles restent suivis.",
  requiresExamType: false,
  resourcePreferences: [],
  chapterSchedule: [],
  examSchedule: () => [],
};
