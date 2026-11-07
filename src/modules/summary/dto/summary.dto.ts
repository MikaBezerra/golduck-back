import { ApiProperty } from '@nestjs/swagger';

import { MONEY_PROPERTY, MONTH_PROPERTY, UUID_PROPERTY } from '../../common/swagger/api-docs';

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

    @ApiProperty({ ...MONEY_PROPERTY, description: '(entrada − compartilhadas) dividido entre as pessoas ativas' })
    public share!: string;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'Despesas individuais da pessoa no mês' })
    public individual!: string;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'share − individual; pode ser negativo' })
    public net!: string;
}

export class SummaryResponse {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiProperty({ ...MONEY_PROPERTY, nullable: true, description: 'null quando não há entrada cadastrada no mês' })
    public income!: string | null;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'Despesas fora do cartão + do cartão (sem as excluídas)' })
    public expensesTotal!: string;

    @ApiProperty({ type: Number })
    public expensesCount!: number;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'entrada (ou 0) − despesas; pode ser negativo' })
    public balance!: string;

    @ApiProperty({ type: () => SummaryBySourceDto })
    public bySource!: SummaryBySourceDto;

    @ApiProperty({ type: () => [SummaryCategoryDto], description: 'Valor decrescente; inclui categorias inativas com despesas no mês' })
    public byCategory!: SummaryCategoryDto[];

    @ApiProperty({ type: () => [SummaryPersonDto], description: 'Valor decrescente; o item com personId null são as despesas compartilhadas' })
    public byPerson!: SummaryPersonDto[];

    @ApiProperty({ type: () => [SummaryNetByPersonDto], description: 'Líquido de cada pessoa ativa, em ordem alfabética' })
    public netByPerson!: SummaryNetByPersonDto[];
}
