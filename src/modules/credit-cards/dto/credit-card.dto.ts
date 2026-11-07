import type { CardBank } from '../../../generated/prisma/client';

export class CreateCreditCardDto {
    public name!: string;

    public bank!: CardBank;
}

export class UpdateCreditCardDto {
    public name?: string;

    public active?: boolean;
}

export type CreditCardResponse = {
    id: string;
    name: string;
    bank: CardBank;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
};
