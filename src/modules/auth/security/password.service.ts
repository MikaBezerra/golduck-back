import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
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
}
