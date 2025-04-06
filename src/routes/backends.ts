import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify'; // Removed FastifySchema
import { FromSchema } from 'json-schema-to-ts';
import { EntityManager } from '../lib/EntityManager';
import { EntityRegister } from '../lib/entity-register';
import { Backend, Thing } from '../types/schema-dts';
import { createBackend, CreateBackendInput } from '../lib/factories'; // Import the factory and input type
import {
  // backendSchema is referenced by other schemas
  paramsSchema,
  updateBackendBodySchema,
  createBackendBodySchema, // Import the new body schema
  getBackendsSchema,
  getBackendSchema,
  createBackendSchema,
  updateBackendSchema,
  deleteBackendSchema,
  // errorMessageSchema is added globally, no need to import here if using $ref
} from '../schemas'; // Import schemas from the central file

// --- Schemas are now imported from ../schemas.ts ---


export default async function (
  fastify: FastifyInstance,
  options: FastifyPluginOptions & { entityManager: EntityManager }
) {
  // Schemas are expected to be added globally in index.ts or similar
  // No need to add errorMessageSchema or backendSchema here if using $ref properly

  const em = options.entityManager;

  if (!em) {
    throw new Error("EntityManager instance is required for backend routes but was not provided.");
  }

  // Helper function to check if an object is a Backend
  function isBackend(thing: Thing | undefined): thing is Backend {
    if (!thing) return false;
    const type = thing['@type'];
    if (type === 'Backend') return true;
    if (Array.isArray(type) && type.includes('Backend')) return true;
    return false;
  }


  // --- GET / ---
  // Retrieves all Backend entities
  fastify.get<{ Reply: Backend[] | { error: string } }>( // Add error type to Reply
    '/',
    { schema: getBackendsSchema }, // Attach schema
    async (request, reply) => {
    try {
      const register = new EntityRegister(); // Create a register for this request
      const allEntitiesMap: Map<string, Thing> = await em.loadAll(register);
      const backends: Backend[] = [];
      allEntitiesMap.forEach(entity => {
        if (isBackend(entity)) {
          backends.push(entity);
        }
      });
      return reply.send(backends); // Use return for async handlers
    } catch (error: any) { // Type error explicitly
      request.log.error(error, 'Failed to fetch backends via loadAll');
      return reply.status(500).send({ error: 'Internal Server Error: Could not fetch backends' });
    }
  });

  // --- GET /:id ---
  // Retrieves a single Backend by its ID
  // Note: FromSchema needs the actual schema object, not the FastifySchema wrapper
  fastify.get<{ Params: FromSchema<typeof paramsSchema>; Reply: Backend | { error: string } }>(
    '/:id',
    { schema: getBackendSchema }, // Attach the imported route schema wrapper
    async (request, reply) => {
      try {
        // Decode the ID from the URL parameter
        const id = decodeURIComponent(request.params.id);
        // No need to construct fullId if the param is expected to be the full IRI
        const register = new EntityRegister();
        const backend = await em.get<Backend>(id, register); // Use em

        if (!backend || !isBackend(backend)) { // Use helper function
          return reply.status(404).send({ error: 'Backend not found' });
        }
        return reply.send(backend);
      } catch (error: any) {
        request.log.error(error, `Failed to fetch backend with ID: ${request.params.id}`);
        return reply.status(500).send({ error: 'Internal Server Error: Could not fetch backend' });
      }
    }
  );

  // --- POST / ---
  // Creates a new Backend
  // Use createBackendBodySchema for Body type
  fastify.post<{ Body: FromSchema<typeof createBackendBodySchema>; Reply: Backend | { error: string } }>(
    '/',
    { schema: createBackendSchema }, // Route schema uses createBackendBodySchema for body
    async (request, reply) => {
      let backendToSave: Backend | null = null; // Initialize for potential use in catch block
      try {
        const userInput = request.body; // User input based on createBackendBodySchema

        // Schema validation handles required fields (name, backendType) and types.
        // Factory handles ID, type, timestamps.
        // No need to check for existing ID.

        // 1. Use the factory to create the complete entity object
        // Note: createBackend returns BackendWithTimestamps, treat as Backend for saving/retrieval.
        // Assert userInput type as CreateBackendInput since schema validation passed
        backendToSave = createBackend(userInput as CreateBackendInput);

        // 2. Save the entity using EntityManager
        await em.saveOrUpdate(backendToSave);

        // 3. Fetch the created backend to confirm and return
        if (!backendToSave || !backendToSave['@id']) {
            request.log.error('Internal error: backendToSave object or its ID is missing after save attempt.');
            return reply.status(500).send({ error: 'Internal server error after creating backend.' });
        }
        const registerGet = new EntityRegister();
        const createdBackend = await em.get<Backend>(backendToSave['@id'], registerGet); // Use generated ID
        if (!createdBackend || !isBackend(createdBackend)) {
            request.log.error(`Failed to retrieve Backend ${backendToSave['@id']} after creation`);
            return reply.status(500).send({ error: 'Failed to verify Backend creation' });
        }
        return reply.status(201).send(createdBackend);

      } catch (err: unknown) {
        const errorForLog = err instanceof Error ? err : new Error(String(err));
        const backendIdForLog = backendToSave?.['@id'] ?? 'unknown (factory or save failed)';
        request.log.error({ err: errorForLog, backendId: backendIdForLog }, 'Failed to create backend');
        const errorMessage = errorForLog instanceof Error ? errorForLog.message : 'Failed to create backend';
        // Assume internal server error
        return reply.status(500).send({ error: errorMessage });
      }
    }
  );

  // --- PUT /:id ---
  // Updates an existing Backend
  // Note: FromSchema needs the actual schema object, not the FastifySchema wrapper
  fastify.put<{ Params: FromSchema<typeof paramsSchema>; Body: FromSchema<typeof updateBackendBodySchema>; Reply: Backend | { error: string } }>(
    '/:id',
    { schema: updateBackendSchema }, // Attach the imported route schema wrapper
    async (request, reply) => {
      try {
        const id = decodeURIComponent(request.params.id);
        const updateData = request.body; // Typed body

        const register = new EntityRegister();
        const existingBackend = await em.get<Backend>(id, register); // Use em

        if (!existingBackend || !isBackend(existingBackend)) {
          return reply.status(404).send({ error: 'Backend not found' });
        }

        // Merge properties (simple merge, updateData only contains allowed fields due to schema)
        // Ensure @id and @type remain unchanged
        const updatedBackend: Backend = {
           ...existingBackend,
           ...updateData, // Apply updates
           '@id': existingBackend['@id'], // Keep original ID
           '@type': 'Backend', // Keep original type
        };


        await em.saveOrUpdate(updatedBackend); // Use em

        // Fetch the updated backend to return it
        const registerGet = new EntityRegister();
        const finalBackend = await em.get<Backend>(id, registerGet);
         if (!finalBackend || !isBackend(finalBackend)) {
            request.log.error(`Failed to retrieve Backend ${id} after update`);
            return reply.status(500).send({ error: 'Failed to verify Backend update' });
        }
        return reply.send(finalBackend);
      } catch (error: any) {
        request.log.error(error, `Failed to update backend with ID: ${request.params.id}`);
        // Changed status to 500 for unexpected server errors during update
        return reply.status(500).send({ error: error.message || 'Internal Server Error: Failed to update backend' });
      }
    }
  );

  // --- DELETE /:id ---
  // Deletes a Backend by its ID
  // Note: FromSchema needs the actual schema object, not the FastifySchema wrapper
  fastify.delete<{ Params: FromSchema<typeof paramsSchema>; Reply: { error: string } | null }>(
    '/:id',
    { schema: deleteBackendSchema }, // Attach the imported route schema wrapper
    async (request, reply) => {
      try {
        const id = decodeURIComponent(request.params.id);

        // Optional: Check if it exists before deleting
        const registerCheck = new EntityRegister();
        const existing = await em.get<Backend>(id, registerCheck); // Use em
        if (!existing || !isBackend(existing)) {
          // Send 204 even if not found for idempotency.
          // return reply.status(404).send({ error: 'Backend not found' });
        } else {
            await em.delete(id); // Use em and only delete if found
        }

        return reply.status(204).send(); // No Content success response
      } catch (error: any) {
        request.log.error(error, `Failed to delete backend with ID: ${request.params.id}`);
        return reply.status(500).send({ error: 'Internal Server Error: Could not delete backend' });
      }
    }
  );

}
