import type { CreditCard } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';

import { CreateCreditCardDto, CreditCardResponse, UpdateCreditCardDto } from '../dto/credit-card.dto';
import { CREDIT_CARD_ERRORS } from '../errors/credit-card.errors';
import { CreditCardRepository } from '../repository/credit-card.repository';

@Injectable()
export class CreditCardService {
    public constructor(private readonly creditCardRepository: CreditCardRepository) { }

    public async create(data: CreateCreditCardDto): Promise<CreditCardResponse> {
        const card = await this.creditCardRepository.create({
            name: this.normalizeName(data.name),
            bank: data.bank
        });

        return this.toResponse(card);
    }

    public async findAll(): Promise<CreditCardResponse[]> {
        const cards = await this.creditCardRepository.findAll();

        return cards.map(card => this.toResponse(card));
    }

    public async findById(id: string): Promise<CreditCardResponse> {
        return this.toResponse(await this.getById(id));
    }

    public async getById(id: string): Promise<CreditCard> {
        const card = await this.creditCardRepository.findById(id);

        if (!card) {
            throw CREDIT_CARD_ERRORS.notFound('credit_card_id_not_found');
        }

        return card;
    }

    public async getActiveById(id: string): Promise<CreditCard> {
        const card = await this.getById(id);

        if (!card.active) {
            throw CREDIT_CARD_ERRORS.inactive('credit_card_inactive');
        }

        return card;
    }

    public async update(id: string, data: UpdateCreditCardDto): Promise<CreditCardResponse> {
        await this.getById(id);

        const card = await this.creditCardRepository.update(id, {
            name: data.name === undefined ? undefined : this.normalizeName(data.name),
            active: data.active
        });

        return this.toResponse(card);
    }

    private normalizeName(name: string): string {
        return name.trim().replace(/\s+/g, ' ');
    }

    private toResponse(card: CreditCard): CreditCardResponse {
        return {
            id: card.id,
            name: card.name,
            bank: card.bank,
            active: card.active,
            createdAt: card.createdAt,
            updatedAt: card.updatedAt
        };
    }
}
