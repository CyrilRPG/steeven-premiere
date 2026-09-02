import type { FrenchExamType, ResourceQuery, RevisionType, StrategyType } from "@/domain/types";

export interface TemplateContext {
  chapterName: string;
  subjectName: string;
}

/**
 * Declarative description of one task of the method.
 * `{chapter}` in title/description is replaced by the chapter name.
 */
export interface TaskTemplate {
  revisionType: RevisionType;
  /** Days relative to J0 (chapter tasks) or to the exam date (exam tasks, negative or 0). */
  offsetDays: number;
  title: string;
  description: string;
  estimatedMinutes: number | null;
  /** true when the duration is an estimate rather than a value defined by the method. */
  durationIsEstimate: boolean;
  resourceQueries?: (ctx: TemplateContext) => ResourceQuery[];
}

export interface RevisionStrategy {
  type: StrategyType;
  label: string;
  description: string;
  /** Tasks triggered by the first course of a chapter (J0, J1, J3, J7, J14). */
  chapterSchedule: TaskTemplate[];
  /** Tasks triggered by an exam (J-3, J-2, J-1, exam day). */
  examSchedule: (opts: { frenchType: FrenchExamType | null }) => TaskTemplate[];
  /** Human readable resource preferences (shown on the chapter page). */
  resourcePreferences: string[];
  /** Whether adding an exam requires choosing a type (French only). */
  requiresExamType: boolean;
}

export const OFFSETS = {
  J0: 0,
  J1: 1,
  J3: 3,
  J7: 7,
  J14: 14,
  J_MINUS_3: -3,
  J_MINUS_2: -2,
  J_MINUS_1: -1,
  EXAM_DAY: 0,
} as const;

export function fill(text: string, ctx: TemplateContext): string {
  return text.replaceAll("{chapter}", ctx.chapterName).replaceAll("{subject}", ctx.subjectName);
}

export const yt = (label: string, query: string): ResourceQuery => ({ label, query, provider: "youtube" });
export const web = (label: string, query: string): ResourceQuery => ({ label, query, provider: "web" });
