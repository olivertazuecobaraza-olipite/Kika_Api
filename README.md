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
- Validacion de entradas, autenticacion opcional por API key, rate limiting y cabeceras de seguridad.

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
MONGO_URI=mongodb://localhost:2017/tutor_db
OPENAI_API_KEY=tu_api_key_aqui
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=tu_qdrant_key_si_tiene
API_KEY=clave_para_consumir_esta_api
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
PERPLEXITY_API_KEY=tu_api_key_de_perplexity_aqui
PERPLEXITY_MODEL=sonar
```

En produccion, `API_KEY` es obligatoria. Si esta configurada, todas las peticiones deben incluir la cabecera:

```http
x-api-key: clave_para_consumir_esta_api
```

Los endpoints conversacionales requieren ademas:

```http
x-user-id: usuario_123
```

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
  -H "x-api-key: clave_para_consumir_esta_api" \
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
  -H "x-api-key: clave_para_consumir_esta_api" \
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
  -H "x-api-key: clave_para_consumir_esta_api" \
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
  -H "x-api-key: clave_para_consumir_esta_api" \
  -H "x-user-id: usuario_123"
```

### Recuperar mensajes

```http
GET /api/tutor/conversations/:conversationId/messages
```

Ejemplo:

```bash
curl http://localhost:3000/api/tutor/conversations/66583f4c2a0d4b98e1e0a111/messages \
  -H "x-api-key: clave_para_consumir_esta_api" \
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
  -H "x-api-key: clave_para_consumir_esta_api" \
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
  -H "x-api-key: clave_para_consumir_esta_api" \
  -H "x-user-id: usuario_123"
```

Si la operacion se completa correctamente, devuelve `204 No Content`.

## Validaciones principales

- `course id`, `curso`, `vs_id_QDRANT` y `x-user-id` son obligatorios en los endpoints que los requieren.
- `vs_id_QDRANT` debe ser el nombre exacto de la collection existente en Qdrant y admite letras, numeros, `_` y `-`, con maximo de 128 caracteres.
- `x-user-id` admite letras, numeros, `_` y `-`, con maximo de 64 caracteres.
- `prompt` no puede estar vacio y esta limitado por `MAX_PROMPT_LENGTH`.
- `web_search`, cuando se envia, debe ser booleano.
- `title` esta limitado por `MAX_CONVERSATION_TITLE_LENGTH`.
- Si la collection indicada en `vs_id_QDRANT` no existe, esta mal escrita o Qdrant no permite consultarla, la API devuelve `400`.

## Seguridad operativa

- Configura siempre `NODE_ENV=production` y `API_KEY` en produccion.
- Ajusta `RATE_LIMIT_MAX`, `MAX_CONTEXT_CHARS`, `MAX_HISTORY_MESSAGES` y `QDRANT_MAX_SCROLL_POINTS` segun el coste aceptable por peticion.
- No subas `.env` al repositorio. Usa `.env.example` como plantilla.

## Respuestas del tutor

El tutor devuelve fragmentos HTML validos, no Markdown, y responde en el idioma de la consulta. Por defecto, las respuestas se basan exclusivamente en el contexto oficial recuperado desde Qdrant. Si se activa la busqueda web mediante `web_search: true` o la frase `Busca en internet`, Perplexity Sonar complementa ese contexto con informacion externa y la respuesta identifica sus fuentes.
