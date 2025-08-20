import { registerAs } from '@nestjs/config';

export default registerAs('solrConfig', () => {
  return {
    solrHost: process.env.SOLR_HOST,
    solrPort: process.env.SOLR_PORT,
    solrCore: process.env.SOLR_CORE,
    solrUsername: process.env.SOLR_USERNAME,
    solrPassword: process.env.SOLR_PASSWORD,
  };
});
