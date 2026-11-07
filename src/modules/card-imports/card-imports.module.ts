import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module';
import { CommonModule } from '../common';
import { CreditCardsModule } from '../credit-cards/credit-cards.module';
import { CardImportController } from './controller/card-import.controller';
import { CARD_STATEMENT_PARSERS } from './parsers/card-statement-parser.registry';
import { CardImportRepository } from './repository/card-import.repository';
import { CardImportService } from './service/card-import.service';

@Module({
    imports: [CommonModule, CategoriesModule, CreditCardsModule],
    controllers: [CardImportController],
    providers: [...CARD_STATEMENT_PARSERS, CardImportRepository, CardImportService]
})
export class CardImportsModule { }
