import { ApiProperty } from '@nestjs/swagger';

import { MONEY_PROPERTY, MONTH_PROPERTY, UUID_PROPERTY } from '../../common/swagger/api-docs.js';

export class SummaryQueryDto {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;
}

export class SummarySourceDto {
    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;

    @ApiProperty({ type: Number })
    public count!: number;
}

export class SummaryBySourceDto {
    @ApiProperty({ type: () => SummarySourceDto, description: 'Despesas fora do cartão' })
    public manual!: SummarySourceDto;

    @ApiProperty({ type: () => SummarySourceDto, description: 'Despesas do cartão (sem as excluídas), pelo mês da fatura' })
    public card!: SummarySourceDto;
}

export class SummaryPendingDto {
    @ApiProperty({ ...MONEY_PROPERTY, description: 'Soma das compras do cartão sem pessoa definida' })
    public amount!: string;

    @ApiProperty({ type: Number, description: 'Quantidade; maior que zero = o resumo pode estar errado e o envio por e-mail fica bloqueado' })
    public count!: number;
}

export class SummaryCategoryDto {
    @ApiProperty(UUID_PROPERTY)
    public categoryId!: string;

    @ApiProperty({ type: String })
    public name!: string;

    @ApiProperty({ type: Boolean })
    public active!: boolean;

    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;

    @ApiProperty({ type: Number })
    public count!: number;
}

export class SummaryPersonDto {
    @ApiProperty({ ...UUID_PROPERTY, nullable: true, description: 'null = despesas sem pessoa (compartilhadas)' })
    public personId!: string | null;

    @ApiProperty({ type: String, nullable: true })
    public name!: string | null;

    @ApiProperty({ type: Boolean, nullable: true })
    public active!: boolean | null;

    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;

    @ApiProperty({ type: Number })
    public count!: number;
}

export class SummaryNetByPersonDto {
    @ApiProperty(UUID_PROPERTY)
    public personId!: string;

    @ApiProperty({ type: String })
    public name!: string;

    @ApiProperty({ ...MONEY_PROPERTY, description: '(entrada − compartilhadas − reserva) dividido entre as pessoas ativas' })
    public share!: string;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'Despesas individuais da pessoa no mês' })
    public individual!: string;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'share − individual; pode ser negativo' })
    public net!: string;
}

/** Campos comuns ao resumo mensal e ao anual. */
export class SummaryTotalsDto {
    @ApiProperty({ ...MONEY_PROPERTY, nullable: true, description: 'null quando não há entrada cadastrada no período' })
    public income!: string | null;

    @ApiProperty({
        ...MONEY_PROPERTY,
        nullable: true,
        description: 'Quanto foi guardado; null quando não há reserva no período. Fora de expensesTotal, mas entra no saldo e na divisão'
    })
    public reserve!: string | null;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'Despesas fora do cartão + do cartão (sem as excluídas e sem a reserva)' })
    public expensesTotal!: string;

    @ApiProperty({ type: Number })
    public expensesCount!: number;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'entrada (ou 0) − despesas − reserva; pode ser negativo' })
    public balance!: string;

    @ApiProperty({ type: () => SummaryBySourceDto })
    public bySource!: SummaryBySourceDto;

    @ApiProperty({
        type: () => [SummaryCategoryDto],
        description: 'Só as compras do cartão (as despesas fora do cartão não têm categoria). Valor decrescente; inclui categorias inativas com compras no período'
    })
    public byCategory!: SummaryCategoryDto[];

    @ApiProperty({ type: () => [SummaryPersonDto], description: 'Valor decrescente; o item com personId null são as despesas compartilhadas' })
    public byPerson!: SummaryPersonDto[];

    @ApiProperty({
        type: () => [SummaryNetByPersonDto],
        description: 'Líquido de cada pessoa ativa, em ordem alfabética (no anual, a soma dos líquidos mensais)'
    })
    public netByPerson!: SummaryNetByPersonDto[];

    @ApiProperty({
        type: () => SummaryPendingDto,
        description: 'Compras do cartão (sem as excluídas) ainda sem pessoa: entram nas contas como compartilhadas até alguém escolher'
    })
    public pending!: SummaryPendingDto;
}

export class SummaryResponse extends SummaryTotalsDto {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;
}

export class AnnualSummaryQueryDto {
    @ApiProperty({ type: Number, minimum: 2000, maximum: 2100, example: 2026 })
    public year!: number;
}

export class SummaryMonthDto {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiProperty({ ...MONEY_PROPERTY, nullable: true, description: 'null quando não há entrada cadastrada no mês' })
    public income!: string | null;

    @ApiProperty({ ...MONEY_PROPERTY, nullable: true, description: 'null quando não há reserva cadastrada no mês' })
    public reserve!: string | null;

    @ApiProperty(MONEY_PROPERTY)
    public expensesTotal!: string;

