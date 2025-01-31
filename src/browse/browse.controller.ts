import { Controller, Get, Query } from '@nestjs/common';
import { BrowseService } from './browse.service';

@Controller('browse')
export class BrowseController {
  constructor(private readonly browseService: BrowseService) {}

  @Get()
  search(@Query('q') query: string) {
    console.log('query', query);
    return this.browseService.search(query);
  }
}
