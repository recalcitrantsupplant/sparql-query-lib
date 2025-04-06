import { StoredQuery, QueryParameterGroup, QueryParameter, Library, Backend, DateTime, Text, URL, IdReference, QueryGroup, QueryNode, QueryEdge, NodeParameterMapping } from '../types/schema-dts'; // Added QueryGroup types
import { SparqlQueryParser } from './parser'; // Correct path relative to src/lib/
import { v4 as uuidv4 } from 'uuid';
import { logger, SeverityNumber } from './logger'; // Import centralized logger and SeverityNumber

const QUERY_NAMESPACE = 'urn:sparql-query-lib:query:';
const LIBRARY_NAMESPACE = 'urn:sparql-query-lib:library:';
const BACKEND_NAMESPACE = 'urn:sparql-query-lib:backend:';
const QUERY_GROUP_NAMESPACE = 'urn:sparql-query-lib:querygroup:'; // Namespace for QueryGroups

const parser = new SparqlQueryParser();

// Input type mirroring the expected body from createStoredQuerySchema
// (now including libraryId, queryGroupId, and optional @id)
export interface CreateStoredQueryInput { // Export the interface
  '@id'?: string; // Optional ID
  name: string;
  query: string;
  libraryId: string; // Required URI string
  queryGroupId?: string; // Optional URI string
  description?: string;
  parameters?: QueryParameterGroup[] | null; // Allow explicit null for auto-detect request
  defaultBackend?: string | null; // Added optional defaultBackend
}

