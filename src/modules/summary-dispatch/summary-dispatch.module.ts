import { Module } from '@nestjs/common';

import { CommonModule } from '../common/index.js';
import { SummaryModule } from '../summary/summary.module.js';
import { SummaryDispatchController } from './controller/summary-dispatch.controller.js';
import { summaryMailerProvider } from './mail/summary-mailer.provider.js';
import { SummaryDispatchRepository } from './repository/summary-dispatch.repository.js';
import { SummaryDispatchService } from './service/summary-dispatch.service.js';

@Module({
    imports: [CommonModule, SummaryModule],
    controllers: [SummaryDispatchController],
    providers: [SummaryDispatchRepository, SummaryDispatchService, summaryMailerProvider]
})
export class SummaryDispatchModule { }
