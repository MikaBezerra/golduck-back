import type { TestResponse } from '../../../testing/http-test-app';

import { dataOf, errorOf, HttpTestApp } from '../../../testing/http-test-app';
import { PeopleModule } from '../people.module';
import { PersonRepository } from '../repository/person.repository';
import { InMemoryPersonRepository } from './in-memory-person.repository';

const MISSING_ID = '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f';
/** UUID válido, mas da versão 1 (a rota só aceita v4). */
const UUID_V1 = 'a8098c1a-f86e-11da-bd1a-00112444be1e';
const PHONE_MESSAGE = 'O celular deve estar no formato internacional, por exemplo +5511999999999';

/** E-mail válido com exatamente `length` caracteres (partes dentro dos limites do RFC). */
function emailWithLength(length: number): string {
    const local = 'a'.repeat(64);
    const fixed = `${local}@${'b'.repeat(63)}.${'c'.repeat(63)}..com`.length;
    return `${local}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(length - fixed)}.com`;
}

/*
 * Rotas /people por HTTP: autenticação, validação (Joi), envelope { data } / { error } e
 * códigos de status. As regras finas ficam no person.service.spec.
 */
describe('rotas /people', () => {
    let repository: InMemoryPersonRepository;
    let api: HttpTestApp;

    beforeEach(async () => {
        repository = new InMemoryPersonRepository();
        api = await HttpTestApp.create({
            imports: [PeopleModule],
            overrides: [{ provide: PersonRepository, useValue: repository }]
        });
    });

    afterEach(async () => {
        await api.close();
    });

    /** Confere 400 VALIDATION_ERROR e o detalhe do campo recusado. */
    const expectInvalid = (response: TestResponse, detail: { field?: string; code?: string; message?: string }): void => {
        expect(response.status).toBe(400);
        expect(errorOf(response).code).toBe('VALIDATION_ERROR');
        expect(errorOf(response).details).toEqual([expect.objectContaining(detail)]);
    };

    it('exige login (401 AUTH_UNAUTHENTICATED sem token ou com token inválido)', async () => {
        const withoutToken = await api.get('/people', { auth: false });
        const invalidToken = await api.post('/people', { name: 'Ayanne' }, { auth: 'nao-e-um-jwt' });

        expect(withoutToken.status).toBe(401);
        expect(errorOf(withoutToken).code).toBe('AUTH_UNAUTHENTICATED');
        expect(invalidToken.status).toBe(401);
        expect(errorOf(invalidToken).code).toBe('AUTH_UNAUTHENTICATED');
        expect(repository.people.size).toBe(0);
    });

    describe('POST /people', () => {
        it('cria (201), tira espaços do nome, normaliza o e-mail e devolve a pessoa no envelope { data }', async () => {
            const response = await api.post('/people', { name: '  Ayanne ', email: '  Ayanne@Exemplo.COM ', phone: ' +5511999999999 ' });

            expect(response.status).toBe(201);
            expect(dataOf(response)).toMatchObject({
                name: 'Ayanne', email: 'ayanne@exemplo.com', phone: '+5511999999999', active: true
            });
            expect(repository.people.size).toBe(1);
        });

        it('e-mail e celular são opcionais e aceitam null', async () => {
            const withoutContacts = await api.post('/people', { name: 'Bruno' });
            const withNulls = await api.post('/people', { name: 'Carla', email: null, phone: null });

            expect(withoutContacts.status).toBe(201);
            expect(dataOf(withoutContacts)).toMatchObject({ name: 'Bruno', email: null, phone: null });
            expect(withNulls.status).toBe(201);
            expect(dataOf(withNulls)).toMatchObject({ name: 'Carla', email: null, phone: null });
        });

        it('nome: obrigatório, texto, não vazio e até 120 caracteres', async () => {
            const longest = await api.post('/people', { name: 'x'.repeat(120) });
            const single = await api.post('/people', { name: 'x' });

            expect(longest.status).toBe(201);
            expect(single.status).toBe(201);

            expectInvalid(await api.post('/people', {}), { field: 'name', code: 'any.required', message: 'name é obrigatório' });
            expectInvalid(await api.post('/people', { name: '   ' }), { field: 'name', code: 'string.empty' });
            expectInvalid(await api.post('/people', { name: 42 }), { field: 'name', code: 'string.base' });
            expectInvalid(await api.post('/people', { name: 'x'.repeat(121) }), {
                field: 'name', code: 'string.max', message: 'name deve ter no máximo 120 caracteres'
            });
            expect(repository.people.size).toBe(2);
        });

        it('e-mail: precisa ser válido e ter até 254 caracteres', async () => {
            const longest = await api.post('/people', { name: 'Ayanne', email: emailWithLength(254) });

            expect(longest.status).toBe(201);
            expect(dataOf<{ email: string }>(longest).email).toHaveLength(254);

            expectInvalid(await api.post('/people', { name: 'Ayanne', email: 'nao-e-email' }), {
                field: 'email', code: 'string.email', message: 'email deve conter um e-mail válido'
            });
            const tooLong = await api.post('/people', { name: 'Ayanne', email: emailWithLength(255) });

            expect(tooLong.status).toBe(400);
            expect(errorOf(tooLong).details).toContainEqual({
                field: 'email', code: 'string.max', message: 'email deve ter no máximo 254 caracteres'
            });
            expect(repository.people.size).toBe(1);
        });

        it('celular: formato internacional, + e de 2 a 15 dígitos, sem zero logo depois do +', async () => {
            const accepted = ['+12', '+5511999999999', `+1${'2'.repeat(14)}`];

            for (const phone of accepted) {
                const response = await api.post('/people', { name: 'Ayanne', phone });

                expect(response.status).toBe(201);
                expect(dataOf(response)).toMatchObject({ phone });
            }

            const rejected = [
                '5511999999999',
                '+0511999999999',
                '+1',
                `+1${'2'.repeat(15)}`,
                '+55 11 99999-9999',
                'tel+5511999999999',
                '+5511999999999x',
                '+55119999a9999'
            ];

            for (const phone of rejected) {
                expectInvalid(await api.post('/people', { name: 'Ayanne', phone }), {
                    field: 'phone', code: 'string.pattern.base', message: PHONE_MESSAGE
                });
            }

            expect(repository.people.size).toBe(accepted.length);
        });

        it('recusa campos extras (400)', async () => {
            expectInvalid(await api.post('/people', { name: 'Ayanne', active: false }), { field: 'active', code: 'object.unknown' });
            expect(repository.people.size).toBe(0);
        });
    });

    describe('GET /people', () => {
        it('lista só as ativas por padrão; includeInactive=true traz todas (ativas primeiro)', async () => {
            repository.seed({ name: 'Carla' });
            repository.seed({ name: 'Antiga', active: false });
            repository.seed({ name: 'Bruno' });

            const active = await api.get('/people');
            const explicitFalse = await api.get('/people', { query: { includeInactive: false } });
            const all = await api.get('/people', { query: { includeInactive: true } });

            expect(active.status).toBe(200);
            expect(dataOf<Array<{ name: string }>>(active).map(person => person.name)).toEqual(['Bruno', 'Carla']);
            expect(dataOf<Array<{ name: string }>>(explicitFalse).map(person => person.name)).toEqual(['Bruno', 'Carla']);
            expect(dataOf<Array<{ name: string }>>(all).map(person => person.name)).toEqual(['Bruno', 'Carla', 'Antiga']);
        });

        it('recusa includeInactive que não é booleano e filtros desconhecidos (400)', async () => {
            expectInvalid(await api.get('/people', { query: { includeInactive: 'talvez' } }), {
                field: 'includeInactive', code: 'boolean.base'
            });
            expectInvalid(await api.get('/people', { query: { search: 'ay' } }), { field: 'search', code: 'object.unknown' });
        });
    });

    describe('GET /people/:id', () => {
        it('devolve a pessoa, mesmo inativa', async () => {
            const person = repository.seed({ name: 'Antiga', active: false, email: 'antiga@exemplo.com' });

            const response = await api.get(`/people/${person.id}`);

            expect(response.status).toBe(200);
            expect(dataOf(response)).toMatchObject({ id: person.id, name: 'Antiga', email: 'antiga@exemplo.com', active: false });
        });

        it('id que não é UUID v4 dá 400; id inexistente dá 404 PERSON_NOT_FOUND', async () => {
            const notUuid = await api.get('/people/123');
            const notV4 = await api.get(`/people/${UUID_V1}`);
            const missing = await api.get(`/people/${MISSING_ID}`);

            expectInvalid(notUuid, { field: '$', code: 'string.guid', message: 'id deve conter um UUID válido' });
            expectInvalid(notV4, { field: '$', code: 'string.guid' });
            expect(missing.status).toBe(404);
            expect(errorOf(missing)).toMatchObject({ code: 'PERSON_NOT_FOUND', message: 'Pessoa não encontrada' });
        });
    });

    describe('PATCH /people/:id', () => {
        it('altera nome, contatos e estado, aplicando as mesmas regras do cadastro', async () => {
            const person = repository.seed({ name: 'Ayanne', email: 'ayanne@exemplo.com', phone: '+5511999999999' });

            const renamed = await api.patch(`/people/${person.id}`, { name: '  Ayanne Souza ', email: ' NOVO@Exemplo.com ' });
            const cleared = await api.patch(`/people/${person.id}`, { email: null, phone: null });
            const deactivated = await api.patch(`/people/${person.id}`, { active: false });

            expect(renamed.status).toBe(200);
            expect(dataOf(renamed)).toMatchObject({ name: 'Ayanne Souza', email: 'novo@exemplo.com', phone: '+5511999999999' });
            expect(dataOf(cleared)).toMatchObject({ name: 'Ayanne Souza', email: null, phone: null, active: true });
            expect(dataOf(deactivated)).toMatchObject({ active: false });
            expect(repository.people.get(person.id)?.active).toBe(false);
        });

        it('valida o corpo: vazio, campos extras, nome em branco, celular fora do formato e active não booleano (400)', async () => {
            const person = repository.seed({ name: 'Ayanne' });

            const empty = await api.patch(`/people/${person.id}`, {});

            expect(empty.status).toBe(400);
            expect(errorOf(empty).details).toEqual([expect.objectContaining({ field: '$', code: 'object.min' })]);
            expectInvalid(await api.patch(`/people/${person.id}`, { active: true, role: 'ADMIN' }), { field: 'role', code: 'object.unknown' });
            expectInvalid(await api.patch(`/people/${person.id}`, { name: ' ' }), { field: 'name', code: 'string.empty' });
            expectInvalid(await api.patch(`/people/${person.id}`, { name: 'x'.repeat(121) }), { field: 'name', code: 'string.max' });
            expectInvalid(await api.patch(`/people/${person.id}`, { phone: '11999999999' }), { field: 'phone', message: PHONE_MESSAGE });
            expectInvalid(await api.patch(`/people/${person.id}`, { email: 'sem-arroba' }), { field: 'email', code: 'string.email' });
            expectInvalid(await api.patch(`/people/${person.id}`, { active: 'sim' }), { field: 'active', code: 'boolean.base' });
            expect(repository.people.get(person.id)?.name).toBe('Ayanne');
        });

        it('id inválido dá 400 e inexistente dá 404', async () => {
            const notUuid = await api.patch('/people/abc', { name: 'Ninguém' });
            const missing = await api.patch(`/people/${MISSING_ID}`, { name: 'Ninguém' });

            expectInvalid(notUuid, { field: '$', code: 'string.guid' });
            expect(missing.status).toBe(404);
            expect(errorOf(missing)).toMatchObject({ code: 'PERSON_NOT_FOUND', message: 'Pessoa não encontrada' });
        });
    });

    it('todo erro traz o requestId, igual ao header x-request-id', async () => {
        const response = await api.get(`/people/${MISSING_ID}`, { headers: { 'x-request-id': 'teste-pessoas-1' } });

        expect(response.headers['x-request-id']).toBe('teste-pessoas-1');
        expect(errorOf(response).requestId).toBe('teste-pessoas-1');
    });
});
