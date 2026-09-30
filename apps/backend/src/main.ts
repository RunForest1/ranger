import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { AppModule } from './app.module';
import { SessionIoAdapter } from './common/session-io-adapter';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  const PgSession = connectPgSimple(session);
  const sessionMiddleware = session({
    store: new PgSession({ conString: process.env.DATABASE_URL, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET ?? '',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
  app.use(sessionMiddleware);

  const prisma = app.get(PrismaService);
  const canConnect = async (userId: string) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return user != null && !user.disabled && !user.mustChangePassword;
  };
  app.useWebSocketAdapter(new SessionIoAdapter(app, sessionMiddleware as never, canConnect));

  app.enableCors({ origin: true, credentials: true });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
