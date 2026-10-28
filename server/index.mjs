import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, createRepository } from './db.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const port = Number(process.env.PORT ?? 4174);
const host = process.env.HOST ?? '127.0.0.1';
const databasePath =
  process.env.FINANZAPRO_DB ?? path.join(root, 'data', 'finanzapro.db');

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const repository = createRepository(databasePath);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    database: 'sqlite',
    file: path.basename(databasePath),
    profiles: repository.countProfiles(),
  });
});

app.get('/api/session', (_req, res) => {
  res.json(repository.getWorkspace());
});

app.post('/api/profiles', (req, res) => {
  const user = repository.createProfile(req.body ?? {});
  res.status(201).json({ user });
});

app.patch('/api/profiles/:id', (req, res) => {
  const user = repository.renameProfile(req.params.id, req.body?.name);
  res.json({ user });
});

app.delete('/api/profiles/:id', (req, res) => {
  repository.deleteProfile(req.params.id);
  res.json(repository.getWorkspace());
});

app.put('/api/active-profile', (req, res) => {
  const activeUserId = repository.setActiveUserId(req.body?.userId);
  res.json({ activeUserId });
});

app.get('/api/profiles/:id/data', (req, res) => {
  res.json(repository.getProfileData(req.params.id));
});

app.put('/api/profiles/:id/data', (req, res) => {
  const result = repository.saveProfileData(req.params.id, req.body ?? {});
  res.json(result);
});

app.post('/api/import', (req, res) => {
  const workspace = repository.importWorkspace(req.body ?? {});
  res.status(201).json(workspace);
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta de API no encontrada.' });
});

const distPath = path.join(root, 'dist');
const indexFile = path.join(distPath, 'index.html');

if (fs.existsSync(indexFile)) {
  app.use(express.static(distPath, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(indexFile);
  });
} else {
  app.get('/', (_req, res) => {
    res
      .type('text/plain')
      .send(
        'API SQLite activa. Ejecuta "npm run dev" para la interfaz de desarrollo o "npm run build" para producción.',
      );
  });
}

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;

  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido.' });
    return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: 'La solicitud es demasiado grande.' });
    return;
  }

  console.error('Error inesperado del servidor SQLite:', error);
  res.status(500).json({ error: 'Error interno del servidor SQLite.' });
});

const server = app.listen(port, host, () => {
  console.log(`SQLite listo en http://${host}:${port}`);
  console.log(`Base de datos: ${databasePath}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `El puerto ${port} ya está en uso. Detén el otro proceso o usa PORT=otro-puerto.`,
    );
  } else {
    console.error('No se pudo iniciar el servidor SQLite:', error);
  }
  repository.close();
  process.exit(1);
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => {
    repository.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
