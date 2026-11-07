import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
import { CreateCreditCardDto, CreditCardResponse, UpdateCreditCardDto } from '../dto/credit-card.dto';
import { CreateCreditCardPipe, CreditCardIdPipe, UpdateCreditCardPipe } from '../flow/credit-card.pipe';
import { CreditCardService } from '../service/credit-card.service';

@Controller('credit-cards')
@Roles(Role.USER)
export class CreditCardController {
    public constructor(private readonly creditCardService: CreditCardService) { }

    @Post()
    public async create(@Body(CreateCreditCardPipe) body: CreateCreditCardDto): Promise<CreditCardResponse> {
        return this.creditCardService.create(body);
    }

    @Get()
    public async findAll(): Promise<CreditCardResponse[]> {
        return this.creditCardService.findAll();
    }

    @Get(':id')
    public async findById(@Param('id', CreditCardIdPipe) id: string): Promise<CreditCardResponse> {
        return this.creditCardService.findById(id);
    }

    @Patch(':id')
    public async update(
        @Param('id', CreditCardIdPipe) id: string,
        @Body(UpdateCreditCardPipe) body: UpdateCreditCardDto
    ): Promise<CreditCardResponse> {
        return this.creditCardService.update(id, body);
    }
}
