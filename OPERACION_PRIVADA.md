# Operacion privada de licencias KIKA API

Este documento es para administracion interna. No lo entregues a clientes.

## Principios

- KIKA_API solo recibe claves publicas RSA.
- La clave privada permanece en `C:\secure\kika-private.pem`.
- Cada cliente recibe su propio JWT mediante un canal privado.
- MongoDB guarda metadatos de licencia, nunca el JWT completo.
- Al renovar una licencia, el token anterior se revoca inmediatamente.

## Generar el par RSA

Los scripts administrativos locales estan ignorados por Git. Desde el directorio
del proyecto ejecuta:

```powershell
node .\scripts\generate-rsa-keypair.js
```

El script crea:

```text
C:\secure\kika-private.pem
C:\secure\kika-public.pem
```

Tambien imprime `PUBLIC_KEY_BASE64`. Copia ese valor al `.env` del servidor:

```env
AUTH_MODE=hybrid
JWT_MAX_TTL_SECONDS=31622400
JWT_PUBLIC_KEYS_JSON={"kika-2026-01":"VALOR_PUBLIC_KEY_BASE64"}
AUTH_AUDIT_INCLUDE_IP=false
```

Activa `AUTH_AUDIT_INCLUDE_IP=true` unicamente si la politica de privacidad
permite registrar la IP de origen.

## Alta de cliente

```powershell
node .\scripts\generate-api-token.js `
  --private-key C:\secure\kika-private.pem `
  --kid kika-2026-01 `
  --client-id cliente_academia_norte `
  --client-name "Academia Norte" `
  --client-email administracion@academia.example `
  --months 3
```

El plazo admite entre 1 y 12 meses naturales. Entrega al cliente solo el valor
`token`. Conserva el `jti` para operaciones posteriores.

## Renovacion

```powershell
node .\scripts\generate-api-token.js `
  --private-key C:\secure\kika-private.pem `
  --kid kika-2026-01 `
  --client-id cliente_academia_norte `
  --client-name "Academia Norte" `
  --client-email administracion@academia.example `
  --months 6 `
  --replace-jti TOKEN_ANTERIOR_JTI
```

La licencia anterior pasa a `superseded` y queda revocada.

## Revocacion manual

```powershell
node .\scripts\revoke-api-token.js `
  --jti TOKEN_JTI `
  --reason "Baja del cliente"
```

## Rotacion de claves

1. Genera un par nuevo y asigna un `kid` distinto.
2. Anade la nueva clave publica a `JWT_PUBLIC_KEYS_JSON`.
3. Despliega KIKA_API.
4. Emite tokens nuevos con el nuevo `kid`.
5. Retira la clave publica anterior cuando sus licencias hayan expirado o hayan
   sido revocadas.

Retirar un `kid` invalida inmediatamente todos los tokens firmados con esa clave.

## Incidente de seguridad

Si se filtra un token, revoca su `jti`. Si se filtra la clave privada, genera un
par nuevo, despliega su clave publica, renueva las licencias validas y retira
inmediatamente el `kid` comprometido.
