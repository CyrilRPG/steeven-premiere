"use client";

import { Check, ChevronRight, Undo2 } from "lucide-react";
import { useState } from "react";
import { RevisionBadge, StatusBadge, displayStatus } from "@/components/domain/badges";
import { Button, cx } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { Chapter, Subject, Task } from "@/domain/types";
import { formatDateShort, formatMinutes, type DateKey } from "@/lib/dates";
import { Link, paths } from "@/lib/router";
import { completeTask, uncompleteTask } from "@/services/scheduling";

interface Props {
  task: Task;
  subject?: Subject;
  chapter?: Chapter;
  today: DateKey;
  showDate?: boolean;
  compact?: boolean;
}

export function TaskCard({ task, subject, chapter, today, showDate, compact }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const status = displayStatus(task, today);
  const done = task.status === "COMPLETED";
  const canComplete = task.status === "UPCOMING" || task.status === "PENDING";
  const highlight = task.revisionType === "EXAM_DAY" || task.revisionType === "J_MINUS_1" || task.revisionType === "J_MINUS_2";

  const onComplete = async () => {
    setBusy(true);
    try {
      await completeTask(task.id);
      toast("Tâche terminée", {
        tone: "success",
        actionLabel: "Annuler",
        onAction: () => uncompleteTask(task.id),
      });
    } finally {
      setBusy(false);
    }
  };

  const onUndo = async () => {
    setBusy(true);
    try {
      await uncompleteTask(task.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={cx(
        "rounded-xl border bg-surface p-3.5 transition-opacity",
        highlight && !done ? "border-warning/50" : "border-border",
        done && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-muted">
            {subject?.name ?? "Matière"}
            {chapter && <span> · {chapter.name}</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <RevisionBadge type={task.revisionType} />
            {(status !== "TODAY" || task.status !== "UPCOMING") && <StatusBadge status={status} />}
            {showDate && <span className="text-xs text-muted">{formatDateShort(task.scheduledDate)}</span>}
          </div>
          <h3 className={cx("mt-2 font-medium leading-snug", done && "line-through decoration-muted")}>{task.title}</h3>
          {!compact && task.description && <p className="mt-1 text-sm text-muted line-clamp-3">{task.description}</p>}
          <p className="mt-1.5 text-xs text-muted">
            {task.estimatedMinutes !== null
              ? `Durée${task.durationIsEstimate ? " estimée" : ""} : ${formatMinutes(task.estimatedMinutes)}`
              : "Durée non définie"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Link href={paths.task(task.id)} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-accent hover:bg-accent-soft">
          Détails & ressources <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
        {canComplete && (
          <Button variant="primary" onClick={onComplete} loading={busy} icon={<Check className="h-4 w-4" aria-hidden />} className="min-w-28">
            Terminé
          </Button>
        )}
        {done && (
          <Button variant="ghost" size="sm" onClick={onUndo} loading={busy} icon={<Undo2 className="h-4 w-4" aria-hidden />}>
            Annuler
          </Button>
        )}
      </div>
    </article>
  );
}
