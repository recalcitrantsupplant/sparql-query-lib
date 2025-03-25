// app.ts - Main application file
import Fastify, { FastifyPluginAsync } from 'fastify';
import { registerQueryRoutes } from './server/query';
import { registerBackendRoutes } from './server/backend';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';

const start = async () => {
  const app = Fastify({
    logger: true
  });

  try {
    // Register CORS plugin
    await app.register(fastifyCors, {
      // During development, allow all origins
      origin: "*",
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    });

    await app.register(fastifySwagger as any, {
      routePrefix: '/docs',
      openapi: {
        info: {
          title: 'SPARQL Query Library API',
          description: 'API for managing and running SPARQL queries',
          version: '1.0.0'
        },
        externalDocs: {
          url: 'https://swagger.io',
          description: 'Find more info here'
        },
        tags: [
          { name: 'Backend', description: 'Routes for managing SPARQL backends' },
          { name: 'Query', description: 'Routes for managing SPARQL queries' }
        ]
      },
      // hide the routes from swagger documentation
      hideUntagged: true,
      stripBasePath: true,
    });

    await app.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      staticCSP: false
    });

    await app.register(registerBackendRoutes as FastifyPluginAsync);
    await app.register(registerQueryRoutes as FastifyPluginAsync);
    console.log('Routes registered');

    try {
      await app.listen({ port: 3000, host: '0.0.0.0' });
      console.log('Server listening on http://localhost:3000');
    } catch (err: any) {
      app.log.error(err);
      if (err.code === 'EADDRINUSE') {
        console.error('Port 3000 is already in use. Please use a different port.');
      }
      process.exit(1);
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

export { start };

if (require.main === module) {
  start();
}
