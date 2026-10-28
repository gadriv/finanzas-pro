import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, createRepository } from './db.mjs';
import * as auth from './auth.mjs';

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

app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/* ------------------------------------------------------------------ */
/* Cookies y sesiones                                                  */
/* ------------------------------------------------------------------ */

function parseCookies(header) {
  const cookies = {};
  if (typeof header !== 'string') return cookies;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    const raw = part.slice(index + 1).trim();
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }
  return cookies;
}

function isSecureRequest(req) {
  return req.secure || req.get('x-forwarded-proto') === 'https';
}

function setSessionCookie(req, res, token, maxAgeSeconds) {
  const parts = [
    `${auth.SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req, res) {
  const parts = [
    `${auth.SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function readSession(req) {
  const token = parseCookies(req.headers.cookie)[auth.SESSION_COOKIE];
  if (!token) return null;

  const tokenHash = auth.hashSessionToken(token);
  const session = repository.getSession(tokenHash);
  if (!session) return null;

  return { ...session, tokenHash };
}

function requireAuth(req, res, next) {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({
      error: 'Inicia sesión para continuar.',
      code: 'unauthorized',
    });
    return;
  }
  req.session = session;
  next();
}

function startSession(req, res, profileId, remember) {
  const token = auth.generateSessionToken();
  const ttl = remember ? auth.REMEMBER_TTL_MS : auth.SESSION_TTL_MS;
  repository.createSession({
    tokenHash: auth.hashSessionToken(token),
    profileId,
    ttlMs: ttl,
  });
  setSessionCookie(req, res, token, Math.floor(ttl / 1000));
}

function authPayload(profileId) {
  const workspace = repository.getWorkspaceForProfile(profileId);
  const account = repository.getAccount(profileId);
  return {
    user: workspace.users[0],
    workspace,
    account: {
      username: account?.username ?? '',
      totpEnabled: Boolean(account?.totpEnabled),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Límite de intentos por IP (además del bloqueo por cuenta)           */
/* ------------------------------------------------------------------ */

const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 40;
const loginAttempts = new Map();

function checkLoginBudget(req) {
  const key = req.ip ?? 'local';
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }

  entry.count += 1;
  if (entry.count > LOGIN_MAX_ATTEMPTS) {
    throw new HttpError(
      429,
      'Demasiados intentos de acceso desde este equipo. Espera unos minutos.',
    );
  }
}

function ensureNotLocked(account, res) {
  const now = Date.now();
  if (account.lockedUntil <= now) return;

  const seconds = Math.ceil((account.lockedUntil - now) / 1000);
  res.setHeader('Retry-After', String(seconds));
  const minutes = Math.ceil(seconds / 60);
  throw new HttpError(
    429,
    `La cuenta está bloqueada por intentos fallidos. Intenta de nuevo en ${minutes} minuto(s).`,
  );
}

async function registerFailure(account, res, message = 'Usuario o contraseña incorrectos.') {
  const { lockedUntil } = repository.registerFailedAttempt(account.profileId);
  if (lockedUntil > 0) {
    res.setHeader('Retry-After', String(Math.ceil((lockedUntil - Date.now()) / 1000)));
    throw new HttpError(
      429,
      'Demasiados intentos fallidos. La cuenta se bloqueó temporalmente.',
    );
  }
  throw new HttpError(401, message);
}

/* ------------------------------------------------------------------ */
/* Rutas públicas                                                      */
/* ------------------------------------------------------------------ */

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    database: 'sqlite',
    file: path.basename(databasePath),
    profiles: repository.countProfiles(),
    auth: 'sessions',
  });
});

app.get('/api/auth/state', (_req, res) => {
  const profiles = repository.listAccountSummaries().map((profile) => ({
    id: profile.id,
    name: profile.name,
    color: profile.color,
    username: profile.username,
    hasPassword: profile.hasPassword,
    totpEnabled: profile.totpEnabled,
    lockedUntil: profile.lockedUntil,
  }));
  res.json({ needsSetup: profiles.length === 0, profiles });
});

app.post(
  '/api/auth/setup',
  asyncRoute(async (req, res) => {
    checkLoginBudget(req);

    if (repository.countProfiles() > 0) {
      throw new HttpError(409, 'Ya existe una cuenta configurada en este equipo.');
    }

    const { name, username, password, data } = req.body ?? {};
    const cleanUsername = auth.sanitizeUsername(username);
    if (!cleanUsername) {
      throw new HttpError(
        400,
        'El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.',
      );
    }

    const passwordError = auth.validatePassword(password, cleanUsername);
    if (passwordError) throw new HttpError(400, passwordError);

    const passwordHash = await auth.hashPassword(password);
    const profile = repository.createProfileWithAccount({
      name,
      username: cleanUsername,
      usernameNorm: auth.usernameKey(cleanUsername),
      passwordHash,
      data: data && typeof data === 'object' ? data : undefined,
    });

    startSession(req, res, profile.id, false);
    res.status(201).json(authPayload(profile.id));
  }),
);

