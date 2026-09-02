import type { StrategyType } from "@/domain/types";

/** Internal instruction used for flashcard generation (shared by client + server). */
export const FLASHCARD_SYSTEM_PROMPT = `Tu es un assistant qui crée des flashcards pour un élève de Première (lycée, France).

Analyse intégralement le cours fourni.

Crée un ensemble de flashcards exhaustif permettant de maîtriser le contenu.

Règles :
- couvre toutes les notions importantes ;
- ne supprime pas une information importante simplement pour réduire le nombre de cartes ;
- une idée principale par carte ;
- questions précises ;
- réponses aussi courtes que possible sans perdre l'information essentielle ;
- évite les formulations ambiguës ;
- inclut définitions, dates, formules, unités, propriétés, mécanismes, vocabulaire et exceptions pertinentes ;
- évite les doublons ;
- n'invente aucune information absente du cours ;
- si une information est incertaine ou illisible, signale-la dans le champ "warning" au lieu de l'inventer ;
- préserve les symboles mathématiques, exposants, indices, lettres grecques (Δ, λ...), équations et unités ;
- si un schéma doit être mémorisé, crée au minimum une carte du type « Quels éléments doivent apparaître sur le schéma de … ? ».

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme :
{"cards":[{"front":"question","back":"réponse courte"}],"warnings":["remarque éventuelle"]}`;

const SUBJECT_HINTS: Record<StrategyType, string> = {
  MATHEMATICS: "Matière : Mathématiques. Inclure définitions, propriétés, théorèmes, formules, méthodes de résolution et cas particuliers.",
  PHYSICS: "Matière : Physique-Chimie. Inclure formules avec unités, définitions, lois, méthodes, ordres de grandeur, et conditions d'application.",
  SVT: "Matière : SVT. Inclure définitions, structures, mécanismes, étapes, acteurs moléculaires, vocabulaire, relations cause/conséquence et schémas importants.",
  OSEF: "Inclure selon le contenu : dates, événements, acteurs, notions, définitions, causes, conséquences, exemples précis, vocabulaire, traductions, règles, expressions, notions culturelles. Ne génère pas de cartes hors sujet.",
  FRENCH: "Matière : Français. Inclure auteurs, œuvres, mouvements, procédés, figures de style, vocabulaire d'analyse, définitions, éléments de méthode.",
  NONE: "",
};

export function buildFlashcardUserPrompt(params: {
  subjectName: string;
  chapterName: string;
  strategyType: StrategyType;
  content: string;
  part: number;
  totalParts: number;
}): string {
  const hint = SUBJECT_HINTS[params.strategyType] ?? "";
  const partInfo = params.totalParts > 1 ? `Ce texte est la partie ${params.part} sur ${params.totalParts} du cours ; traite uniquement cette partie.` : "";
  return [
    `Matière : ${params.subjectName}. Chapitre : ${params.chapterName}. Niveau : Première.`,
    hint,
    partInfo,
    "",
    "COURS :",
    "<<<",
    params.content,
    ">>>",
  ]
    .filter(Boolean)
    .join("\n");
}
