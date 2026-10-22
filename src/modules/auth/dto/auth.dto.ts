export class LoginDto {
    public email!: string;

    public password!: string;
}

export class RefreshDto {
    public refreshToken!: string;
}

export class AuthTokensDto {
    public accessToken!: string;

    public refreshToken!: string;
}