app.post(
  '/api/auth/claim',
  asyncRoute(async (req, res) => {
    checkLoginBudget(req);

    const { profileId, username, password } = req.body ?? {};
    const summary = repository
      .listAccountSummaries()
      .find((profile) => profile.id === profileId);

    if (!summary) throw new HttpError(404, 'Perfil no encontrado.');
    if (summary.hasPassword) {
      throw new HttpError(409, 'Ese perfil ya tiene credenciales de acceso.');
    }

    const cleanUsername = auth.sanitizeUsername(username);
    if (!cleanUsername) {
      throw new HttpError(
        400,
        'El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.',
      );
    }

    const passwordError = auth.validatePassword(password, cleanUsername);
    if (passwordError) throw new HttpError(400, passwordError);

    const passwordHash = await auth.hashPassword(password);
    repository.createAccount({
      profileId,
      username: cleanUsername,
      usernameNorm: auth.usernameKey(cleanUsername),
      passwordHash,
    });

    startSession(req, res, profileId, false);
    res.status(201).json(authPayload(profileId));
  }),
);

app.post(
  '/api/auth/login',
  asyncRoute(async (req, res) => {
    checkLoginBudget(req);

    const { username, password, code, recoveryCode, remember } = req.body ?? {};
    const usernameNorm = auth.usernameKey(username);
    const account = usernameNorm
      ? repository.getAccountByUsername(usernameNorm)
      : null;

    if (!account) {
      // Mantiene un tiempo de respuesta parecido al de una cuenta real.
      await auth.sleep(120);
      throw new HttpError(401, 'Usuario o contraseña incorrectos.');
    }

    ensureNotLocked(account, res);

    const validPassword = await auth.verifyPassword(password, account.passwordHash);
    if (!validPassword) {
      await registerFailure(account, res);
    }

    if (account.totpEnabled) {
      if (typeof recoveryCode === 'string' && recoveryCode.trim()) {
        const used = repository.consumeRecoveryCode(
          account.profileId,
          auth.hashRecoveryCode(recoveryCode),
        );
        if (!used) {
          await registerFailure(
            account,
            res,
            'El código de recuperación no es válido o ya se usó.',
          );
        }
      } else if (!code) {
        throw new HttpError(
          401,
          'Introduce el código de verificación de tu aplicación autenticadora.',
        );
      } else if (!auth.verifyTotp(account.totpSecret, String(code))) {
        await registerFailure(account, res, 'Código de verificación incorrecto.');
      }
    }

    repository.resetFailedAttempts(account.profileId);
    startSession(req, res, account.profileId, Boolean(remember));
    res.json(authPayload(account.profileId));
  }),
);

app.post('/api/auth/logout', (req, res) => {
  const session = readSession(req);
  if (session) repository.deleteSession(session.tokenHash);
  clearSessionCookie(req, res);
  res.status(204).end();
});

/* ------------------------------------------------------------------ */
/* Rutas protegidas                                                    */
/* ------------------------------------------------------------------ */

app.get('/api/auth/session', requireAuth, (req, res) => {
  res.json(authPayload(req.session.profileId));
});

app.post(
  '/api/auth/password',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    const account = repository.getAccount(req.session.profileId);
    if (!account) throw new HttpError(404, 'Cuenta no encontrada.');

    const valid = await auth.verifyPassword(currentPassword, account.passwordHash);
    if (!valid) throw new HttpError(400, 'La contraseña actual no es correcta.');
    if (currentPassword === newPassword) {
      throw new HttpError(400, 'La nueva contraseña debe ser diferente a la actual.');
    }

    const passwordError = auth.validatePassword(newPassword, account.username);
    if (passwordError) throw new HttpError(400, passwordError);

    const passwordHash = await auth.hashPassword(newPassword);
    repository.setPassword(account.profileId, passwordHash);
    // Cierra las demás sesiones y conserva la actual.
    repository.deleteOtherSessions(account.profileId, req.session.tokenHash);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/auth/totp/setup',
  requireAuth,
  asyncRoute(async (req, res) => {
    const account = repository.getAccount(req.session.profileId);
    if (!account) throw new HttpError(404, 'Cuenta no encontrada.');

    const valid = await auth.verifyPassword(req.body?.password, account.passwordHash);
    if (!valid) throw new HttpError(400, 'La contraseña no es correcta.');
    if (account.totpEnabled) {
      throw new HttpError(409, 'El doble factor ya está activo.');
    }

    const secret = auth.generateTotpSecret();
    repository.setPendingTotp(account.profileId, secret);
    res.json({
      secret,
      otpauthUrl: auth.otpauthUrl({ secret, username: account.username }),
    });
  }),
);

