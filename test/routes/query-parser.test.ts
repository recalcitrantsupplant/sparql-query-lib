import Fastify, { FastifyInstance } from 'fastify';
import queryRoutes from '../../src/routes/queries'; // Import the actual routes
import * as schemas from '../../src/schemas'; // Import schemas
import { EntityManager } from '../../src/lib/EntityManager'; // Import EntityManager for mocking

// Minimal mock EntityManager satisfying the plugin's options requirement
const mockEntityManager = {} as EntityManager; // Cast an empty object

// Helper function to build the Fastify app for testing query parser routes
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false }); // Disable logger for cleaner test output

  // Add schemas like in the main app
  for (const schema of Object.values(schemas)) {
    if (schema && typeof schema === 'object' && '$id' in schema) {
      app.addSchema(schema);
    }
  }

  // Register only the query routes, providing the mock EntityManager
  await app.register(queryRoutes, {
    prefix: '/api/queries', // Match the actual prefix
    entityManager: mockEntityManager // Provide the mock
  });

  // Optional: Add a basic error handler for tests if needed
  app.setErrorHandler((error, request, reply) => {
    console.error("Test App Error:", error); // Log errors during tests
    reply.status(error.statusCode || 500).send({ error: error.message });
  });

  await app.ready(); // Ensure all plugins and routes are loaded

  return app;
}


describe('Query Parser Routes (/api/queries) - Unit Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Build the app once for all tests in this suite
    app = await buildTestApp();
  });

  afterAll(async () => {
    // Close the Fastify instance after all tests are done
    await app.close();
  });

  describe('POST /api/queries/detect-parameters', () => {
    it('should detect parameter groups correctly', async () => {
      const query = `
        PREFIX : <http://example.org/>
        SELECT ?result WHERE {
          ?s :p1 ?param1 ;
             :p2 ?param2 .
          OPTIONAL { ?s :p3 ?param3 }
          VALUES (?param4) { (UNDEF) } # Use UNDEF for VALUES parameters
        }
      `;
      const response = await app.inject({
        method: 'POST',
        url: '/api/queries/detect-parameters',
        payload: { query }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      // Expecting only [['param4']] based on VALUES clause with UNDEF
      expect(body).toEqual([['param4']]); // Exact match for the single group
      expect(body.length).toBe(1); // Ensure exactly 1 group
    });

    it('should return 400 if query is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queries/detect-parameters',
        payload: {} // Missing query
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });

    it('should return 400 for invalid SPARQL syntax', async () => {
      const invalidQuery = `SELECT ?s WHERE { ?s ?p ?o`; // Missing closing brace
      const response = await app.inject({
        method: 'POST',
        url: '/api/queries/detect-parameters',
        payload: { query: invalidQuery }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
      // Optionally check for specific error message if needed
      // expect(response.json().error).toContain('parsing error');
    });
  });

  describe('POST /api/queries/detect-outputs', () => {
    it('should detect output variables correctly for SELECT', async () => {
      const query = `
        PREFIX : <http://example.org/>
        SELECT ?subject ?predicate ?object WHERE {
          ?subject ?predicate ?object .
        } LIMIT 10
      `;
      const response = await app.inject({
        method: 'POST',
        url: '/api/queries/detect-outputs',
        payload: { query }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual(expect.arrayContaining(['subject', 'predicate', 'object']));
      expect(body.length).toBe(3);
    });

     it('should detect output variables correctly for CONSTRUCT', async () => {
      const query = `
        PREFIX : <http://example.org/>
        CONSTRUCT { ?s :newProp ?o } WHERE {
          ?s ?p ?o .
        }
      `;
      const response = await app.inject({
        method: 'POST',
        url: '/api/queries/detect-outputs',
        payload: { query }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      // CONSTRUCT queries do not have tabular output variables, expect empty array
      expect(body).toEqual([]);
      expect(body.length).toBe(0);
    });

    it('should return 400 if query is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queries/detect-outputs',
        payload: {} // Missing query
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });

    it('should return 400 for invalid SPARQL syntax', async () => {
      const invalidQuery = `CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o`; // Missing closing brace
      const response = await app.inject({
        method: 'POST',
        url: '/api/queries/detect-outputs',
        payload: { query: invalidQuery }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });
  });
});
