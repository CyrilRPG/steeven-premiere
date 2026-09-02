import type {
  CourseType,
  FrenchExamType,
  ResourceType,
  RevisionType,
  StrategyType,
  TaskStatus,
} from "@/domain/types";

export const REVISION_LABELS: Record<RevisionType, string> = {
  J0: "J0",
  J1: "J1",
  J3: "J3",
  J7: "J7",
  J14: "J14",
  J_MINUS_3: "J-3",
  J_MINUS_2: "J-2",
  J_MINUS_1: "J-1",
  EXAM_DAY: "Contrôle",
  EXTRA_WORK: "Travail sup.",
};

export const REVISION_ORDER: RevisionType[] = [
  "J0",
  "J1",
  "J3",
  "J7",
  "J14",
  "J_MINUS_3",
  "J_MINUS_2",
  "J_MINUS_1",
  "EXAM_DAY",
  "EXTRA_WORK",
];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  UPCOMING: "À venir",
  COMPLETED: "Terminé",
  MISSED: "Raté",
  PENDING: "À rattraper",
  CANCELLED: "Annulée",
};

export const STRATEGY_LABELS: Record<StrategyType, string> = {
  MATHEMATICS: "Mathématiques",
  PHYSICS: "Physique-Chimie",
  SVT: "SVT",
  OSEF: "Osef (flashcards avant contrôle)",
  FRENCH: "Français",
  NONE: "Aucune stratégie automatique",
};

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  COURS: "Cours",
  EXERCICE: "Exercice",
  CORRECTION: "Correction",
  VIDEO: "Vidéo",
  ANNALE: "Annale",
  TYPE_BAC: "Type bac",
  AUTRE: "Autre",
};

export const COURSE_TYPE_LABELS: Record<CourseType, string> = {
  PDF: "PDF",
  DOCX: "Word",
  PPTX: "PowerPoint",
  IMAGE: "Image",
  TEXT: "Texte collé",
  MANUAL: "Texte manuel",
  OTHER: "Fichier",
};

export const FRENCH_TYPE_LABELS: Record<FrenchExamType, string> = {
  BOOK: "Livre / œuvre",
  COMMENTARY: "Commentaire",
  DISSERTATION: "Dissertation",
};
