import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { CreditCardController } from './controller/credit-card.controller';
import { CreditCardRepository } from './repository/credit-card.repository';
import { CreditCardService } from './service/credit-card.service';

@Module({
    imports: [CommonModule],
    controllers: [CreditCardController],
    providers: [CreditCardRepository, CreditCardService],
    exports: [CreditCardService]
})
export class CreditCardsModule { }
