# Factory Pattern for Entity Creation

## Problem

When creating new entities (like `StoredQuery`, `Library`, `Backend`, etc.), several fields need to be generated or defaulted by the server/library rather than provided by the user:

*   `@id`: A unique identifier (often a namespaced URI).
*   `@type`: The specific RDF type of the entity.
*   `createdAt`: Timestamp of creation.
*   `updatedAt`: Timestamp of the last update (same as `createdAt` on creation).
*   Derived fields: Some fields might be derived from user input (e.g., `queryType`, `outputVars`, `parameters` for `StoredQuery` based on the `query` string).

Placing this generation/defaulting logic directly within API route handlers can lead to:

1.  **Code Duplication:** If entities can be created through multiple pathways (e.g., HTTP API, future programmatic JS API, internal processes), the same logic needs to be repeated.
2.  **Scattered Logic:** The responsibility for constructing a valid entity is spread across different parts of the codebase.
3.  **Testing Complexity:** Unit testing the entity creation logic becomes harder as it's tied to the specific context (e.g., a Fastify request handler).

## Solution: Factory Functions

Introduce dedicated factory functions for each entity type that requires server-side generation or defaulting of fields.

**Example: `StoredQuery` Factory**

Create a function, potentially in `src/lib/factories.ts`, with a signature like:

```typescript
import { StoredQuery, QueryParameterGroup } from '../types/schema-dts';
import { SparqlQueryParser } from './parser'; // Assuming parser is needed
import { v4 as uuidv4 } from 'uuid';

const QUERY_NAMESPACE = 'urn:sparql-query-lib:query:';
const parser = new SparqlQueryParser(); // Instantiate parser once or pass as dependency

interface CreateStoredQueryInput {
  name: string;
  query: string;
  description?: string;
  parameters?: QueryParameterGroup[] | null; // Allow explicit null for auto-detect request
}

export function createStoredQuery(input: CreateStoredQueryInput): StoredQuery {
  const generatedId = `${QUERY_NAMESPACE}${uuidv4()}`;
  const now = new Date().toISOString();

  let queryType: StoredQuery['queryType'] = 'UNKNOWN';
  let outputVars: string[] = [];
  let finalParameters: QueryParameterGroup[] | undefined = undefined; // Initialize as undefined

  try {
    const parsedQuery = parser.parseQuery(input.query);
    queryType = parsedQuery.queryType?.toUpperCase() as StoredQuery['queryType'] ?? 'UNKNOWN';
    outputVars = parser.detectQueryOutputs(input.query);

    // Handle parameters: Use provided if not null/undefined, otherwise detect.
    if (input.parameters === null || input.parameters === undefined) {
      const detectedParamGroups = parser.detectParameters(input.query);
      finalParameters = detectedParamGroups.map((groupVarNames): QueryParameterGroup => ({
        '@type': 'QueryParameterGroup',
        vars: groupVarNames.map((varName) /* : QueryParameter */ => ({ // Type annotation might be needed depending on schema-dts output
          '@type': 'QueryParameter',
          parameterVarName: varName,
          parameterType: "uri | literal" // Or more specific type detection if possible
        }))
      }));
    } else {
      // User provided parameters (could be an empty array [])
      finalParameters = input.parameters;
    }

  } catch (parseError: any) {
    console.warn(`Failed to parse query during creation for potential ID ${generatedId}. Proceeding with UNKNOWN type/outputs/params. Error: ${parseError.message}`);
    // Keep defaults: UNKNOWN type, empty outputs
    // If user provided parameters, respect them even if parsing failed elsewhere
    if (input.parameters) {
        finalParameters = input.parameters;
    } else {
        finalParameters = []; // Default to empty array if detection failed and none provided
    }
  }

  // Ensure finalParameters is never null before assigning
  if (finalParameters === null) {
      finalParameters = undefined;
  }

  const newQuery: StoredQuery = {
    '@id': generatedId,
    '@type': 'StoredQuery',
    name: input.name,
    description: input.description, // Will be undefined if not provided
    query: input.query,
    queryType: queryType,
    outputVars: outputVars,
    parameters: finalParameters, // Use the determined parameters
    createdAt: now,
    updatedAt: now,
  };

  return newQuery;
}
```

**Usage in Route Handler (`src/routes/queries.ts`)**

The POST route handler becomes much simpler:

```typescript
import { createStoredQuery } from '../lib/factories'; // Import the factory

// ... inside the POST handler ...
try {
  const userInput = request.body; // Contains name, query, description?, parameters?

  // 1. Use the factory to create the complete entity object
  const queryToSave = createStoredQuery(userInput);

  // 2. Save the entity using EntityManager
  await em.saveOrUpdate(queryToSave);

  // 3. Fetch and return (optional, could return queryToSave directly if confident)
  //    Using the ID from the factory-created object
  const registerGet = new EntityRegister();
  const createdQuery = await em.get<StoredQuery>(queryToSave['@id'], registerGet);
  if (!createdQuery || !isStoredQuery(createdQuery)) {
      request.log.error(`Failed to retrieve StoredQuery ${queryToSave['@id']} after creation`);
      return reply.status(500).send({ error: 'Failed to verify StoredQuery creation' });
  }
  return reply.status(201).send(createdQuery); // Or reply.status(201).send(queryToSave);

} catch (err: unknown) {
  // Error handling...
  // Log using queryToSave?.['@id'] if available
}
```

## Benefits

*   **Centralized Logic:** All default value setting and generation logic for an entity is in one place.
*   **Reusability:** The factory can be used by any part of the system that needs to create the entity.
*   **Testability:** The factory function can be unit tested in isolation, independent of API frameworks or database interactions.
*   **Clearer Route Handlers:** API routes focus on request/response handling and orchestration, delegating entity construction to the factory.

## Considerations

*   **Dependencies:** Factories might need dependencies (like the `SparqlQueryParser`). These can be instantiated within the factory or passed in (Dependency Injection).
*   **Async Operations:** If factory logic requires async operations (e.g., checking for ID uniqueness *before* saving, though less common for UUIDs), the factory function would need to be `async`.
*   **Updates:** A similar pattern could be used for updates (e.g., an `updateStoredQuery` function) to handle recalculating derived fields or updating the `updatedAt` timestamp, taking the existing entity and the update payload as input.
