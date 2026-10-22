export class CreatePersonDto {
    public name!: string;

    public email?: string | null;

    public phone?: string | null;
}

export class UpdatePersonDto {
    public name?: string;

    public email?: string | null;

    public phone?: string | null;

    public active?: boolean;
}

