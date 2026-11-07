// Confere se os valores sensíveis dos .env versionados estão criptografados pelo dotenvx.
// Uso: `node scripts/check-env-encrypted.mjs` (arquivos da pasta, no CI) ou com `--staged`
// (versão que vai no commit, no hook pre-commit do Husky). Nunca imprime valores, só os nomes.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const FILES = ['.env.develop', '.env.production'];
const SENSITIVE = ['DATABASE_URL', 'DATABASE_DIRECT_URL', 'JWT_SECRET'];
const staged = process.argv.includes('--staged');

const read = file => {
    if (!staged) {
        return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    }

    const stagedFiles = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' }).split(/\r?\n/);

    return stagedFiles.includes(file) ? execFileSync('git', ['show', `:${file}`], { encoding: 'utf8' }) : undefined;
};

const problems = [];

for (const file of FILES) {
    const content = read(file);

    if (content === undefined) {
        continue;
    }

    for (const line of content.split(/\r?\n/)) {
        const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);

        if (!match || !SENSITIVE.includes(match[1])) {
            continue;
        }

        const value = match[2].replace(/^["']/, '');

        if (value !== '' && !value.startsWith('encrypted:')) {
            problems.push(`${file}: ${match[1]}`);
        }
    }
}

if (problems.length > 0) {
    console.error('Valores sensíveis sem criptografia (use npx dotenvx encrypt -f <arquivo>):');
    problems.forEach(problem => console.error(`  - ${problem}`));
    process.exit(1);
}
