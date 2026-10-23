import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { IncomeController } from './controller/income.controller';
import { IncomeRepository } from './repository/income.repository';
import { IncomeService } from './service/income.service';

@Module({
    imports: [CommonModule],
    controllers: [IncomeController],
    providers: [IncomeRepository, IncomeService],
    exports: [IncomeService]
})
export class IncomesModule { }
