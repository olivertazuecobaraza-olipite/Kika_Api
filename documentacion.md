# Kika API

## Arranque

1. Instalar dependencias: `pnpm install`
2. Copiar `.env.example` a `.env` y configurar las credenciales reales.
3. Arrancar MongoDB y Qdrant.
4. Ejecutar en desarrollo: `pnpm dev`
5. Ejecutar en produccion: `pnpm start`

## Seguridad operativa

- En produccion define siempre `NODE_ENV=production` y `API_KEY`.
- Si `API_KEY` esta configurada, todas las peticiones deben incluir `x-api-key`.
- Los endpoints conversacionales requieren ademas `x-user-id`.
- `x-user-id` debe tener maximo 64 caracteres y solo puede usar letras, numeros, `_` y `-`.
- `vs_id_QDRANT` lo define el bloque y debe coincidir con el nombre exacto de una collection existente en Qdrant.
- Si la collection indicada no existe, esta mal escrita o Qdrant no permite consultarla, la API devuelve `400`.
- Ajusta `MAX_PROMPT_LENGTH`, `MAX_HISTORY_MESSAGES`, `MAX_CONVERSATION_TITLE_LENGTH`, `MAX_CONTEXT_CHARS`, `RATE_LIMIT_MAX` y `QDRANT_MAX_SCROLL_POINTS` segun el coste aceptable por peticion.

## Tutor legacy sin memoria

`POST /api/tutor/ask` mantiene el contrato original y no usa historial conversacional.

```json
{
  "course id": "790",
  "curso": "COMT013PO",
  "vs_id_QDRANT": "vs_69d3542f0a848191aab05cbae571122a",
  "prompt": "Cual es la secuencia basica para cobrar en efectivo?"
}
```

## Conversaciones con memoria

Los endpoints bajo `/api/tutor/conversations` separan datos por la cabecera `x-user-id`. Un usuario no puede leer, modificar ni continuar conversaciones creadas con otro `x-user-id`.

### Crear conversacion

`POST /api/tutor/conversations`

```json
{
  "course id": "790",
  "curso": "COMT013PO",
  "vs_id_QDRANT": "vs_69d3542f0a848191aab05cbae571122a",
  "title": "Opcional"
}
```

Si no se envia `title`, se usa `Nueva conversación` y se sustituye por un titulo generado desde el primer prompt.

### Enviar mensaje

`POST /api/tutor/conversations/:conversationId/messages`

```json
{
  "prompt": "Explicame mejor el segundo paso."
}
```

La respuesta incluye `conversation_id` y `respuesta`. El tutor carga los ultimos `MAX_HISTORY_MESSAGES` mensajes previos, en orden cronologico, para resolver referencias como "eso" o "el segundo paso". Qdrant sigue siendo la fuente documental principal.

### Listar conversaciones

`GET /api/tutor/conversations`

Opcionalmente filtra por curso:

`GET /api/tutor/conversations?course_id=790`

### Recuperar mensajes

`GET /api/tutor/conversations/:conversationId/messages`

Devuelve los mensajes ordenados de mas antiguo a mas reciente.

### Renombrar conversacion

`PATCH /api/tutor/conversations/:conversationId`

```json
{
  "title": "Cobro en caja"
}
```

### Borrar conversacion

`DELETE /api/tutor/conversations/:conversationId`

Borra la conversacion y sus mensajes.

## Validacion

Ejecutar comprobaciones de sintaxis:

```bash
pnpm run check
```

Auditoria de dependencias:

```bash
pnpm audit --prod
```
