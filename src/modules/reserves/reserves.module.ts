import { Module } from '@nestjs/common';

import { CommonModule } from '../common/index.js';
import { ReserveController } from './controller/reserve.controller.js';
import { ReserveRepository } from './repository/reserve.repository.js';
import { ReserveService } from './service/reserve.service.js';

@Module({
    imports: [CommonModule],
    controllers: [ReserveController],
    providers: [ReserveRepository, ReserveService],
    exports: [ReserveService]
})
export class ReservesModule { }
