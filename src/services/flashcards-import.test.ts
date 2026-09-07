import { describe, expect, it } from "vitest";
import { buildGenerationPrompt, parseFlashcards } from "@/services/flashcards-import";

describe("Flashcard import (no API key)", () => {
  it("reads a JSON array with various key names", () => {
    const r = parseFlashcards('[{"front":"Dérivée de x² ?","back":"2x"},{"question":"Δt ?","réponse":"variation de temps","tags":["Physique"]},{"q":"vide","r":""}]');
    expect(r.format).toBe("json");
    expect(r.cards).toEqual([
      { front: "Dérivée de x² ?", back: "2x", tags: undefined },
      { front: "Δt ?", back: "variation de temps", tags: ["Physique"] },
    ]);
  });

  it("reads the {cards:[…]} shape produced by the generation prompt", () => {
    const r = parseFlashcards('```json\n{"cards":[{"front":"A ?","back":"a"},{"front":"a ?","back":"dup"}],"warnings":["x"]}\n```'.replace(/```json\n|\n```/g, ""));
    expect(r.format).toBe("json");
    expect(r.cards.map((c) => c.front)).toEqual(["A ?"]);
    expect(r.duplicatesRemoved).toBe(1);
  });

  it("reads TSV (including an Anki export with # headers and <br>)", () => {
    const tsv = "#separator:tab\n#html:true\nFront\tBack\tTags\nQu'est-ce qu'un allèle ?\tVersion d'un gène<br>ligne 2\tSVT\nx &lt; 2 ?\toui\t\n";
    const r = parseFlashcards(tsv);
    expect(r.format).toBe("tsv");
    expect(r.cards).toEqual([
      { front: "Qu'est-ce qu'un allèle ?", back: "Version d'un gène\nligne 2", tags: ["SVT"] },
      { front: "x < 2 ?", back: "oui", tags: undefined },
    ]);
  });

  it("reads CSV with semicolons and quoted fields", () => {
    const r = parseFlashcards('"Capitale de la France ?";"Paris"\n"Formule, avec virgule ?";"v = d / Δt"');
    expect(r.format).toBe("csv");
    expect(r.cards.map((c) => c.back)).toEqual(["Paris", "v = d / Δt"]);
  });

  it("reads Q:/R: text blocks with multi-line answers", () => {
    const r = parseFlashcards("Q: Qu'est-ce que la mitose ?\nR: Division cellulaire\nen deux cellules identiques\n\nQuestion : Date de 1789 ?\nRéponse : Révolution française");
    expect(r.format).toBe("text");
    expect(r.cards).toEqual([
      { front: "Qu'est-ce que la mitose ?", back: "Division cellulaire\nen deux cellules identiques", tags: undefined },
      { front: "Date de 1789 ?", back: "Révolution française", tags: undefined },
    ]);
  });

  it("reads 'question :: réponse' lines", () => {
    const r = parseFlashcards("Dérivée de x² ? :: 2x\nDérivée de sin ? :: cos");
    expect(r.format).toBe("text");
    expect(r.cards).toHaveLength(2);
  });

  it("returns unknown for unreadable content", () => {
    const r = parseFlashcards("juste du texte sans structure");
    expect(r.format).toBe("unknown");
    expect(r.cards).toEqual([]);
  });

  it("builds a generation prompt that includes the course", () => {
    const p = buildGenerationPrompt({ subjectName: "SVT", chapterName: "Génétique", courseText: "Un allèle est…" });
    expect(p).toContain("Matière : SVT. Chapitre : Génétique.");
    expect(p).toContain("Un allèle est…");
    expect(p).toContain('{"cards":[{"front":"question","back":"réponse courte"}]');
  });
});
