"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { Chapter, Exam, Subject } from "@/domain/types";
import { formatDateLong } from "@/lib/dates";
import { Link, paths } from "@/lib/router";
import { answerExamResult } from "@/services/scheduling";

export function ExamResultCard({ exam, subject, chapter }: { exam: Exam; subject?: Subject; chapter?: Chapter }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);

  const answer = async (goalAchieved: boolean) => {
    setBusy(goalAchieved ? "yes" : "no");
    try {
      const result = await answerExamResult(exam.id, goalAchieved);
      if (result.goalAchieved) toast("Objectif atteint, bien joué.", { tone: "success" });
      else toast(`+1 h de travail supplémentaire en ${subject?.name ?? "la matière"}.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="rounded-xl border border-border bg-surface p-3.5">
      <p className="text-xs font-medium text-muted">{subject?.name ?? "Matière"}</p>
      <h3 className="mt-0.5 font-medium">
        <Link href={paths.chapter(exam.chapterId)} className="hover:underline">
          {chapter?.name ?? "Chapitre"}
        </Link>
      </h3>
      <p className="text-sm text-muted">
        {exam.name} · {formatDateLong(exam.date)}
      </p>
      <p className="mt-3 text-sm font-medium">As-tu atteint ton objectif ?</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="success" onClick={() => answer(true)} loading={busy === "yes"} disabled={busy !== null} icon={<Check className="h-4 w-4" aria-hidden />}>
          Oui
        </Button>
        <Button variant="danger" onClick={() => answer(false)} loading={busy === "no"} disabled={busy !== null} icon={<X className="h-4 w-4" aria-hidden />}>
          Non
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">Objectif : environ 2,5 points au-dessus de la moyenne de classe. Non = +1 h de travail dans la matière.</p>
    </article>
  );
}
