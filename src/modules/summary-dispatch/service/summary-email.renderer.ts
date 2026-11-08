/*
 * E-mail do resumo de uma pessoa: assunto, HTML (estilos inline, como os clientes de e-mail exigem) e
 * a versão em texto puro. Função pura: recebe os valores já calculados pelo resumo (statement) e só
 * formata. Nenhuma conta aqui além de comparar datas.
 */

export type SummaryEmailInput = {
    /** "AAAA-MM" */
    month: string;
    name: string;
    beforeReserve: string;
    individual: string;
    /** Parte da pessoa na reserva do mês. */
    reserveShare: string;
    net: string;
    /** Quanto foi guardado no mês (todas as pessoas); null = sem reserva. */
    reserveMonth: string | null;
    /** Soma de todas as reservas até o mês. */
    reserveAccumulated: string;
    /** Agora; decide se o mês ainda está em andamento ("até 08/11"). */
    now: Date;
};

export type SummaryEmail = {
    subject: string;
    html: string;
    text: string;
};

const MONTH_NAMES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

const TIME_ZONE = 'America/Sao_Paulo';

const COLORS = {
    text: '#1f2933',
    muted: '#6b7280',
    line: '#e5e7eb',
    positive: '#15803d',
    negative: '#b91c1c',
    background: '#f8fafc'
} as const;

export function renderSummaryEmail(input: SummaryEmailInput): SummaryEmail {
    const monthLabel = formatMonthLabel(input.month);
    const partialUntil = partialDay(input.month, input.now);
    const period = partialUntil === null ? monthLabel : `${monthLabel} (parcial, até ${partialUntil})`;
    const subject = `Golduck · Resumo de ${monthLabel}${partialUntil === null ? '' : ` (até ${partialUntil})`}`;
    const negative = input.net.startsWith('-');
    const reserveMonthText = input.reserveMonth === null ? 'Nada guardado neste mês' : formatMoney(input.reserveMonth);
    const lines: Array<[string, string]> = [
        ['Líquido sem gastos individuais', formatMoney(input.beforeReserve)],
        ['(−) Gastos individuais', formatMoney(input.individual)],
        ['(−) Sua parte da reserva', formatMoney(input.reserveShare)]
    ];
    const name = escapeHtml(input.name);

    const cell = `padding:10px 0;border-bottom:1px solid ${COLORS.line};`;
    const netColor = negative ? COLORS.negative : COLORS.positive;
    const netCell = `<td style="padding:14px 0 0;text-align:right;white-space:nowrap;font-size:20px;font-weight:bold;color:${netColor};">`
        + `${formatMoney(input.net)}</td>`;
    const accumulatedCell = `<td style="padding:10px 0;text-align:right;white-space:nowrap;">${formatMoney(input.reserveAccumulated)}</td>`;
    const rows = lines.map(([label, value]) =>
        `<tr><td style="${cell}color:${COLORS.muted};">${label}</td><td style="${cell}text-align:right;white-space:nowrap;">${value}</td></tr>`
    ).join('');

    const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:${COLORS.background};font-family:Arial,Helvetica,sans-serif;color:${COLORS.text};">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid ${COLORS.line};">
<tr><td style="padding:24px;">
<p style="margin:0 0 4px;font-size:18px;font-weight:bold;">Olá, ${name}!</p>
<p style="margin:0 0 20px;color:${COLORS.muted};">Este é o seu resumo de ${period}.</p>
<table role="presentation" width="100%" style="border-collapse:collapse;font-size:15px;">${rows}
<tr><td style="padding:14px 0 0;font-weight:bold;">Líquido</td>${netCell}</tr>
</table>
<p style="margin:24px 0 8px;font-weight:bold;">Reserva</p>
<table role="presentation" width="100%" style="border-collapse:collapse;font-size:15px;">
<tr><td style="${cell}color:${COLORS.muted};">Guardado neste mês</td><td style="${cell}text-align:right;white-space:nowrap;">${reserveMonthText}</td></tr>
<tr><td style="padding:10px 0;color:${COLORS.muted};">Reserva acumulada até ${monthLabel}</td>${accumulatedCell}</tr>
</table>
<p style="margin:24px 0 0;font-size:12px;color:${COLORS.muted};">Enviado pelo Golduck.</p>
</td></tr>
</table>
</body>
</html>`;

    const text = [
        `Olá, ${input.name}!`,
        '',
        `Este é o seu resumo de ${period}.`,
        '',
        ...lines.map(([label, value]) => `${label}: ${value}`),
        `Líquido: ${formatMoney(input.net)}`,
        '',
        'Reserva',
        `Guardado neste mês: ${reserveMonthText}`,
        `Reserva acumulada até ${monthLabel}: ${formatMoney(input.reserveAccumulated)}`,
        '',
        'Enviado pelo Golduck.'
    ].join('\n');

    return { subject, html, text };
}

/** "1234.56" → "R$ 1.234,56"; "-5.00" → "-R$ 5,00". */
export function formatMoney(amount: string): string {
    const negative = amount.startsWith('-');
    const [whole, fraction = '00'] = (negative ? amount.slice(1) : amount).split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    return `${negative ? '-' : ''}R$ ${grouped},${fraction.padEnd(2, '0')}`;
}

/** "2026-11" → "novembro/2026". */
export function formatMonthLabel(month: string): string {
    const [year, monthNumber] = month.split('-').map(Number);

    return `${MONTH_NAMES[monthNumber - 1]}/${year}`;
}

/** "ayanne@gmail.com" → "ay•••@gmail.com" (para mostrar na tela e no log sem expor o endereço). */
export function maskEmail(email: string): string {
    const at = email.lastIndexOf('@');

    if (at <= 0) {
        return '•••';
    }

    const local = email.slice(0, at);

    return `${local.slice(0, local.length > 2 ? 2 : 1)}•••${email.slice(at)}`;
}

/** Dia de hoje ("08/11") se o resumo é do mês corrente no horário de Brasília; senão, null. */
function partialDay(month: string, now: Date): string | null {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

    return today.slice(0, 7) === month ? `${today.slice(8, 10)}/${today.slice(5, 7)}` : null;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
