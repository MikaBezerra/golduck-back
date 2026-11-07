import { Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export interface RequestFailure {
    readonly code: string;
    readonly reason?: string;
    /** Detalhes da validação (campos rejeitados e por quê). */
    readonly details?: unknown;
    readonly errorName?: string;
    readonly errorMessage?: string;
    readonly stack?: string;
}

@Injectable()
export class RequestLogContext {
    private readonly startedAt = new WeakMap<FastifyRequest, number>();
    private readonly failures = new WeakMap<FastifyRequest, RequestFailure>();

    public start(request: FastifyRequest): void {
        this.startedAt.set(request, performance.now());
    }

    public recordFailure(request: FastifyRequest, failure: RequestFailure): void {
        this.failures.set(request, failure);
    }

    public finish(request: FastifyRequest): { durationMs: number; failure?: RequestFailure } {
        const startedAt = this.startedAt.get(request);
        const failure = this.failures.get(request);
        this.startedAt.delete(request);
        this.failures.delete(request);

        return {
            durationMs: startedAt === undefined ? 0 : Math.round(performance.now() - startedAt),
            ...(failure ? { failure } : {})
        };
    }
}
