export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export enum TokenType {
  // Scalars
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  NULL = 'NULL',

  // Structure
  KEY = 'KEY',
  COLON = 'COLON',
  DASH = 'DASH',
  INDENT = 'INDENT',
  DEDENT = 'DEDENT',
  NEWLINE = 'NEWLINE',
  PIPE = 'PIPE',
  GT = 'GT',

  // Comments
  COMMENT = 'COMMENT',

  // Syntax
  EOF = 'EOF',

  // Error
  INVALID = 'INVALID',
}
