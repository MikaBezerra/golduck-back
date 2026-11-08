import { Module } from '@nestjs/common';

import { CommonModule } from '../common/index.js';
import { PersonController } from './controller/person.controller.js';
import { PersonRepository } from './repository/person.repository.js';
import { PersonService } from './service/person.service.js';

@Module({
    imports: [CommonModule],
    controllers: [PersonController],
    providers: [PersonRepository, PersonService],
    exports: [PersonService]
})
export class PeopleModule { }
