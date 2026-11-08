import { Module } from '@nestjs/common';

import { CommonModule } from '../common/index.js';
import { IncomeController } from './controller/income.controller.js';
import { IncomeRepository } from './repository/income.repository.js';
import { IncomeService } from './service/income.service.js';

@Module({
    imports: [CommonModule],
    controllers: [IncomeController],
    providers: [IncomeRepository, IncomeService],
    exports: [IncomeService]
})
export class IncomesModule { }
