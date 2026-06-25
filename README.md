# KIKA API

API de tutor conversacional para cursos. Recibe preguntas de estudiantes, recupera contexto documental desde Qdrant y genera respuestas pedagogicas en espanol con OpenAI. Tambien permite mantener conversaciones con historial por usuario, generar resumenes, examenes y ejercicios, y administrar colecciones documentales en Qdrant.

## Funcionalidades

- Tutor sin memoria mediante `POST /api/tutor/ask`.
- Conversaciones persistidas con historial mediante `/api/tutor/conversations`.
- Separacion de conversaciones por usuario con la cabecera `x-user-id`.
- Recuperacion de contexto desde colecciones de Qdrant.
- Respuestas generadas con OpenAI.
- Busqueda web opcional con Perplexity Sonar.
- Generacion de resumenes, examenes y ejercicios desde una conversacion.
- Administracion de colecciones y ficheros en Qdrant.
- Persistencia en MongoDB.
- Autenticacion por token, validacion de entradas, rate limiting, CORS y cabeceras de seguridad.

## Requisitos

- Node.js compatible con modulos ES.
- pnpm.
- MongoDB.
- Qdrant.
- API key de OpenAI.
- Token de acceso para consumir la API.

## Instalacion

```bash
pnpm install
```

## Configuracion

Copia el archivo de ejemplo y completa las credenciales reales:

```bash
cp .env.example .env
```

Variables principales:

```env
PORT=3000
NODE_ENV=development
CORS_ALLOWED_ORIGINS=https://moodle.example

MONGO_URI=mongodb://localhost:2017/tutor_db

OPENAI_API_KEY=tu_api_key_aqui
OPENAI_CHAT_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=tu_qdrant_key_si_tiene

PERPLEXITY_API_KEY=
PERPLEXITY_MODEL=sonar

AUTH_MODE=legacy
API_KEY=clave_estatica_solo_para_transicion
JWT_ISSUER=kika-token-service
JWT_AUDIENCE=kika-api
JWT_MAX_TTL_SECONDS=31622400
JWT_CLOCK_TOLERANCE_SECONDS=30
JWT_PUBLIC_KEYS_JSON={"kika-2026-01":"<clave_publica_pem_codificada_en_base64>"}
```

Consulta `.env.example` para ver el resto de limites de contexto, cache, subida de ficheros, rate limiting y pruebas.

## Autenticacion y token

Para usar la API se necesita un token de acceso. Todas las peticiones deben enviarlo en la cabecera:

```http
Authorization: Bearer <token>
```

El token debe tratarse como un secreto: no lo subas al repositorio, no lo incluyas en tickets publicos y no lo compartas en capturas. Si caduca o se filtra, solicita uno nuevo al administrador de la API.

La API permite tres modos de autenticacion durante una migracion:

- `legacy`: acepta `x-api-key`.
- `hybrid`: acepta `Authorization: Bearer <token>` y temporalmente `x-api-key`.
- `jwt`: acepta solo `Authorization: Bearer <token>`.

El modo recomendado para clientes nuevos es usar siempre `Authorization: Bearer <token>`.

Los endpoints conversacionales requieren ademas la cabecera:

```http
x-user-id: usuario_123
```

`Authorization` identifica al cliente que consume la API. `x-user-id` identifica al usuario final y separa sus conversaciones.

## Ejecucion

Desarrollo:

```bash
pnpm dev
```

Produccion:

```bash
pnpm start
```

Comprobacion de sintaxis:

```bash
pnpm run check
```

## Pruebas

```bash
pnpm run test:unit
pnpm run test:integration
pnpm run test:coverage
pnpm run test:all
```

La configuracion de MongoDB/Qdrant para pruebas, la matriz automatizada y la checklist manual del frontend estan documentadas en [TESTING.md](./TESTING.md).

## Endpoints

La API se monta bajo:

```text
/api/tutor
```

