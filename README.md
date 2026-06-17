# KIKA API

API de tutor conversacional para cursos. Recibe preguntas de estudiantes, recupera contexto oficial desde Qdrant y genera respuestas pedagogicas en espanol con OpenAI. Tambien permite crear conversaciones con memoria, separadas por usuario, y persistidas en MongoDB.

## Funcionalidades

- Tutor legacy sin memoria mediante `POST /api/tutor/ask`.
- Conversaciones con historial mediante `/api/tutor/conversations`.
- Separacion de conversaciones por cabecera `x-user-id`.
- Recuperacion de contexto documental desde Qdrant.
- Generacion de respuestas con OpenAI.
- Busqueda web opcional mediante Perplexity Sonar.
- Persistencia de interacciones, conversaciones y mensajes en MongoDB.
- Validacion de entradas, autenticacion JWT expirable con migracion desde API key, rate limiting y cabeceras de seguridad.

## Requisitos

- Node.js compatible con modulos ES.
- pnpm.
- MongoDB.
- Qdrant.
- API key de OpenAI.

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
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=tu_qdrant_key_si_tiene
AUTH_MODE=legacy
API_KEY=clave_estatica_solo_para_transicion
JWT_ISSUER=kika-token-service
JWT_AUDIENCE=kika-api
JWT_MAX_TTL_SECONDS=31622400
JWT_CLOCK_TOLERANCE_SECONDS=30
JWT_PUBLIC_KEYS_JSON={"kika-2026-01":"<clave_publica_pem_codificada_en_base64>"}
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
PERPLEXITY_API_KEY=tu_api_key_de_perplexity_aqui
PERPLEXITY_MODEL=sonar
```

La autenticacion se migra gradualmente mediante `AUTH_MODE`:

- `legacy`: solo acepta `x-api-key`.
- `hybrid`: acepta JWT Bearer y temporalmente `x-api-key`.
- `jwt`: solo acepta JWT Bearer.

El contrato objetivo para todas las peticiones es:

```http
Authorization: Bearer <token>
```

Los endpoints conversacionales requieren ademas:

```http
x-user-id: usuario_123
```

Si el frontend llama a la API directamente desde el navegador, configura
`CORS_ALLOWED_ORIGINS` con el origen exacto de Moodle, sin ruta final. Para
permitir varios origenes, separalos con comas:

```env
CORS_ALLOWED_ORIGINS=https://campus.example,https://campus-staging.example
```

El JWT identifica a la aplicacion consumidora mediante `sub`. La cabecera
`x-user-id` sigue identificando al usuario final y separando sus conversaciones.
Cada token incluye un `jti` unico para permitir su revocacion anticipada.

## Uso del token

Cada cliente recibe una credencial individual por un canal privado. El token
debe tratarse como un secreto y no debe incluirse en repositorios, tickets
publicos ni capturas compartidas.

Si el token caduca o se filtra, solicita una renovacion al administrador de la
API. Los clientes no generan ni renuevan tokens por su cuenta.

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

## Endpoints

La API se monta bajo:

```text
/api/tutor
```

### Preguntar al tutor sin memoria

```http
POST /api/tutor/ask
```

Este endpoint mantiene el contrato legacy. No usa historial conversacional.

Ejemplo:

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

Para complementar la documentacion interna con una busqueda web, incluye la frase
`Busca en internet` dentro de `prompt` o envia `web_search: true`. La frase se
mantiene por compatibilidad y el booleano permite integrar un boton en el frontend:

```json
{
  "course id": "790",
  "curso": "COMT013PO",
  "vs_id_QDRANT": "vs_69d3542f0a848191aab05cbae571122a",
  "prompt": "Cuales son las novedades recientes sobre este tema?",
  "web_search": true
}
```

Las respuestas web incluyen `web_search_used: true`, una seccion HTML con enlaces
y el array estructurado `fuentes`.

### Crear conversacion

```http
POST /api/tutor/conversations
```

Ejemplo:

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

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/tutor/conversations/66583f4c2a0d4b98e1e0a111/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "x-user-id: usuario_123" \
  -d '{
    "prompt": "Explicame mejor el segundo paso."
  }'
```

Respuesta:

```json
{
  "conversation_id": "66583f4c2a0d4b98e1e0a111",
  "respuesta": "<section>...</section>",
  "web_search_used": false,
  "fuentes": []
}
```

### Listar conversaciones

```http
GET /api/tutor/conversations
GET /api/tutor/conversations?course_id=790
```

Ejemplo:

```bash
curl http://localhost:3000/api/tutor/conversations \
  -H "Authorization: Bearer <token>" \
  -H "x-user-id: usuario_123"
```

