import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { executeQuery } from './http';
// randomUUID is now handled within QueryManager
import { StoredQuery, VariableRestrictions, VariableGroup } from '../types'; // Keep types
// fs and path are now handled within FileSystemQueryStorage
import { backendState } from './backend';
// SparqlQueryParser is now handled within QueryManager/FileSystemQueryStorage
import { config } from './config';
import { performance } from 'perf_hooks';
import { FileSystemQueryStorage } from './queryStorage'; // Import storage
import { QueryManager } from './queryManager'; // Import manager

// Remove old file-based functions and global variable
/*
const QUERIES_PATH = path.join(__dirname, 'queries.json');

async function readQueries(): Promise<StoredQuery[]> {
  try {
    const data = await fs.readFile(QUERIES_PATH, 'utf8');
    let queries: StoredQuery[] = JSON.parse(data);

    // Generate variables if they are missing or an empty array
    for (const query of queries) {
      if (!query.variables || query.variables.length === 0) {
        try {
          const parser = new SparqlQueryParser();
          const parsedQuery = parser.parseQuery(query.query);
          const detectedVariables = parser.detectVariables(query.query);
          query.variables = detectedVariables.map(group => {
            const vars: { [variableName: string]: VariableRestrictions } = {};
            group.forEach(name => {
              vars[name] = { type: ['uri', 'literal'] }; // Default to both types
            });
            return { vars };
          });
        } catch (error) {
          console.error(`Error parsing query ${query.id}:`, error);
          query.variables = [];
        }
      }
    }

    return queries;
  } catch (error: any) {
    console.error('Error reading queries.json:', error);
    if (error instanceof SyntaxError) {
      console.error('Invalid JSON in queries.json, attempting to recover');
      try {
        await fs.readFile(QUERIES_PATH, 'utf8');
        throw error; // Re-throw the original SyntaxError
      } catch (recoveryError) {
        console.error('Failed to recover queries.json:', recoveryError);
        throw error; // Re-throw the original SyntaxError
      }
    }
    throw error; // Re-throw the original error
  }
}

async function writeQueries(queries: StoredQuery[]): Promise<void> {
  try {
    await fs.writeFile(QUERIES_PATH, JSON.stringify(queries, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing queries.json:', error);
  }
}

function generateId(): string {
}
*/

// No longer need global queries array:
// let queries: StoredQuery[] = [];

export async function registerQueryRoutes(app: FastifyInstance) {

  // Instantiate storage and manager
  const storage = new FileSystemQueryStorage();
  const queryManager = new QueryManager(storage);

  // Initialize the manager (loads queries into memory)
  await queryManager.initialize();
  // Removed old try/catch block for readQueries

  // List all queries
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
    const allQueries = queryManager.getAllQueries(); // Use manager

    // Basic pagination/sorting can be added here if needed, operating on allQueries
    // For now, just return all data
    return {
      data: allQueries,
      metadata: {
        total: allQueries.length,
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
    try {
      // Delegate creation entirely to the manager
      const newQuery = await queryManager.createQuery(request.body);
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
    const query = queryManager.getQueryById(queryId); // Use manager

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

        try {
            // Delegate update entirely to the manager
            const updatedQuery = await queryManager.updateQuery(queryId, request.body);

            if (updatedQuery) {
                reply.status(200).send(updatedQuery);
            } else {
                reply.status(404).send({ error: 'Query not found' });
            }
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

        try {
            // Delegate deletion entirely to the manager
            const deleted = await queryManager.deleteQuery(queryId);

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
    const query = queryManager.getQueryById(queryId); // Use manager

    if (!query) {
      reply.status(404).send({ error: 'Query not found' });
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
    const query = queryManager.getQueryById(queryId); // Use manager

    if (!query) {
      reply.status(404).send({ error: 'Query not found' });
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
