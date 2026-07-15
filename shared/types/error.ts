export interface LintError {
  stage: 'lexical' | 'syntactic' | 'semantic';
  code: string;
  message: string;
  line: number;
  column?: number;
  explanation?: string;
}
