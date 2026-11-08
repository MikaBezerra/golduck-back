import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

@Injectable()
export class PasswordService {
    /** Hash descartável, com os mesmos parâmetros, para comparar quando o usuário não existe. */
    private dummyHash?: Promise<string>;

    public async hashPassword(password: string): Promise<string> {
        return argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 19 * 1024,
            timeCost: 2,
            parallelism: 1
        });
    }

    public async verifyPassword(
        password: string,
        storedHash: string
    ): Promise<boolean> {
        return argon2.verify(storedHash, password);
    }

    /**
     * Gasta o mesmo tempo de uma verificação real e sempre devolve false. Usado quando o e-mail
     * não existe, para o tempo de resposta não revelar quais e-mails têm conta.
     */
    public async verifyAgainstDummy(password: string): Promise<false> {
        this.dummyHash ??= this.hashPassword(randomBytes(32).toString('base64url'));
        await this.verifyPassword(password, await this.dummyHash);

        return false;
    }
}
