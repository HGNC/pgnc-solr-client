import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BrowseService {
  host: string = process.env.SOLR_HOST ?? '';
  port: number = Number(process.env.SOLR_PORT) || 8983;
  core: string = process.env.SOLR_CORE ?? '';

  constructor(private readonly httpService: HttpService) {}

  async search(q: string) {
    const response = await firstValueFrom(
      this.httpService.get(
        `http://${this.host}:${this.port}/solr/${this.core}/browse?q=${q}`,
      ),
    );
    console.log(
      `http://${this.host}:${this.port}/solr/${this.core}/browse?q=${q}`,
    );
    return response.data;
  }
}
