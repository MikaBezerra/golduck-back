import type { ApiSuccessResponse } from './response.types';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { map, Observable } from 'rxjs';


@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
    public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const reply = context.switchToHttp().getResponse<FastifyReply>();

        return next.handle().pipe(map((value: unknown): ApiSuccessResponse<unknown> | undefined => {
            if (reply.statusCode === 204 || value === undefined) {
                return undefined;
            }

            return { data: value };
        }));
    }
}
