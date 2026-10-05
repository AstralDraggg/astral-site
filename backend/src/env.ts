/**
 * Читает .env из корня проекта и из backend/.env.
 *
 * Нужен только для локальной разработки: переменные окружения на Vercel
 * задаются в дашборде. Уже заданные переменные не перезаписываются.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// backend/dist/env.js -> корень репозитория и папка backend
const candidates = [path.resolve(moduleDir, '..', '..', '.env'), path.resolve(moduleDir, '..', '.env')];

for (const file of candidates) {
  if (!existsSync(file)) {
    continue;
  }

  const content = readFileSync(file, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim().replace(/^export\s+/, '');
    let value = line.slice(separator + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
