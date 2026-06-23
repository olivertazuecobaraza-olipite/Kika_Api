# Plan operativo de pruebas

## Objetivo y capas

La estrategia separa tres tipos de prueba:

- **Unitarias:** lógica, validadores, controladores y middlewares con dependencias controladas.
- **Integración:** peticiones HTTP reales contra Express, MongoDB de test y, cuando se configura, Qdrant de test.
- **Manual desde frontend:** recorrido funcional ejecutado por una persona. No forma parte de la automatización del repositorio.

OpenAI y Perplexity no se consumen durante la suite habitual. Las pruebas unitarias usan clientes simulados para cubrir éxito, timeout, indisponibilidad y respuestas incorrectas.

## Comandos

```bash
pnpm run check
pnpm run test:unit
pnpm run test:integration
pnpm run test:coverage
pnpm run test:all
```

`test:unit` no necesita servicios externos. Para integración, configura como mínimo:

```env
TEST_MONGO_URI=mongodb://localhost:2017/kika_api_test
TEST_QDRANT_URL=http://localhost:6333
```

Los smoke tests consumen APIs reales y solo se ejecutan de forma explícita:

```bash
RUN_PROVIDER_SMOKE=true pnpm run test:smoke
```

Si `TEST_MONGO_URI` no está definido, los casos integrados se muestran como omitidos. Si está definido pero su URI no contiene un identificador `test`, la suite falla antes de conectar. Los casos de Qdrant se omiten si falta `TEST_QDRANT_URL`.

La integración crea usuarios con prefijo `integration-` y colecciones con prefijo `kika_test_`. La limpieza elimina exclusivamente esos datos. No se deben reutilizar URIs de desarrollo o producción.

## Matriz automatizada

### Unitarias y HTTP sin dependencias

- Autenticación legacy, JWT e híbrida: firma, algoritmo, `kid`, emisor, audiencia, TTL, revocación, registro y rotación.
- CORS: preflight permitido, origen rechazado y llamadas internas sin `Origin`.
- Seguridad HTTP: `nosniff`, `no-referrer`, `no-store` y ausencia de `X-Powered-By`.
- Rate limit: límite por IP, independencia entre IP y respuesta 429 con `Retry-After`.
- Parseo: JSON incorrecto y validaciones antes de acceder a persistencia.
- Generación: prompts, enums, contadores, solución opcional, HTML seguro y errores públicos.
- Tutor: selección de búsqueda web, fuentes, idioma, clasificación, RAG insuficiente y preguntas estructurales.
- Qdrant: nombres seguros, chunking, agrupación de ficheros, filtros, paginación, confirmación y campos de subida/borrado.

### Integración local

- Crear, filtrar, renombrar y borrar una conversación por HTTP.
- Persistir y recuperar mensajes en orden.
- Ocultar conversaciones a otro `x-user-id` mediante 404.
- Borrar los mensajes asociados al eliminar la conversación.
- Con Qdrant configurado: crear una colección real, subir un TXT usando embeddings simulados, recuperar sus ficheros, consultarlo mediante RAG, borrar el fichero y eliminar la colección, verificando también la metadata MongoDB.

## Cobertura

La cobertura se obtiene con el recolector nativo de Node. El baseline registrado es 64,54% de líneas, 77,43% de ramas y 62,88% de funciones; el comando exige los mínimos conservadores 64/77/62 para impedir retrocesos por debajo de ese nivel. Se priorizan autenticación, validadores, conversaciones, generación y operaciones destructivas. El objetivo progresivo es llegar al 80% global de líneas y ramas; los umbrales se elevarán cuando la suite los supere de forma estable.

## Checklist manual desde el frontend

Para cada ejecución anota: fecha, entorno, versión/commit, navegador, usuario, curso, resultado esperado, resultado real, captura y referencia del defecto.

### Sesión y seguridad

- Abrir el tutor con una sesión válida: la pantalla carga sin errores de consola y permite consultar.
- Repetir con token ausente, inválido, expirado y revocado: se muestra un error controlado y no se filtran token, claves o trazas.
- Abrir desde un origen no autorizado: la API bloquea la llamada y el frontend presenta un fallo comprensible.
- Revisar Network y consola: ningún token aparece en URL, mensajes, HTML o logs.

