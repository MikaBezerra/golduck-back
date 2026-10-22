import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { map, Observable } from 'rxjs';

import type { ApiSuccessResponse } from './response.types';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
    public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const reply = context.switchToHttp().getResponse<FastifyReply>();

        return next.handle().pipe(map((value: unknown): ApiSuccessResponse<unknown> | undefined => {
            if (reply.statusCode === HttpStatus.NO_CONTENT || value === undefined) {
                return undefined;
            }

            return { data: value };
        }));
    }
}
