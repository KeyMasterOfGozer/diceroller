/** A single resolved die roll, e.g. rolling a d6 and getting 4 */
export interface DieResult {
  sides: number;
  value: number;
  /** True if this die was dropped (keep/drop modifiers) */
  dropped: boolean;
  /** True if this die was rerolled at least once */
  rerolled: boolean;
  /** True if this die exploded (triggered additional rolls) */
  exploded: boolean;
}

/** One named component of a compound macro, e.g. "1d8+3 [Piercing]" */
export interface RollComponent {
  label: string | null;
  notation: string;
  dice: DieResult[];
  modifier: number;
  subtotal: number;
  /** True if this component is the result of a crit() doubling */
  isCrit: boolean;
}

/** The full result of executing a macro or notation string */
export interface RollResult {
  /** The raw notation string as provided (after variable substitution) */
  notation: string;
  components: RollComponent[];
  total: number;
  /** True if any d20 component rolled a natural 20 */
  isNatural20: boolean;
  /** True if any d20 component rolled a natural 1 */
  isNatural1: boolean;
  /** The highest value rolled on any active (non-dropped) d20 die; 0 if no d20 was rolled */
  highestD20: number;
  /** Variable names referenced in the notation that had no value */
  unresolvedVariables: string[];
  rolledAt: Date;
}

/** Variables map: freeform string keys to integer values */
export type VariableMap = Record<string, number>;

/** Options for the roll evaluator */
export interface RollOptions {
  variables?: VariableMap;
  /** Override the random source for testing */
  random?: (sides: number) => number;
  /**
   * Per-component crit override (index-aligned with macro.components).
   * When true for a given index, dice in that component are doubled.
   */
  forceCritComponents?: boolean[];
  /**
   * The minimum d20 natural roll that counts as a critical hit (default 20).
   * Set to 19 for Improved Critical (Champion fighter), 18 for Superior Critical, etc.
   */
  critThreshold?: number;
  /**
   * Character-level advantage mode applied to dice marked with ~ in the notation.
   * 'advantage'    → marked dice roll 2, keep highest
   * 'disadvantage' → marked dice roll 2, keep lowest
   * 'normal'       → marked dice roll as written (default)
   * Explicit adv/dis on a die always overrides this toggle.
   */
  advantageMode?: 'advantage' | 'normal' | 'disadvantage';
}

/**
 * Result of rollAttack() — the to-hit and damage rolls are kept separate so
 * callers can display them distinctly and apply the crit flag to damage only.
 */
export interface AttackRollResult {
  /** The to-hit roll (first component of the notation). */
  toHit: RollResult;
  /** Damage rolls (remaining components). Null if notation has only one component. */
  damage: RollResult | null;
  /** True when the to-hit roll was a natural 20. */
  isCrit: boolean;
  /** True when the to-hit roll was a natural 1. */
  isFumble: boolean;
}
