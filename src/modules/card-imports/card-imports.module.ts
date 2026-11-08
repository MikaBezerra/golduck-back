import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module.js';
import { CommonModule } from '../common/index.js';
import { CreditCardsModule } from '../credit-cards/credit-cards.module.js';
import { PeopleModule } from '../people/people.module.js';
import { CardImportController } from './controller/card-import.controller.js';
import { CARD_STATEMENT_PARSERS } from './parsers/card-statement-parser.registry.js';
import { CardImportRepository } from './repository/card-import.repository.js';
import { CardImportService } from './service/card-import.service.js';

@Module({
    imports: [CommonModule, CategoriesModule, CreditCardsModule, PeopleModule],
    controllers: [CardImportController],
    providers: [...CARD_STATEMENT_PARSERS, CardImportRepository, CardImportService]
})
export class CardImportsModule { }
