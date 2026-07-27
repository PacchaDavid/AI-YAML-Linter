import { Token, TokenType } from '../../../shared/types/token';
import { ASTNode } from '../../../shared/types/ast';
import { LintError } from '../../../shared/types/error';

/**
 * Estructura del resultado devuelto por el componente Parser.
 */
interface ParserResult {
  ast: ASTNode | null;
  errors: LintError[];
}

/**
 * Contexto interno de parsing que mantiene la posición actual del token y la lista de errores.
 */
interface ParseContext {
  tokens: Token[];
  pos: number;
  errors: LintError[];
}

/**
 * @function parser
 * @description Realiza el análisis sintáctico de la Etapa 2 sobre un flujo de tokens generado por el Lexer.
 * Utiliza un algoritmo de Parsing por Descenso Recursivo para construir un Árbol de Sintaxis Abstracta (AST)
 * que representa mapeos, secuencias y nodos escalares. Detecta inconsistencias estructurales como dos puntos faltantes
 * o tokens inesperados.
 *
 * @param tokens Flujo de tokens proveniente de la Etapa 1 (Lexer).
 * @returns Objeto que contiene el nodo raíz ASTNode construido y los errores sintácticos detectados.
 */
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

  // Omitir saltos de línea iniciales y comentarios antes del primer nodo
  skipNewlines(ctx);

  while (ctx.pos < tokens.length && tokens[ctx.pos].type !== TokenType.EOF) {
    const node = parseNode(ctx, 0);
    if (node) {
      root.children!.push(node);
    } else {
      // Recuperación de errores: avanzar más allá del token inválido para continuar el parsing
      advance(ctx);
    }
    skipNewlines(ctx);
  }

  // Verificar desindentaciones no cerradas al final del flujo de tokens
  if (ctx.pos < tokens.length && tokens[ctx.pos].type === TokenType.DEDENT) {
    while (ctx.pos < tokens.length && tokens[ctx.pos].type === TokenType.DEDENT) {
      advance(ctx);
    }
  }

  return {
    ast: root.children?.length ? root : null,
    errors: ctx.errors,
  };
}

/**
 * Procesa y construye un nodo AST según la clasificación del token actual.
 *
 * @param ctx Contexto de parsing actual.
 * @param indentLevel Nivel de profundidad de anidación actual.
 * @returns Nodo AST construido o null si ocurrió un error.
 */
function parseNode(ctx: ParseContext, indentLevel: number): ASTNode | null {
  if (ctx.pos >= ctx.tokens.length) return null;

  const token = ctx.tokens[ctx.pos];

  // Elemento de secuencia (token de guión de lista)
  if (token.type === TokenType.DASH) {
    return parseSequenceItem(ctx, indentLevel);
  }

  // Mapeo clave-valor
  if (token.type === TokenType.KEY) {
    return parseMapping(ctx, indentLevel);
  }

  // Valor escalar independiente
  if (isScalarType(token.type)) {
    const node: ASTNode = {
      type: 'scalar',
      value: token.value,
      line: token.line,
    };
    advance(ctx);
    return node;
  }

  // Registrar error sintáctico por token inesperado
  ctx.errors.push({
    stage: 'syntactic',
    code: 'PAR-001',
    message: `Token inesperado '${token.value}' de tipo ${token.type} en la línea ${token.line}`,
    line: token.line,
    column: token.column,
  });

  return null;
}

/**
 * Procesa un nodo de mapeo clave-valor en YAML y sus nodos hijos o valor escalar en línea.
 */
function parseMapping(ctx: ParseContext, indentLevel: number): ASTNode | null {
  const keyToken = ctx.tokens[ctx.pos];
  advance(ctx); // consumir KEY

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
  advance(ctx); // consumir COLON

  const node: ASTNode = {
    type: 'mapping',
    key: keyToken.value,
    line: keyToken.line,
  };

  if (ctx.pos < ctx.tokens.length) {
    const next = ctx.tokens[ctx.pos];

    if (next.type === TokenType.NEWLINE) {
      // Mapeo o secuencia anidada multilínea
      advance(ctx);
      skipNewlines(ctx);

      if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === TokenType.INDENT) {
        advance(ctx); // consumir INDENT

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
      // Valor en una sola línea o lista en línea
      if (next.type === TokenType.DASH) {
        node.children = [];
        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === TokenType.DASH) {
          advance(ctx);
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

/**
 * Procesa un nodo de elemento de secuencia (elemento de lista que empieza con '-').
 */
function parseSequenceItem(ctx: ParseContext, indentLevel: number): ASTNode | null {
  advance(ctx); // consumir DASH

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
      advance(ctx);
      skipNewlines(ctx);
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

/**
 * Convierte un token escalar crudo en primitivos nativos de JavaScript (number, boolean, null, string).
 */
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

/**
 * Predicado de ayuda que comprueba si un tipo de token representa un valor escalar primitivo.
 */
function isScalarType(type: TokenType): boolean {
  return [
    TokenType.STRING,
    TokenType.NUMBER,
    TokenType.BOOLEAN,
    TokenType.NULL,
  ].includes(type);
}

/**
 * Avanza la posición del cursor omitiendo tokens de NEWLINE y COMMENT.
 */
function skipNewlines(ctx: ParseContext): void {
  while (ctx.pos < ctx.tokens.length &&
         (ctx.tokens[ctx.pos].type === TokenType.NEWLINE ||
          ctx.tokens[ctx.pos].type === TokenType.COMMENT)) {
    advance(ctx);
  }
}

/**
 * Consume y retorna el token actual, incrementando el cursor en 1.
 */
function advance(ctx: ParseContext): Token {
  return ctx.tokens[ctx.pos++];
}


