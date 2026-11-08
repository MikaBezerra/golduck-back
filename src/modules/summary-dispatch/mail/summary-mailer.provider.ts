import type { Config } from '../../common/index.js';
import nodemailer from 'nodemailer';

import { Service } from '../../tokens.js';
import { SUMMARY_DISPATCH_ERRORS } from '../errors/summary-dispatch.errors.js';
import { SmtpSummaryMailer } from './smtp-summary-mailer.js';
import { SummaryMailer } from './summary-mailer.js';

/** MAIL_ENABLED=0: o botão responde 503 MAIL_DISABLED e nada sai da API. */
export class DisabledSummaryMailer extends SummaryMailer {
    public readonly enabled = false;

    public async verify(): Promise<void> {
        return Promise.reject(SUMMARY_DISPATCH_ERRORS.mailDisabled('mail_disabled'));
    }

    public async send(): Promise<void> {
        return Promise.reject(SUMMARY_DISPATCH_ERRORS.mailDisabled('mail_disabled'));
    }
}

/** Escolhe o mailer pela configuração. A porta 465 usa TLS direto; as outras, STARTTLS. */
export function createSummaryMailer(config: Config): SummaryMailer {
    if (config.MAIL_ENABLED !== '1') {
        return new DisabledSummaryMailer();
    }

    const transport = nodemailer.createTransport({
        host: config.MAIL_SMTP_HOST,
        port: config.MAIL_SMTP_PORT,
        secure: config.MAIL_SMTP_PORT === 465,
        auth: { user: config.MAIL_SMTP_USER, pass: config.MAIL_SMTP_PASS },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000
    });

    return new SmtpSummaryMailer(transport, config.MAIL_FROM ?? `Golduck <${config.MAIL_SMTP_USER as string}>`);
}

export const summaryMailerProvider = {
    provide: SummaryMailer,
    inject: [Service.CONFIG],
    useFactory: createSummaryMailer
};
