import { ApiProperty } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client.js';
import { UUID_PROPERTY } from '../../common/swagger/api-docs.js';

export class LoginDto {
    @ApiProperty({ type: String, format: 'email', example: 'admin@exemplo.com' })
    public email!: string;

    @ApiProperty({ type: String, format: 'password' })
    public password!: string;
}

/** O refresh token não vem no corpo: fica no cookie httpOnly gravado pela própria resposta. */
export class AuthTokensDto {
    @ApiProperty({ type: String, description: 'JWT de curta duração (15 min), enviado como Authorization: Bearer' })
    public accessToken!: string;
}

export class AuthUserResponse {
    @ApiProperty(UUID_PROPERTY)
    public id!: string;

    @ApiProperty({ type: String, format: 'email' })
    public email!: string;

    @ApiProperty({ enum: Role, enumName: 'Role' })
    public role!: Role;
}