app.post('/api/auth/totp/enable', requireAuth, (req, res) => {
  const account = repository.getAccount(req.session.profileId);
  if (!account) throw new HttpError(404, 'Cuenta no encontrada.');
  if (account.totpEnabled) throw new HttpError(409, 'El doble factor ya está activo.');
  if (!account.totpPendingSecret) {
    throw new HttpError(400, 'Primero inicia la configuración del doble factor.');
  }

  const code = String(req.body?.code ?? '');
  if (!auth.verifyTotp(account.totpPendingSecret, code)) {
    throw new HttpError(400, 'El código no es válido. Revisa la hora de tu dispositivo.');
  }

  repository.enableTotp(account.profileId);
  const codes = auth.generateRecoveryCodes(8);
  repository.replaceRecoveryCodes(
    account.profileId,
    codes.map((item) => item.hash),
  );

  res.json({ recoveryCodes: codes.map((item) => item.code) });
});

app.post(
  '/api/auth/totp/disable',
  requireAuth,
  asyncRoute(async (req, res) => {
    const account = repository.getAccount(req.session.profileId);
    if (!account) throw new HttpError(404, 'Cuenta no encontrada.');
    if (!account.totpEnabled) {
      throw new HttpError(409, 'El doble factor no está activo.');
    }

    const valid = await auth.verifyPassword(req.body?.password, account.passwordHash);
    if (!valid) throw new HttpError(400, 'La contraseña no es correcta.');
    if (!auth.verifyTotp(account.totpSecret, String(req.body?.code ?? ''))) {
      throw new HttpError(400, 'El código de verificación no es válido.');
    }

    repository.disableTotp(account.profileId);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/auth/recovery-codes',
  requireAuth,
  asyncRoute(async (req, res) => {
    const account = repository.getAccount(req.session.profileId);
    if (!account) throw new HttpError(404, 'Cuenta no encontrada.');
    if (!account.totpEnabled) {
      throw new HttpError(409, 'El doble factor no está activo.');
    }

    const valid = await auth.verifyPassword(req.body?.password, account.passwordHash);
    if (!valid) throw new HttpError(400, 'La contraseña no es correcta.');

    const codes = auth.generateRecoveryCodes(8);
    repository.replaceRecoveryCodes(
      account.profileId,
      codes.map((item) => item.hash),
    );
    res.json({ recoveryCodes: codes.map((item) => item.code) });
  }),
);

app.post(
  '/api/profiles',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { name, color, username, password } = req.body ?? {};
    const cleanUsername = auth.sanitizeUsername(username);
    if (!cleanUsername) {
      throw new HttpError(
        400,
        'El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.',
      );
    }

    const passwordError = auth.validatePassword(password, cleanUsername);
    if (passwordError) throw new HttpError(400, passwordError);

    const passwordHash = await auth.hashPassword(password);
    const profile = repository.createProfileWithAccount({
      name,
      color,
      username: cleanUsername,
      usernameNorm: auth.usernameKey(cleanUsername),
      passwordHash,
    });

    startSession(req, res, profile.id, false);
    res.status(201).json(authPayload(profile.id));
  }),
);

app.patch('/api/profiles/:id', requireAuth, (req, res) => {
  if (req.params.id !== req.session.profileId) {
    throw new HttpError(403, 'Solo puedes cambiar tu propio perfil.');
  }
  const user = repository.renameProfile(req.params.id, req.body?.name);
  res.json({ user });
});

app.delete(
  '/api/profiles/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    if (req.params.id !== req.session.profileId) {
      throw new HttpError(403, 'Solo puedes eliminar tu propio perfil.');
    }

    const account = repository.getAccount(req.session.profileId);
    if (!account) throw new HttpError(404, 'Cuenta no encontrada.');

    const valid = await auth.verifyPassword(req.body?.password, account.passwordHash);
    if (!valid) throw new HttpError(400, 'La contraseña no es correcta.');

    repository.deleteProfileAccount(req.session.profileId);
    clearSessionCookie(req, res);
    res.status(204).end();
  }),
);

app.get('/api/profiles/:id/data', requireAuth, (req, res) => {
  if (req.params.id !== req.session.profileId) {
    throw new HttpError(404, 'Perfil no encontrado.');
  }
  res.json(repository.getProfileData(req.params.id));
});

app.put('/api/profiles/:id/data', requireAuth, (req, res) => {
  if (req.params.id !== req.session.profileId) {
    throw new HttpError(404, 'Perfil no encontrado.');
  }
  const result = repository.saveProfileData(req.params.id, req.body ?? {});
  res.json(result);
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta de API no encontrada.' });
});

/* ------------------------------------------------------------------ */
/* Interfaz compilada                                                  */
/* ------------------------------------------------------------------ */

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
    res.status(error.status).json({
      error: error.message,
      code:
        error.status === 401
          ? 'unauthorized'
          : error.status === 429
            ? 'rate_limited'
            : undefined,
    });
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
