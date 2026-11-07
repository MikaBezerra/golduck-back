import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Identificação da API publicada: vai em todo log (formato JSON), no header x-app-version e em GET /version. */
export interface AppInfo {
    readonly name: string;
    readonly version: string;
    /** Commit publicado (7 caracteres) ou null quando não informado. */
    readonly commit: string | null;
    /** Valor de APP_ENV (local, develop, production...). */
    readonly environment: string;
}

let cached: AppInfo | undefined;

/**
 * Lê nome e versão do package.json da pasta de onde a API foi iniciada
 * (os scripts do npm e a Vercel rodam na raiz do projeto).
 */
function readPackageJson(): { name?: string; version?: string } {
    try {
        return JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { name?: string; version?: string };
    } catch {
        return {};
    }
}

/** GIT_COMMIT_SHA tem prioridade; na Vercel e no GitHub Actions o commit vem em variáveis próprias. */
function resolveCommit(): string | null {
    const sha = process.env.GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;

    return sha ? sha.trim().slice(0, 7) : null;
}

export function getAppInfo(): AppInfo {
    if (!cached) {
        const packageJson = readPackageJson();

        cached = {
            name: packageJson.name ?? process.env.npm_package_name ?? 'api',
            version: packageJson.version ?? process.env.npm_package_version ?? '0.0.0',
            commit: resolveCommit(),
            environment: process.env.APP_ENV || 'local'
        };
    }

    return cached;
}
