/** Token types produced by the lexer */
export const enum TokenType {
  Number      = "Number",
  Dice        = "Dice",        // "d" keyword
  Plus        = "Plus",
  Minus       = "Minus",
  Star        = "Star",
  LParen      = "LParen",
  RParen      = "RParen",
  LBracket    = "LBracket",
  RBracket    = "RBracket",
  Semicolon   = "Semicolon",
  Identifier  = "Identifier",  // adv, dis, kh, kl, dh, dl, r, ro, min, max, cs, crit, etc.
  Variable    = "Variable",    // {{name}}
  Exclaim     = "Exclaim",     // !
  EOF         = "EOF",
}

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = input.trim();

  while (i < src.length) {
    // Skip whitespace
    if (/\s/.test(src[i])) { i++; continue; }

    // Variable: {{...}}
    if (src[i] === "{" && src[i + 1] === "{") {
      const start = i;
      i += 2;
      let name = "";
      while (i < src.length && !(src[i] === "}" && src[i + 1] === "}")) {
        name += src[i++];
      }
      if (src[i] !== "}" || src[i + 1] !== "}") {
        throw new SyntaxError(`Unclosed variable at position ${start}`);
      }
      i += 2;
      tokens.push({ type: TokenType.Variable, value: name.trim(), pos: start });
      continue;
    }

    // Label: [...]
    if (src[i] === "[") {
      tokens.push({ type: TokenType.LBracket, value: "[", pos: i++ }); continue;
    }
    if (src[i] === "]") {
      tokens.push({ type: TokenType.RBracket, value: "]", pos: i++ }); continue;
    }

    // Punctuation
    if (src[i] === "(") { tokens.push({ type: TokenType.LParen,   value: "(", pos: i++ }); continue; }
    if (src[i] === ")") { tokens.push({ type: TokenType.RParen,   value: ")", pos: i++ }); continue; }
    if (src[i] === "+") { tokens.push({ type: TokenType.Plus,     value: "+", pos: i++ }); continue; }
    if (src[i] === "-") { tokens.push({ type: TokenType.Minus,    value: "-", pos: i++ }); continue; }
    if (src[i] === "*") { tokens.push({ type: TokenType.Star,     value: "*", pos: i++ }); continue; }
    if (src[i] === ";") { tokens.push({ type: TokenType.Semicolon,value: ";", pos: i++ }); continue; }
    if (src[i] === "!") { tokens.push({ type: TokenType.Exclaim,  value: "!", pos: i++ }); continue; }

    // Number
    if (/[0-9]/.test(src[i])) {
      const start = i;
      let num = "";
      while (i < src.length && /[0-9]/.test(src[i])) num += src[i++];
      tokens.push({ type: TokenType.Number, value: num, pos: start });
      continue;
    }

    // Identifier (d, adv, dis, kh, kl, dh, dl, r, ro, min, max, cs, crit, ...)
    // Identifiers are letters-only; digits that follow are separate Number tokens.
    // This ensures "d6" → Dice + Number(6), "dl1" → Identifier("dl") + Number(1), etc.
    if (/[a-zA-Z_]/.test(src[i])) {
      const start = i;
      let id = "";
      while (i < src.length && /[a-zA-Z_]/.test(src[i])) id += src[i++];
      // "d" alone is the dice operator; everything else is a general identifier.
      // Preserve original case — the parser lowercases when comparing keywords,
      // so label text like "[To Hit]" is not corrupted.
      if (id.toLowerCase() === "d") {
        tokens.push({ type: TokenType.Dice, value: "d", pos: start });
      } else {
        tokens.push({ type: TokenType.Identifier, value: id, pos: start });
      }
      continue;
    }

    throw new SyntaxError(`Unexpected character '${src[i]}' at position ${i}`);
  }

  tokens.push({ type: TokenType.EOF, value: "", pos: src.length });
  return tokens;
}
