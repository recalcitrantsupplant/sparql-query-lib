import { FastifyInstance, FastifyRequest, FastifyReply, RouteHandler } from 'fastify';
import * as dotenv from 'dotenv';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { BackendState, Backend } from '../types';

const BACKENDS_FILE = 'src/server/backends.json';

function generateId(): string {
  return randomUUID().substring(0, 8); // Generate a short random ID
}

function loadBackends(): BackendState {
  try {
    const data = fs.readFileSync(BACKENDS_FILE, 'utf-8');
    const parsedData: BackendState = JSON.parse(data);
    if (!parsedData.backends || !Array.isArray(parsedData.backends)) {
      console.warn('Invalid backends.json format: backends is not an array. Initializing with empty backends.');
      return { currentBackend: null, backends: [] as Backend[] };
    }

    if (parsedData.currentBackend && !parsedData.backends.find(b => b.id === parsedData.currentBackend)) {
      console.warn(`Invalid currentBackend ID: ${parsedData.currentBackend}. Setting currentBackend to null.`);
      return { currentBackend: null, backends: parsedData.backends };
    }

    return parsedData;
  } catch (error) {
    console.error('Error loading backends from file:', error);
    return {
      currentBackend: null,
      backends: [],
    };
  }
}

function saveBackends(state: BackendState): void {
  try {
    fs.writeFileSync(BACKENDS_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving backends to file:', error);
  }
}

export let backendState: BackendState = loadBackends();

type ListBackendsRouteHandler = RouteHandler<{
  Reply: Backend[];
}>;

export async function registerBackendRoutes(app: FastifyInstance) {
  dotenv.config();

  // List Backends
  app.get<{ Reply: Backend[] }>(`/backends`, {
    schema: {
      tags: ['Backend'],
      operationId: 'listBackends'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const backends = backendState.backends.map(backend => {
      const { username, password, ...safeBackend } = backend;
      return safeBackend;
    });
    reply.send(backends);
  });

  // Add Backend
  app.post<{ Body: { name: string; endpoint: string; username?: string; password?: string, description?: string } }>(`/backends`, {
    schema: {
      tags: ['Backend'],
      operationId: 'addBackend',
      body: {
        type: 'object',
        title: 'AddBackendBody',
        description: 'Request body for adding a new SPARQL backend',
        properties: {
          name: { type: 'string', description: 'The name of the backend' },
          endpoint: { type: 'string', description: 'The SPARQL endpoint URL' },
          username: { type: 'string', description: 'The username for the SPARQL endpoint' },
          password: { type: 'string', description: 'The password for the SPARQL endpoint' },
          description: { type: 'string', description: 'The description of the backend' }
        },
        required: ['name', 'endpoint']
      }
    }
  }, async (request: FastifyRequest<{ Body: { name: string; endpoint: string; username?: string; password?: string, description?: string } }>, reply: FastifyReply) => {
    const { name, endpoint, username, password, description } = request.body;
    const id = generateId();
    const newBackend = { id, name, endpoint, username, password, description };
    backendState.backends.push(newBackend);
    saveBackends(backendState);
    return { id };
  });

  // Get Backend by ID
  app.get<{ Params: { id: string } }>(`/backends/:id`, {
    schema: {
      tags: ['Backend'],
      operationId: 'getBackendById',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The ID of the backend to retrieve' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const backend = backendState.backends.find(backend => backend.id === id);
    if (!backend) {
      return reply.status(404).send({ error: 'Backend not found' });
    }
    const { username, password, ...safeBackend } = backend;
    return safeBackend;
  });

  // Delete Backend
  app.delete<{ Params: { id: string } }>(`/backends/:id`, {
    schema: {
      tags: ['Backend'],
      operationId: 'deleteBackend',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    backendState.backends = backendState.backends.filter(backend => backend.id !== id);
    saveBackends(backendState);
    return { success: true };
  });

  // Set Current Backend
  app.put<{ Body: { id: string } }>(`/backends/current`, {
    schema: {
      tags: ['Backend'],
      operationId: 'setCurrentBackend',
      body: {
        type: 'object',
        title: 'SetBackendBody',
        description: 'Request body for setting the current SPARQL backend',
        properties: {
          id: { type: 'string', description: 'The ID of the backend to set as current' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest<{ Body: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.body;
    const backend = backendState.backends.find(backend => backend.id === id);
    if (!backend) {
      return reply.status(404).send({ error: 'Backend not found' });
    }
    backendState.currentBackend = id;
    saveBackends(backendState);
    return { success: true };
  });

  // Get Current Backend
  app.get(`/backends/current`, {
    schema: {
      tags: ['Backend'],
      operationId: 'getCurrentBackend'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const currentBackendId = backendState.currentBackend;
    if (!currentBackendId) {
      return reply.status(404).send({ error: 'No backend set' });
    }
    const currentBackend = backendState.backends.find(backend => backend.id === currentBackendId);
    if (!currentBackend) {
      return reply.status(404).send({ error: 'Backend not found' });
    }
    const { username, password, ...safeBackend } = currentBackend;
    return safeBackend;
  });
}
