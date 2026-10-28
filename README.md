# FinanzasPro

[![CI](https://github.com/gadriv/finanzas-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/gadriv/finanzas-pro/actions/workflows/ci.yml)

Aplicación web para el control de finanzas personales: registra ingresos y gastos,
visualiza tu balance, controla presupuestos mensuales y revisa tendencias. Los datos se
guardan en una base de datos **SQLite** local mediante un pequeño servidor Node.

## Características

- Dashboard con KPIs: ingresos, gastos, balance neto y tasa de ahorro con meta configurable.
- Filtros por período: diario, semanal, mensual, anual e histórico.
- Registro de ingresos y gastos con categorías, fecha y descripción.
- Edición y eliminación de movimientos (con opción de deshacer).
- Gráfico de gastos por categoría y gráfico de flujo de efectivo (ingresos vs gastos).
- Presupuesto mensual por categoría con alertas de exceso.
- Búsqueda y filtros por tipo y categoría en el historial.
- Multimoneda (CRC, USD, MXN, EUR, COP, ARS, CLP, PEN, GTQ, HNL, NIO, DOP).
- Perfiles independientes: cada perfil guarda sus propios movimientos, moneda y presupuestos.
- Acceso por perfil con nombre de usuario y contraseña (scrypt) y sesiones en cookie
  `httpOnly`.
- Verificación en dos pasos (2FA) opcional con aplicación autenticadora (TOTP), código QR y
  códigos de recuperación de un solo uso.
- Bloqueo temporal tras varios intentos fallidos y límite de intentos por IP.
- Persistencia en SQLite con guardado atómico por perfil y espejo local en el navegador.
- Modo sin conexión: si el servidor no responde, la app sigue funcionando con la copia local
  y sincroniza automáticamente los cambios al reconectar.
- Exportación de reportes del período en PDF y CSV, y de respaldos en JSON/CSV.
- Importación de respaldos y restauración de datos.
- Diseño responsive y accesible (navegación por teclado, etiquetas ARIA).

## Requisitos

- Node.js 22.13 o superior (usa el módulo integrado `node:sqlite` sin flags).
- No requiere compiladores ni dependencias nativas.

> `node:sqlite` todavía se marca como experimental en Node y puede mostrar un
> `ExperimentalWarning` al arrancar. Es informativo: la app funciona con normalidad.

## Puesta en marcha

```bash
npm install
npm run dev
```

`npm run dev` levanta la API SQLite en `http://127.0.0.1:4174` y la interfaz Vite en
`http://localhost:5173` (abre esta última). El proxy de Vite reenvía `/api` al servidor.

La primera vez que abras la app se te pedirá crear la cuenta del primer perfil (nombre de
usuario, contraseña y, opcionalmente, datos de ejemplo).

## Acceso y seguridad

Cada perfil es una cuenta independiente y solo ve sus propios datos.

- **Contraseñas**: se guardan con `scrypt` (N=16384, r=8, p=1) y una sal aleatoria por
  cuenta; nunca se almacenan en claro ni se devuelven al cliente. Mínimo 8 caracteres, con
  letra y número, y sin poder contener el nombre de usuario.
- **Sesiones**: el token se genera con 32 bytes aleatorios y viaja en una cookie
  `finanzas_session` `HttpOnly`, `SameSite=Strict` y `Secure` cuando la conexión es HTTPS.
  En la base solo se guarda su hash SHA-256. Dura 12 horas, o 30 días si marcas
  «Mantener la sesión en este equipo».
- **2FA (TOTP)**: activable desde **Cuenta y seguridad**. Genera un secreto base32, muestra
  un código QR compatible con Google Authenticator, Authy o 1Password y entrega 8 códigos
  de recuperación de un solo uso (también descargables en `.txt`). El código se acepta en
  la ventana actual y las adyacentes (±30 s).
- **Bloqueo**: tras 5 fallos la cuenta se bloquea de forma progresiva (1, 2, 4, 8 y hasta
  15 minutos) y responde `429` con `Retry-After`. Además hay un tope de 40 intentos cada
  5 minutos por IP.
- **Aislamiento**: todas las rutas de datos exigen sesión y el servidor solo devuelve el
  perfil de esa sesión; pedir el perfil de otra cuenta responde `404`/`403`.
- **Cierre de sesión**: invalida el token en SQLite, borra la cookie y elimina el espejo
  local del navegador para que no queden datos visibles sin autenticarse.
- **Perfiles antiguos**: si la base ya tenía perfiles sin credenciales, al abrir la app se
  ofrece «reclamarlos» conservando sus movimientos. Un perfil se puede eliminar solo tras
  confirmar la contraseña de esa misma cuenta.

> El servidor escucha en `127.0.0.1` por defecto. Si lo expones en red, hazlo detrás de
> HTTPS (por ejemplo, un proxy inverso) para que la cookie viaje con `Secure`.

## Producción

```bash
npm run build
npm start
```

La interfaz compilada se sirve desde el mismo servidor en `http://127.0.0.1:4174`, con la
API bajo `/api`. No hace falta publicar `dist/` por separado.

### Variables de entorno

| Variable        | Por defecto            | Uso                                              |
| --------------- | ---------------------- | ------------------------------------------------ |
| `PORT`          | `4174`                 | Puerto de la API/estático.                       |
| `HOST`          | `127.0.0.1`            | Interfaz de red; usa `0.0.0.0` para otros equipos. |
| `FINANZAPRO_DB` | `data/finanzapro.db`   | Ruta del archivo SQLite.                         |
| `VITE_PORT`     | `5173`                 | Puerto de la interfaz en desarrollo.             |
| `VITE_API_URL`  | `/api`                 | URL base de la API usada por el cliente.          |

Ejemplo:

```bash
FINANZAPRO_DB=~/respaldos/finanzas.db PORT=4180 npm start
```

## Reportes

El botón **Reporte** del panel (junto al selector de período) abre un diálogo para descargar
el análisis del período seleccionado. El archivo se genera en el navegador: los datos no se
envían a ningún servicio externo.

- **PDF** (A4, listo para imprimir o compartir): encabezado con perfil, usuario, período y
  moneda; KPIs; gastos por categoría; evolución mensual de ingresos y gastos; presupuestos del
  mes; movimientos del período y numeración de páginas. Se genera con `jsPDF` +
  `jspdf-autotable`, que se cargan solo al pulsar «Descargar PDF» y no forman parte del
  paquete inicial.
- **CSV**: las mismas secciones en filas y columnas, con `sep=;`, BOM UTF-8 y coma decimal
  para abrir directamente en Excel o Google Sheets en español.
- El nombre del archivo incluye perfil, período y fecha, por ejemplo
  `finanzapro_ana_maria_reporte_month_2026-10-28.pdf`.
- En el PDF los importes usan el código ISO de la moneda (`CRC 1 234,56`), porque las fuentes
  estándar de PDF no incluyen símbolos como `₡`.

Los presupuestos son siempre mensuales, aunque el período del reporte sea diario, semanal o
anual. Las tablas cortas (categorías y presupuestos) no se parten entre páginas.

## Pruebas

```bash
npm test
```

Las pruebas cubren fechas, cálculos financieros, formato de moneda, presupuestos, datos de
ejemplo, validación de respaldos, perfiles, el espejo local, el repositorio SQLite
(aislamiento por perfil, saneamiento de datos y persistencia en archivo), las utilidades de
seguridad (scrypt, TOTP según la RFC 6238, códigos de recuperación y tokens de sesión), las
reglas de acceso del cliente y el reporte (resumen del período, CSV y documento PDF).

El flujo completo también se verificó con pruebas de extremo a extremo: alta y reclamo de
perfiles, login con contraseña y con 2FA, códigos de recuperación, cambio de contraseña,
permisos entre perfiles, bloqueo por intentos, cierre de sesión, alta/edición/borrado de
movimientos, exportación e importación de respaldos, descarga de reportes PDF y CSV en los
cinco períodos, modo sin conexión con resincronización y la vista móvil.

## Perfiles y persistencia

La app permite varios perfiles (por ejemplo, personal, trabajo o familia). Cada perfil tiene
su propio usuario y contraseña, y mantiene sus propios movimientos, moneda y presupuestos.

- Una sesión pertenece a un único perfil. Para usar otro perfil se cierra sesión y se
  introduce su contraseña (y su código 2FA si lo tiene activo).
- SQLite es la fuente de verdad. Cada guardado reemplaza de forma atómica los movimientos
  y ajustes del perfil dentro de una transacción.
- `localStorage` se conserva como **espejo y respaldo de emergencia** de la sesión activa.
  Si la API no está disponible, la app guarda los cambios en el navegador y los encola en
  `finanzapro.v3.pendingSync`.
- Al reconectar (botón **Reintentar**, al enfocar la ventana o cada 15 s) los cambios
  pendientes se envían a SQLite y la cola se limpia.
- Crear, renombrar o eliminar perfiles requiere conexión, para evitar conflictos de
  identidad entre el navegador y la base de datos.
- Al cerrar sesión se borra el espejo local, así que no quedan datos visibles sin acceso.
- Los cambios se sincronizan entre pestañas del mismo navegador mediante eventos de
  `localStorage`.
- Si los datos de un perfil están corruptos, se guarda una copia en cuarentena
  (`finanzapro.v3.user.<id>.corrupt.<timestamp>`) y el perfil arranca vacío.

### Base de datos

El archivo se crea en `data/finanzapro.db` (ignorado por git) con modo WAL y estas tablas:

- `profiles` — identificador, nombre, color y fecha de creación.
- `accounts` — credenciales de cada perfil: usuario normalizado único, hash `scrypt`, secreto
  TOTP, estado del 2FA, fallos acumulados y bloqueo.
- `sessions` — hash del token, perfil, caducidad y último uso.
- `recovery_codes` — hashes de los códigos de recuperación y cuándo se usaron.
- `settings` — moneda y meta de ahorro por perfil.
- `budgets` — presupuesto por categoría y perfil.
- `transactions` — movimientos; la clave primaria es `(profile_id, id)`, así que los
  identificadores solo deben ser únicos dentro de cada perfil.
- `app_meta` — preferencias globales, como el perfil activo.

### API

Todas las rutas salvo `health` y `auth/state` requieren sesión.

| Método   | Ruta                          | Descripción                                         |
| -------- | ----------------------------- | --------------------------------------------------- |
| `GET`    | `/api/health`                 | Estado del servidor y de la base.                   |
| `GET`    | `/api/auth/state`             | Perfiles y si hace falta configurar el primero.     |
| `POST`   | `/api/auth/setup`             | Crea el primer perfil con sus credenciales.         |
| `POST`   | `/api/auth/claim`             | Añade credenciales a un perfil antiguo.             |
| `POST`   | `/api/auth/login`             | Inicia sesión (contraseña + TOTP o recuperación).   |
| `POST`   | `/api/auth/logout`            | Cierra la sesión actual.                            |
| `GET`    | `/api/auth/session`           | Perfil, workspace y estado de la cuenta.            |
| `POST`   | `/api/auth/password`          | Cambia la contraseña y cierra las demás sesiones.   |
| `POST`   | `/api/auth/totp/setup`        | Genera el secreto y la URL `otpauth://`.            |
| `POST`   | `/api/auth/totp/enable`       | Confirma el código y entrega códigos de recuperación. |
| `POST`   | `/api/auth/totp/disable`      | Desactiva el 2FA con contraseña y código.           |
| `POST`   | `/api/auth/recovery-codes`    | Regenera los códigos de recuperación.               |
| `POST`   | `/api/profiles`               | Crea un perfil protegido e inicia su sesión.        |
| `PATCH`  | `/api/profiles/:id`           | Renombra el perfil de la sesión.                    |
| `DELETE` | `/api/profiles/:id`           | Elimina el perfil de la sesión (pide contraseña).   |
| `GET`    | `/api/profiles/:id/data`      | Datos del perfil de la sesión.                      |
| `PUT`    | `/api/profiles/:id/data`      | Guarda movimientos y ajustes.                       |

### Respaldos

- **Ajustes → Exportar respaldo** genera un JSON con el perfil activo (o CSV del historial).
- Para respaldar toda la base con el servidor en marcha:

  ```bash
  sqlite3 data/finanzapro.db ".backup 'finanzapro-respaldo.db'"
  ```

- También puedes detener el servidor y copiar `data/finanzapro.db` junto con sus archivos
  `finanzapro.db-wal` y `finanzapro.db-shm`, si existen.
- Para restaurar, detén el servidor y reemplaza el archivo de la base por el respaldo.

## Tecnologías

React 18 · TypeScript · Vite · Tailwind CSS · Recharts · Lucide Icons · Express 5 ·
SQLite (`node:sqlite`) · scrypt y TOTP (`node:crypto`) · `qrcode.react` · `jsPDF` y
`jspdf-autotable` (carga diferida para los reportes).

## Estructura

```
server/
├── auth.mjs            # scrypt, TOTP, códigos de recuperación y sesiones
├── auth.test.mjs       # Pruebas de criptografía y TOTP
├── db.mjs              # Esquema, validación y repositorio SQLite
├── db.test.mjs         # Pruebas del repositorio
└── index.mjs           # API Express, autenticación y estáticos

scripts/
└── dev.mjs             # Arranca API + Vite en desarrollo

src/
├── components/         # UI: acceso, seguridad, tarjetas, formularios, gráficos
├── data/               # Categorías, monedas y datos de ejemplo
├── hooks/              # Sesión, estado financiero e hidratación desde SQLite
├── lib/                # Fechas, formato, cálculos, API, reportes PDF/CSV y almacenamiento local
├── App.tsx             # Composición y control de acceso
├── main.tsx            # Punto de entrada
└── index.css           # Tailwind + utilidades
```

## Notas

- El servidor escucha solo en `127.0.0.1` por defecto. Si lo expones en red, usa HTTPS y
  revisa el bloqueo de intentos y la cookie `Secure`.
- El respaldo JSON incluye el nombre del perfil exportado, sus transacciones y sus
  preferencias; también es compatible con el formato de sólo transacciones (arreglo JSON).
  No incluye contraseñas ni secretos 2FA.
- Exporta un respaldo periódicamente: el espejo del navegador no sustituye a una copia de
  la base de datos.
- Si olvidas la contraseña de un perfil no hay recuperación automática: los datos siguen en
  SQLite y puedes restaurar un respaldo, pero no se puede revertir el hash.
