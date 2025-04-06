import Fastify, { FastifyInstance } from 'fastify';
import Ajv from 'ajv'; // Import Ajv
import addFormats from 'ajv-formats'; // Import ajv-formats
import queryRoutes from '../../src/routes/queries'; // Import the query routes
import queryGroupRoutes from '../../src/routes/queryGroups'; // Import the query group routes
import * as schemas from '../../src/schemas'; // Import schemas for adding to Fastify
import { mockEntityManager, mockParser } from './mocks'; // Import shared mocks

// --- Test App Builder ---

// Configure Ajv
const ajv = new Ajv({
  allErrors: true, // Optional: report all errors
  coerceTypes: false, // Disable type coercion for stricter validation
  useDefaults: true, // Optional: use default values from schema
});
addFormats(ajv); // Add formats like 'date-time', 'uri'

// Helper function to build the Fastify app for testing query routes
export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // Explicitly set the validator compiler
    ajv: {
      customOptions: {
        // Pass the configured Ajv instance options
        allErrors: true,
        coerceTypes: false, // Ensure coercion is also disabled here
        useDefaults: true,
        // Ensure formats are recognized
        formats: {
          'date-time': true,
          uri: true,
          // Add other formats if needed
        }
      },
      plugins: [
        // Add ajv-formats plugin
        require('ajv-formats')
      ]
    }
  });

  // Add schemas like in the main app
  for (const schema of Object.values(schemas)) {
    if (schema && typeof schema === 'object' && '$id' in schema) {
      // Ensure schema has $id before adding
      app.addSchema(schema);
    }
  }

  // Register only the query routes, injecting the mocked EntityManager AND the mock Parser
  await app.register(queryRoutes, {
    prefix: '/api/queries', // Match the actual prefix
    entityManager: mockEntityManager, // Provide the mock EntityManager
    parser: mockParser as any // Provide the mock Parser instance (cast as any to satisfy type)
  });

  // Register the query group routes
  await app.register(queryGroupRoutes, {
    prefix: '/api/query-groups', // Match the actual prefix
    entityManager: mockEntityManager, // Provide the mock EntityManager
  });

  // Optional: Add a basic error handler for tests
  app.setErrorHandler((error, request, reply) => {
    console.error("Test App Error:", error); // Log errors during tests
    reply.status(error.statusCode || 500).send({ error: error.message });
  });

  await app.ready(); // Ensure all plugins and routes are loaded
  return app;
}
