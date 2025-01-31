export type Match = {
  status: string[];
  gene_name_string: string[];
  gene_name_tokenized_ngrams: string[];
  gene_name_tokenized_stemmed: string[];
  gene_symbol_string: string[];
  gene_symbol_ngrams: string[];
  pgnc_id: string[];
  chromosome?: string[];
  uniprot_id?: string[];
  ensembl_gene_id?: string[];
  locus_type?: string[];
  alias_gene_symbol_ngrams?: string[];
  alias_gene_symbol_string?: string[];
  alias_gene_name_string?: string[];
  alias_gene_name_tokenized_ngrams?: string[];
  alias_gene_name_tokenized_stemmed?: string[];
  prev_gene_symbol_ngrams?: string[];
  prev_gene_symbol_string?: string[];
  prev_gene_name_string?: string[];
  prev_gene_name_tokenized_ngrams?: string[];
  prev_gene_name_tokenized_stemmed?: string[];
  phytozome_id?: string[];
  ncbi_gene_id?: string[];
};

export type Highlighter = {
  [key: string]: Match;
};
