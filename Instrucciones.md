# 📖 Instrucciones de Ejecución — AI-YAML-Linter

Este documento contiene las instrucciones detalladas para instalar, ejecutar y probar el proyecto **AI-YAML-Linter** en la terminal y en la Web UI.

---

## 🌐 Dirección / IP del Frontend (Web UI)

El Frontend está mapeado al puerto **5000**. Puedes acceder desde cualquier navegador en las siguientes direcciones:

- **Localhost:** [http://localhost:5000](http://localhost:5000)
- **IP Loopback:** `http://127.0.0.1:5000`

---

## 🚀 Guía Paso a Paso para la Terminal

### 1. Instalación de Dependencias

Ejecuta el siguiente comando en la raíz del proyecto para instalar las dependencias en todos los microservicios y la CLI:

```bash
npm run install:all
```

*(Opcional)* Puedes verificar los tipos de TypeScript y ejecutar las pruebas unitarias:
```bash
npm run typecheck:all
npm run test:all
```

---

### 2. Levantar el Sistema Completo (Docker Compose)

Para construir e iniciar los 8 contenedores de la arquitectura de microservicios (Orchestrator, Lexer, Parser, Semantic Analyzer, Explainer, Web UI, Redis y Ollama):

```bash
npm run docker:up
```
*(Equivale a `docker compose up --build -d`)*

Para ver los logs de los contenedores en tiempo real:
```bash
npm run docker:logs
```

> ℹ️ **Nota:** Durante la primera ejecución, Ollama descargará el modelo `qwen:0.5b` (~400 MB). Espera a que los contenedores estén completamente iniciados antes de realizar pruebas.

---

### 3. Analizar Archivos YAML desde la CLI

Una vez que los servicios estén arriba y saludables, puedes ejecutar la CLI para analizar archivos YAML de ejemplo:

- **Archivo Válido (sin errores):**
  ```bash
  cd cli && npx tsx src/index.ts --file ../examples/valid.yaml
  ```

- **Archivo con Error Léxico (tabs + espacios):**
  ```bash
  cd cli && npx tsx src/index.ts --file ../examples/lexical-error.yaml
  ```

- **Archivo con Error Sintáctico (falta colon `:`):**
  ```bash
  cd cli && npx tsx src/index.ts --file ../examples/syntax-error.yaml
  ```

- **Archivo con Error Semántico (valor fuera de rango):**
  ```bash
  cd cli && npx tsx src/index.ts --file ../examples/semantic-error.yaml
  ```

---

### 4. Usar la Web UI (Interfaz Gráfica)

1. Abre tu navegador e ingresa a `http://localhost:5000`.
2. Pega tu contenido YAML en el editor o carga un archivo.
3. Haz clic en el botón **▶ Analizar** para visualizar los tokens, el AST y las explicaciones generadas por el LLM en tiempo real.

---

## 🧪 Ejemplos YAML para Copiar y Pegar en la Web UI

Puedes copiar cualquiera de los siguientes bloques y pegarlos directamente en el editor del analizador web (`http://localhost:5000`):

### 🟢 Ejemplo 1: Configuración Válida (Sin Errores)
```yaml
# Configuración válida de prueba
version: "1.0"
name: my-app

server:
  port: 8080
  host: localhost
  debug: false
  timeout: 30

database:
  host: db.example.com
  port: 5432
  name: mydb
  user: admin
  password: secret123

logging:
  level: info
  file: /var/log/app.log

features:
  enabled: true
  maxItems: 100
```

---

### 🔴 Ejemplo 2: Error Léxico (`LEX-001` — Tabuladores mezclados con espacios)
> *Nota: YAML no permite tabulaciones (`\t`) para indentar.*
```yaml
# Error léxico: tabulación antes de 'age'
name: test
	age: 25
active: yes
```

---

### 🔴 Ejemplo 3: Error Sintáctico (`PAR-002` — Falta `:` en una clave)
```yaml
# Error sintáctico: falta ':' después de 'server'
name: test
server
  port: 8080
```

---

### 🔴 Ejemplo 4: Error Semántico (`SEM-002` — Puerto fuera de rango / tipo inválido)
```yaml
# Error semántico: puerto > 65535 y booleano inválido
name: test
port: 99999
debug: maybe
count: hello
```

---

## ⚡ Prueba de Resiliencia: Cómo Simular y Activar el Circuit Breaker

El **Circuit Breaker** no se activa por la sintaxis de un archivo YAML, sino por **fallos de infraestructura o caídas de microservicios**.

Sigue estos pasos para forzar y demostrar la activación del Circuit Breaker en vivo:

### 1. Simular la caída de un microservicio
Apaga voluntariamente el microservicio del Explainer o de Ollama:
```bash
docker compose stop explainer
```

### 2. Enviar 3 peticiones de prueba
Envía un archivo con error (ej. `examples/lexical-error.yaml`) 3 veces seguidas desde la Web UI o la CLI.

### 3. Observar la activación del Circuit Breaker
- A la **3ª petición fallida**, el estado del cortacircuito pasará de `closed` a **`open`**.
- El sistema responderá inmediatamente con una solución degradada (*fallback*) sin colapsar la aplicación.
- Puedes verificar los logs con `npm run docker:logs`:
  ```text
  [CB] Call failed: connect ECONNREFUSED
  [CB] Opening circuit after 3 failures
  [CB] Circuit OPEN, using fallback
  ```

### 4. Recuperación del servicio
Vuelve a encender el contenedor:
```bash
docker compose start explainer
```
Tras 10 segundos, el Circuit Breaker cambiará a estado **`half-open`** (prueba de recuperación) y al tener éxito volverá a **`closed`**, funcionando normalmente.

---

### 5. Detener el Sistema

Para apagar y eliminar los contenedores creados por Docker Compose:

```bash
npm run docker:down
```

---

## 📋 Resumen Rápido de Comandos

```bash
# 1. Instalar todo
npm run install:all

# 2. Levantar microservicios
npm run docker:up

# 3. Analizar YAML desde la CLI
cd cli && npx tsx src/index.ts --file ../examples/valid.yaml

# 4. Probando Circuit Breaker (simular caída)
docker compose stop explainer
# (hacer 3 peticiones y luego encenderlo de nuevo)
docker compose start explainer

# 5. Apagar los microservicios
npm run docker:down
```
