import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { executeQuery } from './http';
import { StoredQuery, VariableRestrictions, VariableGroup } from '../types'; // Keep types
import { backendState } from './backend';
import { config } from './config';
import { performance } from 'perf_hooks';
import { FileSystemQueryStorage } from './queryStorage'; // Import storage
import { QueryManager } from './queryManager'; // Import manager
import { LibraryManager } from './libraryManager';

// Extend FastifyInstance types if not already done globally
declare module 'fastify' {
  interface FastifyInstance {
    queryManager: QueryManager;
    libraryManager: LibraryManager; // Ensure this is declared
  }
}

export async function registerQueryRoutes(app: FastifyInstance) {

  // Managers are now decorated onto the app instance in src/index.ts
  // const storage = new FileSystemQueryStorage(); // Removed
  // const queryManager = new QueryManager(storage); // Removed
  // const libraryManager = queryManager['libraryManager']; // Removed

  // Initialization is handled in src/index.ts
  // await queryManager.initialize(); // Removed

  // List queries for the CURRENT library
  app.get<{ Querystring: { page?: number; limit?: number; sort?: string; order?: string } }>('/queries', {
    schema: {
      tags: ['Query'],
      operationId: 'listQueries',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', description: 'Page number' },
          limit: { type: 'number' },
          sort: { type: 'string' },
          order: { type: 'string' }
        },
        required: []
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { page?: number; limit?: number; sort?: string; order?: string } }>, reply: FastifyReply) => {
    const { page = 1, limit = 10, sort, order } = request.query; // Default page/limit

    const currentLibraryId = app.libraryManager.getCurrentLibraryId();
    if (!currentLibraryId) {
        return reply.status(400).send({ error: 'No active library set or found.' });
    }

    const library = app.libraryManager.getLibraries().find(lib => lib.id === currentLibraryId);
    const queries = library ? library.queries : [];

    // TODO: Implement pagination/sorting on 'queries' array if needed
    return {
      data: queries,
      metadata: {
        total: queries.length,
        page: page,
        limit: limit
      }
    };
  });

  // Create a new query
  app.post<{ Body: { name: string; description?: string; query: string } }>('/queries', {
    schema: {
      tags: ['Query'],
      operationId: 'createQuery',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          query: { type: 'string' }
        },
        required: ['name', 'query']
      }
    }
  }, async (request: FastifyRequest<{ Body: { name: string; description?: string; query: string } }>, reply: FastifyReply) => {
    const currentLibraryId = app.libraryManager.getCurrentLibraryId();
    if (!currentLibraryId) {
        return reply.status(400).send({ error: 'Cannot create query: No active library set.' });
    }
    try {
      // Delegate creation entirely to the manager, passing libraryId
      const newQuery = await app.queryManager.createQuery(currentLibraryId, request.body);
      reply.status(201).send(newQuery);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create query.';
        console.error('Error processing create query request:', error);
        // Return specific error from manager if available
        reply.status(500).send({ error: errorMessage });
    }
  });

  // Get a specific query
  app.get<{ Params: { queryId: string } }>('/queries/:queryId', {
    schema: {
      tags: ['Query'],
      operationId: 'getQuery',
      params: {
        type: 'object',
        properties: {
          queryId: { type: 'string', default: 'example' }
        },
        required: ['queryId']
      }
    }
  }, async (request: FastifyRequest<{ Params: { queryId: string } }>, reply: FastifyReply) => {
    const { queryId } = request.params;
    const currentLibraryId = app.libraryManager.getCurrentLibraryId();
    if (!currentLibraryId) {
        // Although getting a query might not strictly need an *active* library,
        // our QueryManager now requires it. Adjust if needed.
        return reply.status(400).send({ error: 'Cannot get query: No active library set.' });
    }

    const query = app.queryManager.getQueryById(currentLibraryId, queryId); // Use manager with libraryId

    if (query) {
      reply.status(200).send(query);
    } else {
      console.log(`[DEBUG] Query not found for id: ${queryId}`);
      reply.status(404).send({ error: 'Query not found' });
    }
  });

    // Update a query (full update)
    app.put<{ Params: { queryId: string }, Body: { name: string; description?: string; query: string } }>('/queries/:queryId', {
        schema: { // Keep schema
      tags: ['Query'],
      operationId: 'updateQuery',
      params: {
        type: 'object',
        properties: {
          queryId: { type: 'string' }
        },
        required: ['queryId']
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          query: { type: 'string' }
        },
        required: ['name', 'query']
      } // End schema properties
    } // End schema
  }, async (request: FastifyRequest<{ Params: { queryId: string }, Body: { name: string; description?: string; query: string } }>, reply: FastifyReply) => {
        const { queryId } = request.params;
        const currentLibraryId = app.libraryManager.getCurrentLibraryId();
        if (!currentLibraryId) {
            return reply.status(400).send({ error: 'Cannot update query: No active library set.' });
        }

        try {
            // Delegate update entirely to the manager, passing libraryId
            const updatedQuery = await app.queryManager.updateQuery(currentLibraryId, queryId, request.body);

            // updateQuery now throws on not found, so no need to check null
            reply.status(200).send(updatedQuery);
            /* Original check removed as updateQuery throws now:
            if (updatedQuery) {
                reply.status(200).send(updatedQuery);
            } else {
                reply.status(404).send({ error: 'Query not found' });
            }
            */ // Add missing closing comment tag
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to update query.';
            console.error('Error processing update query request:', error);
            reply.status(500).send({ error: errorMessage });
        }
    });

    // Delete a query
    app.delete<{ Params: { queryId: string } }>('/queries/:queryId', {
        schema: {
      tags: ['Query'],
      operationId: 'deleteQuery',
      params: {
        type: 'object',
        properties: {
          queryId: { type: 'string' }
        },
        required: ['queryId']
      }
    }
  }, async (request: FastifyRequest<{ Params: { queryId: string } }>, reply: FastifyReply) => {
        const { queryId } = request.params;
        const currentLibraryId = app.libraryManager.getCurrentLibraryId();
        if (!currentLibraryId) {
            return reply.status(400).send({ error: 'Cannot delete query: No active library set.' });
        }

        try {
            // Delegate deletion entirely to the manager, passing libraryId
            const deleted = await app.queryManager.deleteQuery(currentLibraryId, queryId);

            if (deleted) {
                reply.status(204).send();
            } else {
                reply.status(404).send({ error: 'Query not found' });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to delete query.';
            console.error('Error processing delete query request:', error);
            reply.status(500).send({ error: errorMessage });
        }
    });

  // List variables in a query
  app.get<{ Params: { queryId: string } }>('/queries/:queryId/variables', {
    schema: {
      tags: ['Query'],
      operationId: 'listQueryVariables',
      params: {
        type: 'object',
        properties: {
          queryId: { type: 'string' }
        },
        required: ['queryId']
      }
    }
  }, async (request: FastifyRequest<{ Params: { queryId: string } }>, reply: FastifyReply) => {
    const { queryId } = request.params;
    const currentLibraryId = app.libraryManager.getCurrentLibraryId();
     if (!currentLibraryId) {
        return reply.status(400).send({ error: 'Cannot list variables: No active library set.' });
    }
    const query = app.queryManager.getQueryById(currentLibraryId, queryId); // Use manager with libraryId

    if (!query) {
      reply.status(404).send({ error: 'Query not found in active library' });
      return; // Added return
    }

    reply.send(query.variables || []); // Send variables or empty array
  });

  // Execute a query with variables
  app.post<{ Params: { queryId: string }, Body: { [variable: string]: any } }>('/queries/:queryId/execute', {
    schema: {
      tags: ['Query'],
      operationId: 'executeQueryWithVariables',
      params: {
        type: 'object',
        properties: {
          queryId: { type: 'string' }
        },
        required: ['queryId']
      },
      body: {
        type: 'array',
        examples: [
          [
            {
          "head": { "vars": [ "pred"]
          } ,
          "arguments": { 
            "bindings": [
              {
                "pred": { "type": "uri" , "value": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" } 
              } 
            ] 
          } 
        }
      ]
    ]
      }
    }
   }, async (request: FastifyRequest<{ Params: { queryId: string }, Body: { [variable: string]: any } }>, reply: FastifyReply) => {
    const { queryId } = request.params;
    const currentLibraryId = app.libraryManager.getCurrentLibraryId();
     if (!currentLibraryId) {
        return reply.status(400).send({ error: 'Cannot execute query: No active library set.' });
    }
    const query = app.queryManager.getQueryById(currentLibraryId, queryId); // Use manager with libraryId

    if (!query) {
      reply.status(404).send({ error: 'Query not found in active library' });
      return; // Added return
    }

    const variables = request.body;

    if (!backendState.currentBackend) {
      return reply.status(500).send({ error: 'No backend set' });
    }

    const backend = backendState.backends.find(b => b.id === backendState.currentBackend);
    if (!backend) {
      return reply.status(500).send({ error: 'Current backend not found' });
    }

    const startTime = config.enableTimingLogs ? performance.now() : 0;
    if (config.enableTimingLogs) console.time(`Query ${queryId} received`);

    let result;
    try {
      if (config.enableTimingLogs) console.time(`Query ${queryId} execution`);
      result = await executeQuery(query.query, variables, backend.id);
      if (config.enableTimingLogs) console.timeEnd(`Query ${queryId} execution`);
      const body = await result.body.json();
      if (config.enableTimingLogs) {
        const totalTime = performance.now() - startTime;
        console.log(`Query ${queryId} total time: ${totalTime}ms`);
        reply.header('X-Query-Time', totalTime); // Add header for timing
        return reply.send(body);
      }
      return body;
    } catch (error) {
      console.error('Error executing query:', error);
      return reply.status(500).send({ error: 'Failed to execute query' });
    } finally {
        if (config.enableTimingLogs) console.timeEnd(`Query ${queryId} received`);
    }
  });
}
