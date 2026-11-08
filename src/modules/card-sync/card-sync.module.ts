import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module.js';
import { CommonModule } from '../common/index.js';
import { CreditCardsModule } from '../credit-cards/credit-cards.module.js';
import { CardSyncController } from './controller/card-sync.controller.js';
import { pluggyClientProvider } from './pluggy/pluggy-client.provider.js';
import { CardSyncRepository } from './repository/card-sync.repository.js';
import { CardSyncService } from './service/card-sync.service.js';

@Module({
    imports: [CommonModule, CategoriesModule, CreditCardsModule],
    controllers: [CardSyncController],
    providers: [CardSyncRepository, CardSyncService, pluggyClientProvider]
})
export class CardSyncModule { }
