import { Module } from '@nestjs/common';

import { CommonModule } from '../common/index.js';
import { CreditCardController } from './controller/credit-card.controller.js';
import { CreditCardRepository } from './repository/credit-card.repository.js';
import { CreditCardService } from './service/credit-card.service.js';

@Module({
    imports: [CommonModule],
    controllers: [CreditCardController],
    providers: [CreditCardRepository, CreditCardService],
    exports: [CreditCardService]
})
export class CreditCardsModule { }
