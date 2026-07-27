import Ajv from 'ajv';
import { ASTNode } from '../../../shared/types/ast';
import { LintError } from '../../../shared/types/error';

const ajv = new Ajv({ allErrors: true });

/**
 * Estructura de resultado devuelta por el componente Analizador Semántico.
 */
interface SemanticResult {
  valid: boolean;
  errors: LintError[];
}

/**
 * @interface ValidationRule
 * @pattern Interfaz del Patrón Strategy (Estrategia)
 * @description Define el contrato para las estrategias de validación semántica personalizadas e intercambiables.
 * Las reglas que la implementan evalúan nodos AST individuales en contexto sin alterar el motor principal del analizador.
 */
interface ValidationRule {
  name: string;
  code: string;
  validate: (node: ASTNode, path: string[], errors: LintError[]) => void;
}

// --- Esquema de configuración de estructura JSON Schema (ajv) ---
const configSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    version: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    name: { type: 'string' },
    server: {
      type: 'object',
      additionalProperties: true,
      properties: {
        port: { type: 'number', minimum: 1, maximum: 65535 },
        host: { type: 'string' },
        debug: { type: 'boolean' },
        timeout: { type: 'number', minimum: 0 },
      },
    },
    database: {
      type: 'object',
      additionalProperties: true,
      properties: {
        host: { type: 'string' },
        port: { type: 'number', minimum: 1, maximum: 65535 },
        name: { type: 'string' },
        user: { type: 'string' },
        password: { type: 'string' },
      },
    },
    logging: {
      type: 'object',
      additionalProperties: true,
      properties: {
        level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
        file: { type: 'string' },
      },
    },
    features: {
      type: 'object',
      additionalProperties: true,
      properties: {
        enabled: { type: 'boolean' },
        maxItems: { type: 'number', minimum: 0 },
      },
    },
  },
};

let validateSchema: ReturnType<typeof ajv.compile> | null = null;
try {
  validateSchema = ajv.compile(configSchema);
} catch (err) {
  console.warn(`[Semantic] Schema compilation failed:`, err);
}

/**
 * Traduce errores de validación de bajo nivel de AJV a mensajes legibles en español.
 */
function translateAjvError(err: { keyword?: string; message?: string; params?: Record<string, unknown> }): string {
  const keyword = err.keyword || '';

  if (keyword === 'type') {
    return `debe ser de tipo ${String(err.params?.type || 'válido')}`;
  }
  if (keyword === 'required') {
    return `falta la propiedad requerida '${String(err.params?.missingProperty || '')}'`;
  }
  if (keyword === 'additionalProperties') {
    return `no se permite la propiedad adicional '${String(err.params?.additionalProperty || '')}'`;
  }
  if (keyword === 'enum') {
    return 'debe coincidir con uno de los valores permitidos';
  }
  if (keyword === 'minimum') {
    return `debe ser mayor o igual que ${String(err.params?.limit || '')}`;
  }
  if (keyword === 'maximum') {
    return `debe ser menor o igual que ${String(err.params?.limit || '')}`;
  }
  if (keyword === 'minLength') {
    return `debe tener al menos ${String(err.params?.limit || '')} caracteres`;
  }
  if (keyword === 'maxLength') {
    return `debe tener como máximo ${String(err.params?.limit || '')} caracteres`;
  }
  if (keyword === 'pattern') {
    return 'no cumple con el formato esperado';
  }
  if (keyword === 'oneOf') {
    return 'debe cumplir exactamente uno de los esquemas permitidos';
  }
  if (keyword === 'anyOf') {
    return 'debe cumplir al menos uno de los esquemas permitidos';
  }

  const baseMessage = err.message || 'error desconocido';
  return baseMessage
    .replace(/^must\s+/i, 'debe ')
    .replace(/should\s+NOT\s+have\s+additional\s+properties/i, 'no debe tener propiedades adicionales');
}

// --- Implementaciones de Estrategias ---

