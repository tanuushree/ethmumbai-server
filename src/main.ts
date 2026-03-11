import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

declare const module: any;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://www.ethmumbai.in',
      'https://ethmumbai-2026-dec-ui-git-earlybird-ethmumbais-projects.vercel.app',
      'https://ethmumbai-conf-checkin.vercel.app'
    ], // your Vite dev server
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'x-api-key',
    ],
    credentials: true, // set true only if you use cookies/auth headers
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
  console.log('DATABASE_URL at startup:', process.env.DATABASE_URL);

  await app.listen(process.env.PORT ?? 3001);
  if (module.hot) {
    module.hot.accept();
    module.hot.dispose(() => app.close());
  }
}
bootstrap();
