export interface SolrGene {
  pgnc_id: string;
  chromosome?: string;
  gene_symbol_string: string;
  gene_name_string: string;
  locus_type?: string[];
  status: string;
  alias_gene_symbol_string?: string[];
  phytozome_id?: string[];
  ncbi_gene_id?: number[];
  ensembl_gene_id?: string[];
  uniprot_id?: string[];
  uuid: string;
}