### Recuperar mensajes

```http
GET /api/tutor/conversations/:conversationId/messages
```

Ejemplo:

```bash
curl http://localhost:3000/api/tutor/conversations/66583f4c2a0d4b98e1e0a111/messages \
  -H "Authorization: Bearer <token>" \
  -H "x-user-id: usuario_123"
```

### Renombrar conversacion

```http
PATCH /api/tutor/conversations/:conversationId
```

Ejemplo:

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

Ejemplo:

```bash
curl -X DELETE http://localhost:3000/api/tutor/conversations/66583f4c2a0d4b98e1e0a111 \
  -H "Authorization: Bearer <token>" \
  -H "x-user-id: usuario_123"
```

Si la operacion se completa correctamente, devuelve `204 No Content`.

## Gestion administrativa de Qdrant

Los endpoints bajo `/api/tutor/qdrant` usan el mismo token/API key que el resto
de la API. Permiten preparar una UI de gestion para listar, crear, cargar y
borrar colecciones/ficheros de Qdrant.

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

Crea metadata local para colecciones ya existentes en Qdrant y agrupa ficheros
legacy usando `payload.file_name`.

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

### Listar ficheros de una coleccion

```http
GET /api/tutor/qdrant/collections/vs_COMT013PO_790/files
```

### Subir ficheros

Soporta `PDF`, `DOCX` y `TXT` mediante `multipart/form-data`.

```bash
curl -X POST http://localhost:3000/api/tutor/qdrant/collections/vs_COMT013PO_790/files \
  -H "Authorization: Bearer <token>" \
  -F "file=@manual.pdf" \
  -F "course_id=790" \
  -F "curso=COMT013PO"
```

Para varios ficheros:

```bash
curl -X POST http://localhost:3000/api/tutor/qdrant/collections/vs_COMT013PO_790/files/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@manual.pdf" \
  -F "files=@guia.docx" \
  -F "replace_existing=true"
```

Ejemplo desde React:

```js
const formData = new FormData();
files.forEach(file => formData.append('files', file));

await fetch('/api/tutor/qdrant/collections/vs_COMT013PO_790/files/batch', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData
});
```

### Borrar ficheros y colecciones

```http
DELETE /api/tutor/qdrant/collections/:collectionName/files/:fileId
DELETE /api/tutor/qdrant/collections/:collectionName/files/by-name?file_name=manual.pdf
DELETE /api/tutor/qdrant/collections/:collectionName?confirm=true
```

Las operaciones de subida y borrado invalidan la cache documental del tutor para
que las respuestas posteriores usen el estado nuevo de Qdrant.

## Validaciones principales

- `course id`, `curso`, `vs_id_QDRANT` y `x-user-id` son obligatorios en los endpoints que los requieren.
- `vs_id_QDRANT` debe ser el nombre exacto de la collection existente en Qdrant y admite letras, numeros, `_` y `-`, con maximo de 128 caracteres.
- `x-user-id` admite letras, numeros, `_` y `-`, con maximo de 64 caracteres.
- `prompt` no puede estar vacio y esta limitado por `MAX_PROMPT_LENGTH`.
- `web_search`, cuando se envia, debe ser booleano.
- `title` esta limitado por `MAX_CONVERSATION_TITLE_LENGTH`.
- Si la collection indicada en `vs_id_QDRANT` no existe, esta mal escrita o Qdrant no permite consultarla, la API devuelve `400`.

## Seguridad operativa

- Configura siempre `NODE_ENV=production` y el modo de autenticacion apropiado.
- Despliega primero con `AUTH_MODE=legacy`, migra clientes con `AUTH_MODE=hybrid`
  y retira `API_KEY` tras cambiar a `AUTH_MODE=jwt`.
- Para rotar claves, anade primero el nuevo `kid`, empieza a emitir con el y
  retira el anterior cuando sus tokens hayan expirado o hayan sido revocados.
- Retirar un `kid` invalida inmediatamente todos sus tokens.
- Ajusta `RATE_LIMIT_MAX`, `MAX_CONTEXT_CHARS`, `MAX_HISTORY_MESSAGES` y `QDRANT_MAX_SCROLL_POINTS` segun el coste aceptable por peticion.
- No subas `.env` al repositorio. Usa `.env.example` como plantilla.

## Respuestas del tutor

El tutor devuelve fragmentos HTML validos, no Markdown, y responde en el idioma de la consulta. Por defecto, las respuestas se basan exclusivamente en el contexto oficial recuperado desde Qdrant. Si se activa la busqueda web mediante `web_search: true` o la frase `Busca en internet`, Perplexity Sonar complementa ese contexto con informacion externa y la respuesta identifica sus fuentes.
