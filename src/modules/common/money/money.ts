const MAX_AMOUNT_CENTS = 9_223_372_036_854_775_807n;

export function parsePositiveAmountCents(amount: string): bigint | null {
    if (
        amount.length > 20
        || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(amount)
    ) {
        return null;
    }

    const [whole, fraction = ''] = amount.split('.');
    const cents = BigInt(whole) * 100n
        + BigInt(fraction.padEnd(2, '0'));

    return cents > 0n && cents <= MAX_AMOUNT_CENTS
        ? cents
        : null;
}

export function formatAmountCents(cents: bigint): string {
    const negative = cents < 0n;
    const absolute = negative ? -cents : cents;
    const whole = absolute / 100n;
    const fraction = (absolute % 100n).toString().padStart(2, '0');

    return `${negative ? '-' : ''}${whole}.${fraction}`;
}
