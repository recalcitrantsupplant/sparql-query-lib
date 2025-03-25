import { Client } from 'undici';
import Fastify, { FastifyInstance } from 'fastify';
import { registerQueryRoutes } from '../../src/server/query';
import { registerBackendRoutes } from '../../src/server/backend';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import * as fs from 'fs/promises';
import * as path from 'path';

const QUERIES_PATH = path.join(__dirname, '../../src/server/queries.json');

describe('Query List Endpoint Test with Undici', () => {
  let fastify: FastifyInstance;
  let client: Client;
  let serverPort: number;

  beforeAll(async () => {
    // Create a fastify instance with our application
    fastify = Fastify({ logger: false });

    // Register the same plugins and routes as in the start function
    // but without calling app.listen() on port 3000
    await fastify.register(fastifySwagger as any, {
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
      hideUntagged: true,
      stripBasePath: true,
    });

    await fastify.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      staticCSP: false
    });

    await fastify.register(registerBackendRoutes as any, { prefix: 'backend' });
    await fastify.register(registerQueryRoutes as any);

    // Start the server on a random port
    await fastify.listen({ port: 0 });

    // Get the server address
    const address = fastify.server.address();
    if (!address) {
      throw new Error('Server address is null');
    }

    // Determine the port
    serverPort = typeof address === 'string'
      ? parseInt(address.split(':').pop() || '0', 10)
      : address.port;

    // Create an undici client to make requests to our server
    client = new Client(
      `http://localhost:${serverPort}`, {
      keepAliveTimeout: 10,
      keepAliveMaxTimeout: 10
    }
    );
  });

  afterAll(async () => {
    // Clean up after the tests
    await fastify.close();
    await client.close();
  });


  it('should get a list of queries from /queries endpoint', async () => {
    // Make a request to the /queries endpoint
    const response = await client.request({
      method: 'GET',
      path: '/queries'
    });

    // Parse the body for assertions
    const bodyText = await response.body.text();
    const body = JSON.parse(bodyText);

    // Verify the response
    expect(response.statusCode).toBe(200);

    // Check that the response is an object with a data property that is an array
    expect(typeof body).toBe('object');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('should return an empty array when queries.json is empty', async () => {
    // Ensure queries.json starts empty before this test
    await fs.writeFile(QUERIES_PATH, '[]', 'utf8');

    const response = await client.request({
      method: 'GET',
      path: '/queries'
    });

    const bodyText = await response.body.text();
    const body = JSON.parse(bodyText);

    expect(response.statusCode).toBe(200);
    expect(body.data).toEqual([]);
  });

});
