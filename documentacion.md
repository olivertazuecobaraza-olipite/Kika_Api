# Kika API

## Arranque

1. Instalar dependencias: `pnpm install`
2. Copiar `.env.example` a `.env` y configurar las credenciales reales.
3. Arrancar MongoDB y Qdrant.
4. Ejecutar en desarrollo: `pnpm dev`
5. Ejecutar en produccion: `pnpm start`

Si Moodle llama a esta API directamente desde el navegador, configura el origen
exacto permitido, sin ruta final:

```env
CORS_ALLOWED_ORIGINS=https://campus.example
```

## Seguridad operativa

- En produccion define siempre `NODE_ENV=production` y configura `AUTH_MODE`.
- `AUTH_MODE=legacy` acepta `x-api-key`, `hybrid` acepta JWT Bearer o `x-api-key`,
  y `jwt` acepta exclusivamente `Authorization: Bearer <token>`.
- Usa `legacy` al desplegar el cambio, `hybrid` durante la migracion y `jwt`
  cuando todos los clientes consuman tokens expirables.
- Los JWT usan firma `RS256`, incluyen `iss`, `aud`, `sub`, `iat`, `exp`, `jti`
  y `kid`, y no pueden superar 12 meses de vida.
- `sub` identifica a la aplicacion consumidora; no sustituye a `x-user-id`.
- `jti` identifica el token concreto. Debe existir como licencia activa en
  `kika_issued_tokens` y permite revocarlo mediante `kika_revoked_tokens`.
- Los endpoints conversacionales requieren ademas `x-user-id`.
- `x-user-id` debe tener maximo 64 caracteres y solo puede usar letras, numeros, `_` y `-`.
- `vs_id_QDRANT` lo define el bloque y debe coincidir con el nombre exacto de una collection existente en Qdrant.
- Si la collection indicada no existe, esta mal escrita o Qdrant no permite consultarla, la API devuelve `400`.
- Ajusta `MAX_PROMPT_LENGTH`, `MAX_HISTORY_MESSAGES`, `MAX_CONVERSATION_TITLE_LENGTH`, `MAX_CONTEXT_CHARS`, `RATE_LIMIT_MAX` y `QDRANT_MAX_SCROLL_POINTS` segun el coste aceptable por peticion.
- Configura `PERPLEXITY_API_KEY` para habilitar busquedas web. Si no esta definida, el tutor documental sigue funcionando.

## Gestion privada de licencias

La API solo verifica tokens registrados como licencias activas. Las operaciones
de emision, renovacion, revocacion y rotacion se describen en
`OPERACION_PRIVADA.md` y deben ejecutarse exclusivamente por el administrador.

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

La busqueda web se activa si `prompt` contiene la frase `Busca en internet` o si
la peticion incluye `"web_search": true`. El booleano es opcional y permite que
el frontend incorpore un boton sin modificar el texto escrito por el usuario.

```json
{
  "course id": "790",
  "curso": "COMT013PO",
  "vs_id_QDRANT": "vs_69d3542f0a848191aab05cbae571122a",
  "prompt": "Cuales son las novedades recientes sobre este tema?",
  "web_search": true
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
  "prompt": "Explicame mejor el segundo paso.",
  "web_search": false
}
```

La respuesta incluye `conversation_id`, `respuesta`, `web_search_used` y `fuentes`. El tutor carga los ultimos `MAX_HISTORY_MESSAGES` mensajes previos, en orden cronologico, para resolver referencias como "eso" o "el segundo paso". Qdrant sigue siendo la fuente documental principal. Cuando se activa la busqueda web, Perplexity Sonar complementa ese contexto, devuelve la respuesta final y aporta enlaces estructurados.

### Listar conversaciones

`GET /api/tutor/conversations`

Opcionalmente filtra por curso:

`GET /api/tutor/conversations?course_id=790`

### Recuperar mensajes

`GET /api/tutor/conversations/:conversationId/messages`

Devuelve los mensajes ordenados de mas antiguo a mas reciente.
Cada mensaje incluye `web_search_used` y `fuentes`, por lo que las referencias web
siguen disponibles al recargar una conversacion.

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
