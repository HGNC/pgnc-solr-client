import { Module } from '@nestjs/common';
import { BrowseService } from './browse.service';
import { BrowseController } from './browse.controller';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  controllers: [BrowseController],
  exports: [BrowseService],
  providers: [BrowseService],
})
export class BrowseModule {}
