import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SolrResponse } from '../models/solr-response.interface';

@Injectable()
export class BrowseService {
    host: string = process.env.SOLR_HOST ?? '';
    port: number = Number(process.env.SOLR_PORT) || 8983;
    core: string = process.env.SOLR_CORE ?? '';
    username: string = process.env.SOLR_USERNAME ?? '';
    password: string = process.env.SOLR_PASSWORD ?? '';

    constructor(private readonly httpService: HttpService) { }

    async search(q: string, start: number, rows: number, filters?: string[]) {
        start = start > 0 ? start - 1 : 0;
        const params: any = {
            q: q,
            start: start,
            rows: rows,
            fq: filters ? filters : [],
            'hl.simple.pre': '<em>',
            'hl.simple.post': '</em>'
        };
        // ?q=${q}&start=${start}&rows=${rows}${filters ? `&fq=${filters.join('&fq=')}` : ''}&hl.simple.pre=<em>&hl.simple.post=</em>`
        const response = await firstValueFrom(
            this.httpService.get<SolrResponse>(
                `http://${this.host}:${this.port}/solr/${this.core}/browse`,
                {
                    params: params,
                    auth: {
                        username: this.username,
                        password: this.password,
                    },
                },
            ),
        );
        if (response.status !== 200) {
            throw new Error('Failed to fetch data from Solr');
        }

        const data: SolrResponse = response.data;
        return data;
    }
}
