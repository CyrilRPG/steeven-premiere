"use client";

import { Card, PageHeader } from "@/components/ui/primitives";

const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "Erreurs à éviter",
    items: [
      "Ne pas commencer les révisions uniquement la veille ou le matin.",
      "Ne pas passer plus de temps à optimiser l'organisation qu'à travailler réellement.",
      "Ne pas attendre le contrôle pour comprendre le chapitre.",
    ],
  },
  {
    title: "Objectifs",
    items: [
      "Viser au minimum environ 2,5 points au-dessus de la moyenne de classe.",
      "Si l'objectif n'est pas atteint : 1 h de travail supplémentaire dans la matière.",
      "Aller à un contrôle avec l'objectif d'avoir suffisamment travaillé pour que 20/20 soit théoriquement possible.",
      "Ne pas partir en pensant : « 20 est impossible, je vise 15 ».",
    ],
  },
  {
    title: "Spécialités",
    items: [
      "Les spécialités demandent beaucoup de travail.",
      "Ne pas compter uniquement sur les facilités.",
      "Les travailler sérieusement et régulièrement.",
      "Elles sont importantes pour le dossier scolaire et Parcoursup.",
      "Essayer d'être en avance.",
      "Dès qu'un chapitre commence, commencer à le travailler.",
    ],
  },
  {
    title: "Régularité",
    items: [
      "Les autres élèves travaillent également, même lorsque cela ne se voit pas.",
      "Ne pas attendre un déclic tardif.",
      "La régularité doit commencer maintenant.",
    ],
  },
  {
    title: "Rédaction (SVT, Histoire-Géo, Français)",
    items: [
      "Utiliser toutes les connaissances pertinentes permettant de répondre précisément au sujet.",
      "Montrer au maximum ce que je connais sans ajouter d'informations hors sujet.",
    ],
  },
];

export function PrinciplesPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Principes" subtitle="Rappels courts et directs. La méthode des J fait le reste." />
      {SECTIONS.map((s) => (
        <Card key={s.title} className="p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{s.title}</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {s.items.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-accent" aria-hidden>
                  •
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <Card className="p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">La méthode en une ligne</h2>
        <p className="mt-2 text-sm">Cours → Chapitre → J0 → J1 / J3 / J7 / J14 → Contrôle → J-3 / J-2 / J-1 / Jour du contrôle → Todo quotidienne → Travail réalisé ou raté → Statistiques → Amélioration.</p>
      </Card>
    </div>
  );
}
