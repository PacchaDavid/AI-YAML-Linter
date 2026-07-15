import { LintError } from './error';
import { Token } from './token';
import { ASTNode } from './ast';

export interface LexerResponse {
  tokens: Token[];
  errors: LintError[];
}

export interface ParserResponse {
  ast: ASTNode | null;
  errors: LintError[];
}

export interface SemanticResponse {
  valid: boolean;
  errors: LintError[];
}

export interface ExplainerResponse {
  explanation: string;
  cached: boolean;
}

export interface AnalyzeRequest {
  content: string;
}

export interface AnalyzeResponse {
  valid: boolean;
  errors: LintError[];
  stage: 'lexical' | 'syntactic' | 'semantic' | 'complete';
}
