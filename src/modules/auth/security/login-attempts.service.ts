import { Injectable } from '@nestjs/common';

import { ERRORS } from '../../common/errors/error-catalog';
import { RateLimitStore } from '../../common/security';

/** Erros de login aceitos por e-mail dentro da janela; o próximo pedido recebe 429. */
export const LOGIN_MAX_FAILURES_PER_EMAIL = 10;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Trava por e-mail, complementar ao limite por IP do @RateLimit: barra quem tenta senhas de uma
 * mesma conta a partir de muitos IPs. Vale para qualquer e-mail, cadastrado ou não, para a trava
 * não revelar quais contas existem. Um login certo zera os erros daquele e-mail.
 *
 * Efeito colateral conhecido: quem errar de propósito pode travar o login de uma conta por até
 * 15 minutos. Aceitável aqui; em escala, combine com aviso por e-mail ou 2FA.
 */
@Injectable()
export class LoginAttemptsService {
    public constructor(private readonly store: RateLimitStore) { }

    /** Lança 429 (com Retry-After) se o e-mail já atingiu o limite de erros na janela atual. */
    public assertAllowed(email: string, now: number = Date.now()): void {
        const window = this.store.peek(this.key(email), now);

        if (window && window.count >= LOGIN_MAX_FAILURES_PER_EMAIL) {
            throw ERRORS.tooManyRequests(
                `login_failures: ${LOGIN_MAX_FAILURES_PER_EMAIL}/${LOGIN_FAILURE_WINDOW_MS / 60_000}min`,
                (window.resetAt - now) / 1000
            );
        }
    }

    public registerFailure(email: string, now: number = Date.now()): void {
        this.store.hit(this.key(email), LOGIN_FAILURE_WINDOW_MS, now);
    }

    public reset(email: string): void {
        this.store.reset(this.key(email));
    }

    private key(email: string): string {
        return `login-failures ${email.trim().toLowerCase()}`;
    }
}