export function createStoredQuery(input: CreateStoredQueryInput): StoredQuery {
  // Use provided ID if available, otherwise generate one
  const id = input['@id'] ?? `${QUERY_NAMESPACE}${uuidv4()}`;
  const now = new Date().toISOString();

  // Construct the isPartOf array
  const isPartOf: IdReference[] = [{ '@id': input.libraryId }]; // Always include library
  if (input.queryGroupId) {
    isPartOf.push({ '@id': input.queryGroupId }); // Add query group if provided
  }

  let queryType: StoredQuery['queryType'] = 'UNKNOWN';
  let outputVars: string[] = [];
  let finalParameters: QueryParameterGroup[] | undefined = undefined; // Initialize as undefined
  let limitParams: string[] = []; // Initialize limit parameters
  let offsetParams: string[] = []; // Initialize offset parameters

  try {
    // Ensure the query is a string before parsing
    if (typeof input.query !== 'string') {
        throw new Error('Query input must be a string.');
    }

    const parsedQuery = parser.parseQuery(input.query);
    // Determine query type based on parsed structure
    if (parsedQuery.type === 'update') {
        queryType = 'UPDATE'; // Correctly identify UPDATE, INSERT, DELETE etc.
    } else if (parsedQuery.type === 'query' && parsedQuery.queryType) {
        // For SELECT, CONSTRUCT, ASK, DESCRIBE
        queryType = parsedQuery.queryType.toUpperCase() as StoredQuery['queryType'];
    } else {
        // Fallback for unexpected structures
        queryType = 'UNKNOWN';
        logger.emit({ severityNumber: SeverityNumber.WARN, body: `Could not determine specific query type from parsed object structure during creation.`, attributes: { id, parsedType: parsedQuery.type } });
    }
    logger.emit({ severityNumber: SeverityNumber.DEBUG, body: `Attempting to detect outputs for query`, attributes: { query: input.query } });
    outputVars = parser.detectQueryOutputs(input.query);
    // Note: OTEL attributes typically expect primitive types or arrays of primitives. Stringifying complex objects.
    logger.emit({ severityNumber: SeverityNumber.DEBUG, body: `Detected outputVars`, attributes: { outputVars: JSON.stringify(outputVars) } });

    // Handle parameters: Use provided if not null/undefined, otherwise detect.
    if (input.parameters === null || input.parameters === undefined) {
      const detectedParams = parser.detectParameters(input.query); // Capture full result
      // Map detected VALUES parameters to the expected schema structure
      finalParameters = detectedParams.valuesParameters.map((groupVarNames): QueryParameterGroup => ({
        '@type': 'QueryParameterGroup',
        // 'vars' should be an array of QueryParameter objects according to schema-dts
        vars: groupVarNames.map((varName): QueryParameter => ({ // Use map directly for simpler array creation
            '@type': 'QueryParameter',
            paramName: varName, // Renamed from parameterVarName
            // Assuming default allowed types for detected parameters
            // This might need refinement based on schema-dts or ontology specifics
            allowedTypes: ["uri", "literal"] // Renamed from parameterType
        }))
      }));
      // Assign detected limit/offset parameters
      limitParams = detectedParams.limitParameters;
      offsetParams = detectedParams.offsetParameters;
    } else {
      // User provided parameters (could be an empty array [])
      finalParameters = input.parameters;
      // If user provides parameters, we don't auto-detect limit/offset. Keep them empty.
      limitParams = [];
      offsetParams = [];
    }

  } catch (parseError: any) {
    // Log warning instead of throwing, allowing entity creation with defaults
    // Use the actual 'id' being used for the entity in the log attributes
    logger.emit({ severityNumber: SeverityNumber.WARN, body: `Failed to parse query during creation. Proceeding with UNKNOWN type/outputs/params.`, attributes: { id, error: parseError.message } });
    // Keep defaults: UNKNOWN type, empty outputs
    queryType = 'UNKNOWN';
    outputVars = []; // Resetting outputVars here is the likely cause of the validation error
    // If user provided parameters, respect them even if parsing failed elsewhere
    if (input.parameters && input.parameters !== null) { // Check not null explicitly
        finalParameters = input.parameters;
    } else {
        finalParameters = []; // Default to empty array if detection failed and none provided/null
    }
    // Ensure limit/offset params are empty arrays if parsing failed
    limitParams = [];
    offsetParams = [];
  }

  // Ensure finalParameters is never null before assigning to the StoredQuery object
  // The StoredQuery type likely expects QueryParameterGroup[] | undefined
  if (finalParameters === null) {
      finalParameters = undefined;
  }

  const newQuery: StoredQuery = {
    '@id': id, // Use the determined ID
    '@type': 'StoredQuery',
    name: input.name,
    // Only include description if it's provided and not null/empty string? Or allow empty? Assuming allow.
    description: input.description, // Will be undefined if not provided
    query: input.query, // Assume input.query is always a string due to schema/check
    queryType: queryType,
    outputVars: outputVars,
    parameters: finalParameters, // Use the determined parameters (undefined or array)
    // Assign the detected limit/offset parameters
    hasLimitParameter: limitParams.length > 0 ? limitParams : undefined,
    hasOffsetParameter: offsetParams.length > 0 ? offsetParams : undefined,
    'http://schema.org/isPartOf': isPartOf, // Add the constructed array
    'http://schema.org/dateCreated': now,
    'http://schema.org/dateModified': now,
    // Assign string if truthy, otherwise undefined to satisfy SchemaValue type
    defaultBackend: input.defaultBackend ? input.defaultBackend : undefined,
  };

  // Validate the final object against the type definition if possible/needed,
  // though TypeScript should handle most structural issues.

  return newQuery;
}

// --- Library Factory ---

// Define an extended type that includes the timestamps we add, using schema.org properties
type LibraryWithTimestamps = Library & {
    'http://schema.org/dateCreated': DateTime;
    'http://schema.org/dateModified': DateTime;
};

// Input type matching the validated request body (createLibraryBodySchema), plus optional @id
export interface CreateLibraryInput { // Export the interface
    '@id'?: string; // Optional ID
  name: string; // Expect plain string from validated input
  description?: string; // Expect plain string from validated input
  defaultBackend?: string | null; // Added optional defaultBackend
  // queries are likely managed via separate add/remove operations, not at creation
}

