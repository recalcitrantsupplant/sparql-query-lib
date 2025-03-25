import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { executeQuery } from './http';
import { randomUUID } from 'crypto';
import { StoredQuery, VariableRestrictions } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { backendState } from './backend';
import { SparqlQueryParser } from '../lib/parser';

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
  return randomUUID().substring(0, 8); // Generate a short random ID
}

export async function registerQueryRoutes(app: FastifyInstance) {
  let queries: StoredQuery[] = [];

  // List all queries
  app.get<{ Querystring: { page?: number; limit?: number; sort?: string; order?: string } }>('/queries', {
    schema: {
      tags: ['Query'],
      operationId: 'listQueries',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', description: 'Page number' },
          limit: { type: 'number', description: 'Number of items per page' },
          sort: { type: 'string', description: 'Field to sort by' },
          order: { type: 'string', description: 'Sort order (asc or desc)' }
        },
        required: []
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { page?: number; limit?: number; sort?: string; order?: string } }>, reply: FastifyReply) => {
    try {
      queries = await readQueries();
    } catch (error: any) {
      console.error('Error initializing queries:', error);
      return reply.status(500).send({ error: 'Failed to read queries.json' });
    }

    const { page, limit, sort, order } = request.query;

    return {
      data: queries,
      metadata: {
        total: queries.length,
        page: page || 1,
        limit: limit || 10
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
    const { name, description, query } = request.body;
    const id = generateId();
    const now = new Date();

    const newQuery: StoredQuery = {
      id,
      name,
      description,
      query,
      createdAt: now,
      updatedAt: now,
    };

    queries = [...queries, newQuery];
    await writeQueries(queries);

    reply.status(201); // Created
    return newQuery;
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
    const query = queries.find(q => q.id === queryId);

    if (!query) {
      return reply.status(404).send({ error: 'Query not found' });
    }

    return query;
  });

  // Update a query (full update)
  app.put<{ Params: { queryId: string }, Body: { name: string; description?: string; query: string } }>('/queries/:queryId', {
    schema: {
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
      }
    }
  }, async (request: FastifyRequest<{ Params: { queryId: string }, Body: { name: string; description?: string; query: string } }>, reply: FastifyReply) => {
    const { queryId } = request.params;
    const { name, description, query } = request.body;

    const existingQueryIndex = queries.findIndex(q => q.id === queryId);
    if (existingQueryIndex === -1) {
      return reply.status(404).send({ error: 'Query not found' });
    }

    const updatedQuery: StoredQuery = {
      id: queryId,
      name,
      description,
      query,
      createdAt: queries[existingQueryIndex].createdAt,
      updatedAt: new Date()
    };

    queries[existingQueryIndex] = updatedQuery;
    await writeQueries(queries);

    return updatedQuery;
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

    const initialLength = queries.length;
    queries = queries.filter(q => q.id !== queryId);

    if (queries.length === initialLength) {
      return reply.status(404).send({ error: 'Query not found' });
    }

    await writeQueries(queries);
    reply.status(204).send(); // No content
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
    const query = queries.find(q => q.id === queryId);

    if (!query) {
      return reply.status(404).send({ error: 'Query not found' });
    }

    return query.variables || [];
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
        type: 'object'
      }
    }
  }, async (request: FastifyRequest<{ Params: { queryId: string }, Body: { [variable: string]: any } }>, reply: FastifyReply) => {
    const { queryId } = request.params;
    const query = queries.find(q => q.id === queryId);

    if (!query) {
      return reply.status(404).send({ error: 'Query not found' });
    }

    const variables = request.body;

    if (!backendState.currentBackend) {
      return reply.status(500).send({ error: 'No backend set' });
    }

    const backend = backendState.backends.find(b => b.id === backendState.currentBackend);
    if (!backend) {
      return reply.status(500).send({ error: 'Current backend not found' });
    }

    try {
      const result = await executeQuery(query.query, variables, backend.id);
      const body = await result.body.json();
      return body;
    } catch (error) {
      console.error('Error executing query:', error);
      return reply.status(500).send({ error: 'Failed to execute query' });
    }
  });
}
