import { ApiProperty } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client';
import { UUID_PROPERTY } from '../../common/swagger/api-docs';

export class LoginDto {
    @ApiProperty({ type: String, format: 'email', example: 'admin@exemplo.com' })
    public email!: string;

    @ApiProperty({ type: String, format: 'password' })
    public password!: string;
}

export class RefreshDto {
    @ApiProperty({ type: String })
    public refreshToken!: string;
}

export class AuthTokensDto {
    @ApiProperty({ type: String, description: 'JWT de curta duração, enviado como Authorization: Bearer' })
    public accessToken!: string;

    @ApiProperty({ type: String, description: 'Usado uma única vez em /auth/refresh; cada uso gera um novo' })
    public refreshToken!: string;
}

export class AuthUserResponse {
    @ApiProperty(UUID_PROPERTY)
    public id!: string;

    @ApiProperty({ type: String, format: 'email' })
    public email!: string;

    @ApiProperty({ enum: Role, enumName: 'Role' })
    public role!: Role;
}