/**
 * Estrategia: Verificación de Tipos (Type Checking)
 * Valida que los tipos de datos de los valores de las claves coincidan con las expectativas semánticas (ej. puertos/conteos deben ser numéricos, banderas deben ser booleanas).
 */
const typeCheckRule: ValidationRule = {
  name: 'Type Checking',
  code: 'SEM-002',
  validate: (node, path, errors) => {
    if (node.type === 'mapping' && node.key) {
      const keyLower = node.key.toLowerCase();

      if ((keyLower.includes('count') || keyLower.includes('age') || keyLower.includes('port') || keyLower.includes('size') || keyLower.includes('limit')) && node.value !== undefined && node.value !== null) {
        if (typeof node.value === 'string' && isNaN(Number(node.value))) {
          errors.push({
            stage: 'semantic',
            code: 'SEM-002',
            message: `Se esperaba un valor numérico para '${node.key}', pero se recibió la cadena '${node.value}'`,
            line: node.line,
          });
        }
      }

      if ((keyLower.includes('enabled') || keyLower.includes('active') || keyLower.includes('debug') || keyLower.includes('verbose')) && node.value !== undefined && node.value !== null) {
        if (typeof node.value !== 'boolean' && !['true', 'false', 'yes', 'no', 'on', 'off'].includes(String(node.value).toLowerCase())) {
          errors.push({
            stage: 'semantic',
            code: 'SEM-002',
            message: `Se esperaba un valor booleano para '${node.key}', pero se recibió '${node.value}'`,
            line: node.line,
          });
        }
      }
    }
  },
};

/**
 * Estrategia: Verificación de Rangos de Valores (Value Range Check)
 * Valida rangos numéricos para atributos sensibles como puertos de red (1-65535) o porcentajes (0-100).
 */
const rangeCheckRule: ValidationRule = {
  name: 'Value Range Check',
  code: 'SEM-003',
  validate: (node, path, errors) => {
    if (node.type === 'mapping' && node.key) {
      const keyLower = node.key.toLowerCase();

      if (keyLower === 'port' && typeof node.value === 'number') {
        if (node.value < 1 || node.value > 65535) {
          errors.push({
            stage: 'semantic',
            code: 'SEM-003',
            message: `El valor del puerto ${node.value} está fuera del rango permitido (1-65535)`,
            line: node.line,
          });
        }
      }

      if ((keyLower.includes('percentage') || keyLower === 'rate') && typeof node.value === 'number') {
        if (node.value < 0 || node.value > 100) {
          errors.push({
            stage: 'semantic',
            code: 'SEM-003',
            message: `El porcentaje ${node.value} está fuera del rango permitido (0-100)`,
            line: node.line,
          });
        }
      }
    }
  },
};

/**
 * Estrategia: Detección de Claves Duplicadas
 * Detecta declaraciones de claves duplicadas dentro del mismo nivel de anidación de un objeto.
 */
const duplicateKeyRule: ValidationRule = {
  name: 'Duplicate Key Detection',
  code: 'SEM-005',
  validate: (node, path, errors) => {
    if (node.children && node.children.length > 0) {
      const seenKeys = new Map<string, number>();
      for (const child of node.children) {
        if (child.key) {
          if (seenKeys.has(child.key)) {
            errors.push({
              stage: 'semantic',
              code: 'SEM-005',
              message: `Se encontró una clave duplicada '${child.key}' (primera aparición en la línea ${seenKeys.get(child.key)})`,
              line: child.line,
            });
          } else {
            seenKeys.set(child.key, child.line);
          }
        }
      }
    }
  },
};

/**
 * Estrategia: Verificación de Valores Vacíos
 * Detecta claves de mapeo definidas sin ningún valor ni nodo hijo asociado.
 */
const emptyValueRule: ValidationRule = {
  name: 'Empty Value Check',
  code: 'SEM-006',
  validate: (node, path, errors) => {
    if (node.type === 'mapping' && node.key && node.value === undefined && (!node.children || node.children.length === 0)) {
      errors.push({
        stage: 'semantic',
        code: 'SEM-006',
        message: `La clave '${node.key}' no tiene valor ni elementos hijos`,
        line: node.line,
      });
    }
  },
};

