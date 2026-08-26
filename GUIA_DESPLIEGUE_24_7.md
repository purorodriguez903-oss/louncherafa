# Guía de Despliegue 24/7 - RafaPanel Web

Esta plataforma web te permite mantener un servidor **activo las 24 horas del día, los 7 días de la semana** para:
- Subir y actualizar los **7 DLLs** en tiempo real.
- Cambiar la clave del launcher o activar el **Modo Gratis** sin clave.
- Publicar alertas globales y modificar títulos y estados (🟢 Indetectado / 🟡 En Mantenimiento).
- Permitir a los usuarios descargar el launcher y las DLLs directamente.

---

## Opción 1: Ejecutar Localmente en tu PC (1 Clic)

1. Haz doble clic en `Iniciar_Servidor_Web.bat` en la carpeta principal del proyecto (o `RafaPanel_Web/Iniciar_Servidor.bat`).
2. Abre tu navegador en:
   - **Portal Público:** `http://localhost:3000`
   - **Panel de Administración:** `http://localhost:3000/admin.html` (Contraseña por defecto: `admin`)

---

## Opción 2: Alojamiento en la Nube 100% Gratis 24/7 (Render.com)

1. Crea una cuenta gratuita en [https://render.com](https://render.com).
2. Sube la carpeta `RafaPanel_Web` a tu cuenta de GitHub (crea un repositorio llamado `rafapanel-web`).
3. En Render.com:
   - Haz clic en **New +** -> **Web Service**.
   - Conecta tu repositorio de GitHub.
   - **Runtime:** `Node`
   - **Build Command:** Deja vacío o `npm start`
   - **Start Command:** `node server.js`
   - **Plan:** Free ($0/mes).
4. Haz clic en **Create Web Service**.
5. ¡Listo! Render te dará un enlace público HTTPS 24/7 (por ejemplo: `https://rafapanel-vip.onrender.com`) que nunca se apaga.

---

## Opción 3: Alojamiento en Railway.app o Glitch.com

- **Railway:** Simplemente conecta tu repo y Railway detectará el `Dockerfile` / `package.json` automáticamente.
- **Glitch:** Crea un nuevo proyecto Node.js, pega los archivos de `RafaPanel_Web` y quedará online inmediatamente.

---

## ¿Cómo Gestionar los 7 DLLs desde la Web?

1. Entra a `tu-url-web/admin.html` e ingresa tu contraseña de administrador (`admin`).
2. En la pestaña **"📦 Gestión de los 7 DLLs"**, verás:
   1. `edkide.dll` (Cheat Principal)
   2. `minhook.x64.dll` (Hooking)
   3. `libcurl.dll` (Red & Auth)
   4. `glew32.dll` (OpenGL)
   5. `WinDivert.dll` (FakeLag 32-bit)
   6. `WinDivert64.dll` (FakeLag 64-bit)
   7. `z.dll` (Auxiliar)
3. Haz clic en el botón **"Actualizar"** al lado de la DLL que quieras cambiar.
4. Selecciona tu nuevo archivo `.dll` de tu computadora.
5. El servidor actualizará el archivo manteniendo el mismo ID y nombre. ¡Todos los launchers se sincronizarán inmediatamente sin tener que pasar un nuevo `.exe`!

---

## ¿Cómo Cambiar la Clave o Ponerlo Gratis?

1. En el panel admin, ve a la pestaña **"🔑 Login & Seguridad"**.
2. **Para hacerlo gratis (sin login):** Enciende el interruptor **"Modo Acceso Gratuito"** y guarda. Todos los usuarios entrarán sin que se les pida clave.
3. **Para cambiar la clave:** Escribe la nueva clave en **"Clave de Acceso del Launcher"** y haz clic en **Guardar Configuración**.