    @ApiProperty({ type: Number })
    public expensesCount!: number;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'entrada (ou 0) − despesas − reserva; pode ser negativo' })
    public balance!: string;

    @ApiProperty({ type: Number, description: 'Compras do cartão do mês ainda sem pessoa' })
    public pendingCount!: number;
}

export class AnnualSummaryResponse extends SummaryTotalsDto {
    @ApiProperty({ type: Number, example: 2026 })
    public year!: number;

    @ApiProperty({ type: () => [SummaryMonthDto], description: 'Sempre os 12 meses, de janeiro a dezembro, inclusive os vazios' })
    public months!: SummaryMonthDto[];
}

export class SummaryStatementColumnDto {
    @ApiProperty(UUID_PROPERTY)
    public id!: string;

    @ApiProperty({ type: String })
    public name!: string;

    @ApiProperty({ type: String, example: 'A' })
    public initial!: string;

    @ApiProperty({ type: Boolean, description: 'Pessoa inativa com gasto individual no mês: aparece, mas não entra na divisão' })
    public inactive!: boolean;
}

export class SummaryStatementRowDto {
    @ApiProperty({ type: String, example: 'shared-fixed' })
    public id!: string;

    @ApiProperty({ type: String, example: 'Gastos fixos' })
    public label!: string;

    @ApiProperty({ type: String, nullable: true, example: 'despesas fora do cartão' })
    public note!: string | null;

    @ApiProperty({ ...MONEY_PROPERTY, nullable: true, description: 'Coluna "Total"; null = não se aplica' })
    public total!: string | null;

    @ApiProperty({
        type: [String],
        nullable: true,
        description: 'Um valor por coluna (mesma ordem de columns); null = não se aplica',
        example: ['1000.00', '1000.00']
    })
    public cells!: (string | null)[];

    @ApiProperty({ type: () => [SummaryStatementRowDto], description: 'Linhas de detalhe (cada despesa, cada cartão)' })
    public children!: SummaryStatementRowDto[];

    @ApiProperty({ type: String, enum: ['item', 'detail', 'subtotal', 'result', 'highlight'] })
    public style!: 'item' | 'detail' | 'subtotal' | 'result' | 'highlight';
}

export class SummaryStatementSectionDto {
    @ApiProperty({ type: String, enum: ['income', 'shared', 'individual', 'result'] })
    public id!: string;

    @ApiProperty({ type: String, example: 'Compartilhado' })
    public title!: string;

    @ApiProperty({ type: String, example: 'Dividido igualmente entre as pessoas ativas' })
    public hint!: string;

    @ApiProperty({ type: [SummaryStatementRowDto] })
    public rows!: SummaryStatementRowDto[];
}

export class SummaryStatementBreakdownDto {
    @ApiProperty(UUID_PROPERTY)
    public personId!: string;

    @ApiProperty({ type: String })
    public name!: string;

    @ApiProperty({ ...MONEY_PROPERTY, description: '(entrada − despesas compartilhadas) dividido: antes da reserva e dos gastos individuais' })
    public beforeReserve!: string;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'Gastos individuais da pessoa no mês' })
    public individual!: string;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'Parte da pessoa na reserva do mês' })
    public reserve!: string;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'beforeReserve − individual − reserve; igual ao net de GET /summary; pode ser negativo' })
    public net!: string;
}

export class SummaryStatementReserveDto {
    @ApiProperty({ ...MONEY_PROPERTY, nullable: true, description: 'Quanto foi guardado no mês (todas as pessoas); null = sem reserva no mês' })
    public month!: string | null;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'Soma de todas as reservas até o mês, inclusive' })
    public accumulated!: string;
}

export class SummaryStatementResponse {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiProperty({ type: [SummaryStatementColumnDto], description: 'Pessoas ativas em ordem alfabética, depois as inativas com gasto individual' })
    public columns!: SummaryStatementColumnDto[];

    @ApiProperty({ type: [SummaryStatementSectionDto], description: 'Entrada, Compartilhado, Individual e Resultado' })
    public sections!: SummaryStatementSectionDto[];

    @ApiProperty({ type: [SummaryStatementBreakdownDto], description: 'Líquido de cada pessoa ativa em etapas, em ordem alfabética' })
    public breakdown!: SummaryStatementBreakdownDto[];

    @ApiProperty({ type: SummaryStatementReserveDto })
    public reserve!: SummaryStatementReserveDto;

    @ApiProperty({ type: Boolean, description: 'Há pessoas ativas para dividir o compartilhado' })
    public hasPeople!: boolean;

    @ApiProperty({ type: Boolean, description: 'Mês sem entrada cadastrada (as contas usam zero)' })
    public incomeMissing!: boolean;

    @ApiProperty({ type: () => SummaryPendingDto, description: 'Compras do cartão do mês ainda sem pessoa (contam como compartilhadas)' })
    public pending!: SummaryPendingDto;
}
