import Joi from 'joi';

import { ExpenseSplit } from '../../../generated/prisma/client.js';

/*
 * De quem é a despesa (campo split):
 * - PENDING: compra do cartão que chegou pela sincronização ou pelo upload e ninguém classificou.
 *   Entra nas contas como compartilhada, mas o resumo avisa e o envio por e-mail fica bloqueado;
 * - SHARED: compartilhada, dividida entre as pessoas ativas;
 * - PERSONAL: individual, de personId.
 *
 * personId existe só (e sempre) no PERSONAL; o banco garante isso com um CHECK.
 */

/** O que quem edita uma despesa pode escolher (PENDING só nasce da sincronização ou do upload). */
export const CHOSEN_SPLITS = [ExpenseSplit.SHARED, ExpenseSplit.PERSONAL] as const;

export type ChosenSplit = typeof CHOSEN_SPLITS[number];

/** Como a despesa é dividida, já validado. */
export type SplitAssignment = {
    split: ExpenseSplit;
    personId: string | null;
};

export const SPLIT_PROPERTY = {
    type: String,
    enum: ExpenseSplit,
    enumName: 'ExpenseSplit',
    description: 'PENDING (compra do cartão ainda sem pessoa: conta como compartilhada, mas bloqueia o envio do resumo), '
        + 'SHARED (compartilhada) ou PERSONAL (individual, de personId)'
} as const;

export const CHOSEN_SPLIT_PROPERTY = {
    type: String,
    enum: CHOSEN_SPLITS,
    enumName: 'ChosenExpenseSplit',
    description: 'SHARED (compartilhada) ou PERSONAL (individual: exige personId)'
} as const;

/**
 * Regras de split + personId nas rotas que gravam despesas: personId é obrigatório com PERSONAL; nos
 * outros casos (inclusive quando split não veio) só pode faltar ou ser null.
 */
export function splitSchemas(
    idSchema: Joi.StringSchema,
    options: { required: boolean; allowed?: readonly ExpenseSplit[] }
): { split: Joi.StringSchema; personId: Joi.Schema } {
    const split = Joi.string().valid(...(options.allowed ?? CHOSEN_SPLITS));

    return {
        split: options.required ? split.required() : split.optional(),
        personId: Joi.when('split', {
            is: ExpenseSplit.PERSONAL,
            then: idSchema.required(),
            otherwise: Joi.valid(null).optional().messages({ 'any.only': 'personId só pode ser informado com split PERSONAL' })
        })
    };
}

/** Linha que ainda não foi classificada. */
export const PENDING_SPLIT: SplitAssignment = { split: ExpenseSplit.PENDING, personId: null };

/** Todos os valores de split (inclusive PENDING), para filtros e para as escolhas do upload. */
export const ALL_SPLITS = Object.values(ExpenseSplit);
