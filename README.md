# 🧪 YAML Linter — Analizador de Configuración YAML con Explicaciones Asistidas por LLM

![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)
![Node](https://img.shields.io/badge/Node-20-green)
![License](https://img.shields.io/badge/license-MIT-green)

Sistema distribuido que analiza archivos **YAML** en tres etapas independientes (léxica, sintáctica y semántica), detecta errores en cada etapa y genera explicaciones en lenguaje natural usando un **LLM local (Ollama + qwen2.5:0.5b)**. Incluye una **interfaz web** (Web UI) para analizar archivos YAML desde el navegador.

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
- [Uso de Ollama Local](#-uso-de-ollama-local-instalado-en-el-sistema-operativo)
- [Uso de la CLI](#-uso-de-la-cli)
- [Web UI](#-web-ui)
- [Ejemplos](#-ejemplos)
- [Desarrollo Local](#-desarrollo-local)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Códigos de Error](#-códigos-de-error)
- [Resiliencia](#-resiliencia)
- [Licencia](#-licencia)

---

## 🏗️ Arquitectura

```
┌────────────────────────┐   ┌──────────────────────────────────────┐
│        CLI              │   │             WEB UI                    │
│ (node cli/...)          │   │ (services/web-ui, puerto 5000)        │
└───────────┬─────────────┘   └───────────────┬──────────────────────┘
            │ POST /analyze { content }        │  POST /analyze (proxy)
            │                                  │
            └───────────────┬──────────────────┘
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

El **Orchestrator** coordina el pipeline secuencial: **Lexer → Parser → Semantic Analyzer**. Si cualquiera de las etapas detecta errores, el pipeline se detiene inmediatamente y los errores se envían al **Explainer** para generar explicaciones. Tanto la **CLI** como la **Web UI** consumen el endpoint `/analyze` del Orchestrator.

---

## 🧩 Componentes

| Componente | Puerto | Responsabilidad | Contenedor |
|---|---|---|---|
| **Lexer** | `4001` | Tokeniza el YAML crudo; detecta caracteres inválidos, indentación mixta (tabs+espacios), indentación inconsistente | Docker |
| **Parser** | `4002` | Construye un AST a partir de los tokens; detecta errores de estructura (llaves sin cerrar, indentación jerárquica rota, listas mal formadas) | Docker |
| **Semantic Analyzer** | `4003` | Valida el AST contra un esquema JSON (ajv) y reglas personalizadas (tipos incorrectos, valores fuera de rango, claves duplicadas, valores vacíos, convenciones de nombres) | Docker |
| **Explainer** | `4004` | Recibe errores, consulta al LLM (Ollama) o al caché (Redis) y devuelve explicaciones en lenguaje natural | Docker |
| **Orchestrator** | `4000` | Coordina el pipeline; aplica Circuit Breaker en cada llamada; enriquece errores con explicaciones; expone `/analyze` | Docker |
| **Web UI** | `5000` | Interfaz web (Express + estáticos) que consume el endpoint `/analyze` del Orchestrator | Docker |
| **Redis** | `6379` | Cachea explicaciones para evitar re-consultar al LLM por errores repetidos | Docker (oficial) |
| **Ollama** | `11434` | Motor de LLM local con modelo `qwen2.5:0.5b` para generación de explicaciones | Host (OS) |
| **CLI** | — | Interfaz de línea de comandos para el usuario final | No requiere contenedor |

> El `docker-compose.yml` define **7 servicios**: `redis`, `lexer`, `parser`, `semantic-analyzer`, `explainer`, `orchestrator` y `web-ui`.

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
| **LLM local** | Ollama + modelo `qwen2.5:0.5b` |
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

> [!IMPORTANT]
> El sistema está configurado para utilizar la instancia de **Ollama instalada localmente en tu sistema operativo** en lugar de una dockerizada, permitiendo un uso más eficiente de recursos de GPU y VRAM. Antes de levantar Docker, asegúrate de realizar la configuración de red y firewall descrita en [Uso de Ollama Local](#-uso-de-ollama-local-instalado-en-el-sistema-operativo).

```bash
# Construir y levantar todos los servicios en Docker
npm run docker:up
# Equivalente a: docker compose up --build -d

# Ver los logs
npm run docker:logs

# Esperar a que todos los servicios estén saludables
```

---

## 🦙 Uso de Ollama Local (Instalado en el Sistema Operativo)

Para evitar duplicar recursos (memoria RAM/VRAM) y aprovechar la aceleración por hardware (GPU/CUDA) ya configurada en el OS, este sistema se conecta directamente a la instancia de **Ollama** nativa del Host.

### 🐧 Configuración en Linux (ej. CachyOS, Arch, Ubuntu, Debian)

Por defecto, Ollama en Linux corre bajo `systemd` y solo escucha peticiones de la dirección de bucle local `127.0.0.1`. Para permitir que los contenedores de Docker se comuniquen con Ollama en el Host, sigue estos pasos:

1. **Permitir que Ollama escuche en todas las interfaces (`0.0.0.0`):**
   Crea una anulación de configuración en el servicio systemd de Ollama:
   ```bash
   sudo mkdir -p /etc/systemd/system/ollama.service.d
   echo -e "[Service]\nEnvironment=\"OLLAMA_HOST=0.0.0.0\"" | sudo tee /etc/systemd/system/ollama.service.d/override.conf
   ```

2. **Permitir acceso en el cortafuegos (UFW) si está activo:**
   UFW suele bloquear las conexiones desde el puente de Docker hacia los puertos del Host. Abre el puerto de Ollama (`11434`) para el rango privado de Docker:
   ```bash
   sudo ufw allow from 172.16.0.0/12 to any port 11434 proto tcp
   sudo ufw reload
   ```

3. **Recargar systemd y reiniciar Ollama:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart ollama
   ```

4. **Verificar que escuche correctamente:**
   ```bash
   ss -tulpn | grep 11434
   # Debería mostrar *:11434 o 0.0.0.0:11434 en lugar de 127.0.0.1:11434
   ```

5. **Asegurar que el modelo esté descargado en el Host:**
   ```bash
   ollama pull qwen2.5:0.5b
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

## 🌐 Web UI

Además de la CLI, el proyecto incluye una **interfaz web** servida por el servicio `web-ui` (puerto `5000`). Una vez que los contenedores están levantados, abre:

```
http://localhost:5000
```

El frontend (HTML estático en `services/web-ui/src/public/index.html`) permite pegar o cargar un archivo YAML y enviarlo al Orchestrator a través del endpoint `/analyze`, mostrando los errores y sus explicaciones en el navegador.

> La Web UI requiere que el servicio `orchestrator` esté saludable (declarado vía `depends_on` en `docker-compose.yml`).

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
│   ├── orchestrator/src/         # Servicio orquestador
│   └── web-ui/src/               # Interfaz web (servidor Express + público)
│       ├── index.ts              # Punto de entrada de la Web UI
│       └── public/index.html    # Frontend estático
├── cli/src/                      # Interfaz de línea de comandos
│   └── index.ts                  # Punto de entrada CLI
└── tests/                        # Pruebas end-to-end
    └── e2e.test.ts               # Levanta Docker Compose y valida el pipeline
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
- Cada llamada saliente (Orchestrator → Lexer/Parser/Semantic/Explainer; Explainer → Ollama/Redis) está protegida por un **Circuit Breaker**
- La configuración se define por variables de entorno y **difiere por servicio** (ver `docker-compose.yml`):
  - **Orchestrator**: abre tras `3` fallos consecutivos, reset tras `10000` ms
  - **Explainer**: abre tras `5` fallos consecutivos, reset tras `30000` ms
- Si un servicio falla el umbral configurado, el circuito se **abre** y las llamadas subsiguientes usan un **fallback inmediato** sin intentar la conexión
- Tras el tiempo de reset, el circuito pasa a **half-open** y prueba una llamada para verificar la recuperación

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

### Tests unitarios por servicio

```bash
# Tests del Lexer
cd services/lexer && npx vitest run

# Tests del Parser
cd services/parser && npx vitest run

# Tests del Semantic Analyzer
cd services/semantic-analyzer && npx vitest run

# Tests del Explainer con mocks
cd services/explainer && npx vitest run

# Tests del Orchestrator con mocks
cd services/orchestrator && npx vitest run

# O todos a la vez (desde la raíz)
npm run test:all
```

### Pruebas end-to-end (e2e)

El directorio `tests/` contiene `e2e.test.ts`, que levanta el stack completo con **Docker Compose** y valida el pipeline completo (léxico → sintáctico → semántico → explicaciones) contra los archivos de `examples/`.

```bash
# Requiere Docker y Docker Compose disponibles
npm run test:e2e
# Equivalente a: cd tests && npm install && npx vitest run
```

---

## 🩺 Troubleshooting de Ollama y Redes

### Error: El Explainer responde con explicaciones genéricas técnicas (`[TECHNICAL] ...`)

Causa probable: El contenedor `yaml-lint-explainer` no se puede conectar al puerto de Ollama en el Host (problema de red, cortafuegos o dirección de escucha).

#### 1. Verificar conectividad desde el contenedor Docker
Ejecuta la siguiente prueba de conexión HTTP directa desde el contenedor para ver el error exacto:
```bash
docker exec yaml-lint-explainer node -e "fetch('http://host.docker.internal:11434/api/tags').then(r => r.json()).then(console.log).catch(console.error)"
```

* **Si lanza `ConnectTimeoutError` (Timeout):** El cortafuegos (ej. UFW o firewalld) está bloqueando la comunicación. Asegúrate de añadir la regla de red correspondiente para el rango `172.16.0.0/12`.
* **Si lanza `ECONNREFUSED`:** Ollama no está corriendo, o sigue escuchando solo en `127.0.0.1`. Asegúrate de aplicar la configuración de `OLLAMA_HOST=0.0.0.0` y reiniciar el servicio systemd.

#### 2. Verificar que Ollama escuche en la interfaz correcta
En el host, ejecuta:
```bash
ss -tulpn | grep 11434
```
Debe listar `*:11434` o `0.0.0.0:11434`. Si muestra `127.0.0.1:11434`, la configuración en el paso 1 de [Uso de Ollama Local](#-uso-de-ollama-local-instalado-en-el-sistema-operativo) no se aplicó correctamente.

#### 3. Verificar estado del servicio y modelos en el host
```bash
# Comprobar estado del servicio
systemctl status ollama

# Comprobar que el modelo esté descargado
ollama list
# Debe listar: qwen2.5:0.5b
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
