import { Controller, Get, Query } from '@nestjs/common';
import { BrowseService } from './browse.service';
import { SolrGene } from 'src/models/solr-gene.interface';
import { Highlighter, Match } from 'src/models/highlighter.type';
import { Gene } from 'src/models/gene.model';
import { SearchResult } from 'src/models/SearchResult.model';

@Controller('browse')
export class BrowseController {
    constructor(private readonly browseService: BrowseService) {}

    transformSolrGene(doc: SolrGene, hl: Highlighter) {
        const uuid = doc.uuid;
        const gene = new Gene();
        gene.setSymbol(doc.gene_symbol_string);
        gene.setName(doc.gene_name_string);
        gene.setUrl(`/data/gene-symbol-report/pgnc_id/${doc.pgnc_id}`);
        gene.addDisplay({ label: 'PGNC ID', value: doc.pgnc_id });
        gene.addDisplay({ label: 'Status', value: doc.status });
        if (doc.locus_type) {
            gene.addDisplay({
                label: 'Locus Type',
                value: doc.locus_type.join(', '),
            });
        }
        const match: Match = hl[uuid];
        const highlights: Record<string, string> = {};
        if (match) {
            for (const field in match) {
                if (
                    match[field] &&
                    Array.isArray(match[field]) &&
                    match[field].length > 0
                ) {
                    for (const value of match[field]) {
                        if (
                            typeof value === 'string' &&
                            value.includes('<em>')
                        ) {
                            switch (field) {
                                case 'gene_symbol_string':
                                    highlights['Gene symbol'] = value;
                                    break;
                                case 'gene_name_string':
                                    highlights['Gene name'] = value;
                                    break;
                                case 'chromosome':
                                    highlights['Chromosome'] = value;
                                    break;
                                case 'uniprot_id':
                                    highlights['UniProt accession'] = value;
                                    break;
                                case 'ensembl_gene_id':
                                    highlights['Ensembl gene ID'] = value;
                                    break;
                                case 'locus_type':
                                    highlights['Locus type'] = value;
                                    break;
                                case 'alias_gene_symbol_string':
                                    highlights['Alias gene symbol'] = value;
                                    break;
                                case 'alias_gene_name_string':
                                    highlights['Alias gene name'] = value;
                                    break;
                                case 'prev_gene_symbol_string':
                                    highlights['Previous gene symbol'] = value;
                                    break;
                                case 'prev_gene_name_string':
                                    highlights['Previous gene name'] = value;
                                    break;
                                case 'phytozome_id':
                                    highlights['Phytozome ID'] = value;
                                    break;
                                case 'ncbi_gene_id':
                                    highlights['NCBI Gene ID'] = value;
                                    break;
                                case 'pgnc_id':
                                    highlights['PGNC ID'] = value;
                                    break;
                            }
                        }
                    }
                }
            }
        }
        if (Object.keys(highlights).length > 0) {
            gene.addDisplay({ label: 'Matches', value: highlights });
        }
        return gene;
    }

    @Get()
    async search(
        @Query('q') query: string,
        @Query('start') start: number,
        @Query('rows') rows: number,
        @Query('filters') filters: string[],
    ): Promise<SearchResult> {
        try {
            query = query.replace(/(PGNC:\d+)/g, '"$&"');
            const res = await this.browseService.search(
                query,
                start,
                rows,
                filters,
            );
            const genes: Gene[] = res.response.docs.map<Gene>(
                (doc: SolrGene) => {
                    return this.transformSolrGene(doc, res.highlighting);
                },
            );
            const result = new SearchResult(
                genes,
                res.response.numFound,
                res.response.start,
                res.response.docs.length | 0,
            );
            return result;
        } catch (err) {
            throw err;
        }
    }
}
