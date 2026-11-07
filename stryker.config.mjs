// @ts-check
/**
 * Testes de mutação (Stryker): o Stryker faz pequenas mudanças no código (troca `>` por `>=`,
 * `&&` por `||`, apaga um `if`, troca um texto por "") e roda os testes de novo para cada mudança.
 * Se algum teste falhar, o "mutante" morreu: os testes perceberam. Se todos passarem, ele
 * sobreviveu, e isso aponta um comportamento que nenhum teste confere de verdade.
 *
 * - `npm run test:mutation`: o projeto todo; relatório em reports/mutation/index.html.
 * - Só uma parte (bem mais rápido), com a variável STRYKER_MUTATE:
 *   `STRYKER_MUTATE=src/modules/people npm run test:mutation`
 *   (PowerShell: `$env:STRYKER_MUTATE='src/modules/people'; npm run test:mutation`);
 *   relatório em reports/mutation-people/index.html.
 *
 * Detalhes em docs/testes.md.
 */

/** Arquivos que nunca são mutados: testes, código gerado e a montagem da aplicação. */
const NEVER_MUTATE = [
    '!src/generated/**',
    '!src/testing/**',
    '!src/**/spec/**',
    '!src/**/*.spec.ts',
    '!src/server.ts',
    '!src/**/*.module.ts',
    '!src/modules/tokens.ts'
];

const only = process.env.STRYKER_MUTATE?.trim().replace(/\\/g, '/').replace(/\/+$/, '');
/** Nome curto da parte testada, para separar os relatórios (ex.: "people"). */
const scope = only ? only.split('/').filter(Boolean).pop()?.replace(/\.ts$/, '') : undefined;
const reportDir = scope ? `reports/mutation-${scope}` : 'reports/mutation';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
    testRunner: 'jest',
    jest: { projectType: 'custom', configFile: 'jest.json', enableFindRelatedTests: true },
    // O Jest roda em modo ESM, como no npm test.
    testRunnerNodeArgs: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'],
    coverageAnalysis: 'perTest',
    plugins: ['@stryker-mutator/jest-runner', './stryker/ignore-decorators.mjs'],
    ignorers: ['decorators'],
    mutate: [only ? (only.endsWith('.ts') ? only : `${only}/**/*.ts`) : 'src/**/*.ts', ...NEVER_MUTATE],
    reporters: ['clear-text', 'progress', 'html', 'json'],
    htmlReporter: { fileName: `${reportDir}/index.html` },
    jsonReporter: { fileName: `${reportDir}/mutation.json` },
    // Reaproveita o resultado da rodada anterior: só testa de novo o que mudou (código ou testes).
    incremental: true,
    incrementalFile: `${reportDir}/stryker-incremental.json`,
    tempDirName: '.stryker-tmp',
    // Rodada parcial usa menos núcleos, para dar para rodar mais de uma ao mesmo tempo.
    concurrency: scope ? 3 : undefined,
    timeoutMS: 15000,
    // Metas do "mutation score" (% de mutantes mortos). Abaixo de `break`, o comando falha.
    thresholds: { high: 80, low: 60, break: 50 }
};
