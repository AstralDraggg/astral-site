/**
 * Единая Vercel-функция для всех маршрутов /api/*.
 *
 * Vercel разбирает JSON-тело запроса ещё до вызова функции, а сервер читает
 * «сырой» поток байтов — поэтому тело подменяется на уже готовые байты.
 */
import { nodeHandler } from '../backend/dist/server.js';

export default async function handler(req, res) {
  let raw = Buffer.alloc(0);

  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.rawBody)) {
      raw = req.rawBody;
    } else if (typeof req.rawBody === 'string') {
      raw = Buffer.from(req.rawBody);
    } else if (typeof req.body === 'string') {
      raw = Buffer.from(req.body);
    } else {
      raw = Buffer.from(JSON.stringify(req.body));
    }
  }

  req[Symbol.asyncIterator] = function* asyncIterator() {
    if (raw.length > 0) {
      yield raw;
    }
  };

  await nodeHandler(req, res);
}
