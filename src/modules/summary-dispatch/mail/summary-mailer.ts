/*
 * Envio de e-mail do resumo, atrás de uma interface: o service não sabe se é SMTP, outro provedor ou
 * um falso de teste. Trocar de canal (por exemplo, WhatsApp no futuro) = nova implementação.
 */

export type MailMessage = {
    to: string;
    subject: string;
    html: string;
    text: string;
};

/** Por que o envio para uma pessoa falhou (vai para o resultado do envio, com a mensagem amigável). */
export type MailErrorCode = 'MAIL_RECIPIENT_REJECTED' | 'MAIL_CONNECTION_FAILED' | 'MAIL_SEND_FAILED';

/** Falha no envio para um destinatário; o envio para os outros continua. */
export class MailSendError extends Error {
    public constructor(
        public readonly code: MailErrorCode,
        /** Detalhe técnico, só para o log. */
        public readonly reason: string
    ) {
        super(`Falha no envio de e-mail (${code})`);
        this.name = 'MailSendError';
    }
}

export abstract class SummaryMailer {
    /** Envio ligado neste ambiente (MAIL_ENABLED=1). */
    public abstract readonly enabled: boolean;

    /** Confere se dá para enviar agora; senão, lança 503 (MAIL_DISABLED ou MAIL_UNAVAILABLE). */
    public abstract verify(): Promise<void>;

    /** Envia uma mensagem; falha com MailSendError. */
    public abstract send(message: MailMessage): Promise<void>;
}
