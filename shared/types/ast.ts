export interface ASTNode {
  type: 'mapping' | 'sequence' | 'scalar' | 'root';
  key?: string;
  value?: string | number | boolean | null | ASTNode[];
  children?: ASTNode[];
  line: number;
}
