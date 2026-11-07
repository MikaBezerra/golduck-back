import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { SummaryController } from './controller/summary.controller';
import { SummaryRepository } from './repository/summary.repository';
import { SummaryService } from './service/summary.service';

@Module({
    imports: [CommonModule],
    controllers: [SummaryController],
    providers: [SummaryRepository, SummaryService]
})
export class SummaryModule { }
