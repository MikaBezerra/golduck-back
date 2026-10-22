import { ApiProperty } from '@nestjs/swagger';
import { Passenger } from '../../../generated/prisma/client';

export class PassengerData {

    public static readonly NAME_LENGTH = 50;

    @ApiProperty({ type: Number, description: 'Passenger unique ID', example: 36635263 })
    public readonly id: number;

    @ApiProperty({ type: String, description: 'First name', example: 'John' })
    public readonly firstName: string;

    @ApiProperty({ type: String, description: 'Last name', example: 'Doe' })
    public readonly lastName: string;

    public constructor(entity: Passenger) {
        this.id = entity.id;
        this.firstName = entity.firstName;
        this.lastName = entity.lastName;
    }

}
