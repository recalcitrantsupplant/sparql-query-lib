import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { FromSchema } from 'json-schema-to-ts';
// Re-import QueryParameterGroup and QueryParameter for PUT handler
// Import Library type for validation
import { StoredQuery, Thing, QueryParameterGroup, QueryParameter, IdReference, Library } from '../types/schema-dts'; // Added IdReference, Library
import { EntityManager } from '../lib/EntityManager';
import { EntityRegister } from '../lib/entity-register';
import { SparqlQueryParser, DetectedParameters } from '../lib/parser'; // Import DetectedParameters
import { createStoredQuery, CreateStoredQueryInput } from '../lib/factories'; // Import the factory and input type
import { logger, SeverityNumber } from '../lib/logger'; // Import OTel logger
import {
  // storedQuerySchema is referenced within other schemas
  paramsSchema,
  updateQueryBodySchema,
  getQueriesSchema,
  getQuerySchema,
  createQuerySchema,
  updateQuerySchema, // Schema for PUT route
  deleteQuerySchema,
  // errorMessageSchema is added globally
  createStoredQuerySchema, // Schema for POST body
  // Utility schemas
  detectQueryBodySchema,
  detectParametersSchema,
  detectOutputsSchema
} from '../schemas'; // Import schemas

// Import necessary types for validation
// IdReference is now imported above with other types
import { Text, URL as SchemaURL } from '../types/schema-dts';

// --- Schemas are now imported from ../schemas.ts ---

// Helper function to strictly validate and return the query string.
// Returns the string if valid, otherwise null.
function getValidQueryString(queryValue: StoredQuery['query']): string | null {
  // The query MUST be a plain string. Reject arrays or objects.
  if (typeof queryValue === 'string') {
    return queryValue;
  } else {
    console.warn("Invalid query format: Expected a plain string, received:", queryValue);
    return null;
  }
}


// Helper function to check if an object is a StoredQuery
function isStoredQuery(thing: Thing | undefined): thing is StoredQuery {
  if (!thing) return false;
  const type = thing['@type'];
  if (type === 'StoredQuery') return true;
  if (Array.isArray(type) && type.includes('StoredQuery')) return true;
  return false;
}


// Define extended options type including optional parser
interface QueryRoutesOptions extends FastifyPluginOptions {
  entityManager: EntityManager;
  parser?: SparqlQueryParser; // Make parser optional
}

