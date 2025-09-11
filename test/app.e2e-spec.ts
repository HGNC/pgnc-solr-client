import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { BrowseController } from '../src/browse/browse.controller';
import { BrowseService } from '../src/browse/browse.service';

describe('Browse endpoint (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BrowseController],
      providers: [
        {
          provide: BrowseService,
          useValue: {
            search: jest.fn().mockResolvedValue({
              response: {
                docs: [],
                numFound: 0,
                start: 0,
              },
              highlighting: {},
            }),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/browse (GET)', () => {
    return request(app.getHttpServer())
      .get('/browse?q=test')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('genes');
        expect(res.body).toHaveProperty('total');
        expect(res.body).toHaveProperty('start');
        expect(res.body).toHaveProperty('rows');
        expect(Array.isArray(res.body.genes)).toBe(true);
      });
  });
});
