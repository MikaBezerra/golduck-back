import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';

import { parseMonth } from '../../common/date/month.js';
import { describeError, LoggerService } from '../../common/index.js';
import { SummaryStatementBreakdownDto, SummaryStatementResponse } from '../../summary/dto/summary.dto.js';
import { SummaryService } from '../../summary/service/summary.service.js';
import {
    CreateSummaryDispatchDto,
    SummaryDispatchPreviewResponse,
    SummaryDispatchResponse,
    SummaryEmailPreviewResponse,
    SummaryEmailQueryDto
} from '../dto/summary-dispatch.dto.js';
import { SUMMARY_DISPATCH_ERRORS } from '../errors/summary-dispatch.errors.js';
import { MailErrorCode, MailSendError, SummaryMailer } from '../mail/summary-mailer.js';
import {
    DispatchItemData,
    DispatchWithItems,
    PersonContact,
    SummaryDispatchRepository
} from '../repository/summary-dispatch.repository.js';
import { maskEmail, renderSummaryEmail, SummaryEmail } from './summary-email.renderer.js';

/** Um envio parado em RUNNING há mais tempo que isto é considerado interrompido (a função caiu). */
export const STALE_DISPATCH_MS = 5 * 60 * 1000;

const HISTORY_SIZE = 20;

const FAILURE_MESSAGES: Record<MailErrorCode, (name: string) => string> = {
    MAIL_RECIPIENT_REJECTED: name => `O servidor de e-mail recusou o endereço de ${name}. Confira o e-mail cadastrado.`,
    MAIL_CONNECTION_FAILED: name => `Não foi possível falar com o servidor de e-mail ao enviar para ${name}. Tente de novo.`,
    MAIL_SEND_FAILED: name => `Não foi possível enviar o resumo para ${name}. Tente de novo mais tarde.`
};

/**
 * Envio do resumo do mês por e-mail, um por pessoa ativa, com o líquido em etapas e a reserva.
 *
 * - Duplo clique / nova tentativa: a mesma Idempotency-Key devolve o resultado gravado, sem reenviar.
 * - Dois envios do mesmo mês ao mesmo tempo: o runningMonth (único) recusa o segundo (409).
 * - Cada pessoa é isolada: sem e-mail ou com falha no envio vira um item com mensagem amigável, e as
 *   outras recebem normalmente.
 */
@Injectable()
export class SummaryDispatchService {
    public constructor(
        private readonly repository: SummaryDispatchRepository,
        private readonly summaryService: SummaryService,
        private readonly mailer: SummaryMailer,
        private readonly logger: LoggerService
    ) { }

    /** Quem vai receber (para a confirmação na tela) e o último envio do mês. */
    public async preview(month: string): Promise<SummaryDispatchPreviewResponse> {
        const statement = await this.summaryService.findStatement({ month });
        const contacts = await this.contactsOf(statement.breakdown);
        const [last] = await this.repository.findByMonth(parseMonth(month), 1);

        return {
            month,
            enabled: this.mailer.enabled,
            recipients: statement.breakdown.map(person => {
                const email = contacts.get(person.personId)?.email ?? null;

                return { personId: person.personId, name: person.name, hasEmail: email !== null, recipient: email === null ? null : maskEmail(email) };
            }),
            lastDispatch: last ? toResponse(last) : null
        };
    }

    /** Envios do mês, do mais recente para o mais antigo. */
    public async history(month: string): Promise<SummaryDispatchResponse[]> {
        const dispatches = await this.repository.findByMonth(parseMonth(month), HISTORY_SIZE);

        return dispatches.map(toResponse);
    }

    /** O e-mail de uma pessoa como ela vai receber, sem enviar. */
    public async emailPreview(query: SummaryEmailQueryDto): Promise<SummaryEmailPreviewResponse> {
        const statement = await this.summaryService.findStatement({ month: query.month });
        const [person] = this.pickTargets(statement, [query.personId]);
        const email = (await this.contactsOf([person])).get(person.personId)?.email ?? null;

        return {
            personId: person.personId,
            recipient: email === null ? null : maskEmail(email),
            ...this.render(statement, person, new Date())
        };
    }

    public async dispatch(body: CreateSummaryDispatchDto, idempotencyKey: string): Promise<SummaryDispatchResponse> {
        const existing = await this.repository.findByKey(idempotencyKey);

        if (existing) {
            return this.replay(existing, body.month);
        }

        await this.mailer.verify();

        const month = parseMonth(body.month);
        const statement = await this.summaryService.findStatement({ month: body.month });
        const targets = this.pickTargets(statement, body.personIds);
        const contacts = await this.contactsOf(targets);

        await this.repository.releaseStale(month, new Date(Date.now() - STALE_DISPATCH_MS));

        let dispatch: DispatchWithItems;

        try {
            dispatch = await this.repository.start(month, idempotencyKey);
        } catch (error: unknown) {
            return this.startConflict(error, idempotencyKey, body.month);
        }

        const now = new Date();

        try {
            for (const target of targets) {
                await this.repository.addItem(dispatch.id, await this.sendTo(statement, target, contacts.get(target.personId), now));
            }

            const finished = await this.repository.finish(dispatch.id, 'DONE');
            const response = toResponse(finished);

            this.logger.info('Resumo enviado por e-mail', { month: body.month, dispatchId: dispatch.id, ...response.counts });

            return response;
        } catch (error: unknown) {
            await this.repository.finish(dispatch.id, 'INTERRUPTED');
            throw error;
        }
    }

