import { Highlighter } from './highlighter.type';
import { SolrGene } from './solr-gene.interface';

export interface SolrResponse {
  responseHeader: {
    status: number;
    QTime: number;
    params: {
      q: string;
      start: number;
      rows: number;
      fq?: string[];
    };
  };
  response: {
    numFound: number;
    start: number;
    numFoundExact: boolean;
    docs: SolrGene[];
  };
  facet_counts: {
    facet_queries: object;
    facet_fields: { status: any[]; locus_type: any[] };
    facet_ranges: object;
    facet_intervals: object;
    facet_heatmaps: object;
  };
  highlighting: Highlighter;
}
