import { dataOf, errorOf, HttpTestApp } from '../../../testing/http-test-app.js';
import { CategoriesModule } from '../categories.module.js';
import { CategoryRepository } from '../repository/category.repository.js';
import { InMemoryCategoryRepository } from './in-memory-category.repository.js';

/*
 * Rotas /categories por HTTP: autenticação, validação (Joi), envelope { data } / { error } e
 * códigos de status. As regras finas ficam no category.service.spec.
 */
describe('rotas /categories', () => {
    let repository: InMemoryCategoryRepository;
    let api: HttpTestApp;

    beforeEach(async () => {
        repository = new InMemoryCategoryRepository();
        api = await HttpTestApp.create({
            imports: [CategoriesModule],
            overrides: [{ provide: CategoryRepository, useValue: repository }]
        });
    });

    afterEach(async () => {
        await api.close();
    });

    it('exige login (401 AUTH_UNAUTHENTICATED sem token ou com token inválido)', async () => {
        const withoutToken = await api.get('/categories', { auth: false });
        const invalidToken = await api.get('/categories', { auth: 'nao-e-um-jwt' });

        expect(withoutToken.status).toBe(401);
        expect(errorOf(withoutToken).code).toBe('AUTH_UNAUTHENTICATED');
        expect(invalidToken.status).toBe(401);
    });

    it('POST cria (201) e devolve a categoria no envelope { data }', async () => {
        const response = await api.post('/categories', { name: '  Moradia ' });

        expect(response.status).toBe(201);
        expect(dataOf(response)).toMatchObject({ name: 'Moradia', active: true, isDefault: false });
        expect(repository.categories.size).toBe(1);
    });

    it('POST valida o corpo: nome obrigatório, não vazio, até 120 caracteres e sem campos extras (400)', async () => {
        const missing = await api.post('/categories', {});
        const blank = await api.post('/categories', { name: '   ' });
        const extra = await api.post('/categories', { name: 'Lazer', color: 'azul' });
        const tooLong = await api.post('/categories', { name: 'x'.repeat(121) });
        const longest = await api.post('/categories', { name: 'x'.repeat(120) });

        expect(longest.status).toBe(201);

        for (const response of [missing, blank, extra, tooLong]) {
            expect(response.status).toBe(400);
            expect(errorOf(response).code).toBe('VALIDATION_ERROR');
        }

        expect(errorOf(missing).details).toEqual([expect.objectContaining({ field: 'name' })]);
        expect(errorOf(blank).details).toEqual([expect.objectContaining({ field: 'name' })]);
        expect(errorOf(extra).details).toEqual([expect.objectContaining({ field: 'color' })]);
        expect(repository.categories.size).toBe(1);
    });

    it('POST com nome repetido: 409 CATEGORY_NAME_CONFLICT', async () => {
        repository.seed({ name: 'Lazer' });

        const response = await api.post('/categories', { name: 'lazer' });

        expect(response.status).toBe(409);
        expect(errorOf(response)).toMatchObject({ code: 'CATEGORY_NAME_CONFLICT', message: 'Já existe uma categoria com esse nome' });
    });

    it('GET lista as ativas; includeInactive=true traz todas', async () => {
        repository.seed({ name: 'Mercado' });
        repository.seed({ name: 'Antiga', active: false });

        const active = await api.get('/categories');
        const all = await api.get('/categories', { query: { includeInactive: true } });
        const invalid = await api.get('/categories', { query: { includeInactive: 'talvez' } });
        const unknownFilter = await api.get('/categories', { query: { search: 'mer' } });

        expect(dataOf<Array<{ name: string }>>(active).map(category => category.name)).toEqual(['Mercado']);
        expect(dataOf<Array<{ name: string }>>(all).map(category => category.name)).toEqual(['Mercado', 'Antiga']);
        expect(invalid.status).toBe(400);
        expect(unknownFilter.status).toBe(400);
        expect(errorOf(unknownFilter).details).toEqual([expect.objectContaining({ field: 'search' })]);
    });

    it('GET /:id devolve a categoria; id que não é UUID dá 400 e id inexistente dá 404', async () => {
        const category = repository.seed({ name: 'Saúde' });

        const found = await api.get(`/categories/${category.id}`);
        const notUuid = await api.get('/categories/123');
        const missing = await api.get('/categories/3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f');

        expect(found.status).toBe(200);
        expect(dataOf(found)).toMatchObject({ id: category.id, name: 'Saúde' });
        expect(notUuid.status).toBe(400);
        expect(errorOf(notUuid).details).toEqual([expect.objectContaining({ code: 'string.guid', message: 'id deve conter um UUID válido' })]);
        expect(missing.status).toBe(404);
        expect(errorOf(missing)).toMatchObject({ code: 'CATEGORY_NOT_FOUND', message: 'Categoria não encontrada' });
    });

    it('PATCH altera nome/estado; corpo vazio é 400 e a padrão é protegida (409)', async () => {
        const category = repository.seed({ name: 'Feira' });
        const outros = repository.seed({ name: 'Outros', isDefault: true });

        const renamed = await api.patch(`/categories/${category.id}`, { name: 'Hortifruti' });
        const empty = await api.patch(`/categories/${category.id}`, {});
        const extra = await api.patch(`/categories/${category.id}`, { active: true, color: 'azul' });
        const protectedDefault = await api.patch(`/categories/${outros.id}`, { active: false });

        expect(renamed.status).toBe(200);
        expect(dataOf(renamed)).toMatchObject({ name: 'Hortifruti' });
        expect(empty.status).toBe(400);
        expect(extra.status).toBe(400);
        expect(protectedDefault.status).toBe(409);
        expect(errorOf(protectedDefault)).toMatchObject({
            code: 'CATEGORY_DEFAULT_PROTECTED',
            message: 'A categoria padrão não pode ser alterada nem excluída'
        });
    });

    it('DELETE exclui e diz para onde foram as despesas; a padrão é protegida (409) e id inexistente é 404', async () => {
        const category = repository.seed({ name: 'Feira' });
        const outros = repository.seed({ name: 'Outros', isDefault: true });
        repository.expenseCounts.set(category.id, { manualExpenses: 3, cardExpenses: 5 });

        const deleted = await api.request('DELETE', `/categories/${category.id}`);
        const protectedDefault = await api.request('DELETE', `/categories/${outros.id}`);
        const missing = await api.request('DELETE', `/categories/${category.id}`);

        expect(deleted.status).toBe(200);
        expect(dataOf(deleted)).toMatchObject({ movedTo: { id: outros.id, name: 'Outros' }, movedManualExpenses: 3, movedCardExpenses: 5 });
        expect(protectedDefault.status).toBe(409);
        expect(errorOf(protectedDefault).code).toBe('CATEGORY_DEFAULT_PROTECTED');
        expect(missing.status).toBe(404);
        expect((await api.request('DELETE', '/categories/123')).status).toBe(400);
    });

    it('todo erro traz o requestId, igual ao header x-request-id', async () => {
        const response = await api.get('/categories/123', { headers: { 'x-request-id': 'teste-requisicao-1' } });

        expect(response.headers['x-request-id']).toBe('teste-requisicao-1');
        expect(errorOf(response).requestId).toBe('teste-requisicao-1');
    });
});
