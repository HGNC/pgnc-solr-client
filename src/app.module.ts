import { Module } from '@nestjs/common';

import { BrowseModule } from './browse/browse.module';
import { ConfigModule } from '@nestjs/config';

import appConfig from './config/app.config';
import environmentValidation from './config/environment.validation';
import solrConfig from './config/solr.config';

const env = process.env.NODE_ENV;

@Module({
  imports: [
    BrowseModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: !env ? '.env' : `.env.${env}`,
      load: [appConfig, solrConfig],
      validationSchema: environmentValidation,
    }),
  ],
})
export class AppModule {}
