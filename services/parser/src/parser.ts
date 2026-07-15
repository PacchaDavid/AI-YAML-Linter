import { Token, TokenType } from '../../../shared/types/token';
import { ASTNode } from '../../../shared/types/ast';
import { LintError } from '../../../shared/types/error';

interface ParserResult {
  ast: ASTNode | null;
  errors: LintError[];
}

interface ParseContext {
  tokens: Token[];
  pos: number;
  errors: LintError[];
}

export function parser(tokens: Token[]): ParserResult {
  const ctx: ParseContext = {
    tokens,
    pos: 0,
    errors: [],
  };

  const root: ASTNode = {
    type: 'root',
    children: [],
    line: 1,
  };

  // Skip initial newlines
  skipNewlines(ctx);

  while (ctx.pos < tokens.length && tokens[ctx.pos].type !== TokenType.EOF) {
    const node = parseNode(ctx, 0);
    if (node) {
      root.children!.push(node);
    } else {
      // Error recovery: skip to next meaningful token
      advance(ctx);
    }
    skipNewlines(ctx);
  }

  // Check for unbalanced indentation
  if (ctx.pos < tokens.length && tokens[ctx.pos].type === TokenType.DEDENT) {
    // This is normal at EOF, but check if there are extra dedents
    let dedentCount = 0;
    while (ctx.pos < tokens.length && tokens[ctx.pos].type === TokenType.DEDENT) {
      dedentCount++;
      advance(ctx);
    }
    // Too many dedents could indicate a problem
  }

  return {
    ast: root.children?.length ? root : null,
    errors: ctx.errors,
  };
}

function parseNode(ctx: ParseContext, indentLevel: number): ASTNode | null {
  if (ctx.pos >= ctx.tokens.length) return null;

  const token = ctx.tokens[ctx.pos];

  // List item (dash)
  if (token.type === TokenType.DASH) {
    return parseSequenceItem(ctx, indentLevel);
  }

  // Key-value pair
  if (token.type === TokenType.KEY) {
    return parseMapping(ctx, indentLevel);
  }

  // Scalar value at root level
  if (isScalarType(token.type)) {
    const node: ASTNode = {
      type: 'scalar',
      value: token.value,
      line: token.line,
    };
    advance(ctx);
    return node;
  }

  // Unexpected token
  ctx.errors.push({
    stage: 'syntactic',
    code: 'PAR-001',
    message: `Token inesperado '${token.value}' de tipo ${token.type} en la línea ${token.line}`,
    line: token.line,
    column: token.column,
  });

  return null;
}

function parseMapping(ctx: ParseContext, indentLevel: number): ASTNode | null {
  const keyToken = ctx.tokens[ctx.pos];
  advance(ctx); // consume KEY

  if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== TokenType.COLON) {
    ctx.errors.push({
      stage: 'syntactic',
      code: 'PAR-002',
      message: `Se esperaba ':' después de la clave '${keyToken.value}' en la línea ${keyToken.line}`,
      line: keyToken.line,
      column: keyToken.column + keyToken.value.length + 1,
    });
    return {
      type: 'mapping',
      key: keyToken.value,
      value: null,
      line: keyToken.line,
    };
  }
  advance(ctx); // consume COLON

  // Skip spaces
  const node: ASTNode = {
    type: 'mapping',
    key: keyToken.value,
    line: keyToken.line,
  };

  // Check what follows
  if (ctx.pos < ctx.tokens.length) {
    const next = ctx.tokens[ctx.pos];

    if (next.type === TokenType.NEWLINE) {
      // Multi-line value: check for indented children
      advance(ctx); // consume NEWLINE
      skipNewlines(ctx);

      // Read indented children (sequence or mapping)
      if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === TokenType.INDENT) {
        advance(ctx); // consume INDENT

        node.children = [];
        while (ctx.pos < ctx.tokens.length) {
          const t = ctx.tokens[ctx.pos];
          if (t.type === TokenType.DEDENT) {
            break;
          }
          if (t.type === TokenType.NEWLINE) {
            advance(ctx);
            continue;
          }

          const child = parseNode(ctx, indentLevel + 1);
          if (child) {
            node.children.push(child);
          } else {
            advance(ctx);
          }
          skipNewlines(ctx);
        }

        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === TokenType.DEDENT) {
          advance(ctx);
        }
      }
    } else if (isScalarType(next.type) || next.type === TokenType.DASH) {
      // Inline value
      if (next.type === TokenType.DASH) {
        // Inline sequence
        node.children = [];
        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === TokenType.DASH) {
          advance(ctx); // consume DASH
          if (ctx.pos < ctx.tokens.length && isScalarType(ctx.tokens[ctx.pos].type)) {
            node.children.push({
              type: 'scalar',
              value: ctx.tokens[ctx.pos].value,
              line: ctx.tokens[ctx.pos].line,
            });
            advance(ctx);
          }
        }
      } else {
        node.value = parseScalar(ctx);
      }
    }
  }

  return node;
}

function parseSequenceItem(ctx: ParseContext, indentLevel: number): ASTNode | null {
  advance(ctx); // consume DASH

  const node: ASTNode = {
    type: 'sequence',
    children: [],
    line: ctx.pos > 0 ? ctx.tokens[ctx.pos - 1].line : 0,
  };

  if (ctx.pos < ctx.tokens.length) {
    const next = ctx.tokens[ctx.pos];
    if (isScalarType(next.type)) {
      node.value = parseScalar(ctx);
      return {
        type: 'scalar',
        value: node.value,
        line: node.line,
      };
    } else if (next.type === TokenType.NEWLINE) {
      advance(ctx); // consume NEWLINE
      skipNewlines(ctx);
      // Read indented content under this list item
      if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === TokenType.INDENT) {
        advance(ctx);
        while (ctx.pos < ctx.tokens.length) {
          const t = ctx.tokens[ctx.pos];
          if (t.type === TokenType.DEDENT) break;
          if (t.type === TokenType.NEWLINE) { advance(ctx); continue; }
          const child = parseNode(ctx, indentLevel + 1);
          if (child && node.children) node.children.push(child);
          else if (!child) advance(ctx);
          skipNewlines(ctx);
        }
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === TokenType.DEDENT) {
          advance(ctx);
        }
      }
    }
  }

  return node;
}

function parseScalar(ctx: ParseContext): string | number | boolean | null {
  if (ctx.pos >= ctx.tokens.length) return null;
  const token = ctx.tokens[ctx.pos];
  advance(ctx);

  switch (token.type) {
    case TokenType.NUMBER:
      return token.value.includes('.') ? parseFloat(token.value) : parseInt(token.value, 10);
    case TokenType.BOOLEAN:
      return token.value.toLowerCase() === 'true' || token.value.toLowerCase() === 'yes' || token.value.toLowerCase() === 'on';
    case TokenType.NULL:
      return null;
    default:
      return token.value;
  }
}

function isScalarType(type: TokenType): boolean {
  return [
    TokenType.STRING,
    TokenType.NUMBER,
    TokenType.BOOLEAN,
    TokenType.NULL,
  ].includes(type);
}

function skipNewlines(ctx: ParseContext): void {
  while (ctx.pos < ctx.tokens.length &&
         (ctx.tokens[ctx.pos].type === TokenType.NEWLINE ||
          ctx.tokens[ctx.pos].type === TokenType.COMMENT)) {
    advance(ctx);
  }
}

function advance(ctx: ParseContext): Token {
  return ctx.tokens[ctx.pos++];
}
