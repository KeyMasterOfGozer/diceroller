/**
 * AST node types for the dice notation grammar.
 *
 * Grammar (simplified):
 *   macro     := component (';' component)*
 *   component := expr ('[' label ']')?
 *   expr      := term (('+' | '-') term)*
 *   term      := factor ('*' factor)*
 *   factor    := '-' factor | '(' expr ')' | diceExpr | number | variable | critExpr
 *   diceExpr  := count? 'd' sides modifier* ('!')?  ('adv' | 'dis')?
 *   modifier  := ('kh'|'kl'|'dh'|'dl') number
 *              | ('r' | 'ro') number
 *              | 'min' number | 'max' number
 *              | 'cs' number
 *   critExpr  := 'crit' '(' expr ')'
 */

export type ASTNode =
  | NumberNode
  | VariableNode
  | BinaryNode
  | UnaryNode
  | DiceNode
  | CritNode
  | ComponentNode
  | MacroNode;

export interface NumberNode   { kind: "number";   value: number }
export interface VariableNode { kind: "variable"; name: string }
export interface BinaryNode   { kind: "binary";   op: "+" | "-" | "*"; left: ASTNode; right: ASTNode }
export interface UnaryNode    { kind: "unary";    op: "-"; operand: ASTNode }
export interface CritNode     { kind: "crit";     expr: ASTNode }

export interface DiceModifiers {
  keepHigh?: number;
  keepLow?: number;
  dropHigh?: number;
  dropLow?: number;
  rerollOn?: number;     // reroll indefinitely
  rerollOnce?: number;   // reroll once
  minVal?: number;
  maxVal?: number;
  countSuccesses?: number;
  exploding?: boolean;
  advantage?: boolean;   // shorthand: 2d20kh1
  disadvantage?: boolean;
}

export interface DiceNode {
  kind: "dice";
  count: ASTNode;        // number of dice (may be variable or expression)
  sides: ASTNode;        // die sides
  modifiers: DiceModifiers;
}

export interface ComponentNode {
  kind: "component";
  expr: ASTNode;
  label: string | null;
}

export interface MacroNode {
  kind: "macro";
  components: ComponentNode[];
}

// ── Parser ─────────────────────────────────────────────────────────────────

import { tokenize, Token, TokenType } from "./lexer.js";

