# Catálogo Mayorista - Cloudflare Worker Migration

Este proyecto es la migración del Catálogo Mayorista de Google Apps Script a Cloudflare Workers.

## Estructura

- `src/index.js`: Worker principal (API + HTML Serving).
- `src/sheets-client.js`: Cliente de Google Sheets.
- `src/google-auth.js`: Autenticación Service Account.
- `public/index.html`: Frontend SPA.

## Requisitos Previos

1.  **Node.js & NPM**: Instalar desde [nodejs.org](https://nodejs.org/).
2.  **Cloudflare Account**: Tener cuenta en Cloudflare.
3.  **Google Cloud Service Account**:
    -   Crear proyecto en Google Cloud.
    -   Habilitar **Google Sheets API**.
    -   Crear Service Account y descargar la JSON Key.
    -   **IMPORTANTE**: Dar permiso de "Editor" al email de la Service Account en la Spreadsheet de Google Sheets.

## Setup Inicial

1.  Instalar dependencias:
    ```bash
    npm install
    ```

2.  Login en Cloudflare:
    ```bash
    npx wrangler login
    ```

## Configuración de Secretos

Para seguridad, llenar los secretos en Cloudflare (no en el código):

```bash
# Email de la Service Account
npx wrangler secret put GOOGLE_CLIENT_EMAIL

# Private Key (copiar todo el contenido del PEM, incluyendo headers)
npx wrangler secret put GOOGLE_PRIVATE_KEY
```

Editar `wrangler.toml` para configurar las variables públicas (o usarlas por ambiente):

```toml
[vars]
DEFAULT_CATEGORY = "LIBRERIA"
SPREADSHEET_ID = "TU_SPREADSHEET_ID_AQUI"
GOOGLE_CLIENT_EMAIL = "tu-service-account@..." # También puede ir aquí si no es secreto crítico, pero mejor usar secrets para la key.
```

## Desarrollo Local

```bash
npx wrangler dev
```

Visitar `http://localhost:8787`.

## Deploy

Para desplegar diferentes catálogos:

1.  **LIBRERIA**:
    Editar `wrangler.toml` -> `DEFAULT_CATEGORY = "LIBRERIA"`
    ```bash
    npx wrangler deploy --name catalogo-libreria
    ```

2.  **BAZAR**:
    Editar `wrangler.toml` -> `DEFAULT_CATEGORY = "BAZAR"`
    ```bash
    npx wrangler deploy --name catalogo-bazar
    ```

## Notas de Migración

- El frontend usa `fetch` en lugar de `google.script.run`.
- La autenticación con Google Sheets se hace directo desde el Worker con la Service Account.
- El HTML se sirve desde el Worker injectando la categoría dinámicamente.