export function createLibrary(input: CreateLibraryInput): LibraryWithTimestamps {
    // Use provided ID if available, otherwise generate one
    const id = input['@id'] ?? `${LIBRARY_NAMESPACE}${uuidv4()}`;
    const now = new Date().toISOString();

    const newLibrary: LibraryWithTimestamps = {
        '@id': id, // Use the determined ID
    '@type': 'Library',
    name: input.name,
    description: input.description, // undefined if not provided
    // Assign string if truthy, otherwise undefined to satisfy SchemaValue type
    defaultBackend: input.defaultBackend ? input.defaultBackend : undefined,
    // queries: [], // Removed as 'queries' is not defined on the Library type in schema-dts.ts
    'http://schema.org/dateCreated': now,
    'http://schema.org/dateModified': now,
  };

    return newLibrary;
}

// --- Backend Factory ---

// Define an extended type that includes the timestamps we add, using schema.org properties
type BackendWithTimestamps = Backend & {
    'http://schema.org/dateCreated': DateTime;
    'http://schema.org/dateModified': DateTime;
};

// Input type matching the validated request body (createBackendBodySchema), plus optional @id
export interface CreateBackendInput { // Export the interface
    '@id'?: string; // Optional ID
    name: string; // Expect plain string
    description?: string; // Expect plain string
    backendType: string; // Expect plain string (e.g., 'Oxigraph', 'HttpSparqlEndpoint')
    endpoint?: string; // Expect plain string (URL format validated by schema)
    username?: string; // Expect plain string
    password?: string; // Expect plain string
}

export function createBackend(input: CreateBackendInput): BackendWithTimestamps {
    // Use provided ID if available, otherwise generate one
    const id = input['@id'] ?? `${BACKEND_NAMESPACE}${uuidv4()}`;
    const now = new Date().toISOString();

    // Basic validation or defaulting could happen here if needed
    // e.g., ensure endpoint is present if type is HttpSparqlEndpoint

    const newBackend: BackendWithTimestamps = {
        '@id': id, // Use the determined ID
        '@type': 'Backend',
        name: input.name,
        description: input.description,
        backendType: input.backendType,
        endpoint: input.endpoint,
        username: input.username,
        password: input.password, // Consider security implications of storing passwords directly
        'http://schema.org/dateCreated': now,
        'http://schema.org/dateModified': now,
    };

    return newBackend;
}

// --- QueryGroup Factory ---

// Define an extended type that includes the timestamps we add
type QueryGroupWithTimestamps = QueryGroup & {
    'http://schema.org/dateCreated': DateTime;
    'http://schema.org/dateModified': DateTime;
};

// Input type matching the validated request body (queryGroupSchema, minus generated fields)
// Note: We expect the schema validation to ensure nodes/edges are present if required by logic,
// but the factory itself doesn't enforce deep structure beyond types.
export interface CreateQueryGroupInput { // Export the interface
    '@id'?: string; // Optional ID
    name: string; // Use plain string
    description?: string; // Use plain string
    nodes?: QueryNode[];
    edges?: QueryEdge[];
    startNodeIds?: string[]; // Added startNodeIds
    // libraryId is needed to link the group
    libraryId: string; // Required URI string
}

export function createQueryGroup(input: CreateQueryGroupInput): QueryGroupWithTimestamps {
    // Use provided ID if available, otherwise generate one
    const id = input['@id'] ?? `${QUERY_GROUP_NAMESPACE}${uuidv4()}`;
    const now = new Date().toISOString();

    // Construct the isPartOf array - QueryGroups belong to a Library
    const isPartOf: IdReference[] = [{ '@id': input.libraryId }];

    const newQueryGroup: QueryGroupWithTimestamps = {
        '@id': id,
        '@type': 'QueryGroup',
        name: input.name,
        description: input.description, // undefined if not provided
        nodes: input.nodes ?? [], // Default to empty array if not provided
        edges: input.edges ?? [], // Default to empty array if not provided
        startNodeIds: input.startNodeIds, // Pass through startNodeIds
        'http://schema.org/isPartOf': isPartOf,
        'http://schema.org/dateCreated': now,
        'http://schema.org/dateModified': now,
    };

    return newQueryGroup;
}
