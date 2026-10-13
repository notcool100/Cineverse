import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? "").split(",").filter(Boolean), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle("Cineora API").setVersion("1").addBearerAuth().build(),
  );
  SwaggerModule.setup("docs", app, doc);
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