    /**
     * O create falhou. P2002 com a mesma chave = corrida de duplo clique: responde como o envio que
     * ganhou. P2002 sem a chave = já há outro envio do mês rodando (409).
     */
    private async startConflict(error: unknown, idempotencyKey: string, month: string): Promise<SummaryDispatchResponse> {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
            throw error;
        }

        const winner = await this.repository.findByKey(idempotencyKey);

        if (winner) {
            return this.replay(winner, month);
        }

        throw SUMMARY_DISPATCH_ERRORS.inProgress('summary_dispatch_month_running');
    }

    /** Mesma chave de novo: devolve o que foi gravado (ou 409 se ainda está rodando ou se o mês é outro). */
    private async replay(existing: DispatchWithItems, month: string): Promise<SummaryDispatchResponse> {
        if (formatMonthOf(existing.month) !== month) {
            throw SUMMARY_DISPATCH_ERRORS.keyReused('summary_dispatch_key_other_month');
        }

        if (existing.status === 'RUNNING') {
            throw SUMMARY_DISPATCH_ERRORS.inProgress('summary_dispatch_same_key_running');
        }

        return Promise.resolve(toResponse(existing));
    }

    /** Pessoas ativas do mês; com personIds, só elas (todas precisam participar da divisão). */
    private pickTargets(statement: SummaryStatementResponse, personIds?: string[]): SummaryStatementBreakdownDto[] {
        if (!personIds) {
            return statement.breakdown;
        }

        const known = new Set(statement.breakdown.map(person => person.personId));

        if (personIds.some(id => !known.has(id))) {
            throw SUMMARY_DISPATCH_ERRORS.unknownPerson('summary_dispatch_person_not_participant');
        }

        return statement.breakdown.filter(person => personIds.includes(person.personId));
    }

    private async contactsOf(people: SummaryStatementBreakdownDto[]): Promise<Map<string, PersonContact>> {
        const contacts = await this.repository.findContacts(people.map(person => person.personId));

        return new Map(contacts.map(contact => [contact.id, contact]));
    }

    /** Envia para uma pessoa; nunca lança: o resultado (enviado, sem e-mail ou falha) vira um item. */
    private async sendTo(
        statement: SummaryStatementResponse,
        person: SummaryStatementBreakdownDto,
        contact: PersonContact | undefined,
        now: Date
    ): Promise<DispatchItemData> {
        const base = { personId: person.personId, name: person.name };
        const email = contact?.email ?? null;

        if (email === null) {
            return { ...base, recipient: null, status: 'SKIPPED_NO_EMAIL', errorCode: null, message: `${person.name} não tem e-mail cadastrado.` };
        }

        const recipient = maskEmail(email);

        try {
            await this.mailer.send({ to: email, ...this.render(statement, person, now) });

            return { ...base, recipient, status: 'SENT', errorCode: null, message: null };
        } catch (error: unknown) {
            const code: MailErrorCode = error instanceof MailSendError ? error.code : 'MAIL_SEND_FAILED';

            this.logger.warn('Falha ao enviar o resumo por e-mail', {
                month: statement.month,
                personId: person.personId,
                recipient,
                code,
                ...(error instanceof MailSendError ? { reason: error.reason } : describeError(error))
            });

            return { ...base, recipient, status: 'FAILED', errorCode: code, message: FAILURE_MESSAGES[code](person.name) };
        }
    }

    private render(statement: SummaryStatementResponse, person: SummaryStatementBreakdownDto, now: Date): SummaryEmail {
        return renderSummaryEmail({
            month: statement.month,
            name: person.name,
            beforeReserve: person.beforeReserve,
            individual: person.individual,
            reserveShare: person.reserve,
            net: person.net,
            reserveMonth: statement.reserve.month,
            reserveAccumulated: statement.reserve.accumulated,
            now
        });
    }
}

function formatMonthOf(date: Date): string {
    return date.toISOString().slice(0, 7);
}

function toResponse(dispatch: DispatchWithItems): SummaryDispatchResponse {
    const count = (status: string): number => dispatch.items.filter(item => item.status === status).length;

    return {
        id: dispatch.id,
        month: formatMonthOf(dispatch.month),
        channel: dispatch.channel,
        status: dispatch.status,
        startedAt: dispatch.startedAt,
        finishedAt: dispatch.finishedAt,
        counts: { sent: count('SENT'), skipped: count('SKIPPED_NO_EMAIL'), failed: count('FAILED') },
        items: dispatch.items.map(item => ({
            personId: item.personId,
            name: item.name,
            status: item.status,
            recipient: item.recipient,
            errorCode: item.errorCode,
            message: item.message
        }))
    };
}
