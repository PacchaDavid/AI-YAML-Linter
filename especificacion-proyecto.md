# Especificación técnica: Linter de configuración YAML con explicación asistida por LLM

## 1. Propósito

Sistema que analiza archivos de configuración YAML en tres etapas independientes (léxica, sintáctica, semántica), detecta errores en cada etapa y, cuando encuentra un error, genera una explicación concisa en lenguaje natural usando un LLM local (Ollama) sobre qué está mal y cómo corregirlo.

Cada etapa del análisis corre en su propio contenedor Docker, comunicándose por HTTP. Es una decisión pedagógica deliberada (aprobada por el profesor): simular una arquitectura distribuida de microservicios para practicar patrones de diseño, resiliencia entre servicios y contenerización, aunque en un sistema de producción real este pipeline correría en un solo proceso.

## 2. Alcance funcional

El sistema debe:

1. Recibir un archivo YAML como entrada (vía CLI).
2. **Etapa léxica (Lexer):** tokenizar el contenido crudo, detectando errores léxicos (caracteres inválidos, indentación inconsistente, tabs mezclados con espacios).
3. **Etapa sintáctica (Parser):** construir un AST a partir de los tokens, detectando errores de estructura (llaves sin cerrar, indentación que rompe la jerarquía, listas mal formadas).
4. **Etapa semántica (Semantic Analyzer):** validar el AST contra un esquema de configuración esperado (tipos de datos incorrectos, campos requeridos ausentes, valores fuera de rango, referencias cruzadas inválidas entre claves).
5. Si cualquier etapa produce errores, detener el pipeline en ese punto (no tiene sentido analizar semánticamente algo que no parseó) y enviar cada error al servicio de explicación.
6. **Servicio de explicación:** para cada error, generar una explicación breve (máx. 2-3 frases) y una sugerencia de corrección, usando un modelo LLM corriendo localmente vía Ollama.
7. Cachear explicaciones para errores con la misma "firma" (mismo tipo + misma regla violada) para no volver a consultar al LLM.
8. Si el servicio de explicación no está disponible (Ollama caído o tarda demasiado), el sistema debe seguir funcionando y devolver el error técnico sin explicación enriquecida, en vez de fallar por completo.
9. Presentar al usuario final: lista de errores con etapa de origen, línea/columna, mensaje técnico y explicación en lenguaje natural (si estuvo disponible).

## 3. Fuera de alcance (explícitamente)

- No se soporta corrección automática de errores (solo diagnóstico).
- No se valida contra múltiples formatos (solo YAML; JSON/TOML quedan como extensión futura posible).
- No se requiere autenticación ni multiusuario — es una herramienta de línea de comandos de un solo usuario.
- No se requiere escalado horizontal real de los servicios (es una simulación de microservicios con fines de aprendizaje).

## 4. Componentes del sistema

| Componente | Responsabilidad | Contenedor propio |
|---|---|---|
| CLI / Cliente | Recibe la ruta del archivo, invoca al Orchestrator, muestra resultados formateados | No (corre local o junto al Orchestrator) |
| Orchestrator | Coordina la llamada secuencial entre Lexer → Parser → Semantic Analyzer → Explainer; aplica resiliencia (circuit breaker) por cada llamada | Sí |
| Servicio Lexer | Tokeniza el YAML crudo; detecta errores léxicos | Sí |
| Servicio Parser | Construye el AST a partir de tokens; detecta errores sintácticos | Sí |
| Servicio Semantic Analyzer | Valida el AST contra reglas/esquema; detecta errores semánticos | Sí |
| Servicio Explainer | Recibe un error, consulta al LLM (Ollama) o la cache, devuelve explicación | Sí |
| Ollama | Motor de LLM local, expone API HTTP para generación de texto | Sí (imagen oficial) |
| Cache (Redis) | Almacena explicaciones ya generadas, indexadas por firma del error | Sí (imagen oficial) |

## 5. Contratos de datos entre componentes (resumen conceptual)

