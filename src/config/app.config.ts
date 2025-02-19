import { registerAs } from '@nestjs/config';

export default registerAs('appConfig', () => {
  return {
    environment: 'production',
    apiVersion: '0.1',
  };
});
