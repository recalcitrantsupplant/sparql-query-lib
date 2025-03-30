import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { executeQuery } from './http';
import { StoredQuery, VariableGroup, Library, Backend } from '../types'; // Import Backend type
// Removed backendState import
import { config } from './config';
import { performance } from 'perf_hooks';
import { LibraryManager } from './libraryManager'; // Keep LibraryManager

// Extend FastifyInstance types if not already done globally
declare module 'fastify' {
  interface FastifyInstance {
    // queryManager: QueryManager; // Removed QueryManager decoration
    libraryManager: LibraryManager;
  }
}

export async function registerQueryRoutes(app: FastifyInstance) {

  // LibraryManager is decorated onto the app instance in src/index.ts

  // List queries for a SPECIFIC library
  app.get<{ Querystring: { libraryId: string; page?: number; limit?: number; sort?: string; order?: string } }>('/queries', {
    schema: {
      tags: ['Query'],
      operationId: 'listQueriesByLibrary', // Updated operationId
      querystring: {
        type: 'object',
        properties: {
          libraryId: { type: 'string', description: 'ID of the library to list queries for' }, // Added libraryId
          page: { type: 'number', description: 'Page number' },
          limit: { type: 'number' },
          sort: { type: 'string' },
          order: { type: 'string' }
        },
        required: ['libraryId'] // libraryId is now required
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { libraryId: string; page?: number; limit?: number; sort?: string; order?: string } }>, reply: FastifyReply) => {
    const { libraryId, page = 1, limit = 10, sort, order } = request.query;

    try {
        // Fetch queries directly using libraryManager
        const queries = await app.libraryManager.getQueriesByLibrary(libraryId);

        // TODO: Implement pagination/sorting on 'queries' array if needed
        // For now, return all queries for the library
        return {
          data: queries,
          metadata: {
            total: queries.length,
            page: page, // Reflect requested page/limit even if not fully implemented
            limit: limit
          }
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to list queries.';
        // Check if error indicates library not found (optional, depends on storage impl)
        // if (error.message.includes('not found')) {
        //     return reply.status(404).send({ error: `Library with ID ${libraryId} not found.` });
        // }
        console.error(`Error listing queries for library ${libraryId}:`, error);
        reply.status(500).send({ error: errorMessage });
    }
  });

  // Create a new query in a specific library
  app.post<{ Body: { libraryId: string; name: string; description?: string; query: string } }>('/queries', {
    schema: {
      tags: ['Query'],
      operationId: 'createQueryInLibrary', // Updated operationId
      body: {
        type: 'object',
        properties: {
          libraryId: { type: 'string', description: 'ID of the library to add the query to' }, // Added libraryId
          name: { type: 'string' },
          description: { type: 'string' },
          query: { type: 'string' }
        },
        required: ['libraryId', 'name', 'query'] // libraryId is now required
      }
    }
  }, async (request: FastifyRequest<{ Body: { libraryId: string; name: string; description?: string; query: string } }>, reply: FastifyReply) => {
    const { libraryId, ...queryData } = request.body; // Extract libraryId

    try {
      // Use libraryManager directly
      const newQuery = await app.libraryManager.addQueryToLibrary(libraryId, queryData);
      reply.status(201).send(newQuery);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create query.';
        console.error('Error processing create query request:', error);
        // Check for specific errors like "Library not found"
        if (errorMessage.includes('not found')) {
             reply.status(404).send({ error: errorMessage });
        } else {
             reply.status(500).send({ error: errorMessage });
        }
    }
  });

  // Get a specific query by its ID (assuming query IDs are globally unique)
  app.get<{ Params: { queryId: string } }>('/queries/:queryId', {
    schema: {
      tags: ['Query'],
      operationId: 'getQueryById', // Updated operationId
      params: {
        type: 'object',
        properties: {
          queryId: { type: 'string', description: 'ID of the query' } // Default removed
        },
        required: ['queryId']
      }
    }
  }, async (request: FastifyRequest<{ Params: { queryId: string } }>, reply: FastifyReply) => {
    const { queryId } = request.params;
    // No need for currentLibraryId

    try {
        // Use libraryManager directly
        const query = await app.libraryManager.getQueryById(queryId);

        if (query) {
          reply.status(200).send(query);
        } else {
          reply.status(404).send({ error: `Query with ID ${queryId} not found` });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get query.';
        console.error(`Error getting query ${queryId}:`, error);
        reply.status(500).send({ error: errorMessage });
    }
  });

    // Update a query (full update, assuming query IDs are globally unique)
    app.put<{ Params: { queryId: string }, Body: { name: string; description?: string; query: string } }>('/queries/:queryId', {
        schema: {
      tags: ['Query'],
      operationId: 'updateQueryById', // Updated operationId
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
          // libraryId is NOT needed here if queryId is unique
          name: { type: 'string' },
          description: { type: 'string' },
          query: { type: 'string' }
        },
        required: ['name', 'query']
      }
    }
  }, async (request: FastifyRequest<{ Params: { queryId: string }, Body: { name: string; description?: string; query: string } }>, reply: FastifyReply) => {
        const { queryId } = request.params;
        // No need for currentLibraryId

        try {
            // Use libraryManager directly
            const updatedQuery = await app.libraryManager.updateQuery(queryId, request.body);

            if (updatedQuery) {
                reply.status(200).send(updatedQuery);
            } else {
                // updateQuery returns null if not found
                reply.status(404).send({ error: `Query with ID ${queryId} not found` });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to update query.';
            console.error(`Error updating query ${queryId}:`, error);
            reply.status(500).send({ error: errorMessage });
        }
    });

    // Delete a query by its ID (assuming query IDs are globally unique)
    app.delete<{ Params: { queryId: string } }>('/queries/:queryId', {
        schema: {
      tags: ['Query'],
      operationId: 'deleteQueryById', // Updated operationId
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
        // No need for currentLibraryId

        try {
            // Use libraryManager directly
            const deleted = await app.libraryManager.removeQuery(queryId);

            if (deleted) {
                reply.status(204).send(); // Success, no content
            } else {
                // removeQuery returns false if not found
                reply.status(404).send({ error: `Query with ID ${queryId} not found` });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to delete query.';
            console.error(`Error deleting query ${queryId}:`, error);
            reply.status(500).send({ error: errorMessage });
        }
    });

  // List variables in a query by its ID (assuming query IDs are globally unique)
  app.get<{ Params: { queryId: string } }>('/queries/:queryId/variables', {
    schema: {
      tags: ['Query'],
      operationId: 'listQueryVariablesById', // Updated operationId
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
    // No need for currentLibraryId

    try {
        // Use libraryManager directly
        const query = await app.libraryManager.getQueryById(queryId);

        if (!query) {
          reply.status(404).send({ error: `Query with ID ${queryId} not found` });
          return;
        }

        reply.send(query.variables || []); // Send variables or empty array
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get query variables.';
        console.error(`Error getting variables for query ${queryId}:`, error);
        reply.status(500).send({ error: errorMessage });
    }
  });

  // Execute a query by its ID using a specified backend
  // Body now includes backendId and the bindings array
  app.post<{ Params: { queryId: string }, Body: { backendId: string; bindings: any } }>('/queries/:queryId/execute', {
    schema: {
      tags: ['Query'],
      operationId: 'executeQueryByIdWithBackend', // Updated operationId
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
            backendId: { type: 'string', description: 'ID of the backend to execute against' },
            bindings: { type: 'array', description: 'SPARQL bindings array' } // Keep bindings schema flexible
        },
        required: ['backendId', 'bindings'],
         examples: [ // Example updated to include backendId
          {
            backendId: 'example-backend-id',
            bindings: [
              {
                "head": { "vars": [ "pred"] },
                "arguments": {
                  "bindings": [
                    { "pred": { "type": "uri", "value": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" } }
                  ]
                }
              }
            ]
          }
        ]
      }
    }
   }, async (request: FastifyRequest<{ Params: { queryId: string }, Body: { backendId: string; bindings: any } }>, reply: FastifyReply) => {
    const { queryId } = request.params;
    const { backendId, bindings } = request.body; // Extract backendId and bindings

     let query: StoredQuery | null = null;
     let backend: Backend | null = null;
     // Fetch query and backend concurrently
    try {
        [query, backend] = await Promise.all([
            app.libraryManager.getQueryById(queryId),
            app.backendStorage.getBackendById(backendId)
        ]);
    } catch (error) {
         const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve query or backend before execution.';
         console.error(`Error getting query ${queryId} or backend ${backendId} for execution:`, error);
         return reply.status(500).send({ error: errorMessage });
    }

    // Check if query or backend was found
    if (!query) {
      return reply.status(404).send({ error: `Query with ID ${queryId} not found` });
    }
    if (!backend) {
      return reply.status(404).send({ error: `Backend with ID ${backendId} not found` });
    }

    // const variables = request.body; // Bindings payload - already extracted as 'bindings'

    const startTime = config.enableTimingLogs ? performance.now() : 0;
    if (config.enableTimingLogs) console.time(`Query ${queryId} on backend ${backendId} received`);

     let result;
    try {
      if (config.enableTimingLogs) console.time(`Query ${queryId} on backend ${backendId} execution`);
      // Pass backendStorage, query, backendId, and bindings to executeQuery
      result = await executeQuery(app.backendStorage, query.query, backend.id, bindings); // Corrected arguments
      if (config.enableTimingLogs) console.timeEnd(`Query ${queryId} on backend ${backendId} execution`);

      // Process result (assuming executeQuery returns something with body.json())
      // Note: Need to handle potential errors from executeQuery itself (e.g., network issues)
      const body = await result.body.json();

      if (config.enableTimingLogs) {
        const totalTime = performance.now() - startTime;
        console.log(`Query ${queryId} on backend ${backendId} total time: ${totalTime}ms`);
        reply.header('X-Query-Time', totalTime);
        return reply.send(body);
      }
      return reply.send(body);
    } catch (error) {
      // Handle errors during executeQuery or result processing
      console.error(`Error executing query ${queryId} on backend ${backendId}:`, error);
      // Provide more specific error if possible (e.g., from executeQuery response)
      return reply.status(500).send({ error: `Failed to execute query on backend ${backendId}` });
    } finally {
        if (config.enableTimingLogs) console.timeEnd(`Query ${queryId} on backend ${backendId} received`);
    }
  });
}
