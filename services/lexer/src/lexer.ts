import { Token, TokenType } from '../../../shared/types/token';
import { LintError } from '../../../shared/types/error';

interface LexerResult {
  tokens: Token[];
  errors: LintError[];
}

export function lexer(input: string): LexerResult {
  const tokens: Token[] = [];
  const errors: LintError[] = [];
  const lines = input.split('\n');

  let indentStack: number[] = [0];
  let lineNum = 0;

  for (const rawLine of lines) {
    lineNum++;
    const line = rawLine;

    // Check for mixed tabs and spaces
    if (/^ *\t|\t +/.test(line) || /^ +\t/.test(line)) {
      errors.push({
        stage: 'lexical',
        code: 'LEX-001',
        message: `Se mezclaron tabulaciones y espacios en la línea ${lineNum}`,
        line: lineNum,
        column: line.search(/\t/),
      });
    }

    // Check for invalid characters
    const invalidCharMatch = line.match(/[^\x09\x0A\x0D\x20-\x7E\x80-\xFF\u00A0\u2000-\u200A\u202F\u205F\u3000]/);
    if (invalidCharMatch) {
      errors.push({
        stage: 'lexical',
        code: 'LEX-002',
        message: `Carácter inválido '${invalidCharMatch[0]}' en la línea ${lineNum}`,
        line: lineNum,
        column: (invalidCharMatch.index ?? 0) + 1,
      });
    }

    // Empty line or comment
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      if (trimmed.startsWith('#')) {
        tokens.push({
          type: TokenType.COMMENT,
          value: trimmed,
          line: lineNum,
          column: line.indexOf('#') + 1,
        });
      }
      tokens.push({ type: TokenType.NEWLINE, value: '\n', line: lineNum, column: line.length + 1 });
      continue;
    }

    // Compute indentation
    const indentMatch = line.match(/^ */);
    const indentLen = indentMatch ? indentMatch[0].length : 0;

    if (indentLen > indentStack[indentStack.length - 1]) {
      indentStack.push(indentLen);
      tokens.push({ type: TokenType.INDENT, value: ' '.repeat(indentLen), line: lineNum, column: 1 });
    } else if (indentLen < indentStack[indentStack.length - 1]) {
      while (indentLen < indentStack[indentStack.length - 1]) {
        indentStack.pop();
        tokens.push({
          type: TokenType.DEDENT,
          value: '',
          line: lineNum,
          column: indentLen + 1,
        });
      }
      if (indentLen !== indentStack[indentStack.length - 1]) {
        errors.push({
          stage: 'lexical',
          code: 'LEX-003',
          message: `Indentación inconsistente en la línea ${lineNum}. Se esperaba un nivel de indentación ya existente.`,
          line: lineNum,
          column: indentLen + 1,
        });
      }
    }

    // Tokenize the content of the line after indentation
    const content = line.substring(indentLen);
    let col = indentLen + 1;

    // Check for list item (dash)
    if (content.startsWith('- ')) {
      tokens.push({ type: TokenType.DASH, value: '-', line: lineNum, column: col });
      col += 2;
      tokenizeValue(content.substring(2), tokens, lineNum, col);
    } else if (content.startsWith('-')) {
      tokens.push({ type: TokenType.DASH, value: '-', line: lineNum, column: col });
      col += 1;
    } else {
      // Key: value pair
      const colonIdx = content.indexOf(':');
      if (colonIdx >= 0) {
        const key = content.substring(0, colonIdx).trimEnd();
        tokens.push({ type: TokenType.KEY, value: key, line: lineNum, column: col });
        col += colonIdx;
        tokens.push({ type: TokenType.COLON, value: ':', line: lineNum, column: col + 1 });
        col += 1;

        const valuePart = content.substring(colonIdx + 1).trim();
        if (valuePart) {
          col += content.length - (colonIdx + 1) - content.substring(colonIdx + 1).length + valuePart.length;
          tokenizeValue(valuePart, tokens, lineNum, col - valuePart.length + 1);
        }
      } else {
        // Scalar value without key (e.g., plain text)
        tokenizeValue(content.trim(), tokens, lineNum, col);
      }
    }

    tokens.push({ type: TokenType.NEWLINE, value: '\n', line: lineNum, column: line.length + 1 });
  }

  // Close any remaining indentation
  while (indentStack.length > 1) {
    indentStack.pop();
    tokens.push({
      type: TokenType.DEDENT,
      value: '',
      line: lineNum,
      column: 1,
    });
  }

  tokens.push({ type: TokenType.EOF, value: '', line: lineNum, column: 1 });

  return { tokens, errors };
}

function tokenizeValue(value: string, tokens: Token[], line: number, col: number): void {
  if (!value) return;

  // Boolean
  if (/^(true|false|yes|no|on|off)$/i.test(value)) {
    tokens.push({ type: TokenType.BOOLEAN, value, line, column: col });
    return;
  }

  // Null
  if (/^(null|~)$/i.test(value)) {
    tokens.push({ type: TokenType.NULL, value, line, column: col });
    return;
  }

  // Number (integer or float)
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) {
    tokens.push({ type: TokenType.NUMBER, value, line, column: col });
    return;
  }

  // Pipe (multi-line string)
  if (value === '|') {
    tokens.push({ type: TokenType.PIPE, value, line, column: col });
    return;
  }

  // GT (folded string)
  if (value === '>') {
    tokens.push({ type: TokenType.GT, value, line, column: col });
    return;
  }

  // String (default)
  tokens.push({ type: TokenType.STRING, value, line, column: col });
}
