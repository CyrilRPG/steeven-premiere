import { describe, expect, it } from "vitest";
import { buildAnkiTsv, buildHierarchicalTag, escapeAnkiField, parseAnkiTsv, toTagPart } from "@/services/anki";

describe("Anki export (TSV UTF-8)", () => {
  it("keeps accents, apostrophes, formulas and math symbols", () => {
    const tsv = buildAnkiTsv([
      { front: "Quelle est la dérivée de x² ?", back: "2x", tags: ["Première", "Mathématiques", "Dérivation"] },
      { front: "Quelle est la formule de la vitesse moyenne ?", back: "v = d / Δt", tags: ["Physique", "Mouvement"] },
      { front: "Qu'est-ce qu'un « allèle » ?", back: "Version d'un gène ; λ ≠ μ, a ≤ b.", tags: [] },
    ]);
    const lines = tsv.split("\n");
    expect(lines[0]).toBe("#separator:tab");
    expect(lines[1]).toBe("#html:true");
    expect(lines[2]).toBe("#tags column:3");
    expect(lines[4]).toBe("Quelle est la dérivée de x² ?\t2x\tPremiere Mathematiques Derivation");
    expect(lines[5]).toBe("Quelle est la formule de la vitesse moyenne ?\tv = d / Δt\tPhysique Mouvement");
    expect(lines[6]).toContain("Qu'est-ce qu'un « allèle » ?");
    expect(lines[6]).toContain("λ ≠ μ, a ≤ b.");
    expect(tsv.endsWith("\n")).toBe(true);
    // Round trip
    const parsed = parseAnkiTsv(tsv);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].tags).toEqual(["Premiere", "Mathematiques", "Derivation"]);
  });

  it("escapes tabs, line breaks, quotes and HTML characters", () => {
    expect(escapeAnkiField("a\tb")).toBe("a    b");
    expect(escapeAnkiField("ligne 1\nligne 2\r\nligne 3")).toBe("ligne 1<br>ligne 2<br>ligne 3");
    expect(escapeAnkiField('x < 2 et y > 3, "citation" & co')).toBe("x &lt; 2 et y &gt; 3, &quot;citation&quot; &amp; co");
    const tsv = buildAnkiTsv([{ front: "multi\nligne", back: "avec\ttab", tags: [] }]);
    const rows = tsv.split("\n").filter((l) => !l.startsWith("#") && l);
    expect(rows).toHaveLength(1);
    expect(rows[0].split("\t")).toHaveLength(3);
  });

  it("builds clean hierarchical tags", () => {
    expect(toTagPart("Mathématiques")).toBe("Mathematiques");
    expect(toTagPart("Fonction dérivée")).toBe("Fonction_derivee");
    expect(toTagPart("Histoire-Géographie-EMC")).toBe("Histoire_Geographie_EMC");
    expect(buildHierarchicalTag("Physique-Chimie", "Mouvement & forces")).toBe("Premiere::Physique_Chimie::Mouvement_forces");
  });

  it("encodes as UTF-8 without loss", () => {
    const tsv = buildAnkiTsv([{ front: "Δ, λ, é, œ, ≠", back: "→ ok", tags: ["SVT"] }]);
    const bytes = new TextEncoder().encode(tsv);
    const decoded = new TextDecoder("utf-8").decode(bytes);
    expect(decoded).toBe(tsv);
  });
});
