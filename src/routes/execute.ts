import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify'; // Removed FastifySchema
import { FromSchema } from 'json-schema-to-ts';
import { EntityManager } from '../lib/EntityManager';
import { EntityRegister } from '../lib/entity-register';
import { Backend, StoredQuery, Thing } from '../types/schema-dts'; // Removed SchemaValue import
import { ISparqlExecutor, SparqlSelectJsonOutput } from '../server/ISparqlExecutor'; // Import SparqlSelectJsonOutput
import { HttpSparqlExecutor } from '../server/HttpSparqlExecutor';
import { OxigraphSparqlExecutor } from '../server/OxigraphSparqlExecutor'; // Import Oxigraph executor
import { SparqlQueryParser } from '../lib/parser';
import {
  argumentValueSchema,
  argumentRowSchema,
  argumentSetSchema,
  executeRequestBodySchema,
  executeQuerySchema,
  // errorMessageSchema is added globally
} from '../schemas'; // Import schemas
import { meter } from '../lib/logger'; // Import the meter instance
import { ValueType } from '@opentelemetry/api'; // Import ValueType for histogram unit

// --- Define Metrics ---
const queryExecutionCounter = meter.createCounter('query.execution.count', {
  description: 'Counts the number of SPARQL query executions',
});
const queryExecutionDuration = meter.createHistogram('query.execution.duration', {
  description: 'Measures the duration of SPARQL query executions',
  unit: 'ms', // Milliseconds
  valueType: ValueType.DOUBLE,
});

// --- Helper Type Guards ---
function isStoredQuery(thing: Thing | undefined): thing is StoredQuery {
  return !!thing && thing['@type'] === 'StoredQuery';
}

function isBackend(thing: Thing | undefined): thing is Backend {
  return !!thing && thing['@type'] === 'Backend';
}

// --- Schemas are now imported from ../schemas.ts ---


// --- Plugin ---