- **Lexer recibe:** texto crudo del YAML → **devuelve:** lista de tokens + lista de errores léxicos (cada uno con línea, columna, mensaje).
- **Parser recibe:** lista de tokens → **devuelve:** AST (árbol de nodos con tipo, clave, valor, hijos, línea) + lista de errores sintácticos.
- **Semantic Analyzer recibe:** AST → **devuelve:** resultado de validez (booleano) + lista de errores semánticos (cada uno con código de regla violada).
- **Explainer recibe:** un error individual (etapa de origen, código, mensaje, línea) → **devuelve:** texto de explicación en lenguaje natural.
- Todos los errores comparten una forma común: `{ stage, code, message, line, column? }` — esto permite que el Orchestrator los trate de manera uniforme sin importar de qué etapa vinieron.

## 6. Requisitos no funcionales

- **Resiliencia:** ninguna falla de un servicio downstream (especialmente Ollama) debe tumbar el sistema completo; debe degradar con gracia (fallback sin explicación).
- **Rendimiento percibido:** las explicaciones repetidas para el mismo tipo de error no deben re-consultar al LLM (uso obligatorio de cache).
- **Extensibilidad:** debe ser posible reemplazar Ollama por otro proveedor de LLM sin modificar la lógica de negocio de ninguna etapa (aislamiento mediante interfaz/puerto).
- **Observabilidad mínima:** cada servicio debe loguear las peticiones que recibe y su resultado (éxito/error) para poder depurar el pipeline distribuido.
- **Portabilidad:** todo el sistema debe levantarse con un solo comando (`docker compose up`), sin configuración manual adicional.

## 7. Patrones de diseño requeridos (y dónde aplican)

| Patrón | Dónde se aplica | Motivo |
|---|---|---|
| Chain of Responsibility | Conceptual, en la secuencia de llamadas del Orchestrator (Lexer → Parser → Semantic) | El pipeline se detiene apenas una etapa produce errores |
| Facade | Orchestrator | Oculta al cliente la complejidad de coordinar 4 servicios |
| Adapter | Cliente HTTP de cada servicio dentro del Orchestrator; cliente de Ollama dentro del Explainer | Aísla la lógica de negocio del protocolo de comunicación concreto |
| Strategy | Reglas de validación semántica intercambiables dentro del Semantic Analyzer | Permite agregar/quitar reglas sin modificar el motor de validación |
| Circuit Breaker | Cada llamada saliente del Orchestrator hacia los demás servicios; llamada del Explainer hacia Ollama | Evita fallas en cascada cuando un servicio está caído o lento |
| Decorator | Envoltura de cache alrededor de la llamada al LLM en el Explainer | Añade cacheo sin modificar la lógica de generación del LLM |
| Repository | Acceso a la cache de explicaciones (Redis) | Abstrae el mecanismo de persistencia de la lógica de negocio |
| Builder | Construcción del reporte final de errores mostrado al usuario | El reporte tiene muchos campos opcionales según la etapa de origen |
| Factory Method | Creación del parser/tokenizador si se contemplara soporte a más de un formato | Extensibilidad futura sin tocar el código cliente |

## 8. Stack tecnológico

- **Lenguaje:** TypeScript (Node.js) en los 5 servicios (Orchestrator, Lexer, Parser, Semantic Analyzer, Explainer).
- **Framework HTTP:** Express (o Fastify) para exponer endpoints simples en cada servicio.
- **Parsing YAML base:** librería `yaml` (para apoyo en la tokenización/parsing, sin delegar toda la lógica).
- **Validación de esquema:** `ajv` para reglas semánticas basadas en JSON Schema.
- **LLM local:** Ollama (imagen oficial `ollama/ollama`), modelo ligero (ej. `llama3.2` o `phi3`).
- **Cache compartida:** Redis (imagen oficial `redis:7-alpine`).
- **Contenerización:** Docker + Docker Compose, un `Dockerfile` por servicio.
- **Testing:** Vitest, con dobles de prueba (mocks) para las interfaces de cada puerto — el objetivo es poder testear el pipeline sin levantar Ollama ni Redis.

## 9. Criterios de aceptación

- El sistema procesa un YAML válido y reporta "sin errores".
- El sistema detecta al menos un error representativo por cada etapa (léxico, sintáctico, semántico) y lo reporta con su explicación generada por el LLM.
- Si se detiene el contenedor de Ollama, el sistema sigue reportando errores técnicos (sin explicación LLM) en vez de fallar.
- Los errores del mismo tipo no generan una nueva consulta al LLM la segunda vez (verificable por logs o tiempos de respuesta).
- Todo el sistema levanta con `docker compose up` sin pasos manuales adicionales.
