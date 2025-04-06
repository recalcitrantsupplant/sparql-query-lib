// app.ts - Main application file
import 'dotenv/config'; // Load .env file variables
import Fastify, { FastifyPluginAsync } from 'fastify';
// Removed imports for renamed route files
// import { registerQueryRoutes } from './server/query.ts.unused';
// import { registerBackendRoutes } from './server/backend.ts.unused';
// import { registerLibraryRoutes } from './server/libraries.ts.unused';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import { config } from './server/config'; // Keep config import
import { EntityManager } from './lib/EntityManager'; // Import EntityManager
import { ISparqlExecutor } from './server/ISparqlExecutor'; // Import the interface
import { HttpSparqlExecutor } from './server/HttpSparqlExecutor'; // Import an executor implementation
// TODO: Import OxigraphSparqlExecutor when needed
// import { OxigraphSparqlExecutor } from './server/OxigraphSparqlExecutor';
import backendRoutes from './routes/backends'; // Import the new backend routes
import queryRoutes from './routes/queries'; // Import the new query routes
import libraryRoutes from './routes/libraries'; // Import the new library routes
import queryGroupRoutes from './routes/queryGroups';
import executeRoutes from './routes/execute';
import * as schemas from './schemas'; // Import all schemas

// Update Fastify instance declaration - No custom decorations needed for now
// If EntityManager needs to be globally accessible, add it here.
declare module 'fastify' {
  interface FastifyInstance {
    // libraryManager: LibraryManager; // Removed decoration
    // backendStorage: IBackendStorage; // Removed decoration - Backend routes are removed
  }
}

// Create the Fastify instance outside the start function
const app = Fastify({
  logger: true
});

// Define the start function, accepting the app instance
const start = async (fastifyApp: typeof app) => {
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
          { name: 'Query', description: 'Routes for managing SPARQL queries' },
          { name: 'Library', description: 'Routes for managing Query Libraries' },
          { name: 'QueryGroup', description: 'Routes for managing Query Groups' },
          { name: 'Execution', description: 'Routes for executing queries' } // Added Execution tag
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

    // Add all shared schemas to the Fastify instance
    for (const schema of Object.values(schemas)) {
      // Check if the schema object has an $id property before adding
      if (schema && typeof schema === 'object' && '$id' in schema) {
        app.addSchema(schema);
      }
    }
    app.log.info('Added shared schemas to Fastify instance.');

    // Global Error Handler
    app.setErrorHandler((error, request, reply) => {
      // Log the error
      request.log.error(error);

      // Check if it's a Fastify validation/parsing error (often 400)
      // or if the error object explicitly has a statusCode
      const statusCode = error.statusCode || 500; // Default to 500

      // Send a standardized JSON error response
      reply.status(statusCode).send({ error: error.message || 'An unexpected error occurred' });
    });


    // Removed instantiation of unused storage/managers
    // const libraryStorage = new FileSystemLibraryStorage(config.queriesFilePath);
    // const backendStorage = new FileSystemBackendStorage(config.backendsFilePath);
    // const libraryManager = new LibraryManager(/* libraryStorage */);
    // await libraryManager.initialize();

    // Removed decorations for unused components
    // Instantiate the SPARQL executor based on the internal backend configuration
    let internalExecutor: ISparqlExecutor;
    const backendConfig = config.internalBackend; // Use the updated config structure

    if (backendConfig.type === 'http') {
      internalExecutor = new HttpSparqlExecutor({
        queryUrl: backendConfig.queryUrl,
        updateUrl: backendConfig.updateUrl,
        username: backendConfig.username, // Pass username from config
        password: backendConfig.password, // Pass password from config
      });
      console.log(`Using HTTP SPARQL Executor for internal backend: ${backendConfig.queryUrl}`);
    } else if (backendConfig.type === 'oxigraph-memory') {
      // TODO: Instantiate OxigraphSparqlExecutor properly when implemented
      // Need to import it first
      // import { OxigraphSparqlExecutor } from './server/OxigraphSparqlExecutor';
      // internalExecutor = new OxigraphSparqlExecutor({ dbPath: backendConfig.dbPath });
      console.warn("Oxigraph internal backend selected, but OxigraphSparqlExecutor is not fully implemented/instantiated yet.");
      // For now, throw an error or use a placeholder if needed for compilation
      throw new Error("OxigraphSparqlExecutor instantiation is not yet implemented.");
    } else {
      // Handle unknown backend type in config
      throw new Error(`Unsupported internal backend type specified in configuration: ${(backendConfig as any).type}`);
    }

    // Instantiate the EntityManager
    const entityManager = new EntityManager(internalExecutor);

    // Register the new API routes, passing the EntityManager instance
    await fastifyApp.register(backendRoutes, { prefix: '/api/backends', entityManager: entityManager });
    await fastifyApp.register(queryRoutes, { prefix: '/api/queries', entityManager: entityManager });
    await fastifyApp.register(libraryRoutes, { prefix: '/api/libraries', entityManager: entityManager });
    await fastifyApp.register(queryGroupRoutes, { prefix: '/api/queryGroups', entityManager: entityManager }); // Register QueryGroup routes
    await fastifyApp.register(executeRoutes, { prefix: '/api/execute', entityManager: entityManager }); // Register Execution routes

    console.log('Core setup complete. Registered routes for /api/backends, /api/queries, /api/libraries, /api/queryGroups, /api/execute.'); // Updated log

    try {
      await fastifyApp.listen({ port: 3000, host: '0.0.0.0' });
      console.log('Server listening on http://localhost:3000');
    } catch (err: any) {
      fastifyApp.log.error(err);
      if (err.code === 'EADDRINUSE') {
        console.error('Port 3000 is already in use. Please use a different port.');
      }
      process.exit(1);
    }
  } catch (err) {
    fastifyApp.log.error(err);
    process.exit(1);
  }
}

// Export the app instance and the start function
export { app, start };

// Start the server only if this script is run directly
if (require.main === module) {
  start(app); // Pass the app instance to start
}
