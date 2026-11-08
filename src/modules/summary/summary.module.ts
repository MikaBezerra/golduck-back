import { Module } from '@nestjs/common';

import { CommonModule } from '../common/index.js';
import { SummaryController } from './controller/summary.controller.js';
import { SummaryRepository } from './repository/summary.repository.js';
import { SummaryService } from './service/summary.service.js';

@Module({
    imports: [CommonModule],
    controllers: [SummaryController],
    providers: [SummaryRepository, SummaryService],
    exports: [SummaryService]
})
export class SummaryModule { }
