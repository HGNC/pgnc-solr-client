import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Injectable } from '@nestjs/common';
import { SolrResponse } from '../models/solr-response.interface';

@Injectable()
export class BrowseService {
  host: string = process.env.SOLR_HOST ?? '';
  port: number = Number(process.env.SOLR_PORT) || 8983;
  core: string = process.env.SOLR_CORE ?? '';

  constructor(private readonly httpService: HttpService) {}

  async search(q: string, start: number, rows: number, filters?: string[]) {
    const response = await firstValueFrom(
      this.httpService.get<SolrResponse>(
        `http://${this.host}:${this.port}/solr/${this.core}/browse?q=${q}&start=${start}&rows=${rows}${filters ? `&fq=${filters.join('&fq=')}` : ''}&hl.simple.pre=<em>&hl.simple.post=</em>`,
      ),
    );
    if (response.status !== 200) {
      throw new Error('Failed to fetch data from Solr');
    }
    const data: SolrResponse = response.data;
    return data;
  }
}