export default async function (
  fastify: FastifyInstance,
  options: FastifyPluginOptions & { entityManager: EntityManager }
) {
  // Schemas are expected to be added globally in index.ts or similar
  // No need to add errorMessageSchema or other dependent schemas here

  const em = options.entityManager;

  if (!em) {
    throw new Error('EntityManager instance is required for execution routes');
   }

   const parser = new SparqlQueryParser();

   // Define a more specific reply type if possible, though results vary by query type
  // Import SparqlSelectJsonOutput if not already imported
  // import { SparqlSelectJsonOutput } from '../server/ISparqlExecutor'; // Assuming it's exported there
  type ExecuteReply = SparqlSelectJsonOutput | string | { error: string } | { boolean: boolean } | any; // Allow flexibility

  // Use FastifyRequest/Reply directly here as the generic types cover it
  fastify.post(
    '/',
    { schema: executeQuerySchema }, // Attach the main route schema
    async (request: FastifyRequest<{ Body: FromSchema<typeof executeRequestBodySchema> }>, reply: FastifyReply) => {
      // Log the incoming request body
      request.log.info(`Received /execute request with body:\n${JSON.stringify(request.body, null, 2)}`);

      // Use 'arguments' from body, alias to 'args' for brevity
      const { targetId, backendId, arguments: args } = request.body;
      const register = new EntityRegister(); // Needed for fetching entities
      let executionStatus: 'success' | 'failure' = 'failure'; // Default to failure
      let backendTypeAttr: string | undefined = undefined; // To store backend type for metrics
      // let queryTypeAttr: string | undefined = undefined; // Removed query type tracking
      const startTime = performance.now(); // Start timing

      try {
        // 1. Fetch the target query/group and the backend
        const targetEntity = await em.get(targetId, register);
        // Fetch backend using the ID from the request body
        const backendEntity = await em.get<Backend>(backendId, register); // Specify Backend type

        // 2. Validate entities
        // Validate backend first, using the ID from the request
        if (!backendEntity || !isBackend(backendEntity)) {
          request.log.error(`Backend with ID ${backendId} not found or is not a Backend.`);
          return reply.code(404).send({ error: `Backend with ID ${backendId} not found or is not a Backend.` });
        }
        // Then validate the target entity
        if (!targetEntity) {
          request.log.error(`Target entity with ID ${targetId} not found.`);
          return reply.code(404).send({ error: `Target entity with ID ${targetId} not found.` });
        }
        request.log.info(`Successfully fetched target ${targetId} and backend ${backendId}.`);


        // 3. Handle StoredQuery execution (QueryGroup later)
        let sparqlQueryString: string | undefined;
        let queryType: string | undefined; // e.g., SELECT, CONSTRUCT, ASK

        if (isStoredQuery(targetEntity)) {
          sparqlQueryString = targetEntity.query as string; // Assuming query is stored as Text
          queryType = targetEntity.queryType as string; // Assuming queryType is stored as Text
          // queryTypeAttr = queryType; // Removed query type tracking

          if (!sparqlQueryString) {
            return reply.code(400).send({ error: `StoredQuery ${targetId} does not contain a query string.` });
          }
          if (!queryType) {
             request.log.warn(`StoredQuery ${targetId} is missing queryType. Assuming SELECT.`);
             queryType = 'SELECT'; // Default assumption
             // queryTypeAttr = queryType; // Removed query type tracking
          }

          // Apply arguments using the parser if arguments are provided
          if (args && args.length > 0 && sparqlQueryString) {
             try {
                // Ensure args is treated as an array of argument sets
                const argumentSets = args as any[]; 
                sparqlQueryString = parser.applyArguments(sparqlQueryString, argumentSets);
                request.log.info(`Applied arguments to query ${targetId} using parser.`);
             } catch (parseError: any) {
                 request.log.error(parseError, `Error applying arguments to query ${targetId}`);
                 return reply.code(400).send({ error: `Failed to apply arguments: ${parseError.message}` });
             }
          }

        } else if (targetEntity['@type'] === 'QueryGroup') {
          // TODO: Implement QueryGroup execution logic
          request.log.warn(`Execution of QueryGroup ${targetId} is not yet implemented.`);
          return reply.code(501).send({ error: 'QueryGroup execution is not implemented.' });
        } else {
          return reply.code(400).send({ error: `Target entity ${targetId} is not an executable type (StoredQuery or QueryGroup). Found type: ${targetEntity['@type']}` });
        }

        // 4. Instantiate the executor for the *target* backend based on its type
        let targetExecutor: ISparqlExecutor;
        // Directly access backendType, assuming JSON-LD context ensures it's single
        const backendType = backendEntity.backendType;

        if (!backendType) {
          // Use backendId from request in error message
          request.log.error(`Backend ${backendId} is missing the required 'backendType' property.`);
          return reply.code(400).send({ error: `Backend ${backendId} is missing the required 'backendType' property.` });
        }

        // Ensure backendType is a string before using it in the switch
        if (typeof backendType !== 'string') {
            // Use backendId from request in error message
            request.log.error(`Backend ${backendId} has an invalid or non-string backendType: ${JSON.stringify(backendType)}`);
            return reply.code(400).send({ error: `Backend ${backendId} has an invalid backendType.` });
        }
        backendTypeAttr = backendType; // Capture for metrics

        // Use backendId from request in log message
        request.log.info(`Instantiating executor for backend ${backendId} of type: ${backendType}`);

        switch (backendType.toUpperCase()) { // Now safe to call toUpperCase()
          case 'HTTP':
            // Directly access endpoint
            const endpoint = backendEntity.endpoint;
            if (!endpoint) {
              // Use backendId from request in error message
              return reply.code(400).send({ error: `HTTP Backend ${backendId} does not have an endpoint configured.` });
            }
            // Assuming endpoint is the base URL, construct query/update URLs if needed, or expect full URLs in schema
            // For now, assume endpoint is the query endpoint, and maybe update too.
            // TODO: Refine Backend schema for separate query/update URLs if necessary.
            targetExecutor = new HttpSparqlExecutor({
              queryUrl: endpoint as string, // Cast needed as generated type includes URL | IdReference
              updateUrl: endpoint as string, // Assuming same for now
              // Directly access username and password
              username: backendEntity.username as string | undefined,
              password: backendEntity.password as string | undefined,
            });
            // Use backendId from request in log message
            request.log.info(`Using HttpSparqlExecutor for backend ${backendId}: ${endpoint}`);
            break;

          case 'OXIGRAPHMEMORY':
            // TODO: Implement Oxigraph executor instantiation.
            // It might need access to the EntityManager or a specific store instance.
            // For now, assuming it can be instantiated directly or configuration is handled elsewhere.
             // Use backendId from request in log/error message
             request.log.warn(`OxigraphSparqlExecutor instantiation is not fully implemented for backend ${backendId}. Using placeholder.`);
             // targetExecutor = new OxigraphSparqlExecutor(/* config? */);
             // For now, send 501 Not Implemented
             return reply.code(501).send({ error: `Backend type 'OxigraphMemory' is configured but its executor is not yet implemented.` });
            // break; // Keep break for future implementation

          default:
            // Use backendId from request in log/error message
            request.log.error(`Unsupported backend type '${backendType}' for backend ${backendId}.`);
            return reply.code(400).send({ error: `Unsupported backend type: ${backendType}` });
        }

        // 4.5 Determine Accept header
        let acceptHeader = request.headers.accept;
        let defaultAcceptHeader: string | undefined = undefined;

        switch (queryType?.toUpperCase()) {
          case 'SELECT':
            defaultAcceptHeader = 'application/sparql-results+json';
            break;
          case 'CONSTRUCT':
            defaultAcceptHeader = 'application/n-triples';
            break;
          // Add other cases like ASK if needed
        }

        // Use provided header if it exists and is specific, otherwise use default
        const finalAcceptHeader = (acceptHeader && acceptHeader !== '*/*') ? acceptHeader : defaultAcceptHeader;
        request.log.info(`Using Accept header: ${finalAcceptHeader || 'None (default behavior)'}`);


        // 5. Execute the query, passing the determined Accept header
        let results: ExecuteReply; // Use the defined type
        // Use the appropriate executor method based on query type
        // Ensure sparqlQueryString is not undefined before passing
        if (!sparqlQueryString) {
             // This should have been caught earlier, but defensive check
             throw new Error("Internal error: sparqlQueryString became undefined before execution.");
        }

        // Pass finalAcceptHeader to executor methods (requires interface/implementation changes)
        switch (queryType?.toUpperCase()) {
           case 'SELECT':
              // Assuming selectQueryParsed will accept an options object or header param
              // TODO: Update ISparqlExecutor and implementations
              results = await targetExecutor.selectQueryParsed(sparqlQueryString, { acceptHeader: finalAcceptHeader });
              break;
           case 'CONSTRUCT':
              // Assuming constructQueryParsed will accept an options object or header param
              // TODO: Update ISparqlExecutor and implementations
              results = await targetExecutor.constructQueryParsed(sparqlQueryString, { acceptHeader: finalAcceptHeader });
              break;
           case 'DESCRIBE': // Handle DESCRIBE like CONSTRUCT as both return graphs
              // Assuming constructQueryParsed can handle DESCRIBE queries at the endpoint
              // TODO: Verify backend compatibility or add specific DESCRIBE method later
              results = await targetExecutor.constructQueryParsed(sparqlQueryString, { acceptHeader: finalAcceptHeader });
              break;
           case 'ASK':
              // TODO: Add ASK query support when ISparqlExecutor interface includes it
              // TODO: Pass acceptHeader if/when ASK is implemented
              request.log.warn(`ASK query execution for ${targetId} is not yet implemented in ISparqlExecutor.`);
              return reply.code(501).send({ error: 'ASK query execution is not yet implemented.' });
              // break; // Keep break for consistency if ASK is added later
           case 'UPDATE':
              // Execute the UPDATE query using the appropriate executor method
              await targetExecutor.update(sparqlQueryString);
              // Set a success response, as UPDATE queries don't return data in the same way
              results = { success: true };
              request.log.info(`Executed UPDATE query ${targetId} successfully.`);
              break;
           default:
              request.log.warn(`Unknown query type '${queryType}' for ${targetId}. Cannot execute.`);
              // Cannot fallback as there's no generic query method in the interface
              return reply.code(400).send({ error: `Unsupported or unknown query type: ${queryType}` });
        }


        // 6. Return results
        executionStatus = 'success'; // Mark as success before returning
        return reply.send(results);

      } catch (error: any) {
        // Use backendId from request in error logging
        request.log.error(error, `Error executing query ${targetId} on backend ${backendId}`);
        // Provide more specific error messages if possible
        if (error.message.includes('fetch')) {
           // Use backendId from request in error message
           return reply.code(502).send({ error: `Failed to connect to backend ${backendId}: ${error.message}` });
        }
        return reply.code(500).send({ error: `Internal server error during execution: ${error.message}` });
      } finally {
        const duration = performance.now() - startTime;
        // Record metrics using the backend ID from the request
        const attributes = {
          'query.id': targetId,
          'backend.id': backendId, // Use backendId from request
          // 'backend.source' removed
          'backend.type': backendTypeAttr || 'unknown', // Use stored backend type
          // 'query.type': queryTypeAttr || 'unknown', // Removed query type attribute
          'status': executionStatus,
        };
        queryExecutionDuration.record(duration, attributes);
        queryExecutionCounter.add(1, attributes);
        request.log.info({ duration, attributes }, `Recorded execution metrics for query ${targetId}`);
      }
    }
  );
}
