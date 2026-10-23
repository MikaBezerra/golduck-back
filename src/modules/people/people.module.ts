import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { PersonController } from './controller/person.controller';
import { PersonRepository } from './repository/person.repository';
import { PersonService } from './service/person.service';

@Module({
    imports: [CommonModule],
    controllers: [PersonController],
    providers: [PersonRepository, PersonService],
    exports: [PersonService]
})
export class PeopleModule { }
