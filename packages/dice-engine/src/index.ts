export * from "./types.js";
export * from "./parser.js";
export * from "./evaluator.js";

import { parse } from "./parser.js";
import { evaluate } from "./evaluator.js";
import { RollOptions, RollResult } from "./types.js";

/**
 * Main entry point: parse and evaluate a dice notation string in one call.
 *
 * @example
 * const result = roll("2d20kh1 + {{prof}} [To Hit]; 1d8+3 [Damage]", { variables: { prof: 4 } });
 */
export function roll(notation: string, options: RollOptions = {}): RollResult {
  const macro = parse(notation);
  const result = evaluate(macro, options);
  // Attach the original notation string
  result.notation = notation;
  return result;
}

/**
 * Validate a notation string without rolling.
 * Returns null on success, or an error message string on failure.
 */
export function validate(notation: string): string | null {
  try {
    parse(notation);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