export default async function (
  fastify: FastifyInstance,
  options: QueryRoutesOptions // Use the extended options type
) {
  const { entityManager: em } = options;
  // Use injected parser if provided, otherwise create a new one
  const parser = options.parser || new SparqlQueryParser();

  if (!em) {
    throw new Error("EntityManager instance is required for query routes but was not provided.");
  }

  // --- POST / ---
  // Create StoredQuery
  fastify.post<{ Body: FromSchema<typeof createStoredQuerySchema>; Reply: StoredQuery | { error: string } }>( // Use createStoredQuerySchema for Body type
    '/',
    { schema: createQuerySchema }, // Attach route schema (which references createStoredQuerySchema for body)
    async (request, reply) => {
      let queryToSave: StoredQuery | null = null; // Initialize for potential use in catch block
      try {
        const userInput = request.body; // User input based on createStoredQuerySchema

        // Schema validation handles required fields (name, query) and types.
        // The factory handles ID generation, timestamps, type, and derived fields.
        // No need to check for existing ID as it's generated.

        // --- Library Validation ---
        // Assert userInput type to access libraryId safely after schema validation
        const typedInput = userInput as CreateStoredQueryInput;
        if (!typedInput.libraryId) {
            // This should be caught by schema validation, but double-check defensively
            logger.emit({ severityNumber: SeverityNumber.WARN, body: 'libraryId missing from input despite schema validation.' });
            return reply.status(400).send({ error: 'Bad Request: libraryId is required.' });
        }

        const libraryRegister = new EntityRegister();
        const libraryExists = await em.get<Library>(typedInput.libraryId, libraryRegister);

        if (!libraryExists || libraryExists['@type'] !== 'Library') { // Also check type for robustness
            logger.emit({ severityNumber: SeverityNumber.WARN, body: `Attempt to create query with non-existent or invalid libraryId: ${typedInput.libraryId}` });
            return reply.status(400).send({ error: `Bad Request: Library with id ${typedInput.libraryId} not found.` });
        }
        // --- End Library Validation ---


        // 1. Use the factory to create the complete entity object
        // We already asserted the type above
        queryToSave = createStoredQuery(typedInput);

        // DEBUG: Log object before saving
        // Convert complex object to string for logging attribute
        logger.emit({ severityNumber: SeverityNumber.INFO, body: 'StoredQuery object BEFORE saveOrUpdate', attributes: { queryToSave: JSON.stringify(queryToSave) } });

        // 2. Save the entity using EntityManager
        await em.saveOrUpdate(queryToSave);

        // 3. Fetch the created query to confirm and return
        //    Using the ID generated by the factory
        if (!queryToSave || !queryToSave['@id']) {
            // This should theoretically not happen if factory and save succeeded
            logger.emit({ severityNumber: SeverityNumber.ERROR, body: 'Internal error: queryToSave object or its ID is missing after save attempt.' });
            return reply.status(500).send({ error: 'Internal server error after creating query.' });
        }
        const registerGet = new EntityRegister();
        const createdQuery = await em.get<StoredQuery>(queryToSave['@id'], registerGet); // Now queryToSave['@id'] is known to be string

        // DEBUG: Log object after retrieval
        // Convert complex object to string for logging attribute
        logger.emit({ severityNumber: SeverityNumber.INFO, body: 'StoredQuery object AFTER get', attributes: { createdQuery: JSON.stringify(createdQuery) } });

        if (!createdQuery || !isStoredQuery(createdQuery)) {
            // Log using the generated ID
            logger.emit({ severityNumber: SeverityNumber.ERROR, body: `Failed to retrieve StoredQuery after creation`, attributes: { queryId: queryToSave['@id'] } });
            return reply.status(500).send({ error: 'Failed to verify StoredQuery creation' });
        }
        return reply.status(201).send(createdQuery);

      } catch (err: unknown) {
        const errorForLog = err instanceof Error ? err : new Error(String(err));
        // Use the generated ID from queryToSave if available, otherwise 'unknown'
        const queryIdForLog = queryToSave?.['@id'] ?? 'unknown (factory or save failed)';
        // Convert Error object to primitive attributes
        logger.emit({
            severityNumber: SeverityNumber.ERROR,
            body: 'Failed to create StoredQuery',
            attributes: {
                'error.message': errorForLog.message,
                'error.stack': errorForLog.stack, // Include stack trace
                queryId: queryIdForLog
            }
        });
        // This catch block implies an internal issue (e.g., DB error, unexpected factory failure)
        return reply.status(500).send({ error: 'Internal Server Error: Could not create StoredQuery.' });
      }
    }
  );

  // --- GET / ---
  // List all StoredQuery entities
  fastify.get<{ Querystring: { libraryId?: string }; Reply: StoredQuery[] | { error: string } }>( // Add Querystring type
    '/',
    { schema: getQueriesSchema }, // Schema will be updated separately
    async (request, reply) => {
    try {
      const libraryId = request.query.libraryId; // Get optional libraryId
      const register = new EntityRegister();
      const allEntitiesMap: Map<string, Thing> = await em.loadAll(register);
      const queries: StoredQuery[] = [];

      allEntitiesMap.forEach(entity => {
        if (isStoredQuery(entity)) {
          if (libraryId) {
            // Filter by libraryId if provided
            const isPartOfRaw = entity['http://schema.org/isPartOf'];
            const isPartOfArray: readonly IdReference[] = isPartOfRaw
              ? (Array.isArray(isPartOfRaw) ? isPartOfRaw : [isPartOfRaw])
              : [];

            const belongsToLibrary = isPartOfArray.some(ref => ref['@id'] === libraryId);

            if (belongsToLibrary) {
              queries.push(entity);
            }
          } else {
            // No libraryId filter, include all queries
            queries.push(entity);
          }
        }
      });
      return reply.send(queries);
    } catch (err: unknown) {
      const errorForLog = err instanceof Error ? err : new Error(String(err));
      // Convert Error object to primitive attributes
      logger.emit({
          severityNumber: SeverityNumber.ERROR,
          body: 'Failed to fetch StoredQueries via loadAll',
          attributes: {
              'error.message': errorForLog.message,
              'error.stack': errorForLog.stack
          }
      });
      return reply.status(500).send({ error: 'Internal Server Error: Could not fetch StoredQueries' });
    }
  });

  // --- GET /:id ---
  // Get StoredQuery by ID
  // Note: FromSchema needs the actual schema object, not the FastifySchema wrapper
  fastify.get<{ Params: FromSchema<typeof paramsSchema>; Reply: StoredQuery | { error: string } }>(
    '/:id',
    { schema: getQuerySchema }, // Attach imported route schema
    async (request, reply) => {
      try {
        const id = decodeURIComponent(request.params.id); // Decode IRI
        const register = new EntityRegister();
        const query = await em.get<StoredQuery>(id, register);

        if (!query || !isStoredQuery(query)) { // Use helper
          return reply.status(404).send({ error: `StoredQuery with id ${id} not found` });
        }
        return reply.send(query);
      } catch (err: unknown) {
        const errorForLog = err instanceof Error ? err : new Error(String(err));
        // Include params in log context, convert Error
        logger.emit({
            severityNumber: SeverityNumber.ERROR,
            body: `Failed to fetch StoredQuery`,
            attributes: {
                'error.message': errorForLog.message,
                'error.stack': errorForLog.stack,
                // Assuming request.params is a simple object of strings
                'request.params': JSON.stringify(request.params) // Stringify params just in case
            }
        });
        return reply.status(500).send({ error: 'Internal Server Error: Could not fetch StoredQuery' });
      }
    }
  );

  // --- PUT /:id ---
  // Update StoredQuery
  // Note: FromSchema needs the actual schema object, not the FastifySchema wrapper
  fastify.put<{ Params: FromSchema<typeof paramsSchema>; Body: FromSchema<typeof updateQueryBodySchema>; Reply: StoredQuery | { error: string } }>(
    '/:id',
    { schema: updateQuerySchema }, // Attach imported route schema
    async (request, reply) => {
      try {
        const id = decodeURIComponent(request.params.id);
        const updateData = request.body as FromSchema<typeof updateQueryBodySchema>; // Typed body, includes libraryId/queryGroupId

        // DEBUG: Log incoming PUT request details
        logger.emit({
            severityNumber: SeverityNumber.INFO,
            body: 'Received PUT request for StoredQuery update',
            attributes: {
                queryId: id,
                updateData: JSON.stringify(updateData) // Log the incoming body
            }
        });

        const register = new EntityRegister();
        const existingQuery = await em.get<StoredQuery>(id, register);

        if (!existingQuery || !isStoredQuery(existingQuery)) {
          return reply.status(404).send({ error: `StoredQuery with id ${id} not found` });
        }

        let needsReparsing = false;
        // Get the current query string, validating format safely
        const currentQueryString = existingQuery.query ? getValidQueryString(existingQuery.query) : null;
        let finalQueryString = currentQueryString; // Initialize with current valid string (might be null)

        if (existingQuery.query && currentQueryString === null) {
             // Log error if existing data is invalid, but proceed if possible
             logger.emit({ severityNumber: SeverityNumber.ERROR, body: 'Existing query data is not a valid string format.', attributes: { queryId: id } });
             // We might allow the update to fix it, depending on requirements.
             // For now, we'll rely on the updateData validation below.
        }

        // Check if the query string itself is being updated
        if ('query' in updateData) { // Check if 'query' key exists in the update payload
            // Relying on Fastify schema validation to ensure updateData.query is a string here.
            const newQueryStringValue = updateData.query as string; // Cast as string based on schema validation

            // Check if the valid new string is different from the valid current string
            if (newQueryStringValue !== currentQueryString) {
                needsReparsing = true;
                finalQueryString = newQueryStringValue; // Use the valid new string value
            }
            // If new is valid but same as current, no need to reparse based on query change
        }

        let newQueryType = existingQuery.queryType;
        let newOutputVars = existingQuery.outputVars;
        // Handle potential null/undefined parameters from input or existing query
        let newParameters = existingQuery.parameters === null ? undefined : existingQuery.parameters;
        // Initialize limit/offset params from existing query, ensuring they are string arrays (Original logic)
        let newLimitParams: string[] = Array.isArray(existingQuery.hasLimitParameter)
            ? existingQuery.hasLimitParameter.filter((item): item is string => typeof item === 'string') // Ensure items are strings
            : [];
        let newOffsetParams: string[] = Array.isArray(existingQuery.hasOffsetParameter)
            ? existingQuery.hasOffsetParameter.filter((item): item is string => typeof item === 'string') // Ensure items are strings
            : [];

        // Reparse if the query string changed
        if (needsReparsing) {
            if (finalQueryString === null) { // Should have been caught by schema validation if query was provided but invalid
                logger.emit({ severityNumber: SeverityNumber.ERROR, body: 'Cannot reparse query as the final query string is null or invalid', attributes: { queryId: id } });
                return reply.status(500).send({ error: 'Internal error processing query string for update.' });
            }
            try {
                // Recalculate type and outputs
                const parsed = parser.parseQuery(finalQueryString);
                if (parsed.type === 'update') newQueryType = 'UPDATE';
                else if (parsed.type === 'query' && parsed.queryType) newQueryType = parsed.queryType.toUpperCase() as StoredQuery['queryType'];
                else newQueryType = 'UNKNOWN';
                newOutputVars = parser.detectQueryOutputs(finalQueryString);

                // Recalculate parameters (VALUES, LIMIT, OFFSET) *unless* user explicitly provided VALUES parameters
                if (!('parameters' in updateData) || updateData.parameters === null || updateData.parameters === undefined) {
                    // Auto-detect all parameters because query changed and user didn't provide specific VALUES params
                    const detected = parser.detectParameters(finalQueryString);
                    newParameters = detected.valuesParameters.map((groupVarNames): QueryParameterGroup => ({
                        '@type': 'QueryParameterGroup',
                        vars: groupVarNames.map((varName): QueryParameter => ({
                            '@type': 'QueryParameter',
                            paramName: varName,
                            allowedTypes: ["uri", "literal"]
                        }))
                    }));
                    // Assign the extracted parameter names (arrays of strings)
                    newLimitParams = detected.limitParameters;
                    newOffsetParams = detected.offsetParameters;
                } else {
                    // User provided specific VALUES parameters, use them
                    newParameters = updateData.parameters;
                    // Still need to re-detect LIMIT/OFFSET parameter names because the query changed
                    const detected = parser.detectParameters(finalQueryString);
                    newLimitParams = detected.limitParameters; // Assign extracted names
                    newOffsetParams = detected.offsetParameters; // Assign extracted names
                }

            } catch (parseError: any) {
                // Handle parsing error (return 400)
                newLimitParams = []; // Reset on error
                newOffsetParams = []; // Reset on error
                const parseErrorForLog = parseError instanceof Error ? parseError : new Error(String(parseError));
                logger.emit({
                    severityNumber: SeverityNumber.ERROR,
                    body: 'Failed to parse updated query string',
                    attributes: {
                        'error.message': parseErrorForLog.message,
                        'error.stack': parseErrorForLog.stack,
                        queryId: id,
                        query: finalQueryString
                    }
                });
                return reply.status(400).send({ error: `Invalid SPARQL query provided: ${parseErrorForLog.message}` });
            }
        } else if ('parameters' in updateData) {
            // Query string did NOT change, but user provided parameters (or null/undefined to trigger auto-detect)
            if (updateData.parameters === null || updateData.parameters === undefined) {
                // Trigger auto-detection based on the *existing* query string
                if (currentQueryString === null) {
                    logger.emit({ severityNumber: SeverityNumber.ERROR, body: 'Cannot auto-detect parameters as existing query string is null or invalid', attributes: { queryId: id } });
                    return reply.status(500).send({ error: 'Internal error processing existing query string for parameter detection.' });
                }
                try {
                    const detected = parser.detectParameters(currentQueryString);
                    // Add the missing mapping for VALUES parameters
                    newParameters = detected.valuesParameters.map((groupVarNames): QueryParameterGroup => ({
                        '@type': 'QueryParameterGroup',
                        vars: groupVarNames.map((varName): QueryParameter => ({
                            '@type': 'QueryParameter',
                            paramName: varName,
                            allowedTypes: ["uri", "literal"] // Defaulting allowedTypes
                        }))
                    }));
                    // Assign the extracted parameter names (arrays of strings)
                    newLimitParams = detected.limitParameters;
                    newOffsetParams = detected.offsetParameters;
                } catch (parseError: any) {
                    // Handle error parsing the *existing* query if user requested auto-detect
                    newLimitParams = []; // Reset on error
                    newOffsetParams = []; // Reset on error
                    const parseErrorForLog = parseError instanceof Error ? parseError : new Error(String(parseError));
                     logger.emit({
                        severityNumber: SeverityNumber.ERROR,
                        body: 'Failed to parse existing query string during parameter auto-detection',
                        attributes: {
                            'error.message': parseErrorForLog.message,
                            'error.stack': parseErrorForLog.stack,
                            queryId: id,
                            query: currentQueryString
                        }
                    });
                    // Consider this a 500 as the existing stored query is problematic
                    return reply.status(500).send({ error: `Internal Server Error: Could not parse existing query to detect parameters: ${parseErrorForLog.message}` });
                }
            } else {
                // User provided specific parameters without changing the query
                newParameters = updateData.parameters;
                // Keep existing limit/offset as query didn't change
            }
        }
        // If neither query nor parameters were in updateData, all existing derived fields are kept (already initialized)

        // --- Handle isPartOf update ---
        let newIsPartOf: IdReference[] = [];
        const existingIsPartOfRaw = existingQuery['http://schema.org/isPartOf'];
        // Normalize existingIsPartOfRaw to always be an array or empty array
        const existingIsPartOfArray: readonly IdReference[] = existingIsPartOfRaw
            ? (Array.isArray(existingIsPartOfRaw) ? existingIsPartOfRaw : [existingIsPartOfRaw])
            : [];

        // 1. Determine the Library link (mandatory)
        let libraryLink: IdReference | undefined;
        if (updateData.libraryId) {
            // User provided a new library ID
            libraryLink = { '@id': updateData.libraryId };
        } else {
            // Find the existing library link within the normalized array
            // Heuristic: check URL pattern. A more robust approach might involve checking the type of the linked entity.
            libraryLink = existingIsPartOfArray.find(ref => ref['@id'].includes('/library/'));
            if (!libraryLink && existingIsPartOfArray.length > 0) {
                 // Fallback: If no library pattern found, assume the first element is the library link.
                 // This assumes the library link was always added first or is the only one present.
                 // Consider adding type checks if the IdReference objects could have @type.
                 const firstElement = existingIsPartOfArray[0];
                 // Ensure the first element is actually an IdReference (it should be based on type)
                 if (firstElement && typeof firstElement === 'object' && '@id' in firstElement) {
                    libraryLink = firstElement;
                 }
            }
        }

        if (!libraryLink) {
            // This should not happen if the query was created correctly, but handle defensively
            logger.emit({ severityNumber: SeverityNumber.ERROR, body: 'Cannot update query: existing library link not found and no new libraryId provided.', attributes: { queryId: id } });
            return reply.status(400).send({ error: 'Bad Request: Query must belong to a Library. Provide libraryId or ensure existing link is valid.' });
        }
        newIsPartOf.push(libraryLink); // Add the mandatory library link

        // 2. Determine the QueryGroup link (optional)
        let queryGroupLink: IdReference | undefined;
        if ('queryGroupId' in updateData) { // Check if the key exists in the payload
            if (updateData.queryGroupId === null) {
                // User explicitly wants to remove the group link
                queryGroupLink = undefined;
            } else if (updateData.queryGroupId) {
                // User wants to add/update the group link
                queryGroupLink = { '@id': updateData.queryGroupId };
            }
            // If updateData.queryGroupId is undefined but key exists, it's treated like null (remove)
        } else {
            // Key not in payload, keep existing group link if present
            // Find existing group link in the normalized array (heuristic: check URL pattern)
            queryGroupLink = existingIsPartOfArray.find(ref => ref['@id'].includes('/queryGroup/'));
            // Add a fallback only if a library link was also found, to avoid misinterpreting a single library link as a group link
            if (!queryGroupLink && libraryLink && existingIsPartOfArray.length > 1) {
                 // Find the element that is *not* the library link
                 queryGroupLink = existingIsPartOfArray.find(ref => ref !== libraryLink);
            }
            // Note: No fallback if only one item exists and it was identified as the library.
        }

        if (queryGroupLink) {
            newIsPartOf.push(queryGroupLink); // Add the optional query group link if determined
        }
        // --- End isPartOf update ---


        const now = new Date().toISOString();

        // Construct the final object for saving
        const queryToSave: StoredQuery = {
          ...existingQuery, // Start with existing
          // Overlay user-provided updates (name, description, query, parameters)
          // Note: libraryId and queryGroupId from updateData are handled via newIsPartOf
          name: updateData.name ?? existingQuery.name,
          description: updateData.description ?? existingQuery.description,
          query: updateData.query ?? existingQuery.query, // Use new query if provided
          '@id': existingQuery['@id'], // Ensure ID is not changed
          '@type': 'StoredQuery',      // Ensure type is not changed
          queryType: newQueryType,     // Use potentially recalculated type
          outputVars: newOutputVars,   // Use potentially recalculated outputs
          // Use recalculated/user-provided parameters, ensuring null becomes undefined
          parameters: newParameters === null ? undefined : newParameters,
          // Assign the first detected parameter name (string) or undefined
          hasLimitParameter: newLimitParams.length > 0 ? newLimitParams[0] : undefined,
          hasOffsetParameter: newOffsetParams.length > 0 ? newOffsetParams[0] : undefined,
          'http://schema.org/isPartOf': newIsPartOf, // Use the newly constructed array
          'http://schema.org/dateModified': now,      // Update timestamp using correct property
          // dateCreated remains from existingQuery
          'http://schema.org/dateCreated': existingQuery['http://schema.org/dateCreated'],
          // Explicitly handle defaultBackend update
          defaultBackend: 'defaultBackend' in updateData
            ? (updateData.defaultBackend ? updateData.defaultBackend : undefined) // Set to string or undefined
            : existingQuery.defaultBackend // Keep existing if not in updateData
        };

         // Final check to remove null parameters before saving (already handled for defaultBackend)
         if (queryToSave.parameters === null) {
             delete queryToSave.parameters;
         }
         // Remove limit/offset if they are empty arrays after processing
         // Check if the property exists and is an array before checking length
         if (queryToSave.hasLimitParameter && Array.isArray(queryToSave.hasLimitParameter) && queryToSave.hasLimitParameter.length === 0) {
             delete queryToSave.hasLimitParameter;
         }
         if (queryToSave.hasOffsetParameter && Array.isArray(queryToSave.hasOffsetParameter) && queryToSave.hasOffsetParameter.length === 0) {
             delete queryToSave.hasOffsetParameter;
         }


        // DEBUG: Log object before saving
        logger.emit({
            severityNumber: SeverityNumber.INFO,
            body: 'StoredQuery object BEFORE saveOrUpdate',
            attributes: {
                queryToSaveId: queryToSave['@id'],
                queryToSave: JSON.stringify(queryToSave) // Log the object being saved
            }
        });

        await em.saveOrUpdate(queryToSave);

        // DEBUG: Log after saveOrUpdate attempt
        logger.emit({
            severityNumber: SeverityNumber.INFO,
            body: 'em.saveOrUpdate attempted for StoredQuery',
            attributes: {
                queryId: id
            }
        });

        // Fetch and return the updated query
        const registerGet = new EntityRegister();
        const finalQuery = await em.get<StoredQuery>(id, registerGet);

        // DEBUG: Log key identifiers of the fetched object and the type check result
        logger.emit({
            severityNumber: SeverityNumber.INFO,
            body: 'Verifying final query after update',
            attributes: {
                // Log only key identifiers instead of the whole object to avoid stringify issues with mocks
                finalQueryId: finalQuery?.['@id'] ?? 'undefined',
                finalQueryType: finalQuery?.['@type'] ?? 'undefined',
                isStoredQueryCheck: isStoredQuery(finalQuery)
            }
        });

        if (!finalQuery || !isStoredQuery(finalQuery)) {
            logger.emit({ severityNumber: SeverityNumber.ERROR, body: `Failed to retrieve StoredQuery after update or type mismatch`, attributes: { queryId: id } });
            return reply.status(500).send({ error: 'Failed to verify StoredQuery update' });
        }

        // DEBUG: Log the final object being sent in the response
        logger.emit({
            severityNumber: SeverityNumber.INFO,
            body: 'Sending final StoredQuery object in response',
            attributes: {
                finalQueryId: finalQuery['@id'],
                finalQuery: JSON.stringify(finalQuery) // Log the response object
            }
        });

        return reply.send(finalQuery);
      } catch (err: unknown) {
        const errorForLog = err instanceof Error ? err : new Error(String(err));
        // Include params and potentially relevant body parts in log context
        // Be cautious about logging the entire body if it contains sensitive info or is very large
        const logAttributes = {
            'error.message': errorForLog.message,
            'error.stack': errorForLog.stack,
            'request.params': JSON.stringify(request.params), // Stringify params
            'request.bodyKeys': Object.keys(request.body || {}) // Array of strings is fine
        };
        logger.emit({ severityNumber: SeverityNumber.ERROR, body: 'Failed to update StoredQuery', attributes: logAttributes });
        // Distinguish between client errors (like validation errors caught by schema or earlier checks)
        // and genuine internal server errors (like DB connection issues).
        // If the error message suggests a validation/parsing issue handled earlier, it might be 400.
        // Otherwise, assume 500 for unexpected errors during the save/update process.
        // Since the previous catch handles parsing errors with 400, this catch likely represents DB or other internal issues.
        return reply.status(500).send({ error: 'Internal Server Error: Could not update StoredQuery.' });
      }
    }
  );

  // --- DELETE /:id ---
  // Delete StoredQuery
  // Note: FromSchema needs the actual schema object, not the FastifySchema wrapper
  fastify.delete<{ Params: FromSchema<typeof paramsSchema>; Reply: { error: string } | null }>(
    '/:id',
    { schema: deleteQuerySchema }, // Attach imported route schema
    async (request, reply) => {
      try {
        const id = decodeURIComponent(request.params.id);

        // Optional: Check existence before deleting
        const registerCheck = new EntityRegister();
        const existing = await em.get<StoredQuery>(id, registerCheck);
        if (!existing || !isStoredQuery(existing)) {
          // Reply 204 even if not found for idempotency
        } else {
          await em.delete(id);
        }
        return reply.status(204).send();
      } catch (err: unknown) {
        const errorForLog = err instanceof Error ? err : new Error(String(err));
        // Include params in log context, convert Error
        logger.emit({
            severityNumber: SeverityNumber.ERROR,
            body: `Failed to delete StoredQuery`,
            attributes: {
                'error.message': errorForLog.message,
                'error.stack': errorForLog.stack,
                'request.params': JSON.stringify(request.params) // Stringify params
            }
        });
        return reply.status(500).send({ error: 'Internal Server Error: Could not delete StoredQuery' });
      }
    }
  );

  // --- POST /detect-parameters ---
  // Detect parameters in a given query string
  fastify.post<{ Body: FromSchema<typeof detectQueryBodySchema>; Reply: DetectedParameters | { error: string } }>( // Update Reply type
    '/detect-parameters',
    { schema: detectParametersSchema }, // Use the original schema reference
    async (request, reply) => {
      try {
        // Schema validation handles input checks now
        const { query } = request.body;
        // We assume 'query' is a valid string here due to schema validation
        const parameters = parser.detectParameters(query as string);
        // Return the full parameters object (including values, limit, offset)
        return reply.status(200).send(parameters);
      } catch (err: unknown) {
        const errorForLog = err instanceof Error ? err : new Error(String(err));
        logger.emit({
            severityNumber: SeverityNumber.ERROR,
            body: 'Failed to detect parameters',
            attributes: {
                'error.message': errorForLog.message,
                'error.stack': errorForLog.stack,
                query: request.body?.query // String is fine
            }
        });
        const errorMessage = errorForLog instanceof Error ? errorForLog.message : 'Failed to detect parameters';
        // Send 400 for parsing errors, 500 for others
        const statusCode = errorMessage.includes('parse') || errorMessage.includes('Unexpected token') ? 400 : 500; // Refined check for parsing errors
        // Format message based on status code to match test expectations for 500
        const responseMessage = statusCode === 500
            ? `Internal Server Error: Could not detect parameters: ${errorMessage}`
            : errorMessage; // Keep original message for 400 parse errors
        return reply.status(statusCode).send({ error: responseMessage });
      }
    }
  );

  // --- POST /detect-outputs ---
  // Detect outputs in a given query string
  fastify.post<{ Body: FromSchema<typeof detectQueryBodySchema>; Reply: string[] | { error: string } }>(
    '/detect-outputs',
    { schema: detectOutputsSchema },
    async (request, reply) => {
      try {
        // Schema validation handles input checks now
        const { query } = request.body;
        // We assume 'query' is a valid string here due to schema validation
        const outputs = parser.detectQueryOutputs(query as string); // Cast as string
        return reply.status(200).send(outputs);
      } catch (err: unknown) {
        const errorForLog = err instanceof Error ? err : new Error(String(err));
        logger.emit({
            severityNumber: SeverityNumber.ERROR,
            body: 'Failed to detect outputs',
            attributes: {
                'error.message': errorForLog.message,
                'error.stack': errorForLog.stack,
                query: request.body?.query // String is fine
            }
        });
        const errorMessage = errorForLog instanceof Error ? errorForLog.message : 'Failed to detect outputs';
        // Send 400 for parsing errors, 500 for others
        const statusCode = errorMessage.includes('parse') || errorMessage.includes('Unexpected token') ? 400 : 500; // Refined check for parsing errors
        // Format message based on status code to match test expectations for 500
        const responseMessage = statusCode === 500
            ? `Internal Server Error: Could not detect outputs: ${errorMessage}`
            : errorMessage; // Keep original message for 400 parse errors
        return reply.status(statusCode).send({ error: responseMessage });
      }
    }
  );

}