export function parse(input: string): MacroNode {
  const tokens = tokenize(input);
  let pos = 0;

  function peek(): Token { return tokens[pos]; }
  function consume(): Token { return tokens[pos++]; }

  function expect(type: TokenType): Token {
    const t = consume();
    if (t.type !== type) throw new SyntaxError(`Expected ${type} but got ${t.type} ('${t.value}') at position ${t.pos}`);
    return t;
  }

  function match(...types: TokenType[]): boolean {
    return types.includes(peek().type);
  }

  // ── macro := component (';' component)* ──────────────────────────────────
  function parseMacro(): MacroNode {
    const components: ComponentNode[] = [];
    components.push(parseComponent());
    while (match(TokenType.Semicolon)) {
      consume();
      // Allow trailing semicolon
      if (match(TokenType.EOF)) break;
      components.push(parseComponent());
    }
    expect(TokenType.EOF);
    return { kind: "macro", components };
  }

  // ── component := expr ('[' text ']')? ────────────────────────────────────
  function parseComponent(): ComponentNode {
    const expr = parseExpr();
    let label: string | null = null;
    if (match(TokenType.LBracket)) {
      consume();
      let text = "";
      while (!match(TokenType.RBracket, TokenType.EOF)) {
        text += consume().value + (match(TokenType.RBracket, TokenType.EOF) ? "" : " ");
      }
      expect(TokenType.RBracket);
      label = text.trim();
    }
    return { kind: "component", expr, label };
  }

  // ── expr := term (('+' | '-') term)* ─────────────────────────────────────
  function parseExpr(): ASTNode {
    let left = parseTerm();
    while (match(TokenType.Plus, TokenType.Minus)) {
      const op = consume().value as "+" | "-";
      left = { kind: "binary", op, left, right: parseTerm() };
    }
    return left;
  }

  // ── term := factor ('*' factor)* ─────────────────────────────────────────
  function parseTerm(): ASTNode {
    let left = parseFactor();
    while (match(TokenType.Star)) {
      consume();
      left = { kind: "binary", op: "*", left, right: parseFactor() };
    }
    return left;
  }

  // ── factor := '-' factor | '(' expr ')' | critExpr | diceExpr | number | variable
  function parseFactor(): ASTNode {
    if (match(TokenType.Minus)) {
      consume();
      return { kind: "unary", op: "-", operand: parseFactor() };
    }
    if (match(TokenType.LParen)) {
      consume();
      const e = parseExpr();
      expect(TokenType.RParen);
      return e;
    }
    if (match(TokenType.Identifier) && peek().value.toLowerCase() === "crit") {
      consume();
      expect(TokenType.LParen);
      const e = parseExpr();
      expect(TokenType.RParen);
      return { kind: "crit", expr: e };
    }
    if (match(TokenType.Variable)) {
      return { kind: "variable", name: consume().value };
    }
    // Could be a dice expression (NdM or just dM) or a bare number
    return parseDiceOrNumber();
  }

  // ── diceOrNumber := (number)? 'd' sides modifiers  |  number ────────────
  function parseDiceOrNumber(): ASTNode {
    // Check if next meaningful token is 'd' or a number followed by 'd'
    const isAdv = match(TokenType.Identifier) && (peek().value.toLowerCase() === "adv" || peek().value.toLowerCase() === "dis");

    if (isAdv) {
      // adv/dis as standalone shorthand: treat as d20adv / d20dis
      const adv = consume().value.toLowerCase() === "adv";
      const sides: ASTNode = { kind: "number", value: 20 };
      const count: ASTNode = { kind: "number", value: 1 };
      const mods: DiceModifiers = adv ? { advantage: true } : { disadvantage: true };
      return { kind: "dice", count, sides, modifiers: mods };
    }

    let countNode: ASTNode | null = null;

    if (match(TokenType.Number)) {
      const n = parseInt(consume().value, 10);
      if (!match(TokenType.Dice)) {
        // bare number
        return { kind: "number", value: n };
      }
      countNode = { kind: "number", value: n };
    }

    if (!match(TokenType.Dice)) {
      throw new SyntaxError(`Expected dice expression or number at position ${peek().pos}`);
    }
    consume(); // eat 'd'

    // sides
    let sidesNode: ASTNode;
    if (match(TokenType.Number)) {
      sidesNode = { kind: "number", value: parseInt(consume().value, 10) };
    } else {
      throw new SyntaxError(`Expected die sides after 'd' at position ${peek().pos}`);
    }

    const mods: DiceModifiers = {};
    if (countNode === null) countNode = { kind: "number", value: 1 };

    // Parse modifiers in any order
    let parsing = true;
    while (parsing) {
      if (match(TokenType.Exclaim)) {
        consume();
        mods.exploding = true;
      } else if (match(TokenType.Identifier)) {
        const id = peek().value.toLowerCase();
        if (id === "kh") { consume(); mods.keepHigh = expectInt(); }
        else if (id === "kl") { consume(); mods.keepLow = expectInt(); }
        else if (id === "dh") { consume(); mods.dropHigh = expectInt(); }
        else if (id === "dl") { consume(); mods.dropLow = expectInt(); }
        else if (id === "ro") { consume(); mods.rerollOnce = expectInt(); }
        else if (id === "r")  { consume(); mods.rerollOn = expectInt(); }
        else if (id === "min") { consume(); mods.minVal = expectInt(); }
        else if (id === "max") { consume(); mods.maxVal = expectInt(); }
        else if (id === "cs")  { consume(); mods.countSuccesses = expectInt(); }
        else if (id === "adv") { consume(); mods.advantage = true; }
        else if (id === "dis") { consume(); mods.disadvantage = true; }
        else { parsing = false; }
      } else {
        parsing = false;
      }
    }

    return { kind: "dice", count: countNode, sides: sidesNode, modifiers: mods };
  }

  function expectInt(): number {
    const t = expect(TokenType.Number);
    return parseInt(t.value, 10);
  }

  return parseMacro();
}
