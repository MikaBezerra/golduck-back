import { SUMMARY_DISPATCH_ERRORS } from '../errors/summary-dispatch.errors.js';
import { MailErrorCode, MailMessage, MailSendError, SummaryMailer } from './summary-mailer.js';

/** O que o mailer usa do transporte do nodemailer (facilita trocar por um falso nos testes). */
export interface MailTransport {
    verify(): Promise<unknown>;
    sendMail(options: { from: string; to: string; subject: string; html: string; text: string }): Promise<unknown>;
}

/** Erros de rede/conexão do nodemailer: o servidor não respondeu ou caiu no meio. */
const CONNECTION_CODES = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNRESET', 'ECONNREFUSED', 'ETLS', 'EAUTH']);

/** Envio por SMTP (no Gmail, com a senha de app). Uma conexão por envio: a função da Vercel não fica viva. */
export class SmtpSummaryMailer extends SummaryMailer {
    public readonly enabled = true;

    public constructor(
        private readonly transport: MailTransport,
        private readonly from: string
    ) {
        super();
    }

    public async verify(): Promise<void> {
        try {
            await this.transport.verify();
        } catch (error: unknown) {
            throw SUMMARY_DISPATCH_ERRORS.mailUnavailable(`smtp_verify_failed:${errorCode(error) ?? 'unknown'}`);
        }
    }

    public async send(message: MailMessage): Promise<void> {
        try {
            await this.transport.sendMail({ from: this.from, ...message });
        } catch (error: unknown) {
            throw new MailSendError(classify(error), `${errorCode(error) ?? 'unknown'}:${responseCode(error) ?? '-'}`);
        }
    }
}

function classify(error: unknown): MailErrorCode {
    const code = errorCode(error);
    const response = responseCode(error);

    // Endereço recusado pelo servidor (5xx no RCPT TO) ou envelope inválido.
    if (code === 'EENVELOPE' || (response !== undefined && response >= 500 && response < 600)) {
        return 'MAIL_RECIPIENT_REJECTED';
    }

    return code !== undefined && CONNECTION_CODES.has(code) ? 'MAIL_CONNECTION_FAILED' : 'MAIL_SEND_FAILED';
}

function errorCode(error: unknown): string | undefined {
    const value = (error as { code?: unknown } | null)?.code;

    return typeof value === 'string' ? value : undefined;
}

function responseCode(error: unknown): number | undefined {
    const value = (error as { responseCode?: unknown } | null)?.responseCode;

    return typeof value === 'number' ? value : undefined;
}
