import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { DEFAULT_LOCALE, t, type Locale } from './i18n.js';
import { logger } from './logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } } : {}),
  });

  return transporter;
}

/**
 * Sends mail, or logs it when running tests. Callers treat delivery as
 * best-effort: an unreachable SMTP host must never fail the request that
 * triggered the message.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (env.isTest) {
    sentInTests.push(message);
    return true;
  }

  try {
    await getTransporter().sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
    logger.debug({ to: message.to, subject: message.subject }, 'Email sent');
    return true;
  } catch (err) {
    logger.error({ err, to: message.to, subject: message.subject }, 'Email delivery failed');
    return false;
  }
}

/** Test-only outbox so integration tests can assert on what was sent. */
export const sentInTests: EmailMessage[] = [];

function layout(locale: Locale, title: string, bodyLines: string[], action?: { label: string; url: string }): string {
  const paragraphs = bodyLines.map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`).join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${action.url}" style="background:#1971C2;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(action.label)}</a></p>
       <p style="margin:0;font-size:12px;color:#666">${escapeHtml(t(locale, 'email.linkFallback'))}<br>${action.url}</p>`
    : '';

  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#222;line-height:1.5;padding:24px">
    <h2 style="margin:0 0 16px">${escapeHtml(title)}</h2>${paragraphs}${button}
  </body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function invitationEmail(params: {
  to: string;
  inviterName: string;
  workspaceName: string;
  role: string;
  acceptUrl: string;
  expiresInDays: number;
  /** The inviter's own language, since the recipient has no account yet to have a preference of their own. */
  locale?: Locale;
}): EmailMessage {
  const locale = params.locale ?? DEFAULT_LOCALE;
  const role = t(locale, `common.role.${params.role}`);
  const action = t(locale, 'email.invitation.action');
  const lines = [
    t(locale, 'email.invitation.body1', { inviter: params.inviterName, workspace: params.workspaceName, role }),
    t(locale, 'email.invitation.body2', { count: params.expiresInDays }),
  ];

  return {
    to: params.to,
    subject: t(locale, 'email.invitation.subject', { inviter: params.inviterName, workspace: params.workspaceName }),
    text: `${lines.join('\n\n')}\n\n${action}: ${params.acceptUrl}`,
    html: layout(locale, t(locale, 'email.invitation.greeting'), lines, { label: action, url: params.acceptUrl }),
  };
}

export function notificationEmail(params: {
  to: string;
  fullName: string;
  title: string;
  message: string;
  url?: string;
  /** The recipient's own stored preference — see `pendingDeliveries` in `modules/notifications/service.ts`. */
  locale?: Locale;
}): EmailMessage {
  const locale = params.locale ?? DEFAULT_LOCALE;
  const action = t(locale, 'email.notification.action');
  const lines = [t(locale, 'email.notification.greeting', { name: params.fullName }), params.message];

  return {
    to: params.to,
    subject: params.title,
    text: `${lines.join('\n\n')}${params.url ? `\n\n${action}: ${params.url}` : ''}`,
    html: layout(locale, params.title, lines, params.url ? { label: action, url: params.url } : undefined),
  };
}
