module.exports = {
    "env": {
        "browser": false,
        "es6": true,
        "node": true
    },
    "extends": [
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking"
    ],
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "project": "tsconfig.eslint.json",
        "sourceType": "module"
    },
    "plugins": [
        "eslint-plugin-prefer-arrow",
        "eslint-plugin-import",
        "@typescript-eslint"
    ],
    "root": true,
    "ignorePatterns": ["src/generated/**"],
    "overrides": [
        {
            "files": ["scripts/**/*.ts"],
            "rules": {
                "import/no-extraneous-dependencies": ["error", { "devDependencies": true }],
                "no-console": "off"
            }
        }
    ],
    "rules": {
        "@typescript-eslint/adjacent-overload-signatures": "error",
        "@typescript-eslint/array-type": "off",
        "@typescript-eslint/await-thenable": "error",
        "@typescript-eslint/consistent-type-assertions": "error",
        "@typescript-eslint/dot-notation": "error",
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/explicit-member-accessibility": [
            "error",
            {
                "accessibility": "explicit"
            }
        ],
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/member-ordering": "error",
        "@typescript-eslint/naming-convention": [
            "error",
            {
                "selector": "variable",
                "format": [
                    "camelCase",
                    "UPPER_CASE"
                ],
                "leadingUnderscore": "forbid",
                "trailingUnderscore": "forbid"
            }
        ],
        "@typescript-eslint/no-dynamic-delete": "error",
        "@typescript-eslint/no-empty-function": "error",
        "@typescript-eslint/no-empty-interface": "error",
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-misused-new": "error",
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/no-non-null-assertion": "error",
        "@typescript-eslint/no-parameter-properties": "off",
        "@typescript-eslint/no-shadow": [
            "error",
            {
                "hoist": "all"
            }
        ],
        "@typescript-eslint/no-unused-expressions": "error",
        "@typescript-eslint/no-use-before-define": "off",
        "@typescript-eslint/no-var-requires": "error",
        "@typescript-eslint/prefer-for-of": "error",
        "@typescript-eslint/prefer-function-type": "error",
        "@typescript-eslint/prefer-namespace-keyword": "error",
        "@typescript-eslint/prefer-readonly": "error",
        "@typescript-eslint/promise-function-async": "error",
        "@typescript-eslint/restrict-plus-operands": "error",
        "@typescript-eslint/triple-slash-reference": [
            "error",
            {
                "path": "always",
                "types": "prefer-import",
                "lib": "always"
            }
        ],
        "@typescript-eslint/typedef": "off",
        "@typescript-eslint/unified-signatures": "error",
        "arrow-body-style": "error",
        "arrow-parens": [
            "off",
            "always"
        ],
        "brace-style": [
            "off",
            "off"
        ],
        "comma-dangle": "off",
        "complexity": "off",
        "constructor-super": "error",
        "curly": [
            "error",
            "multi-line"
        ],
        "dot-notation": "off",
        "eol-last": "off",
        "eqeqeq": [
            "error",
            "always"
        ],
        "guard-for-in": "error",
        "id-denylist": "error",
        "id-match": "error",
        "import/no-default-export": "error",
        "import/no-extraneous-dependencies": [
            "error",
            {
                "devDependencies": false
            }
        ],
        "import/no-unassigned-import": "error",
        "import/order": [
            "error",
            {
                "alphabetize": {
                    "caseInsensitive": true,
                    "order": "asc"
                },
                "newlines-between": "ignore",
                "groups": [
                    [
                        "builtin",
                        "external",
                        "internal",
                        "unknown",
                        "object",
                        "type"
                    ],
                    "parent",
                    [
                        "sibling",
                        "index"
                    ]
                ],
                "distinctGroup": false,
                "pathGroupsExcludedImportTypes": [],
                "pathGroups": [
                    {
                        "pattern": "./",
                        "patternOptions": {
                            "nocomment": true,
                            "dot": true
                        },
                        "group": "sibling",
                        "position": "before"
                    },
                    {
                        "pattern": ".",
                        "patternOptions": {
                            "nocomment": true,
                            "dot": true
                        },
                        "group": "sibling",
                        "position": "before"
                    },
                    {
                        "pattern": "..",
                        "patternOptions": {
                            "nocomment": true,
                            "dot": true
                        },
                        "group": "parent",
                        "position": "before"
                    },
                    {
                        "pattern": "../",
                        "patternOptions": {
                            "nocomment": true,
                            "dot": true
                        },
                        "group": "parent",
                        "position": "before"
                    }
                ]
            }
        ],
        "max-len": [
            "error",
            {
                "code": 180
            }
        ],
        "new-parens": "error",
        "no-bitwise": "error",
        "no-caller": "error",
        "no-cond-assign": "error",
        "no-console": "error",
        "no-debugger": "error",
        "no-empty": "error",
        "no-empty-function": "off",
        "no-eval": "error",
        "no-fallthrough": "off",
        "no-invalid-this": "error",
        "no-multiple-empty-lines": "error",
        "no-new-wrappers": "error",
        "no-param-reassign": "error",
        "no-return-await": "error",
        "no-sequences": "error",
        "no-shadow": "off",
        "no-throw-literal": "error",
        "no-trailing-spaces": "error",
        "no-undef-init": "error",
        "no-underscore-dangle": "error",
        "no-unsafe-finally": "error",
        "no-unused-expressions": "off",
        "no-unused-labels": "error",
        "no-use-before-define": "off",
        "no-var": "error",
        "object-shorthand": "error",
        "one-var": [
            "off",
            "never"
        ],
        "prefer-arrow/prefer-arrow-functions": [
            "off",
            {}
        ],
        "prefer-const": "error",
        "prefer-template": "error",
        "quotes": ["error", "single"],
        "radix": "error",
        "semi": ["error", "always"],
        "spaced-comment": [
            "error",
            "always",
            {
                "markers": [
                    "/"
                ]
            }
        ],
        "use-isnan": "error",
        "valid-typeof": "off"
    }
};
