// Клиентская половина проверки при входе на сайт.
//
// Браузер берёт задание у сервера, подбирает решение (proof-of-work) и
// отправляет его обратно. Сервер ставит подписанный куки, после чего
// браузерные запросы API проходят. Скрипт без JS это сделать не может,
// а скрипту с JS приходится тратить процессор.

const STORAGE_KEY = 'astral_gate_ok';
// За час до истечения куки заново пропускаем проверку, чтобы не словить 403
// посреди долгой сессии.
const GRACE_MS = 60 * 60_000;

type Challenge = { nonce: string; ts: number; difficulty: number };

/** Проверка уже пройдена и куки ещё живой? */
export function gatePassed(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return false;
    }

    const exp = Number(raw);
    return Number.isFinite(exp) && exp - GRACE_MS > Date.now();
  } catch {
    return false;
  }
}

function remember(exp: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(exp));
  } catch {
    // приватный режим — проверка просто пройдёт заново при следующем заходе
  }
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);

  let hex = '';
  for (const byte of new Uint8Array(digest)) {
    hex += byte.toString(16).padStart(2, '0');
  }

  return hex;
}

const CHUNK = 400;

/** Подбирает счётчик, пока хеш не начнётся на нужное число нулей. */
async function solve(challenge: Challenge, onProgress: (value: number) => void): Promise<number> {
  const zeros = '0'.repeat(challenge.difficulty);
  // Среднее число попыток — по шестнадцать на каждый лишний ноль в начале хеша.
  const expected = 16 ** challenge.difficulty;
  let counter = 0;
  let sinceYield = 0;

  for (;;) {
    const hex = await sha256Hex(`${challenge.nonce}:${counter}`);
    if (hex.startsWith(zeros)) {
      onProgress(1);
      return counter;
    }

    counter += 1;
    sinceYield += 1;

    if (sinceYield >= CHUNK) {
      sinceYield = 0;
      // Отдаём кадр браузеру, иначе страница намертво виснет на проверке.
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      onProgress(Math.min(0.97, counter / expected));
    }
  }
}

/** Полный цикл проверки: задание -> решение -> куки у сервера. */
export async function runGate(onProgress: (value: number) => void): Promise<void> {
  const challengeResponse = await fetch('/api/gate/challenge', {
    headers: { Accept: 'application/json' },
  });

  if (!challengeResponse.ok) {
    throw new Error(
      challengeResponse.status === 429
        ? 'Слишком много попыток. Подождите минуту и обновите страницу.'
        : 'Не удалось начать проверку. Обновите страницу.',
    );
  }

  const challenge = (await challengeResponse.json()) as Challenge;
  const counter = await solve(challenge, onProgress);

  const verifyResponse = await fetch('/api/gate/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ ...challenge, counter }),
  });

  if (!verifyResponse.ok) {
    const data = (await verifyResponse.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Проверка не пройдена. Обновите страницу.');
  }

  const data = (await verifyResponse.json().catch(() => ({}))) as { maxAge?: number };
  remember(Date.now() + (data.maxAge ?? 6 * 60 * 60_000));
}
