import type { Config } from '../../common/index.js';
import { jest } from '@jest/globals';

import { AppError } from '../../common/errors/app-error.js';
import { MailTransport, SmtpSummaryMailer } from '../mail/smtp-summary-mailer.js';
import { MailSendError, SummaryMailer } from '../mail/summary-mailer.js';
import { createSummaryMailer, DisabledSummaryMailer, summaryMailerProvider } from '../mail/summary-mailer.provider.js';

/*
 * Mailer SMTP com um transporte falso (nada sai da máquina): verify vira 503 quando o servidor não
 * responde e cada erro de envio vira um código (endereço recusado, conexão ou genérico).
 */
const message = { to: 'ana@exemplo.com', subject: 'Assunto', html: '<p>Oi</p>', text: 'Oi' };

const smtpError = (fields: Record<string, unknown>): Error => Object.assign(new Error('falhou'), fields);

describe('SmtpSummaryMailer', () => {
    let transport: { verify: jest.Mock<MailTransport['verify']>; sendMail: jest.Mock<MailTransport['sendMail']> };
    let mailer: SmtpSummaryMailer;

    beforeEach(() => {
        transport = {
            verify: jest.fn<MailTransport['verify']>().mockResolvedValue(true),
            sendMail: jest.fn<MailTransport['sendMail']>().mockResolvedValue({ messageId: '1' })
        };
        mailer = new SmtpSummaryMailer(transport, 'Golduck <golduck@gmail.com>');
    });

    it('está ligado e envia com o remetente configurado', async () => {
        await mailer.verify();
        await mailer.send(message);

        expect(mailer.enabled).toBe(true);
        expect(transport.sendMail).toHaveBeenCalledWith({ from: 'Golduck <golduck@gmail.com>', ...message });
    });

    it('verify com falha vira 503 MAIL_UNAVAILABLE, com o código do erro só no motivo', async () => {
        transport.verify.mockRejectedValueOnce(smtpError({ code: 'EAUTH' }));
        transport.verify.mockRejectedValueOnce('texto solto');

        const auth = await mailer.verify().catch((error: unknown) => error);
        const unknown = await mailer.verify().catch((error: unknown) => error);

        expect(auth).toBeInstanceOf(AppError);
        expect(auth).toMatchObject({ code: 'MAIL_UNAVAILABLE', statusCode: 503, reason: 'smtp_verify_failed:EAUTH' });
        expect(unknown).toMatchObject({ code: 'MAIL_UNAVAILABLE', reason: 'smtp_verify_failed:unknown' });
    });

    it.each([
        [{ code: 'EENVELOPE' }, 'MAIL_RECIPIENT_REJECTED', 'EENVELOPE:-'],
        [{ code: 'EMESSAGE', responseCode: 550 }, 'MAIL_RECIPIENT_REJECTED', 'EMESSAGE:550'],
        [{ code: 'ETIMEDOUT' }, 'MAIL_CONNECTION_FAILED', 'ETIMEDOUT:-'],
        [{ code: 'ECONNECTION', responseCode: 421 }, 'MAIL_CONNECTION_FAILED', 'ECONNECTION:421'],
        [{ code: 'EMESSAGE' }, 'MAIL_SEND_FAILED', 'EMESSAGE:-'],
        [{}, 'MAIL_SEND_FAILED', 'unknown:-']
    ])('erro de envio %j vira %s', async (fields, code, reason) => {
        transport.sendMail.mockRejectedValueOnce(smtpError(fields));

        const error = await mailer.send(message).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(MailSendError);
        expect(error).toMatchObject({ code, reason, name: 'MailSendError' });
    });

    it('erro que nem é objeto também vira MAIL_SEND_FAILED', async () => {
        transport.sendMail.mockRejectedValueOnce(null);

        await expect(mailer.send(message)).rejects.toMatchObject({ code: 'MAIL_SEND_FAILED', reason: 'unknown:-' });
    });
});

describe('createSummaryMailer', () => {
    const config = (overrides: Partial<Config>): Config => ({
        MAIL_ENABLED: '0',
        MAIL_SMTP_HOST: 'smtp.gmail.com',
        MAIL_SMTP_PORT: 465,
        ...overrides
    } as Config);

    it('MAIL_ENABLED=0: mailer desligado, que responde 503 MAIL_DISABLED', async () => {
        const mailer = createSummaryMailer(config({}));

        expect(mailer).toBeInstanceOf(DisabledSummaryMailer);
        expect(mailer.enabled).toBe(false);
        await expect(mailer.verify()).rejects.toMatchObject({ code: 'MAIL_DISABLED', statusCode: 503 });
        await expect(mailer.send(message)).rejects.toMatchObject({ code: 'MAIL_DISABLED' });
    });

    it('MAIL_ENABLED=1: mailer SMTP (porta 465 ou 587, com ou sem MAIL_FROM), sem conectar ao criar', () => {
        const auth = { MAIL_ENABLED: '1' as const, MAIL_SMTP_USER: 'golduck@gmail.com', MAIL_SMTP_PASS: 'senha' };

        expect(createSummaryMailer(config(auth))).toBeInstanceOf(SmtpSummaryMailer);
        expect(createSummaryMailer(config({ ...auth, MAIL_SMTP_PORT: 587, MAIL_FROM: 'Casa <casa@gmail.com>' })).enabled).toBe(true);
    });

    it('é o provider do SummaryMailer, montado pela configuração', () => {
        expect(summaryMailerProvider.provide).toBe(SummaryMailer);
        expect(summaryMailerProvider.useFactory).toBe(createSummaryMailer);
    });
});
