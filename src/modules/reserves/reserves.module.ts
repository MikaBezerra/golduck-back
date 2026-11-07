import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { ReserveController } from './controller/reserve.controller';
import { ReserveRepository } from './repository/reserve.repository';
import { ReserveService } from './service/reserve.service';

@Module({
    imports: [CommonModule],
    controllers: [ReserveController],
    providers: [ReserveRepository, ReserveService],
    exports: [ReserveService]
})
export class ReservesModule { }
