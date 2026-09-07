"use client";

import { Badge, cx } from "@/components/ui/primitives";
import { slotMinutes, slotState, type TimetableSlot } from "@/domain/timetable";
import { formatMinutes } from "@/lib/dates";

interface Props {
  slots: TimetableSlot[];
  /** "HH:MM" of now when the list is today's; null otherwise. */
  nowHHMM: string | null;
  emptyLabel?: string;
  onSelect?: (slot: TimetableSlot) => void;
}

export function TimetableDay({ slots, nowHHMM, emptyLabel = "Pas de cours.", onSelect }: Props) {
  if (slots.length === 0) return <p className="px-3.5 py-3 text-sm text-muted">{emptyLabel}</p>;
  const total = slots.reduce((acc, s) => acc + slotMinutes(s), 0);
  return (
    <div>
      <ul className="divide-y divide-border">
        {slots.map((s) => {
          const state = nowHHMM ? slotState(s, nowHHMM) : "upcoming";
          const content = (
            <>
              <span className={cx("w-24 shrink-0 text-sm tabular-nums", state === "past" ? "text-muted" : "font-medium")}>
                {s.start} – {s.end}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block truncate text-sm", state === "past" ? "text-muted line-through decoration-muted/60" : "font-medium")}>{s.subject}</span>
                <span className="block truncate text-xs text-muted">
                  {[s.teacher, s.room].filter(Boolean).join(" · ")}
                  {s.note && ` · ${s.note}`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {s.group && <Badge>Groupe {s.group}</Badge>}
                {state === "current" && <Badge tone="accent">En cours</Badge>}
              </span>
            </>
          );
          return (
            <li key={s.id}>
              {onSelect ? (
                <button type="button" onClick={() => onSelect(s)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2">
                  {content}
                </button>
              ) : (
                <div className="flex items-center gap-3 px-3.5 py-2.5">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="border-t border-border px-3.5 py-2 text-xs text-muted">
        {slots.length} cours · {formatMinutes(total)} · fin à {slots[slots.length - 1].end}
      </p>
    </div>
  );
}
