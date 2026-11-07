/**
 * Mensagens de commit no padrão Conventional Commits (feat:, fix:, chore:, docs:...), as mesmas que o
 * release-please usa no CHANGELOG e que o workflow pr-title exige no título do PR.
 * Roda no hook commit-msg do Husky.
 */
export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        // Assunto em português, com nomes próprios e siglas (ex.: "feat: Swagger com JWT").
        'subject-case': [0],
        // Corpo e rodapé com listas e linhas longas.
        'body-max-line-length': [0],
        'footer-max-line-length': [0]
    }
};
