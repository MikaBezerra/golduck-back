import type { ExecutionContext } from '@nestjs/common';

/** Classe de um controller de teste (só o protótipo importa: é nele que os decorators gravam os metadados). */
export interface ControllerClass {
    readonly prototype: object;
}

/**
 * ExecutionContext mínimo de uma requisição HTTP, para chamar um guard direto. O handler é o próprio
 * método do protótipo (como o Nest entrega em getHandler()), com os metadados de @Public/@Roles.
 */
export function httpContext(controller: ControllerClass, method: string, getRequest: () => unknown): ExecutionContext {
    const handler: unknown = Object.getOwnPropertyDescriptor(controller.prototype, method)?.value;

    if (typeof handler !== 'function') {
        throw new Error(`o controller de teste não tem o método ${method}`);
    }

    return {
        getClass: () => controller,
        getHandler: () => handler,
        switchToHttp: () => ({ getRequest })
    } as unknown as ExecutionContext;
}