### Preguntar al tutor sin memoria

```http
POST /api/tutor/ask
```

No usa historial conversacional.

```bash
curl -X POST http://localhost:3000/api/tutor/ask \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "course id": "790",
    "curso": "COMT013PO",
    "vs_id_QDRANT": "vs_69d3542f0a848191aab05cbae571122a",
    "prompt": "Cual es la secuencia basica para cobrar en efectivo?"
  }'
```

Respuesta:

```json
{
  "course id": "790",
  "curso": "COMT013PO",
  "vs_id_qdrant": "vs_69d3542f0a848191aab05cbae571122a",
  "respuesta": "<section>...</section>",
  "web_search_used": false,
  "fuentes": []
}
```

Para complementar la respuesta con busqueda web, envia `web_search: true` o incluye la frase `Busca en internet` en el `prompt`.

### Crear conversacion

```http
POST /api/tutor/conversations
```

```bash
curl -X POST http://localhost:3000/api/tutor/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "x-user-id: usuario_123" \
  -d '{
    "course id": "790",
    "curso": "COMT013PO",
    "vs_id_QDRANT": "vs_69d3542f0a848191aab05cbae571122a",
    "title": "Cobro en caja"
  }'
```

Respuesta:

```json
{
  "conversation_id": "66583f4c2a0d4b98e1e0a111",
  "title": "Cobro en caja",
  "course id": "790",
  "curso": "COMT013PO",
  "vs_id_qdrant": "vs_69d3542f0a848191aab05cbae571122a"
}
```

### Enviar mensaje a una conversacion

```http
POST /api/tutor/conversations/:conversationId/messages
```

```bash
curl -X POST http://localhost:3000/api/tutor/conversations/66583f4c2a0d4b98e1e0a111/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "x-user-id: usuario_123" \
  -d '{
    "prompt": "Explicame mejor el segundo paso."
  }'
```

### Generar contenido en una conversacion

Resumen:

```http
POST /api/tutor/conversations/:conversationId/summaries
```

Examen:

```http
POST /api/tutor/conversations/:conversationId/exams
```

Ejercicio:

```http
POST /api/tutor/conversations/:conversationId/exercises
```

Los tres endpoints devuelven un fragmento HTML listo para insertar en el chat:

```json
{
  "conversation_id": "66583f4c2a0d4b98e1e0a111",
  "tipo_generacion": "resumen",
  "respuesta": "<section>...</section>",
  "web_search_used": false,
  "fuentes": []
}
```

`summaries` puede usar `web_search: true`. `exams` y `exercises` se basan solo en la documentacion del curso.

### Listar conversaciones

```http
GET /api/tutor/conversations
GET /api/tutor/conversations?course_id=790
```

```bash
curl http://localhost:3000/api/tutor/conversations \
  -H "Authorization: Bearer <token>" \
  -H "x-user-id: usuario_123"
```

### Recuperar mensajes

```http
GET /api/tutor/conversations/:conversationId/messages
```

### Renombrar conversacion

```http
PATCH /api/tutor/conversations/:conversationId
```

```bash
curl -X PATCH http://localhost:3000/api/tutor/conversations/66583f4c2a0d4b98e1e0a111 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "x-user-id: usuario_123" \
  -d '{
    "title": "Cobro en efectivo"
  }'
```

### Borrar conversacion

```http
DELETE /api/tutor/conversations/:conversationId
```

Si la operacion se completa correctamente, devuelve `204 No Content`.

## Administracion de Qdrant

Los endpoints administrativos se montan bajo:

```text
/api/tutor/qdrant
```

Usan el mismo token que el resto de la API.

### Listar colecciones

```http
GET /api/tutor/qdrant/collections?page=1&page_size=10
GET /api/tutor/qdrant/collections?course_id=790
GET /api/tutor/qdrant/collections?curso=COMT013PO
GET /api/tutor/qdrant/collections?file_name=manual.pdf
GET /api/tutor/qdrant/collections?search=manual
```

