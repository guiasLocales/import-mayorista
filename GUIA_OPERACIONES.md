# 📖 Guía de Operaciones y Despliegue - Import.cba

Este documento explica detalladamente cómo funciona el ecosistema del proyecto, las herramientas necesarias y el flujo de trabajo para realizar cambios y desplegarlos.

---

## 🛠️ 1. Requisitos de Instalación (Local)

Para trabajar en este proyecto desde tu computadora, necesitas tener instalado:

1.  **Node.js (v18 o superior)**: Es el entorno de ejecución para JavaScript. [Descargar aquí](https://nodejs.org/).
2.  **Git**: Herramienta para el control de versiones y conexión con GitHub. [Descargar aquí](https://git-scm.com/).
3.  **Editor de Código**: Se recomienda **Visual Studio Code**.

---

## 🔗 2. Conexión con GitHub y Despliegue

El proyecto usa una técnica llamada **CI/CD (Integración y Despliegue Continuo)** a través de **GitHub Actions**.

### ¿Cómo funciona la conexión?
- El código vive en un repositorio de GitHub.
- Existe un archivo en [.github/workflows/deploy.yml](.github/workflows/deploy.yml) que contiene las instrucciones para Cloudflare.
- Cada vez que haces un `push` (subes cambios) a la rama `main`, GitHub lee ese archivo automáticamente.

### Secretos Necesarios
Para que GitHub tenga permiso de desplegar en tu cuenta de Cloudflare, debes configurar estos "Secrets" en GitHub (**Settings > Secrets and variables > Actions**):
- `CLOUDFLARE_API_TOKEN`: Permiso para actuar en tu cuenta.
- `CLOUDFLARE_ACCOUNT_ID`: El ID de tu cuenta de Cloudflare.

---

## 🚀 3. Cómo realizar cambios y Desplegar (Paso a Paso)

Cuando termines de hacer cambios en el código (ya sea tú o una IA), debes seguir estos comandos en la terminal:

1.  **Guardar los cambios localmente**:
    ```bash
    git add .
    ```
2.  **Crear una etiqueta del cambio (Commit)**:
    ```bash
    git commit -m "Descripción de lo que cambiaste"
    ```
3.  **Subir a GitHub (Esto dispara el deploy)**:
    ```bash
    git push origin main
    ```

> [!TIP]
> Una vez hecho el `push`, puedes ir a la pestaña **Actions** de tu repositorio en GitHub para ver el progreso del despliegue en tiempo real.

---

## 🌐 4. Arquitectura del Proyecto

- **Frontend (`public/`)**: Archivos HTML, CSS y JS que el cliente descarga.
- **Backend (`src/index.js`)**: El "Cerebro" que corre en la red de Cloudflare (Worker).
- **Base de Datos (Google Sheets)**: El Worker se comunica con tu hoja de cálculo para leer productos y guardar pedidos.
- **Configuración (`wrangler.toml`)**: Archivo que define el nombre del proyecto y las variables de entorno básicas.

---

## 🔐 5. Gestión de Contraseñas (Persistencia)

Para que la contraseña de administrador (`ADMIN_PASSWORD`) no se borre tras un despliegue:
1.  **NUNCA** pongas la contraseña en el código.
2.  Configúrala siempre en el panel de **Cloudflare Workers > Settings > Variables**.
3.  Asegúrate de marcarla como **Secret (Encrypted)**. Wrangler respeta los secretos existentes y no los sobrescribe.

---

Esta guía te permite clonar el proyecto en cualquier entorno y entender exactamente qué cables conectan cada parte.