### Conversaciones

- Crear una conversación sin título: aparece como `Nueva conversación`.
- Crear otra con título: se conserva tras recargar.
- Enviar el primer mensaje a una conversación sin título: el título se deriva del prompt y respeta la longitud máxima.
- Enviar dos preguntas relacionadas: la segunda respuesta usa el contexto de la primera.
- Listar todas y filtrar por curso: solo aparecen las correspondientes y se ordenan por última actividad.
- Recuperar el historial tras recargar: roles, HTML, fuentes y fechas mantienen el orden.
- Renombrar con un título válido; probar vacío y excesivamente largo.
- Abrir la misma URL con otro usuario: no puede ver, modificar ni borrar la conversación.
- Borrar con confirmación: desaparece del listado y no reaparece al recargar.
- Probar doble clic y envíos repetidos: no deben crearse duplicados involuntarios.

### Tutor documental

- Saludo, ayuda e identidad: responde sin fingir que consultó documentación.
- Pregunta exacta sobre un documento: responde basándose en el curso.
- Pregunta estructural sobre módulos, unidades, horas o temario: devuelve la estructura disponible.
- Pregunta ambigua (`explica el segundo` sin historial): solicita precisión.
- Pregunta sin evidencia: reconoce que falta contexto y no inventa datos.
- Pregunta en otro idioma o con instrucción explícita de idioma: responde en ese idioma.
- Revisar el renderizado: fragmento HTML válido, sin Markdown visible, scripts, eventos inline ni estilos inesperados.
- Enviar caracteres especiales y texto que parezca HTML: se muestra como contenido seguro.

### Búsqueda web

- Activar el control `web_search`: `web_search_used` es verdadero y aparecen fuentes navegables.
- Desactivarlo: una consulta documental normal no incorpora fuentes externas.
- Usar la frase legacy `Busca en internet`: sigue activando la búsqueda.
- Simular indisponibilidad de Perplexity: se conserva el chat y se muestra un error controlado.
- Comprobar enlaces duplicados, títulos con caracteres especiales y apertura segura de URLs.

### Resúmenes, exámenes y ejercicios

- Resumen: probar las tres extensiones, formatos y enfoques; repetir con búsqueda web activada.
- Examen: probar `test`, `preguntas_abiertas` y `mixto`, verificando cantidades y dificultad.
- Examen inválido: contadores a cero, negativos, superiores al máximo y `web_search`; el formulario/API debe impedirlo.
- Ejercicio: recorrer los cuatro tipos, tres dificultades, distintos apartados y solución activada/desactivada.
- Confirmar que cada submit genera un mensaje de usuario y otro del asistente y que ambos sobreviven al refresco.

### Administración Qdrant

- Listar, paginar, buscar y filtrar por curso, código y fichero.
- Crear una colección y repetir el nombre: el segundo intento devuelve conflicto sin duplicarla.
- Subir TXT, PDF y DOCX; comprobar nombre, tamaño, estado y chunks.
- Subir lote válido y lote parcialmente inválido; la UI distingue cargados y fallidos.
- Probar tipo no permitido, fichero vacío, fichero demasiado grande y exceso de ficheros.
- Reemplazar un fichero y preguntar inmediatamente por el contenido nuevo para validar la caché.
- Borrar por ID y por nombre; confirmar que desaparece del listado y de las respuestas.
- Intentar borrar una colección sin confirmar y después con confirmación explícita.
- Ejecutar sincronización y comprobar que incorpora colecciones preexistentes.

### Resiliencia y experiencia

- Desconectar temporalmente la red, MongoDB o Qdrant: no queda un spinner infinito y se permite reintentar.
- Superar el rate limit: aparece un estado 429 comprensible y el reintento funciona tras `Retry-After`.
- Probar respuestas lentas, recarga durante una petición y navegación atrás/adelante.
- Validar escritorio y móvil: historial, formularios, HTML generado y modales siguen siendo utilizables.

## Criterio de aceptación

- `pnpm run test:all` termina sin fallos con los servicios de test disponibles.
- `pnpm run test:coverage` no retrocede respecto al baseline registrado.
- No quedan documentos `integration-*` ni colecciones `kika_test_*` después de la suite.
- La checklist manual no contiene defectos críticos o altos abiertos.
