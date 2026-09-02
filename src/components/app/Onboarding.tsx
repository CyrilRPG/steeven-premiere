"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { updateSettings } from "@/db/seed";

const SCREENS = [
  {
    title: "Bienvenue Steeven",
    body: "Steeven Première organise automatiquement tes révisions. Tu ajoutes tes cours et tes contrôles, l'application te dit quoi faire chaque jour.",
  },
  {
    title: "Importe un cours",
    body: "Crée un chapitre dans une matière, puis importe ton premier cours (PDF, Word, PowerPoint, photo ou texte). Ce premier cours déclenche J0, puis J1, J3, J7 et J14.",
  },
  {
    title: "Regarde Aujourd'hui",
    body: "Ton programme est généré automatiquement. Ouvre Aujourd'hui, fais les tâches, coche-les. Une tâche non faite à minuit devient ratée, et reste dans l'historique.",
  },
];

export function Onboarding() {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const last = index === SCREENS.length - 1;
  const finish = async () => {
    setBusy(true);
    await updateSettings({ onboardingDone: true });
  };
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 pt-safe pb-safe">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Étape {index + 1} / {SCREENS.length}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{SCREENS[index].title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg/90">{SCREENS[index].body}</p>
        <div className="mt-6 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={finish} disabled={busy}>
            Passer
          </Button>
          {last ? (
            <Button variant="primary" size="lg" onClick={finish} loading={busy}>
              Commencer
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={() => setIndex((i) => i + 1)}>
              Suivant
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
