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
- Persistencia en SQLite con guardado atómico por perfil y espejo local en el navegador.
- Modo sin conexión: si el servidor no responde, la app sigue funcionando con la copia local
  y sincroniza automáticamente los cambios al reconectar.
- Exportación JSON/CSV, importación de respaldos.
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

## Pruebas

```bash
npm test
```

Las pruebas cubren fechas, cálculos financieros, formato de moneda, presupuestos, datos de
ejemplo, validación de respaldos, perfiles, el espejo local y el repositorio SQLite
(aislamiento por perfil, saneamiento de datos y persistencia en archivo).

El flujo completo también se verificó con pruebas de extremo a extremo: alta, edición,
borrado y deshacer movimientos; cambio de moneda; creación, renombrado y borrado de
perfiles; exportación e importación de respaldos; modo sin conexión con resincronización;
y la vista móvil.

## Perfiles y persistencia

La app permite varios perfiles (por ejemplo, personal, trabajo o familia). Cada perfil
mantiene sus propios movimientos, moneda y presupuestos; al cambiar de perfil se cargan
sus datos y el resto queda intacto.

- SQLite es la fuente de verdad. Cada guardado reemplaza de forma atómica los movimientos
  y ajustes del perfil dentro de una transacción.
- `localStorage` se conserva como **espejo y respaldo de emergencia**. Si la API no está
  disponible, la app arranca en «Modo local», guarda los cambios en el navegador y los
  encola en `finanzapro.v3.pendingSync`.
- Al reconectar (botón **Reintentar**, al enfocar la ventana o cada 15 s) los perfiles
  pendientes se envían a SQLite y la cola se limpia.
- Crear, renombrar o eliminar perfiles requiere conexión, para evitar conflictos de
  identidad entre el navegador y la base de datos.
- Los cambios se sincronizan entre pestañas del mismo navegador mediante eventos de
  `localStorage`.
- Al actualizar desde la versión anterior, los datos de `finanzapro.v2.*` se migran
  automáticamente a SQLite (perfil «Mi cuenta») la primera vez que se conecta.
- Si los datos de un perfil están corruptos, se guarda una copia en cuarentena
  (`finanzapro.v3.user.<id>.corrupt.<timestamp>`) y el perfil arranca vacío.

### Base de datos

El archivo se crea en `data/finanzapro.db` (ignorado por git) con modo WAL y estas tablas:

- `profiles` — identificador, nombre, color y fecha de creación.
- `settings` — moneda y meta de ahorro por perfil.
- `budgets` — presupuesto por categoría y perfil.
- `transactions` — movimientos; la clave primaria es `(profile_id, id)`, así que los
  identificadores solo deben ser únicos dentro de cada perfil.
- `app_meta` — preferencias globales, como el perfil activo.

### API

| Método   | Ruta                     | Descripción                          |
| -------- | ------------------------ | ------------------------------------ |
| `GET`    | `/api/health`            | Estado del servidor y de la base.    |
| `GET`    | `/api/session`           | Perfiles, perfil activo y sus datos. |
| `POST`   | `/api/profiles`          | Crea un perfil.                      |
| `PATCH`  | `/api/profiles/:id`      | Renombra un perfil.                  |
| `DELETE` | `/api/profiles/:id`      | Elimina un perfil (nunca el último). |
| `PUT`    | `/api/active-profile`    | Cambia el perfil activo.             |
| `GET`    | `/api/profiles/:id/data` | Datos de un perfil.                  |
| `PUT`    | `/api/profiles/:id/data` | Guarda movimientos y ajustes.        |
| `POST`   | `/api/import`            | Importa un workspace si la base está vacía. |

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
SQLite (`node:sqlite`).

## Estructura

```
server/
├── db.mjs              # Esquema, validación y repositorio SQLite
├── db.test.mjs         # Pruebas del repositorio
└── index.mjs           # API Express y servicio de archivos estáticos

scripts/
└── dev.mjs             # Arranca API + Vite en desarrollo

src/
├── components/         # UI: tarjetas, formularios, gráficos, modales
├── data/               # Categorías, monedas y datos de ejemplo
├── hooks/              # Estado, hidratación desde SQLite y sincronización
├── lib/                # Fechas, formato, cálculos, API y almacenamiento local
├── App.tsx             # Composición de la aplicación
├── main.tsx            # Punto de entrada
└── index.css           # Tailwind + utilidades
```

## Notas

- El servidor escucha solo en `127.0.0.1` por defecto. No hay autenticación: si lo expones
  en red, cualquiera con acceso puede leer y modificar los datos.
- El respaldo JSON incluye el nombre del perfil exportado, sus transacciones y sus
  preferencias; también es compatible con el formato de sólo transacciones (arreglo JSON).
- Exporta un respaldo periódicamente: el espejo del navegador no sustituye a una copia de
  la base de datos.
