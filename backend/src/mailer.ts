/**
 * Отправка кодов подтверждения на почту.
 *
 * Два способа, выбираются по переменным окружения:
 *
 *  1) SMTP — письма идут с твоего почтового ящика (Gmail, Yandex, Mail.ru).
 *     Нужны SMTP_HOST, SMTP_USER, SMTP_PASS (пароль приложения).
 *     Работает без своего домена.
 *
 *  2) Resend (https://resend.com) — требует верифицированный домен,
 *     нужен RESEND_API_KEY и EMAIL_FROM вида "Astral <noreply@ваш-домен>".
 *
 * Если ничего не настроено (локальная разработка): письмо не уходит, код
 * пишется в лог сервера и возвращается в ответе как devCode.
 */
import nodemailer from 'nodemailer';

const REQUEST_TIMEOUT_MS = 10_000;

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function resendKey(): string {
  return process.env.RESEND_API_KEY ?? '';
}

export type CodePurpose = 'register' | 'reset';

export function isMailerConfigured(): boolean {
  return smtpConfigured() || resendKey().length > 0;
}

/** Можно ли вернуть код прямо в ответе (только локально / вне продакшена). */
export function devCodesAllowed(): boolean {
  if (isMailerConfigured()) {
    return false;
  }

  return process.env.ALLOW_DEV_CODES === 'true' || process.env.NODE_ENV !== 'production';
}

function fromAddress(): string {
  if (process.env.EMAIL_FROM) {
    return process.env.EMAIL_FROM;
  }

  if (smtpConfigured()) {
    return `Astral <${process.env.SMTP_USER}>`;
  }

  return 'Astral <onboarding@resend.dev>';
}

const subjects: Record<CodePurpose, string> = {
  register: 'Код подтверждения регистрации — Astral',
  reset: 'Код для сброса пароля — Astral',
};

function buildText(code: string, purpose: CodePurpose): string {
  if (purpose === 'register') {
    return [
      'Привет!',
      '',
      `Код подтверждения регистрации в Astral: ${code}`,
      '',
      'Он действует 10 минут. Если это были не вы — просто игнорируйте письмо.',
    ].join('\n');
  }

  return [
    'Привет!',
    '',
    `Код для сброса пароля в Astral: ${code}`,
    '',
    'Он действует 10 минут. Если сброс пароля запускали не вы — ничего не делайте.',
  ].join('\n');
}

function buildHtml(code: string, purpose: CodePurpose): string {
  const title = purpose === 'register' ? 'Подтверждение регистрации' : 'Сброс пароля';

  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#0b0b12;padding:32px;color:#e8e8f0">',
    `<h2 style="margin:0 0 16px;font-size:20px">${title} — Astral</h2>`,
    '<p style="margin:0 0 12px;font-size:15px">Ваш код подтверждения:</p>',
    `<div style="font-size:32px;letter-spacing:8px;font-weight:bold;background:#151522;border:1px solid #2a2a3d;border-radius:12px;padding:16px 24px;display:inline-block">${code}</div>`,
    '<p style="margin:16px 0 0;font-size:13px;color:#9a9ab0">Код действует 10 минут. Если это были не вы — просто игнорируйте письмо.</p>',
    '</div>',
  ].join('');
}

async function sendViaSmtp(to: string, subject: string, text: string, html: string): Promise<void> {
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER ?? '';
  const pass = process.env.SMTP_PASS ?? '';

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? '',
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transport.sendMail({ from: fromAddress(), to, subject, text, html });
}

async function sendViaResend(to: string, subject: string, text: string, html: string): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject,
      text,
      html,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend ${response.status}: ${detail}`);
  }
}

/** Бросает ошибку, если письмо не ушло. */
export async function sendVerificationCode(to: string, code: string, purpose: CodePurpose): Promise<void> {
  const subject = subjects[purpose];
  const text = buildText(code, purpose);
  const html = buildHtml(code, purpose);

  if (smtpConfigured()) {
    await sendViaSmtp(to, subject, text, html);
    return;
  }

  if (resendKey()) {
    await sendViaResend(to, subject, text, html);
    return;
  }

  console.log(`[astral] Код для ${to} (${purpose}): ${code}`);
}
