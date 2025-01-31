import * as Joi from 'joi';

export default Joi.object({
  NODE_ENV: Joi.string().valid('dev', 'prod', 'test', 'stage').default('dev'),
  API_VERSION: Joi.string().required(),
  SOLR_HOST: Joi.string().required(),
  SOLR_PORT: Joi.number().required(),
  SOLR_CORE: Joi.string().required(),
});
