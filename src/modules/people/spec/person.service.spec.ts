import type { AppError } from '../../common/errors/app-error';
import { jest } from '@jest/globals';

import { PersonRepository } from '../repository/person.repository';
import { PersonService } from '../service/person.service';
import { InMemoryPersonRepository } from './in-memory-person.repository';

const MISSING_ID = '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f';
const CREATED_AT = new Date('2026-03-01T12:00:00.000Z');
const UPDATED_AT = new Date('2026-03-02T08:30:00.000Z');

/** Regras do cadastro de pessoas, com o repositório em memória no lugar do banco. */
describe('PersonService', () => {
    let repository: InMemoryPersonRepository;
    let service: PersonService;

    beforeEach(() => {
        repository = new InMemoryPersonRepository();
        service = new PersonService(repository as unknown as PersonRepository);
    });

    /** Confere o erro devolvido ao cliente (código e status) e o motivo que vai para o log. */
    const expectAppError = async (promise: Promise<unknown>, expected: { code: string; statusCode: number; reason: string }): Promise<void> => {
        await expect(promise).rejects.toMatchObject(expected satisfies Partial<AppError>);
    };

    describe('create', () => {
        it('grava os dados recebidos e devolve só os campos públicos', async () => {
            const create = jest.spyOn(repository, 'create');

            const created = await service.create({ name: 'Ayanne', email: 'ayanne@exemplo.com', phone: '+5511999999999' });

            expect(create).toHaveBeenCalledWith({ name: 'Ayanne', email: 'ayanne@exemplo.com', phone: '+5511999999999' });
            expect(created).toMatchObject({ name: 'Ayanne', email: 'ayanne@exemplo.com', phone: '+5511999999999', active: true });
            expect(Object.keys(created).sort()).toEqual(['active', 'createdAt', 'email', 'id', 'name', 'phone', 'updatedAt']);
            expect(repository.people.get(created.id)?.name).toBe('Ayanne');
        });

        it('aceita pessoa sem e-mail e sem celular (ficam null)', async () => {
            const created = await service.create({ name: 'Bruno' });

            expect(created).toMatchObject({ name: 'Bruno', email: null, phone: null, active: true });
        });
    });

    describe('findAll', () => {
        it('sem argumento, lista só as ativas, em ordem alfabética', async () => {
            repository.seed({ name: 'Carla' });
            repository.seed({ name: 'Antiga', active: false });
            repository.seed({ name: 'Bruno' });
            const findAll = jest.spyOn(repository, 'findAll');

            const names = (await service.findAll()).map(person => person.name);

            expect(findAll).toHaveBeenCalledWith(false);
            expect(names).toEqual(['Bruno', 'Carla']);
        });

        it('com includeInactive, traz também as inativas (depois das ativas)', async () => {
            repository.seed({ name: 'Antiga', active: false });
            repository.seed({ name: 'Bruno' });

            const names = (await service.findAll(true)).map(person => person.name);

            expect(names).toEqual(['Bruno', 'Antiga']);
        });

        it('devolve cada pessoa só com os campos públicos', async () => {
            const person = repository.seed({
                name: 'Ayanne', email: 'ayanne@exemplo.com', phone: '+5511988887777', createdAt: CREATED_AT, updatedAt: UPDATED_AT
            });

            await expect(service.findAll()).resolves.toEqual([{
                id: person.id,
                name: 'Ayanne',
                email: 'ayanne@exemplo.com',
                phone: '+5511988887777',
                active: true,
                createdAt: CREATED_AT,
                updatedAt: UPDATED_AT
            }]);
        });
    });

    describe('findById', () => {
        it('devolve a pessoa pelo id, ativa ou não', async () => {
            const person = repository.seed({ name: 'Antiga', active: false, createdAt: CREATED_AT, updatedAt: UPDATED_AT });

            await expect(service.findById(person.id)).resolves.toEqual({
                id: person.id,
                name: 'Antiga',
                email: null,
                phone: null,
                active: false,
                createdAt: CREATED_AT,
                updatedAt: UPDATED_AT
            });
        });

        it('id inexistente: 404 PERSON_NOT_FOUND', async () => {
            await expectAppError(service.findById(MISSING_ID), {
                code: 'PERSON_NOT_FOUND', statusCode: 404, reason: 'person_id_not_found'
            });
        });
    });

    describe('update', () => {
        it('altera só os campos enviados', async () => {
            const person = repository.seed({ name: 'Ayanne', email: 'ayanne@exemplo.com', phone: '+5511999999999' });

            const updated = await service.update(person.id, { name: 'Ayanne Souza' });

            expect(updated).toMatchObject({ id: person.id, name: 'Ayanne Souza', email: 'ayanne@exemplo.com', phone: '+5511999999999' });
            expect(Object.keys(updated).sort()).toEqual(['active', 'createdAt', 'email', 'id', 'name', 'phone', 'updatedAt']);
        });

        it('null apaga e-mail e celular', async () => {
            const person = repository.seed({ name: 'Ayanne', email: 'ayanne@exemplo.com', phone: '+5511999999999' });

            const updated = await service.update(person.id, { email: null, phone: null });

            expect(updated).toMatchObject({ name: 'Ayanne', email: null, phone: null });
        });

        it('desativa e reativa', async () => {
            const person = repository.seed({ name: 'Bruno' });

            await expect(service.update(person.id, { active: false })).resolves.toMatchObject({ active: false });
            await expect(service.update(person.id, { active: true })).resolves.toMatchObject({ active: true });
        });

        it('id inexistente: 404 sem tentar gravar', async () => {
            const update = jest.spyOn(repository, 'update');

            await expectAppError(service.update(MISSING_ID, { name: 'Ninguém' }), {
                code: 'PERSON_NOT_FOUND', statusCode: 404, reason: 'person_id_not_found'
            });
            expect(update).not.toHaveBeenCalled();
        });

        it('erros do banco no update passam como vieram', async () => {
            const person = repository.seed({ name: 'Bruno' });
            const failure = new Error('conexão caiu');
            jest.spyOn(repository, 'update').mockRejectedValueOnce(failure);

            await expect(service.update(person.id, { name: 'Bruno Lima' })).rejects.toBe(failure);
        });
    });
});