/**
 * Estrategia: Convención de Nombres
 * Advierte sobre el uso mixto de camelCase y snake_case dentro del mismo nombre de clave.
 */
const namingConventionRule: ValidationRule = {
  name: 'Naming Convention Check',
  code: 'SEM-007',
  validate: (node, path, errors) => {
    if (node.type === 'mapping' && node.key) {
      if (/[A-Z]/.test(node.key) && node.key.includes('_')) {
        errors.push({
          stage: 'semantic',
          code: 'SEM-007',
          message: `La clave '${node.key}' mezcla convenciones de nombres (camelCase + snake_case). Se recomienda usar una sola convención.`,
          line: node.line,
        });
      }
    }
  },
};

/** Arreglo de estrategias de validación activas registradas */
const allRules: ValidationRule[] = [
  typeCheckRule,
  rangeCheckRule,
  duplicateKeyRule,
  emptyValueRule,
  namingConventionRule,
];

/**
 * Convierte un nodo AST en un objeto JavaScript simple para evaluación contra JSON Schema de AJV.
 */
function astToRecord(node: ASTNode): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (node.children) {
    for (const child of node.children) {
      if (child.key) {
        if (child.children && child.children.length > 0) {
          result[child.key] = astToRecord(child);
        } else if (child.value !== undefined) {
          result[child.key] = child.value;
        } else {
          result[child.key] = null;
        }
      }
    }
  }
  return result;
}

/**
 * @function semanticAnalyzer
 * @pattern Ejecución del Patrón Strategy
 * @description Realiza el análisis semántico de la Etapa 3 sobre un AST.
 * Evalúa el AST contra reglas estructurales JSON Schema (AJV) y aplica todas las estrategias de validación registradas.
 *
 * @param ast Nodo raíz del Árbol de Sintaxis Abstracta.
 * @returns Objeto que indica la validez semántica y lista los errores identificados.
 */
export function semanticAnalyzer(ast: ASTNode): SemanticResult {
  const errors: LintError[] = [];

  if (!ast) {
    return { valid: false, errors: [] };
  }

  // Evaluación de estructura mediante JSON Schema (ajv)
  if (validateSchema) {
    try {
      const record = astToRecord(ast);
      const valid = validateSchema(record);

      if (!valid && validateSchema.errors) {
        for (const err of validateSchema.errors) {
          errors.push({
            stage: 'semantic',
            code: 'SEM-001',
            message: `Validación de esquema: ${translateAjvError(err)} en la ruta '${err.instancePath || '/'}'`,
            line: 1,
          });
        }
      }
    } catch (err) {
      errors.push({
        stage: 'semantic',
        code: 'SEM-998',
        message: `Error de validación de esquema: ${err instanceof Error ? err.message : String(err)}`,
        line: 1,
      });
    }
  }

  // Evaluación mediante estrategias personalizadas
  const nodesWithPaths: { node: ASTNode; path: string[] }[] = [];
  collectNodesWithPaths(ast, [], nodesWithPaths);

  for (const { node, path } of nodesWithPaths) {
    for (const rule of allRules) {
      try {
        rule.validate(node, path, errors);
      } catch (err) {
        errors.push({
          stage: 'semantic',
          code: 'SEM-999',
          message: `Error interno en la regla '${rule.name}': ${err instanceof Error ? err.message : String(err)}`,
          line: node.line,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Recorre recursivamente el árbol AST para recolectar nodos junto con su ruta estructural de objetos.
 */
function collectNodesWithPaths(
  node: ASTNode,
  currentPath: string[],
  result: { node: ASTNode; path: string[] }[]
): void {
  const newPath = node.key ? [...currentPath, node.key] : currentPath;
  result.push({ node, path: newPath });

  if (node.children) {
    for (const child of node.children) {
      collectNodesWithPaths(child, newPath, result);
    }
  }
}


