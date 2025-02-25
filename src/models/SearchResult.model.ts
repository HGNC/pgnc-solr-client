import { Gene } from './gene.model';

export class SearchResult {
    private genes: Gene[] | undefined = undefined;
    private total: number = 0;
    private start: number = 0;
    private rows: number = 0;

    constructor(
        genes: Gene[] | undefined,
        total: number,
        start: number,
        rows: number,
    ) {
        this.genes = genes;
        this.total = total;
        this.start = start;
        this.rows = rows;
    }
}
