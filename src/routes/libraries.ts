import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify'; // Removed FastifySchema
import { FromSchema } from 'json-schema-to-ts';
import { Library, Thing } from '../types/schema-dts';
import { EntityManager } from '../lib/EntityManager';
import { EntityRegister } from '../lib/entity-register';
import { createLibrary, CreateLibraryInput } from '../lib/factories'; // Import the factory and the input type
import {
  // librarySchema is referenced by other schemas
  paramsSchema,
  updateLibraryBodySchema,
  createLibraryBodySchema, // Import the new body schema
  getLibrariesSchema,
  getLibrarySchema,
  createLibrarySchema,
  updateLibrarySchema,
  deleteLibrarySchema,
  // errorMessageSchema is added globally
} from '../schemas'; // Import schemas

// --- Schemas are now imported from ../schemas.ts ---

// Helper function to check if an object is a Library
function isLibrary(thing: Thing | undefined): thing is Library {
  if (!thing) return false;
  const type = thing['@type'];
  if (type === 'Library') return true;
  if (Array.isArray(type) && type.includes('Library')) return true;
  return false;
}

export default async function (
  fastify: FastifyInstance,
  options: FastifyPluginOptions & { entityManager: EntityManager }
) {
  // Schemas are expected to be added globally in index.ts or similar
  // No need to add errorMessageSchema or librarySchema here

  const { entityManager: em } = options;

  if (!em) {
    throw new Error("EntityManager instance is required for library routes but was not provided.");
  }

  // --- POST / ---
  // Create Library
  // Use createLibraryBodySchema for Body type
  fastify.post<{ Body: FromSchema<typeof createLibraryBodySchema>; Reply: Library | { error: string } }>(
    '/',
    { schema: createLibrarySchema }, // Route schema uses createLibraryBodySchema for body
    async (request, reply) => {
      let libraryToSave: Library | null = null; // Initialize for potential use in catch block
      try {
        const userInput = request.body; // User input based on createLibraryBodySchema

        // Schema validation handles required fields (name) and types.
        // Factory handles ID, type, timestamps, initializing queries array.
        // No need to check for existing ID.

        // 1. Use the factory to create the complete entity object
        // Note: createLibrary returns LibraryWithTimestamps, but we treat it as Library for saving/retrieval
        // as EntityManager should handle the common timestamp fields.
        // Assert userInput type as CreateLibraryInput since schema validation passed
        libraryToSave = createLibrary(userInput as CreateLibraryInput);

        // 2. Save the entity using EntityManager
        await em.saveOrUpdate(libraryToSave);

        // 3. Fetch the created library to confirm and return
        if (!libraryToSave || !libraryToSave['@id']) {
            request.log.error('Internal error: libraryToSave object or its ID is missing after save attempt.');
            return reply.status(500).send({ error: 'Internal server error after creating library.' });
        }
        const registerGet = new EntityRegister();
        const createdLibrary = await em.get<Library>(libraryToSave['@id'], registerGet); // Use generated ID
        if (!createdLibrary || !isLibrary(createdLibrary)) {
            request.log.error(`Failed to retrieve Library ${libraryToSave['@id']} after creation`);
            return reply.status(500).send({ error: 'Failed to verify Library creation' });
        }
        return reply.status(201).send(createdLibrary);

      } catch (err: unknown) {
        const errorForLog = err instanceof Error ? err : new Error(String(err));
        const libraryIdForLog = libraryToSave?.['@id'] ?? 'unknown (factory or save failed)';
        request.log.error({ err: errorForLog, libraryId: libraryIdForLog }, 'Failed to create Library');
        const errorMessage = errorForLog instanceof Error ? errorForLog.message : 'Failed to create Library';
        // Assume internal server error
        return reply.status(500).send({ error: errorMessage });
      }
    }
  );

  // --- GET / ---
  // List all Libraries
  fastify.get<{ Reply: Library[] | { error: string } }>(
    '/',
    { schema: getLibrariesSchema }, // Attach schema
    async (request, reply) => {
    try {
      const register = new EntityRegister();
      const allEntitiesMap: Map<string, Thing> = await em.loadAll(register);
      const libraries: Library[] = [];
      allEntitiesMap.forEach(entity => {
        if (isLibrary(entity)) {
          libraries.push(entity);
        }
      });
      return reply.send(libraries);
    } catch (error: any) {
      request.log.error(error, 'Failed to fetch Libraries via loadAll');
      return reply.status(500).send({ error: 'Internal Server Error: Could not fetch Libraries' });
    }
  });

  // --- GET /:id ---
  // Get Library by ID
  // Note: FromSchema needs the actual schema object, not the FastifySchema wrapper
  fastify.get<{ Params: FromSchema<typeof paramsSchema>; Reply: Library | { error: string } }>(
    '/:id',
    { schema: getLibrarySchema }, // Attach imported route schema
    async (request, reply) => {
      try {
        const id = decodeURIComponent(request.params.id); // Decode IRI
        const register = new EntityRegister();
        const library = await em.get<Library>(id, register);

        if (!library || !isLibrary(library)) { // Use helper
          return reply.status(404).send({ error: `Library with id ${id} not found` });
        }
        return reply.send(library);
      } catch (error: any) {
        request.log.error(error, `Failed to fetch Library with ID: ${request.params.id}`);
        return reply.status(500).send({ error: 'Internal Server Error: Could not fetch Library' });
      }
    }
  );

  // --- PUT /:id ---
  // Update Library
  // Note: FromSchema needs the actual schema object, not the FastifySchema wrapper
  fastify.put<{ Params: FromSchema<typeof paramsSchema>; Body: FromSchema<typeof updateLibraryBodySchema>; Reply: Library | { error: string } }>(
    '/:id',
    { schema: updateLibrarySchema }, // Attach imported route schema
    async (request, reply) => {
      try {
        const id = decodeURIComponent(request.params.id);
        const updateData = request.body; // Typed body

        const register = new EntityRegister();
        const existingLibrary = await em.get<Library>(id, register);

        if (!existingLibrary || !isLibrary(existingLibrary)) {
          return reply.status(404).send({ error: `Library with id ${id} not found` });
        }

        // Merge properties, ensuring @id and @type remain correct
        const updatedLibrary: Library = {
          ...existingLibrary,
          // Apply specific updates from updateData
          name: updateData.name ?? existingLibrary.name,
          description: updateData.description ?? existingLibrary.description,
          '@id': existingLibrary['@id'], // Keep original ID
          '@type': 'Library',      // Keep original type
          // Explicitly handle defaultBackend update
          defaultBackend: 'defaultBackend' in updateData
            ? (updateData.defaultBackend ? updateData.defaultBackend : undefined) // Set to string or undefined
            : existingLibrary.defaultBackend // Keep existing if not in updateData
        };

        await em.saveOrUpdate(updatedLibrary);

        // Fetch and return the updated library
        const registerGet = new EntityRegister();
        const finalLibrary = await em.get<Library>(id, registerGet);
        if (!finalLibrary || !isLibrary(finalLibrary)) {
            request.log.error(`Failed to retrieve Library ${id} after update`);
            return reply.status(500).send({ error: 'Failed to verify Library update' });
        }
        return reply.send(finalLibrary);
      } catch (err: unknown) {
        const errorForLog = err instanceof Error ? err : new Error(String(err));
        request.log.error({ err: errorForLog, libraryId: request.params.id }, 'Failed to update Library');
        const errorMessage = errorForLog instanceof Error ? errorForLog.message : 'Failed to update Library';
        return reply.status(400).send({ error: errorMessage });
      }
    }
  );

  // --- DELETE /:id ---
  // Delete Library
  fastify.delete<{ Params: FromSchema<typeof paramsSchema>; Reply: { error: string } | null }>( // Reply can be null for 204
    '/:id',
    { schema: deleteLibrarySchema }, // Attach imported route schema
    async (request, reply) => {
      try {
        const id = decodeURIComponent(request.params.id);
        const register = new EntityRegister();
        const existingLibrary = await em.get<Library>(id, register);

        // Only attempt delete if the library actually exists
        if (existingLibrary && isLibrary(existingLibrary)) {
          await em.delete(id);
        }

        // Return 204 No Content whether it existed or not (idempotency)
        return reply.status(204).send();

      } catch (error: any) {
        request.log.error({ err: error, libraryId: request.params.id }, 'Failed to delete Library');
        // If delete itself fails, return 500
        return reply.status(500).send({ error: 'Internal Server Error: Could not delete Library' });
      }
    }
  );
}
