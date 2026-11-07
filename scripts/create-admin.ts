import { input, password } from '@inquirer/prompts';
import * as Joi from 'joi';

import { Prisma, Role } from '../src/generated/prisma/client';
import { PasswordService } from '../src/modules/auth/security/password.service';
import { PrismaService } from '../src/modules/common/provider/prisma.provider';


const emailSchema = Joi.string().email().required();

/** Onde o admin será criado (ambiente, host, banco e schema), sem usuário nem senha da URL. */
function describeTarget(): string {
    const environment = process.env.APP_ENV || 'local';

    try {
        const url = new URL(process.env.DATABASE_URL ?? '');
        const schema = url.searchParams.get('schema') || 'public';

        return `${environment} (banco ${url.pathname.slice(1)} em ${url.hostname}, schema ${schema})`;
    } catch {
        throw new Error('DATABASE_URL ausente ou inválida no arquivo de ambiente.');
    }
}

async function createAdmin(): Promise<void> {
    if (!process.stdin.isTTY) {
        throw new Error('Execute este comando em um terminal interativo');

    }

    console.log(`Criando administrador em: ${describeTarget()}`);

    const email = (await input({
        message: 'E-mail de administrador',
        validate: value =>
            emailSchema.validate(value.trim().toLowerCase()).error
                ? 'Informe um e-mail válido'
                : true
    })).trim().toLowerCase();

    const plainPassword = await password({
        message: 'Senha:',
        mask: '*',
        toggleMask: false,
        validate: value =>
            value.length >= 12
                ? true
                : 'Use pelo menos 12 caracteres.'
    });

    await password({
        message: 'Confirme a senha:',
        mask: '*',
        toggleMask: false,
        validate: value =>
            value === plainPassword
                ? true
                : 'As senhas não coincidem.'
    });

    const prisma = new PrismaService();

    try {
        await prisma.$connect();

        const existingUser = await prisma.user.findFirst({
            where: {
                email: {
                    equals: email,
                    mode: 'insensitive'
                }
            },
            select: { id: true }
        });

        if (existingUser) {
            throw new Error('Já existe um usuário com esse e-mail.');
        }

        const hash = await new PasswordService().hashPassword(plainPassword);

        const admin = await prisma.user.create({
            data: {
                email,
                hash,
                role: Role.ADMIN
            },
            select: {
                id: true,
                email: true
            }
        });

        console.log(`Administrador criado: ${admin.email} (${admin.id})`);
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
        ) {
            throw new Error('Já existe um usuário com esse e-mail.');
        }

        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

createAdmin().catch(error => {
    console.error(
        error instanceof Error
            ? error.message
            : 'Não foi possível criar o administrador.'
    );
    process.exitCode = 1;
});
