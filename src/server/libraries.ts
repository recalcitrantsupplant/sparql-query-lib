import { FastifyInstance } from 'fastify';
import { LibraryManager } from './libraryManager';
import { FileSystemQueryStorage } from './queryStorage'; // TODO: Remove this

export const registerLibraryRoutes = async (app: FastifyInstance) => {
  // Get all libraries
  app.get('/libraries', {
    schema: {
      tags: ['Library'],
      operationId: 'listLibraries',
      response: {
        200: {
          type: 'array',
          items: {
            // Assuming Library type has id and name. Adjust if needed based on types.ts
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              // queries property might be too large for a list view, omitting for now
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Fetch only necessary fields if possible, or filter later
      const libraries = app.libraryManager.getLibraries().map(lib => ({ id: lib.id, name: lib.name })); // Example: map to simpler objects
      reply.send(libraries);
    } catch (error: any) {
      console.error('Failed to get libraries:', error);
      reply.status(500).send({ error: error.message });
    }
  });

  // Create a new library
  app.post('/libraries', {
    schema: {
      tags: ['Library'],
      operationId: 'createLibrary',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Name for the new library' }
        }
      },
      response: {
        201: {
          // Assuming Library type has id and name
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.body as { name: string }; // Type assertion remains
      const newLibrary = await app.libraryManager.createLibrary(name);
      reply.status(201).send(newLibrary);
    } catch (error: any) {
      console.error('Failed to create library:', error);
      reply.status(500).send({ error: error.message });
    }
  });

  // Get the currently active library ID
  app.get('/libraries/current', {
    schema: {
      tags: ['Library'],
      operationId: 'getCurrentLibrary',
      response: {
        200: {
          type: 'object',
          properties: {
            // Corrected key name to match the actual response
            currentLibraryId: { type: ['string', 'null'], description: 'ID of the current library, or null if none is set' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const currentLibraryId = app.libraryManager.getCurrentLibraryId(); // Returns ID or null
      reply.send({ currentLibraryId }); // Use the correct variable name here too
    } catch (error: any) {
      console.error('Failed to get current library ID:', error); // Update error message for clarity
      reply.status(500).send({ error: error.message });
    }
  });

  // Set the currently active library
  app.put('/libraries/current', {
    schema: {
      tags: ['Library'],
      operationId: 'setCurrentLibrary',
      body: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'ID of the library to set as current' }
        }
      },
      response: {
        200: { // Note: PUT usually returns 204 No Content on success, not 200 with body
          type: 'object',
          properties: {
            success: { type: 'boolean' } // This response body might not be sent if using 204
          }
        },
        400: { // Add error response schema
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.body as { id: string }; // Type assertion remains
      await app.libraryManager.setCurrentLibrary(id);
      reply.status(204).send(); // Correct status code for successful PUT with no body
    } catch (error: any) {
      console.error('Failed to set current library:', error);
      reply.status(400).send({ error: error.message }); // Use 400 for client errors like 'not found'
    }
  });

  // Delete a library
  app.delete<{ Params: { libraryId: string } }>('/libraries/:libraryId', {
    schema: {
      tags: ['Library'],
      operationId: 'deleteLibrary',
      params: {
        type: 'object',
        required: ['libraryId'],
        properties: {
          libraryId: { type: 'string', description: 'ID of the library to delete' }
        }
      },
      response: {
        204: { // No content on success
          type: 'null',
          description: 'Library deleted successfully'
        },
        404: { // Not Found error response schema
           type: 'object',
           properties: {
             error: { type: 'string' }
           }
        },
        500: { // Internal Server Error response schema
           type: 'object',
           properties: {
             error: { type: 'string' }
           }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { libraryId } = request.params; // Parameter access remains
      const deleted = await app.libraryManager.deleteLibrary(libraryId); // Check boolean result
      if (deleted) {
        reply.status(204).send();
      } else {
        reply.status(404).send({ error: 'Library not found' }); // Return 404 if not found
      }
    } catch (error: any) {
      console.error('Failed to delete library:', error);
      reply.status(500).send({ error: error.message }); // Keep 500 for unexpected errors
    }
  });
};
