"use client";

import { Ban, Check, Circle, CircleDot, Clock, X } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/primitives";
import { REVISION_LABELS, STATUS_LABELS } from "@/domain/labels";
import type { RevisionType, Task, TaskStatus } from "@/domain/types";
import type { DateKey } from "@/lib/dates";

const REVISION_TONES: Record<RevisionType, Tone> = {
  J0: "info",
  J1: "info",
  J3: "info",
  J7: "info",
  J14: "info",
  J_MINUS_3: "warning",
  J_MINUS_2: "warning",
  J_MINUS_1: "warning",
  EXAM_DAY: "danger",
  EXTRA_WORK: "violet",
};

export function RevisionBadge({ type, className }: { type: RevisionType; className?: string }) {
  return (
    <Badge tone={REVISION_TONES[type]} className={className} title={type === "EXAM_DAY" ? "Jour du contrôle" : undefined}>
      {REVISION_LABELS[type]}
    </Badge>
  );
}

export type DisplayStatus = TaskStatus | "TODAY";

export function displayStatus(task: Pick<Task, "status" | "scheduledDate">, today: DateKey): DisplayStatus {
  if (task.status === "UPCOMING" && task.scheduledDate === today) return "TODAY";
  return task.status;
}

const STATUS_META: Record<DisplayStatus, { tone: Tone; label: string; Icon: typeof Check }> = {
  TODAY: { tone: "accent", label: "Aujourd'hui", Icon: CircleDot },
  UPCOMING: { tone: "neutral", label: STATUS_LABELS.UPCOMING, Icon: Circle },
  COMPLETED: { tone: "success", label: STATUS_LABELS.COMPLETED, Icon: Check },
  MISSED: { tone: "danger", label: STATUS_LABELS.MISSED, Icon: X },
  PENDING: { tone: "violet", label: STATUS_LABELS.PENDING, Icon: Clock },
  CANCELLED: { tone: "neutral", label: STATUS_LABELS.CANCELLED, Icon: Ban },
};

export function StatusBadge({ status, className }: { status: DisplayStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className}>
      <meta.Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}
