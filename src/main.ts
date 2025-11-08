import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:5173'], // your Vite dev server
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'Api-Key',
    ],
    credentials: true, // set true only if you use cookies/auth headers
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
