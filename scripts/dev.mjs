// Modo desenvolvimento: compila com `tsc --watch` e roda o resultado (dist/) com `node --watch`.
// Executar o TypeScript direto (tsx, ts-node) não serve: o tsx não gera os metadados de tipo que a
// injeção de dependências do Nest usa, e o loader ESM do ts-node não resolve os pacotes do NestJS 12.
import { spawn } from 'node:child_process';

const children = [];
let api;

const run = (args, options = {}) => {
    const child = spawn(process.execPath, args, { stdio: options.stdio ?? 'inherit' });
    children.push(child);
    return child;
};

const stopAll = () => {
    children.forEach(child => child.kill());
    process.exit();
};

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

const tsc = run(['node_modules/typescript/bin/tsc', '--watch', '--preserveWatchOutput'], { stdio: ['ignore', 'pipe', 'inherit'] });

tsc.stdout.on('data', chunk => {
    const text = chunk.toString();
    process.stdout.write(text);

    // Sobe a API depois da primeira compilação; o node --watch reinicia a cada nova compilação.
    if (!api && /Found \d+ errors?\./.test(text)) {
        api = run(['--watch', 'dist/server.js']);
    }
});

tsc.on('exit', code => {
    children.forEach(child => child.kill());
    process.exit(code ?? 0);
});
