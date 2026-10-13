import nodemailer from 'nodemailer';
import type { EmailMessage } from './subscriptions.email.js';

/** 寄信的介面；寄送失敗時 reject，由呼叫端記錄並重試。 */
export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

const DEFAULT_FROM = 'EVENTOU <no-reply@eventou.local>';

/** 未設定 SMTP 時使用：只把信件印在主控台，方便本機開發，不會真的寄出。 */
export const consoleMailer: Mailer = {
  async send(message) {
    console.log(`[notifications] (未設定 SMTP，僅顯示) 收件者：${message.to}`);
    console.log(`[notifications] 主旨：${message.subject}\n${message.text}`);
  },
};

/**
 * 依環境變數建立寄信方式：有 SMTP_HOST 時透過 SMTP 寄送，否則只印在主控台。
 * SMTP_PORT 預設 587；SMTP_SECURE=true 時使用 TLS 連線（通常是 465）。
 */
export function createMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const host = env.SMTP_HOST;
  if (!host) return consoleMailer;
  const transport = nodemailer.createTransport({
    host,
    port: Number(env.SMTP_PORT ?? 587),
    secure: env.SMTP_SECURE === 'true',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
  });
  const from = env.MAIL_FROM ?? DEFAULT_FROM;
  return {
    async send(message) {
      await transport.sendMail({ from, ...message });
    },
  };
}
