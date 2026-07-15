# 🧪 YAML Linter — Analizador de Configuración YAML con Explicaciones Asistidas por LLM

![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)
![Node](https://img.shields.io/badge/Node-20-green)
![License](https://img.shields.io/badge/license-MIT-green)

Sistema distribuido que analiza archivos **YAML** en tres etapas independientes (léxica, sintáctica y semántica), detecta errores en cada etapa y genera explicaciones en lenguaje natural usando un **LLM local (Ollama + qwen:0.5b)**.

> Arquitectura de microservicios simulada con fines pedagógicos — **8 patrones de diseño** implementados.

---

## 📋 Tabla de Contenidos

- [Arquitectura](#-arquitectura)
- [Componentes](#-componentes)
- [Pipeline de Análisis](#-pipeline-de-análisis)
- [Patrones de Diseño](#-patrones-de-diseño)
- [Stack Tecnológico](#-stack-tecnológico)
- [Requisitos](#-requisitos)
- [Instalación y Uso Rápido](#-instalación-y-uso-rápido)
- [Uso de la CLI](#-uso-de-la-cli)
- [Ejemplos](#-ejemplos)
- [Desarrollo Local](#-desarrollo-local)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Códigos de Error](#-códigos-de-error)
- [Resiliencia](#-resiliencia)
- [Licencia](#-licencia)

---

## 🏗️ Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│                           CLI                                │
│                   (node src/index.ts)                        │
└────────────────────────┬─────────────────────────────────────┘
                         │ POST /analyze { content }
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR (puerto 4000)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌─────────┐ │
│  │ Circuit  │  │ Circuit  │  │   Circuit    │  │ Circuit │ │
│  │ Breaker  │  │ Breaker  │  │   Breaker    │  │ Breaker │ │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  └────┬────┘ │
└───────┼──────────────┼───────────────┼───────────────┼───────┘
        │              │               │               │
        ▼              ▼               ▼               ▼
┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌──────────┐
│  LEXER   │   │  PARSER  │   │   SEMANTIC   │   │EXPLAINER │
│ :4001    │──▶│ :4002    │──▶│ :4003        │   │ :4004    │
│Tokeniza  │   │Construye │   │Valida contra │   │          │
│YAML crudo│   │AST       │   │esquema +     │   │  ┌──────┐│
│          │   │          │   │reglas custom  │   │  │CACHE ││
│          │   │          │   │              │   │  │Redis ││
│          │   │          │   │              │   │  └──┬───┘│
└──────────┘   └──────────┘   └──────────────┘   │     │    │
                                                  │  ┌──┴───┐│
                                                  │  │OLLAMA││
                                                  │  │LLM   ││
                                                  │  └──────┘│
                                                  └──────────┘
```

El **Orchestrator** coordina el pipeline secuencial: **Lexer → Parser → Semantic Analyzer**. Si cualquiera de las etapas detecta errores, el pipeline se detiene inmediatamente y los errores se envían al **Explainer** para generar explicaciones.

---

## 🧩 Componentes

| Componente | Puerto | Responsabilidad | Contenedor |
|---|---|---|---|
| **Lexer** | `4001` | Tokeniza el YAML crudo; detecta caracteres inválidos, indentación mixta (tabs+espacios), indentación inconsistente | Docker |
| **Parser** | `4002` | Construye un AST a partir de los tokens; detecta errores de estructura (llaves sin cerrar, indentación jerárquica rota, listas mal formadas) | Docker |
| **Semantic Analyzer** | `4003` | Valida el AST contra un esquema JSON (ajv) y reglas personalizadas (tipos incorrectos, valores fuera de rango, claves duplicadas, valores vacíos, convenciones de nombres) | Docker |
| **Explainer** | `4004` | Recibe errores, consulta al LLM (Ollama) o al caché (Redis) y devuelve explicaciones en lenguaje natural | Docker |
| **Orchestrator** | `4000` | Coordina el pipeline; aplica Circuit Breaker en cada llamada; enriquece errores con explicaciones | Docker |
| **Redis** | `6379` | Cachea explicaciones para evitar re-consultar al LLM por errores repetidos | Docker (oficial) |
| **Ollama** | `11434` | Motor de LLM local con modelo `qwen:0.5b` para generación de explicaciones | Docker (oficial) |
| **CLI** | — | Interfaz de línea de comandos para el usuario final | No requiere contenedor |

---

## 🔄 Pipeline de Análisis

El análisis sigue una **Chain of Responsibility** — cada etapa se ejecuta secuencialmente y el pipeline se detiene en cuanto se detecta un error:

```
YAML Crudo
    │
    ▼
┌─────────────────────────────────────────────┐
│            ETAPA LÉXICA (Lexer)              │
│  • Tokeniza el contenido                     │
│  • Detecta: caracteres inválidos,           │
│    tabs+espacios mixtos, indentación        │
│    inconsistente                            │
│  ✅ Sin errores → continúa al Parser        │
│  ❌ Con errores → se detiene aquí           │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│          ETAPA SINTÁCTICA (Parser)           │
│  • Construye AST desde tokens               │
│  • Detecta: estructura mal formada,         │
│    colones faltantes, tokens inesperados    │
│  ✅ Sin errores → continúa al Semantic      │
│  ❌ Con errores → se detiene aquí           │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│         ETAPA SEMÁNTICA (Analyzer)           │
│  • Valida contra esquema JSON (ajv)         │
│  • Reglas Strategy: tipos, rangos,          │
│    duplicados, valores vacíos, nombres      │
│  ✅ Sin errores → resultado: VÁLIDO         │
│  ❌ Con errores → se reportan               │
└─────────────────────────────────────────────┘
    │
    ▼
  Los errores detectados (de cualquier etapa)
  se envían al EXPLAINER para generar
  explicaciones en lenguaje natural
```

---

## 🎯 Patrones de Diseño

El proyecto implementa **8 patrones de diseño** como requisito pedagógico:

| Patrón | Ubicación | Propósito |
|---|---|---|
| **Chain of Responsibility** | `orchestrator.ts` — pipeline secuencial | El pipeline se detiene cuando una etapa produce errores |
| **Facade** | `orchestrator/index.ts` — endpoint `/analyze` | Oculta al CLI la complejidad de coordinar 4 servicios |
| **Adapter** | `orchestrator/index.ts` — wrappers HTTP; `ollama-client.ts` — cliente HTTP | Aísla la lógica de negocio del protocolo de comunicación |
| **Strategy** | `semantic-analyzer.ts` — `ValidationRule[]` | Permite agregar/quitar reglas de validación sin modificar el motor |
| **Circuit Breaker** | `circuit-breaker.ts` (orchestrator + explainer) | Evita fallos en cascada cuando un servicio está caído o lento |
| **Decorator** | `explainer.ts` — cache envuelve llamada al LLM | Añade caché sin modificar la lógica de generación del LLM |
| **Repository** | `cache.ts` — `CacheRepository` interface | Abstrae el mecanismo de persistencia (Redis) de la lógica de negocio |
| **Builder** | `orchestrator.ts` — `ErrorReportBuilder` | Construye el reporte final de errores con campos opcionales |

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Lenguaje** | TypeScript 5.4 (Node.js 20) |
| **Framework HTTP** | Express.js |
| **Validación de esquema** | ajv (JSON Schema) |
| **LLM local** | Ollama + modelo `qwen:0.5b` |
| **Cache** | Redis 7 Alpine |
| **Contenerización** | Docker + Docker Compose |
| **Testing** | Vitest |

---

## 📋 Requisitos

- **Docker** + **Docker Compose** (para ejecutar todos los servicios)
- **Node.js 20+** (para ejecutar la CLI sin Docker)
- **Al menos 4 GB RAM** (recomendado 8 GB para ejecutar todos los servicios con margen)
- **Conexión a internet** (solo la primera vez para descargar imágenes Docker y el modelo LLM)

---

## 🚀 Instalación y Uso Rápido

### 1. Clonar e instalar dependencias

```bash
# Desde la raíz del repositorio

# Instalar dependencias de todos los servicios
npm run install:all

# Verificar TypeScript
npm run typecheck:all

# Ejecutar todos los tests
npm run test:all
```

### 2. Levantar los servicios con Docker Compose

```bash
# Construir y levantar todos los servicios
npm run docker:up
# Equivalente a: docker compose up --build -d

# Ver los logs
npm run docker:logs

# Esperar a que todos los servicios estén saludables
# (la primera vez, Ollama descargará qwen:0.5b ~400MB)
```

### 3. Analizar un archivo YAML

```bash
# Usar la CLI directamente con tsx
cd cli && npx tsx src/index.ts --file ../examples/valid.yaml

# O ejecutar la CLI compilada
npm run build:all
node cli/dist/index.js --file examples/valid.yaml
```

---

## 💻 Uso de la CLI

```
📋 YAML Linter — Configuration Analysis Tool

Usage:
  yaml-lint --file <path>     Analyze a YAML file
  yaml-lint --help             Show this help message

Options:
  -f, --file <path>   Path to the YAML file to analyze
  --help              Show this help message

Environment:
  ORCHESTRATOR_URL    Orchestrator service URL (default: http://localhost:4000)
```

### Códigos de salida

| Código | Significado |
|---|---|
| `0` | YAML válido — sin errores |
| `1` | YAML inválido — errores encontrados |

### Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `ORCHESTRATOR_URL` | `http://localhost:4000` | URL del servicio Orchestrator |

---

## 📂 Ejemplos

El directorio `examples/` contiene archivos YAML de prueba para cada tipo de error:

### `valid.yaml` — Sin errores

```yaml
# Sample valid configuration
version: "1.0"
name: my-app

server:
  port: 8080
  host: localhost
  debug: false
```

**Ejecutar:**
```bash
cd cli && npx tsx src/index.ts --file ../examples/valid.yaml
```

**Salida esperada:**
```
✅ No errors found — YAML configuration is valid!
```

### `lexical-error.yaml` — Error léxico (tabs + espacios)

```yaml
# Sample with lexical errors
name: test
	age: 25  # Mixed tabs and spaces (tab before 'age')
```

**Ejecutar:**
```bash
cd cli && npx tsx src/index.ts --file ../examples/lexical-error.yaml
```

**Salida esperada:**
```
❌ Errors Found:

  1. [LEXICAL   ] LEX-001
     Location:  Line 3, Col 1
    Message:   Se mezclaron tabulaciones y espacios en la línea 3
     Fix:       [TECHNICAL] Mixed tabs and spaces detected. YAML requires consistent indentation. Use only spaces (2 spaces per level is standard).
```

### `syntax-error.yaml` — Error sintáctico (falta colon)

```yaml
# Sample with syntax errors (missing colon)
name: test
server
  port: 8080
```

**Ejecutar:**
```bash
cd cli && npx tsx src/index.ts --file ../examples/syntax-error.yaml
```

### `semantic-error.yaml` — Error semántico (valor fuera de rango)

```yaml
# Sample with semantic errors
name: test
port: 99999     # Out of range (max 65535)
debug: maybe    # Not a boolean
count: hello    # Expected number
```

**Ejecutar:**
```bash
cd cli && npx tsx src/index.ts --file ../examples/semantic-error.yaml
```

---

## 🧑‍💻 Desarrollo Local

### Scripts disponibles (desde la raíz del proyecto)

```bash
npm run install:all     # Instalar dependencias de todos los servicios
npm run build:all       # Compilar TypeScript en todos los servicios
npm run test:all        # Ejecutar todos los tests
npm run typecheck:all   # Verificar tipos en todos los servicios
npm run docker:up       # docker compose up --build -d
npm run docker:down     # docker compose down
npm run docker:logs     # docker compose logs -f
```

### Ejecutar tests individualmente

```bash
cd services/lexer && npx vitest run
cd services/parser && npx vitest run
cd services/semantic-analyzer && npx vitest run
cd services/explainer && npx vitest run
cd services/orchestrator && npx vitest run
```

### Arquitectura de servicios

Cada servicio es un microservicio independiente con su propio `package.json`, `tsconfig.json`, `Dockerfile` y tests. Los tipos compartidos están en `shared/types/`.

```
services/
├── lexer/                # Tokenización YAML
│   ├── src/
│   │   ├── index.ts      # Servidor Express
│   │   ├── lexer.ts      # Tokenizador
│   │   └── lexer.test.ts # Tests
│   ├── Dockerfile
│   └── package.json
├── parser/               # Construcción de AST
├── semantic-analyzer/    # Validación semántica
├── explainer/            # Explicaciones LLM + caché Redis
└── orchestrator/         # Coordinador del pipeline
```

---

## 📁 Estructura del Proyecto

```
project-root/
├── .env                          # Variables de entorno
├── .gitignore
├── package.json                  # Scripts raíz (test:all, docker:up, etc.)
├── README.md                     # Este archivo
├── docker-compose.yml            # 8 servicios
├── shared/
│   └── types/                    # Tipos compartidos
│       ├── error.ts              # LintError
│       ├── token.ts              # Token, TokenType
│       ├── ast.ts                # ASTNode
│       └── responses.ts          # Respuestas de servicios
├── examples/                     # Archivos YAML de ejemplo
│   ├── valid.yaml
│   ├── lexical-error.yaml
│   ├── syntax-error.yaml
│   └── semantic-error.yaml
├── services/
│   ├── lexer/src/                # Servicio de tokenización
│   ├── parser/src/               # Servicio de parsing
│   ├── semantic-analyzer/src/    # Servicio de validación semántica
│   ├── explainer/src/            # Servicio de explicaciones
│   └── orchestrator/src/         # Servicio orquestador
└── cli/src/                      # Interfaz de línea de comandos
    └── index.ts                  # Punto de entrada CLI
```

---

## 🔤 Códigos de Error

### Errores Léxicos (códigos `LEX-*`)

| Código | Descripción |
|---|---|
| `LEX-001` | Tabs y espacios mezclados en la misma línea |
| `LEX-002` | Carácter inválido en el archivo |
| `LEX-003` | Indentación inconsistente (no coincide con ningún nivel anterior) |

### Errores Sintácticos (códigos `PAR-*`)

| Código | Descripción |
|---|---|
| `PAR-001` | Token inesperado en la posición actual |
| `PAR-002` | Falta `:` después de una clave |

### Errores Semánticos (códigos `SEM-*`)

| Código | Descripción |
|---|---|
| `SEM-001` | Error de validación contra esquema JSON (ajv) |
| `SEM-002` | Tipo de dato incorrecto (se esperaba número/booleano) |
| `SEM-003` | Valor fuera de rango (puerto, porcentaje) |
| `SEM-005` | Clave duplicada en el mismo nivel |
| `SEM-006` | Clave sin valor ni hijos |
| `SEM-007` | Convención de nombres mixta (camelCase + snake_case) |
| `SEM-998` | Error interno en la validación del esquema |
| `SEM-999` | Error interno en una regla de validación |

### Ejemplo de mensaje semántico en español (AJV)

```
Validación de esquema: debe ser de tipo string en la ruta '/database/name'
```

---

## 🛡️ Resiliencia

El sistema maneja fallos de manera graceful:

### Circuit Breaker
- Cada llamada saliente del Orchestrator (hacia Lexer, Parser, Semantic, Explainer) está protegida por un **Circuit Breaker**
- Si un servicio falla 3 veces consecutivas, el circuito se **abre** y las llamadas subsiguientes usan un **fallback inmediato** sin intentar la conexión
- Después de 10 segundos, el circuito pasa a **half-open** y prueba una llamada para verificar la recuperación

### Degradación graceful
- Si **Ollama** no está disponible o tarda demasiado, el Explainer devuelve una explicación técnica sin LLM
- Si **Redis** no está disponible, el caché se degrada a **no-op** (sin almacenamiento)
- Si **cualquier servicio del pipeline** falla, el Orchestrator devuelve un error técnico en lugar de fallar completamente

### Caché de explicaciones
- Las explicaciones se cachean en Redis usando una **firma normalizada** (etapa + código + mensaje sin números)
- Errores con la misma firma no re-consultan al LLM
- TTL del caché: 1 hora

---

## 🧪 Testing

El proyecto usa **Vitest** con mocks para las dependencias externas (Redis, Ollama). Esto permite testear el pipeline completo sin levantar contenedores.

```bash
# Tests del Lexer (10 tests)
cd services/lexer && npx vitest run

# Tests del Parser (6 tests)
cd services/parser && npx vitest run

# Tests del Semantic Analyzer (7 tests)
cd services/semantic-analyzer && npx vitest run

# Tests del Explainer con mocks (3 tests)
cd services/explainer && npx vitest run

# Tests del Orchestrator con mocks (3 tests)
cd services/orchestrator && npx vitest run

# O todos a la vez
npm run test:all
```

---

## 🩺 Troubleshooting Docker

### Error: `container yaml-lint-ollama exited (2)`

Causa probable: error de sintaxis en el `entrypoint` shell de Ollama.

Verifica que en [docker-compose.yml](docker-compose.yml) el bloque de Ollama use:

```yaml
ollama rm llama3.2 2>/dev/null || true &&
```

y no una secuencia con `&&` colgando.

### Error de salud de Ollama por `wget: not found`

La imagen oficial de Ollama no incluye `wget` por defecto. El healthcheck recomendado es:

```yaml
healthcheck:
  test: ["CMD-SHELL", "ollama list | grep -q 'qwen:0.5b'"]
```

### Reaplicar configuración y recrear servicios

```bash
docker compose up --build -d
docker compose up -d --force-recreate ollama
docker compose ps
```

---

## 📄 Licencia

MIT

---

## ✨ Funcionalidades Futuras (Fuera de Alcance)

- **Corrección automática** de errores (actualmente solo diagnóstico)
- **Soporte para múltiples formatos** (JSON, TOML)
- **Autenticación y multiusuario**
- **Escalado horizontal** real de los servicios