Respuesta:

```json
{
  "items": [],
  "page": 1,
  "page_size": 10,
  "total": 0,
  "has_next": false
}
```

### Sincronizar colecciones existentes

```http
POST /api/tutor/qdrant/collections/sync
```

Crea metadata local para colecciones existentes en Qdrant.

### Crear coleccion

```http
POST /api/tutor/qdrant/collections
```

```json
{
  "collection_name": "vs_COMT013PO_790",
  "display_name": "Curso COMT013PO",
  "course_id": "790",
  "curso": "COMT013PO"
}
```

### Ver detalle de una coleccion

```http
GET /api/tutor/qdrant/collections/:collectionName
```

### Listar ficheros de una coleccion

```http
GET /api/tutor/qdrant/collections/:collectionName/files
```

### Subir ficheros

Soporta `PDF`, `DOCX` y `TXT` mediante `multipart/form-data`.

Un fichero:

```bash
curl -X POST http://localhost:3000/api/tutor/qdrant/collections/vs_COMT013PO_790/files \
  -H "Authorization: Bearer <token>" \
  -F "file=@manual.pdf" \
  -F "course_id=790" \
  -F "curso=COMT013PO"
```

Varios ficheros:

```bash
curl -X POST http://localhost:3000/api/tutor/qdrant/collections/vs_COMT013PO_790/files/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@manual.pdf" \
  -F "files=@guia.docx" \
  -F "replace_existing=true"
```

### Borrar ficheros y colecciones

```http
DELETE /api/tutor/qdrant/collections/:collectionName/files/:fileId
DELETE /api/tutor/qdrant/collections/:collectionName/files/by-name?file_name=manual.pdf
DELETE /api/tutor/qdrant/collections/:collectionName?confirm=true
```

Las operaciones de subida y borrado invalidan la cache documental del tutor para que las respuestas posteriores usen el estado actualizado de Qdrant.

## Validaciones principales

- `course id`, `curso`, `vs_id_QDRANT` y `x-user-id` son obligatorios en los endpoints que los requieren.
- `vs_id_QDRANT` debe ser el nombre exacto de una coleccion existente en Qdrant.
- `vs_id_QDRANT` admite letras, numeros, `_` y `-`, con un maximo de 128 caracteres.
- `x-user-id` admite letras, numeros, `_` y `-`, con un maximo de 64 caracteres.
- `prompt` no puede estar vacio y esta limitado por `MAX_PROMPT_LENGTH`.
- `web_search`, cuando se envia, debe ser booleano.
- `title` esta limitado por `MAX_CONVERSATION_TITLE_LENGTH`.
- Si la coleccion indicada no existe o Qdrant no permite consultarla, la API devuelve `400`.

## Seguridad operativa

- Usa `NODE_ENV=production` en produccion.
- Configura `CORS_ALLOWED_ORIGINS` con el origen exacto del frontend, sin ruta final.
- No subas `.env` al repositorio. Usa `.env.example` como plantilla.
- Migra clientes a `Authorization: Bearer <token>` y deja `AUTH_MODE=jwt` cuando todos lo usen.
- Ajusta `RATE_LIMIT_MAX`, `MAX_CONTEXT_CHARS`, `MAX_HISTORY_MESSAGES` y `QDRANT_MAX_SCROLL_POINTS` segun el coste aceptable por peticion.

## Respuestas del tutor

El tutor devuelve fragmentos HTML validos, no Markdown. No incluye `<html>`, `<head>`, `<body>`, scripts ni estilos inline.

Por defecto, las respuestas se basan exclusivamente en el contexto oficial recuperado desde Qdrant. Si se activa la busqueda web con `web_search: true` o la frase `Busca en internet`, Perplexity Sonar complementa ese contexto con informacion externa y la respuesta incluye sus fuentes.
