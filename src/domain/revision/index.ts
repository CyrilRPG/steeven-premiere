import type { StrategyType } from "@/domain/types";
import type { RevisionStrategy } from "@/domain/revision/strategy";
import { mathematicsStrategy } from "@/domain/revision/strategies/mathematics";
import { physicsStrategy } from "@/domain/revision/strategies/physics";
import { svtStrategy } from "@/domain/revision/strategies/svt";
import { osefStrategy } from "@/domain/revision/strategies/osef";
import { frenchStrategy } from "@/domain/revision/strategies/french";
import { noneStrategy } from "@/domain/revision/strategies/none";

export const STRATEGIES: Record<StrategyType, RevisionStrategy> = {
  MATHEMATICS: mathematicsStrategy,
  PHYSICS: physicsStrategy,
  SVT: svtStrategy,
  OSEF: osefStrategy,
  FRENCH: frenchStrategy,
  NONE: noneStrategy,
};

export const STRATEGY_ORDER: StrategyType[] = ["MATHEMATICS", "PHYSICS", "SVT", "OSEF", "FRENCH", "NONE"];

export function getStrategy(type: StrategyType): RevisionStrategy {
  return STRATEGIES[type] ?? noneStrategy;
}
