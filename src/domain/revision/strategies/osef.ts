import { OFFSETS, type RevisionStrategy } from "@/domain/revision/strategy";

/**
 * Histoire-Géo-EMC, Enseignement scientifique, Anglais, Espagnol.
 * Only a J0 "Devoir" task when the first course arrives; the rest depends on the exam date.
 */
export const osefStrategy: RevisionStrategy = {
  type: "OSEF",
  label: "Osef (flashcards avant le contrôle)",
  description: "J0 : faire le devoir de la matière. Puis flashcards exhaustives à J-2, réapprentissage à J-1 et le jour J.",
  requiresExamType: false,
  resourcePreferences: [],
  chapterSchedule: [
    {
      revisionType: "J0",
      offsetDays: OFFSETS.J0,
      title: "Devoir {subject}",
      description: "Faire le devoir de {subject} donné avec le cours « {chapter} » (exercices, lecture, préparation demandée).",
      estimatedMinutes: null,
      durationIsEstimate: true,
    },
  ],
  examSchedule: () => [
    {
      revisionType: "J_MINUS_2",
      offsetDays: OFFSETS.J_MINUS_2,
      title: "Créer toutes les flashcards du cours et les apprendre",
      description:
        "Créer toutes les flashcards exhaustives et complètes du cours « {chapter} », avec des réponses courtes, puis toutes les apprendre.",
      estimatedMinutes: null,
      durationIsEstimate: true,
    },
    {
      revisionType: "J_MINUS_1",
      offsetDays: OFFSETS.J_MINUS_1,
      title: "Réapprendre toutes les flashcards",
      description: "Réapprendre toutes les flashcards de « {chapter} ».",
      estimatedMinutes: null,
      durationIsEstimate: true,
    },
    {
      revisionType: "EXAM_DAY",
      offsetDays: OFFSETS.EXAM_DAY,
      title: "Contrôle aujourd'hui — réviser toutes les flashcards",
      description: "Réviser / réapprendre toutes les flashcards de « {chapter} ».",
      estimatedMinutes: null,
      durationIsEstimate: true,
    },
  ],
};
