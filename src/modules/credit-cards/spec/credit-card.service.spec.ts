import type { AppError } from '../../common/errors/app-error';
import { jest } from '@jest/globals';

import { CreditCardRepository } from '../repository/credit-card.repository';
import { CreditCardService } from '../service/credit-card.service';
import { InMemoryCreditCardRepository } from './in-memory-credit-card.repository';

const MISSING_ID = '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f';
const CREATED_AT = new Date('2026-03-01T12:00:00.000Z');
const UPDATED_AT = new Date('2026-03-02T08:30:00.000Z');

/** Regras do cadastro de cartões, com o repositório em memória no lugar do banco. */
describe('CreditCardService', () => {
    let repository: InMemoryCreditCardRepository;
    let service: CreditCardService;

    beforeEach(() => {
        repository = new InMemoryCreditCardRepository();
        service = new CreditCardService(repository as unknown as CreditCardRepository);
    });

    /** Confere o erro devolvido ao cliente (código e status) e o motivo que vai para o log. */
    const expectAppError = async (promise: Promise<unknown>, expected: { code: string; statusCode: number; reason: string }): Promise<void> => {
        await expect(promise).rejects.toMatchObject(expected satisfies Partial<AppError>);
    };

    const NOT_FOUND = { code: 'CREDIT_CARD_NOT_FOUND', statusCode: 404, reason: 'credit_card_id_not_found' };

    describe('create', () => {
        it('tira espaços sobrando do nome (início, fim e repetidos) e grava com o banco escolhido', async () => {
            const create = jest.spyOn(repository, 'create');

            const created = await service.create({ name: '  Nubank \t  Mikaell   Silva ', bank: 'NUBANK' });

            expect(create).toHaveBeenCalledWith({ name: 'Nubank Mikaell Silva', bank: 'NUBANK' });
            expect(created).toMatchObject({ name: 'Nubank Mikaell Silva', bank: 'NUBANK', active: true });
            expect(Object.keys(created).sort()).toEqual(['active', 'bank', 'createdAt', 'id', 'name', 'updatedAt']);
        });

        it('aceita os três bancos', async () => {
            for (const bank of ['NUBANK', 'C6', 'NEON'] as const) {
                await expect(service.create({ name: `Cartão ${bank}`, bank })).resolves.toMatchObject({ bank });
            }

            expect(repository.cards.size).toBe(3);
        });
    });

    describe('findAll', () => {
        it('lista só os ativos, por nome', async () => {
            repository.seed({ name: 'Neon', bank: 'NEON' });
            repository.seed({ name: 'Antigo', active: false });
            repository.seed({ name: 'C6 Ayanne', bank: 'C6' });

            const names = (await service.findAll()).map(card => card.name);

            expect(names).toEqual(['C6 Ayanne', 'Neon']);
        });

        it('devolve cada cartão só com os campos públicos', async () => {
            const card = repository.seed({ name: 'Neon', bank: 'NEON', createdAt: CREATED_AT, updatedAt: UPDATED_AT });

            await expect(service.findAll()).resolves.toEqual([{
                id: card.id, name: 'Neon', bank: 'NEON', active: true, createdAt: CREATED_AT, updatedAt: UPDATED_AT
            }]);
        });
    });

    describe('findById e getById', () => {
        it('findById devolve o cartão, ativo ou não, só com os campos públicos', async () => {
            const card = repository.seed({ name: 'Antigo', bank: 'C6', active: false, createdAt: CREATED_AT, updatedAt: UPDATED_AT });

            await expect(service.findById(card.id)).resolves.toEqual({
                id: card.id, name: 'Antigo', bank: 'C6', active: false, createdAt: CREATED_AT, updatedAt: UPDATED_AT
            });
        });

        it('getById devolve o registro do banco como veio', async () => {
            const card = repository.seed({ name: 'Nubank' });

            await expect(service.getById(card.id)).resolves.toBe(card);
        });

        it('id inexistente: 404 CREDIT_CARD_NOT_FOUND', async () => {
            await expectAppError(service.findById(MISSING_ID), NOT_FOUND);
            await expectAppError(service.getById(MISSING_ID), NOT_FOUND);
        });
    });

    describe('getActiveById', () => {
        it('devolve o cartão ativo', async () => {
            const card = repository.seed({ name: 'Nubank' });

            await expect(service.getActiveById(card.id)).resolves.toBe(card);
        });

        it('cartão inativo: 409 CREDIT_CARD_INACTIVE', async () => {
            const card = repository.seed({ name: 'Antigo', active: false });

            await expectAppError(service.getActiveById(card.id), {
                code: 'CREDIT_CARD_INACTIVE', statusCode: 409, reason: 'credit_card_inactive'
            });
        });

        it('id inexistente: 404', async () => {
            await expectAppError(service.getActiveById(MISSING_ID), NOT_FOUND);
        });
    });

    describe('update', () => {
        it('renomeia normalizando o nome, sem mexer no estado', async () => {
            const card = repository.seed({ name: 'Nubank', bank: 'NUBANK' });
            const update = jest.spyOn(repository, 'update');

            const updated = await service.update(card.id, { name: '  Nubank   Ayanne ' });

            expect(update).toHaveBeenCalledWith(card.id, { name: 'Nubank Ayanne', active: undefined });
            expect(updated).toMatchObject({ id: card.id, name: 'Nubank Ayanne', bank: 'NUBANK', active: true });
            expect(Object.keys(updated).sort()).toEqual(['active', 'bank', 'createdAt', 'id', 'name', 'updatedAt']);
        });

        it('desativa e reativa sem mexer no nome', async () => {
            const card = repository.seed({ name: 'Nubank' });
            const update = jest.spyOn(repository, 'update');

            await expect(service.update(card.id, { active: false })).resolves.toMatchObject({ name: 'Nubank', active: false });
            await expect(service.update(card.id, { active: true })).resolves.toMatchObject({ name: 'Nubank', active: true });
            expect(update).toHaveBeenNthCalledWith(1, card.id, { name: undefined, active: false });
        });

        it('id inexistente: 404 sem tentar gravar', async () => {
            const update = jest.spyOn(repository, 'update');

            await expectAppError(service.update(MISSING_ID, { active: false }), NOT_FOUND);
            expect(update).not.toHaveBeenCalled();
        });

        it('erros do banco no update passam como vieram', async () => {
            const card = repository.seed({ name: 'Nubank' });
            const failure = new Error('conexão caiu');
            jest.spyOn(repository, 'update').mockRejectedValueOnce(failure);

            await expect(service.update(card.id, { name: 'Outro' })).rejects.toBe(failure);
        });
    });
});
