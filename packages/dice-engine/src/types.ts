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
}
