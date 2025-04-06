import { FastifySchema } from 'fastify';

// --- Common Schemas ---

export const paramsSchema = {
  $id: 'paramsSchema', // Added $id for potential referencing
  type: 'object',
  properties: {
    id: { type: 'string' }, // Assuming ID is URL-encoded IRI or just the suffix
  },
  required: ['id'],
} as const;

export const errorMessageSchema = {
  $id: 'errorMessage',
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
  required: ['error'],
} as const;

// --- Backend Schemas (from src/routes/backends.ts) ---

export const backendSchema = {
  $id: 'backend',
  type: 'object',
  properties: {
    '@id': { type: 'string', format: 'uri' },
    '@type': { type: 'string', const: 'Backend' },
    name: { type: 'string' },
    description: { type: 'string' },
    endpoint: { type: 'string', format: 'uri' },
    backendType: { type: 'string', enum: ['HTTP', 'OxigraphMemory'] },
    'http://schema.org/dateCreated': { type: 'string', format: 'date-time', readOnly: true },
    'http://schema.org/dateModified': { type: 'string', format: 'date-time', readOnly: true },
  },
  required: ['@id', '@type', 'name', 'endpoint', 'backendType', 'http://schema.org/dateCreated', 'http://schema.org/dateModified'],
} as const;

export const updateBackendBodySchema = {
  $id: 'updateBackendBody', // Added $id
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    endpoint: { type: 'string', format: 'uri' },
    backendType: { type: 'string', enum: ['HTTP', 'OxigraphMemory'] },
    username: { type: 'string' }, // Optional username
    password: { type: 'string' }  // Optional password
  },
  additionalProperties: false,
  minProperties: 1 // Require at least one field for update
} as const;

// Schema for the body when creating a Backend
// Schema for the body when creating a Backend (using explicit types)
export const createBackendBodySchema = {
  $id: 'createBackendBody',
  type: 'object',
  properties: {
    '@id': { type: 'string', format: 'uri', description: 'Optional: Provide a specific @id for the new backend.' },
    name: { type: 'string' },
    description: { type: 'string' },
    endpoint: { type: 'string', format: 'uri' }, // Keep format for validation hint
    backendType: { type: 'string', enum: ['HTTP', 'OxigraphMemory'] }, // Keep enum for validation
    username: { type: 'string' }, // Optional username
    password: { type: 'string' }  // Optional password
  },
  required: ['name', 'backendType'], // Endpoint might be optional depending on type
  additionalProperties: false,
} as const;


export const getBackendsSchema: FastifySchema = {
  description: 'Get all Backends',
  tags: ['Backend'],
  response: {
    200: {
      type: 'array',
      items: { $ref: 'backend' }, // Reference by $id
    },
  },
};

// --- Query Utility Schemas ---

// Schema for the body of detect-parameters and detect-outputs requests
export const detectQueryBodySchema = {
  $id: 'detectQueryBody',
  type: 'object',
  properties: {
    query: { type: 'string', description: 'The SPARQL query string to analyze.' },
  },
  required: ['query'],
  additionalProperties: false,
} as const;

// Schema for the response of detect-parameters (includes VALUES, LIMIT, OFFSET params)
export const detectParametersResponseSchema = {
  $id: 'detectParametersResponse',
  type: 'object',
  description: 'Detected parameters including VALUES groups, LIMIT placeholders, and OFFSET placeholders.',
  properties: {
    valuesParameters: {
      type: 'array',
      description: 'An array of parameter groups (from VALUES clauses), where each group is an array of variable names.',
      items: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    limitParameters: {
      type: 'array',
      description: 'An array of detected LIMIT parameter placeholder names (e.g., "limitParam" from "LIMIT 000limitParam").',
      items: { type: 'string' },
    },
    offsetParameters: {
      type: 'array',
      description: 'An array of detected OFFSET parameter placeholder names (e.g., "offsetParam" from "OFFSET 000offsetParam").',
      items: { type: 'string' },
    },
  },
  required: ['valuesParameters', 'limitParameters', 'offsetParameters'],
} as const;

// Route schema for POST /queries/detect-parameters
export const detectParametersSchema: FastifySchema = {
  description: 'Detect parameter groups (variables marked with UNDEF in VALUES clauses) in a SPARQL query.',
  tags: ['Query', 'Utility'],
  body: { $ref: 'detectQueryBody' },
  response: {
    200: { $ref: 'detectParametersResponse' }, // Use the specific schema for string[][]
    400: { $ref: 'errorMessage' }, // For parsing errors or invalid input
    500: { $ref: 'errorMessage' },
  },
};

// Route schema for POST /queries/detect-outputs
export const detectOutputsSchema: FastifySchema = {
  description: 'Detect output variables or aliased expressions in a SELECT query.',
  tags: ['Query', 'Utility'],
  body: { $ref: 'detectQueryBody' },
  response: {
    // Reuse the definition of outputVars from storedQuerySchema
    200: { $ref: 'storedQuery#/properties/outputVars' },
    400: { $ref: 'errorMessage' }, // For parsing errors or invalid input
    500: { $ref: 'errorMessage' },
  },
};


// --- QueryGroup Schemas (from src/routes/queryGroups.ts) ---
export const getBackendSchema: FastifySchema = {
  description: 'Get a specific Backend by ID',
  tags: ['Backend'],
  params: { $ref: 'paramsSchema' }, // Reference by $id
  response: {
    200: { $ref: 'backend' }, // Reference by $id
    404: { $ref: 'errorMessage' },
  },
};

export const createBackendSchema: FastifySchema = {
  description: 'Create a new Backend. Server generates @id, @type, createdAt, updatedAt.',
  tags: ['Backend'],
  body: { $ref: 'createBackendBody' }, // Use the specific create body schema
  response: {
    201: { $ref: 'backend' }, // Response uses the full backend schema
    400: { $ref: 'errorMessage' },
    409: { $ref: 'errorMessage' },
  },
};

export const updateBackendSchema: FastifySchema = {
  description: 'Update an existing Backend',
  tags: ['Backend'],
  params: { $ref: 'paramsSchema' }, // Reference by $id
  body: { $ref: 'updateBackendBody' }, // Reference by $id
  response: {
    200: { $ref: 'backend' }, // Reference by $id
    404: { $ref: 'errorMessage' },
    400: { $ref: 'errorMessage' },
  },
};

export const deleteBackendSchema: FastifySchema = {
  description: 'Delete a Backend by ID',
  tags: ['Backend'],
  params: { $ref: 'paramsSchema' }, // Reference by $id
  response: {
    204: { type: 'null' },
    404: { $ref: 'errorMessage' },
  },
};

// --- Execution Schemas (from src/routes/execute.ts) ---

export const argumentValueSchema = {
    $id: 'argumentValueSchema',
    type: 'object',
    properties: {
        type: { type: 'string', enum: ['uri', 'literal'] },
        value: { type: 'string' },
        datatype: { type: 'string', format: 'uri' },
        'xml:lang': { type: 'string' }
    },
    required: ['type', 'value']
} as const;

export const argumentRowSchema = {
    $id: 'argumentRowSchema',
    type: 'object',
    additionalProperties: { $ref: 'argumentValueSchema' }
} as const;

export const argumentSetSchema = {
  $id: 'argumentSetSchema',
  type: 'object',
  properties: {
    head: {
      type: 'object',
      properties: {
        vars: { type: 'array', items: { type: 'string' } }
      },
      required: ['vars']
    },
    arguments: {
      type: 'array',
      items: { $ref: 'argumentRowSchema' }
    }
  },
  required: ['head', 'arguments']
} as const;

export const executeRequestBodySchema = {
  $id: 'executeRequest',
  type: 'object',
  properties: {
    targetId: {
      description: 'The @id of the StoredQuery or QueryGroup to execute.',
      type: 'string',
      format: 'uri'
    },
    backendId: {
      description: 'The @id of the Backend to execute against.',
      type: 'string',
      format: 'uri'
    },
    arguments: {
      description: 'Optional runtime arguments for query parameters, as an array of argument sets.',
      type: 'array',
      items: { $ref: 'argumentSetSchema' }
    }
  },
  required: ['targetId', 'backendId'], // backendId is required again
} as const;

export const executeQuerySchema: FastifySchema = {
  description: 'Execute a StoredQuery (or QueryGroup - future) against a Backend.',
  tags: ['Execution'],
  body: { $ref: 'executeRequest' }, // Reference by $id
  response: {
    200: {
      description: 'SPARQL Query Results (JSON format)',
      type: 'object',
      additionalProperties: true
    },
    400: { $ref: 'errorMessage' },
    404: { $ref: 'errorMessage' },
    500: { $ref: 'errorMessage' },
    501: { $ref: 'errorMessage' },
    502: { $ref: 'errorMessage' },
  },
};

// --- Library Schemas (from src/routes/libraries.ts) ---

export const librarySchema = {
  $id: 'library',
  type: 'object',
  properties: {
    '@id': { type: 'string', format: 'uri' },
    '@type': { type: 'string', const: 'Library' },
    name: { type: 'string' },
    description: { type: 'string' },
    // queries property removed
    'http://schema.org/dateCreated': { type: 'string', format: 'date-time', readOnly: true },
    'http://schema.org/dateModified': { type: 'string', format: 'date-time', readOnly: true },
    defaultBackend: { type: 'string', format: 'uri', nullable: true, description: 'Optional @id of the default Backend for this library.' }, // Added optional defaultBackend
  },
  // defaultBackend is optional, so not added to required list
  required: ['@id', '@type', 'name', 'http://schema.org/dateCreated', 'http://schema.org/dateModified'],
} as const;

export const updateLibraryBodySchema = {
  $id: 'updateLibraryBody', // Added $id
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    defaultBackend: { type: 'string', format: 'uri', nullable: true, description: 'Optional: Set or change the default Backend @id (use null to remove).' }, // Added optional defaultBackend
    // queries property removed
  },
  additionalProperties: false, // Keep this false
  minProperties: 1 // Require at least one field for update
} as const;

// Schema for the body when creating a Library (user provides only name/description)
export const createLibraryBodySchema = {
  $id: 'createLibraryBody',
  type: 'object',
  properties: {
    '@id': { type: 'string', format: 'uri', description: 'Optional: Provide a specific @id for the new library.' },
    name: { $ref: 'library#/properties/name' }, // Reference name from librarySchema
    description: { $ref: 'library#/properties/description' }, // Reference description
    defaultBackend: { type: 'string', format: 'uri', nullable: true, description: 'Optional: Set the default Backend @id.' } // Added optional defaultBackend
  },
  required: ['name'], // Only name is strictly required, defaultBackend is optional
  additionalProperties: false,
} as const;


export const getLibrariesSchema: FastifySchema = {
  description: 'Get all Libraries',
  tags: ['Library'],
  response: {
    200: {
      type: 'array',
      items: { $ref: 'library' }, // Reference by $id
    },
  },
};

export const getLibrarySchema: FastifySchema = {
  description: 'Get a specific Library by ID',
  tags: ['Library'],
  params: { $ref: 'paramsSchema' }, // Reference by $id
  response: {
    200: { $ref: 'library' }, // Reference by $id
    404: { $ref: 'errorMessage' },
  },
};

export const createLibrarySchema: FastifySchema = {
  description: 'Create a new Library. Server generates @id, @type, createdAt, updatedAt.',
  tags: ['Library'],
  body: { $ref: 'createLibraryBody' }, // Use the specific create body schema
  response: {
    201: { $ref: 'library' }, // Response uses the full library schema
    400: { $ref: 'errorMessage' },
    409: { $ref: 'errorMessage' },
  },
};

export const updateLibrarySchema: FastifySchema = {
  description: 'Update an existing Library',
  tags: ['Library'],
  params: { $ref: 'paramsSchema' }, // Reference by $id
  body: { $ref: 'updateLibraryBody' }, // Reference by $id
  response: {
    200: { $ref: 'library' }, // Reference by $id
    404: { $ref: 'errorMessage' },
    400: { $ref: 'errorMessage' },
  },
};

export const deleteLibrarySchema: FastifySchema = {
  description: 'Delete a Library by ID',
  tags: ['Library'],
  params: { $ref: 'paramsSchema' }, // Reference by $id
  response: {
    204: { type: 'null' },
    404: { $ref: 'errorMessage' },
  },
};

// --- Query Schemas (from src/routes/queries.ts) ---

// Schema for individual parameter definition within a group
// Aligned with schema-dts QueryParameter type and factory output
export const queryParameterSchema = {
  $id: 'queryParameter',
  type: 'object',
  properties: {
    '@type': { type: 'string', const: 'QueryParameter' },
    paramName: { type: 'string' }, // The variable name (e.g., "s") - Renamed from parameterVarName
    allowedTypes: { // Renamed from parameterType
      type: 'array',
      items: { type: 'string', enum: ['uri', 'literal'] } // Allowed types
    }
  },
  required: ['@type', 'paramName', 'allowedTypes'] // Updated required fields
} as const;

// Schema for a group of parameters (corresponding to one VALUES clause)
// Aligned with schema-dts QueryParameterGroup type and factory output
export const queryParameterGroupSchema = {
  $id: 'queryParameterGroup',
  type: 'object',
  properties: {
    '@type': { type: 'string', const: 'QueryParameterGroup' },
    vars: {
      type: 'array', // Changed from object to array
      items: { $ref: 'queryParameter' } // Array contains QueryParameter objects
    }
  },
  required: ['@type', 'vars'] // Both fields are required
} as const;


// Base schema for StoredQuery properties (used for creation and response)
export const storedQueryProperties = {
  '@id': { type: 'string', format: 'uri' },
  '@type': { type: 'string', const: 'StoredQuery' },
  name: { type: 'string' }, // Can be set/updated
  description: { type: 'string' }, // Can be set/updated
  query: { type: 'string' }, // Can be set/updated
  // Server-generated or managed fields
  queryType: { type: 'string', enum: ['SELECT', 'CONSTRUCT', 'ASK', 'UPDATE', 'DESCRIBE', 'UNKNOWN'], readOnly: true },
  outputVars: { type: 'array', items: { type: 'string' }, readOnly: true },
  parameters: { // Can be set/updated (or auto-detected)
    type: 'array',
    items: { $ref: 'queryParameterGroup' },
    nullable: true
  },
  hasLimitParameter: { // Added for LIMIT 000N detection
    type: 'array',
    items: { type: 'string' },
    nullable: true,
    readOnly: true,
    description: 'Detected LIMIT parameter placeholders (e.g., "LIMIT 00010").'
  },
  hasOffsetParameter: { // Added for OFFSET 000N detection
    type: 'array',
    items: { type: 'string' },
    nullable: true,
    readOnly: true,
    description: 'Detected OFFSET parameter placeholders (e.g., "OFFSET 0005").'
  },
  defaultBackend: { type: 'string', format: 'uri', nullable: true, description: 'Optional @id of the default Backend for this query.' }, // Added optional defaultBackend
  'http://schema.org/isPartOf': { // Managed by factory/update logic
    type: 'array',
    items: { $ref: 'idReference' },
    minItems: 1, // Must have at least the library link
    readOnly: true
  },
  'http://schema.org/dateCreated': { type: 'string', format: 'date-time', readOnly: true },
  'http://schema.org/dateModified': { type: 'string', format: 'date-time', readOnly: true },
} as const;

export const createStoredQuerySchema = {
  $id: 'createStoredQuery',
  type: 'object',
  properties: {
    // User provides these:
    '@id': { type: 'string', format: 'uri', description: 'Optional: Provide a specific @id for the new query.' },
    name: storedQueryProperties.name,
    description: storedQueryProperties.description,
    query: storedQueryProperties.query,
    libraryId: { type: 'string', format: 'uri', description: 'The @id of the Library this query belongs to.' },
    queryGroupId: { type: 'string', format: 'uri', description: 'Optional @id of the QueryGroup this query also belongs to.' },
    parameters: storedQueryProperties.parameters, // Optional input for parameters
    defaultBackend: { type: 'string', format: 'uri', nullable: true, description: 'Optional: Set the default Backend @id.' } // Added optional defaultBackend
  },
  // @id, @type, isPartOf, queryType, outputVars, timestamps, defaultBackend generated by server/factory or optional
  required: ['name', 'query', 'libraryId'],
  additionalProperties: false,
} as const;

// Schema representing the full StoredQuery entity (used in responses)
export const storedQuerySchema = {
  $id: 'storedQuery',
  type: 'object',
  properties: storedQueryProperties,
  required: [
    '@id',
    '@type',
    'name',
    'query',
    'queryType',
    // 'outputVars', // Removed from base required list
    'http://schema.org/isPartOf',
    'http://schema.org/dateCreated',
    'http://schema.org/dateModified'
    // Parameters and defaultBackend are optional/nullable
  ],
  allOf: [ // Add conditional requirement for outputVars
    {
      if: {
        properties: { queryType: { const: 'SELECT' } }
      },
      then: {
        required: ['outputVars']
      }
    }
  ]
} as const;


// Schema for the body when updating a StoredQuery (subset of fields allowed)
export const updateQueryBodySchema = {
  $id: 'updateQueryBody',
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    query: { type: 'string' },
    libraryId: { type: 'string', format: 'uri', description: 'Optional: Change the Library this query belongs to.' }, // Logic prevents removal
    queryGroupId: { type: 'string', format: 'uri', nullable: true, description: 'Optional: Change or remove the QueryGroup link (use null to remove).' },
    parameters: storedQueryProperties.parameters, // Keep reference for parameters
    defaultBackend: { type: 'string', format: 'uri', nullable: true, description: 'Optional: Set or change the default Backend @id (use null to remove).' }, // Added optional defaultBackend
  },
  additionalProperties: false, // Disallow updating server-generated fields directly
  minProperties: 1 // Must provide at least one field to update
} as const;

// Route schemas using the updated base/body/response schemas

export const getQueriesSchema: FastifySchema = {
  description: 'Get all StoredQueries, optionally filtered by libraryId',
  tags: ['Query'],
  querystring: { // Add querystring definition
    type: 'object',
    properties: {
      libraryId: {
        type: 'string',
        format: 'uri',
        description: 'Optional: Filter queries belonging to this Library @id.'
      }
    },
    additionalProperties: false
  },
  response: {
    200: {
      type: 'array',
      items: { $ref: 'storedQuery' }, // Response uses the full schema
    },
    500: { $ref: 'errorMessage' },
  },
};

export const getQuerySchema: FastifySchema = {
  description: 'Get a specific StoredQuery by ID',
  tags: ['Query'],
  params: { $ref: 'paramsSchema' },
  response: {
    200: { $ref: 'storedQuery' }, // Response uses the full schema
    404: { $ref: 'errorMessage' },
    500: { $ref: 'errorMessage' },
  },
};

export const createQuerySchema: FastifySchema = {
  description: 'Create a new StoredQuery. Server generates queryType, outputVars, parameters (if not provided), createdAt, updatedAt.',
  tags: ['Query'],
  body: { $ref: 'createStoredQuery' }, // Use the specific create schema for the body
  response: {
    201: { $ref: 'storedQuery' }, // Response uses the full schema
    400: { $ref: 'errorMessage' },
    409: { $ref: 'errorMessage' },
    500: { $ref: 'errorMessage' },
  },
};

export const updateQuerySchema: FastifySchema = {
  description: 'Update an existing StoredQuery. Server recalculates queryType, outputVars, and parameters (if query changes and parameters not provided). Updates updatedAt.',
  tags: ['Query'],
  params: { $ref: 'paramsSchema' },
  body: { $ref: 'updateQueryBody' }, // Reference the body schema by $id
  response: {
    200: { $ref: 'storedQuery' }, // Response uses the full schema
    404: { $ref: 'errorMessage' },
    400: { $ref: 'errorMessage' },
    500: { $ref: 'errorMessage' },
  },
};

export const deleteQuerySchema: FastifySchema = {
  description: 'Delete a StoredQuery by ID',
  tags: ['Query'],
  params: { $ref: 'paramsSchema' },
  response: {
    204: { type: 'null' },
    // 404 is handled implicitly by DELETE idempotency (no error if not found)
    500: { $ref: 'errorMessage' },
  },
};


// --- QueryGroup Schemas (from src/routes/queryGroups.ts) ---

export const idReferenceSchema = {
  $id: 'idReference', // Added $id
  type: 'object',
  properties: {
    '@id': { type: 'string', format: 'uri' },
  },
  required: ['@id'],
} as const;

export const nodeParameterMappingSchema = {
  $id: 'nodeParameterMapping',
  type: 'object',
  properties: {
    '@id': { type: 'string', format: 'uri' },
    '@type': { type: 'string', const: 'NodeParameterMapping' },
    parameterName: { type: 'string' },
    parameterValue: { type: 'string' },
  },
  required: ['@type', 'parameterName', 'parameterValue'],
} as const;

export const queryNodeSchema = {
  $id: 'queryNode',
  type: 'object',
  properties: {
    '@id': { type: 'string', format: 'uri' },
    '@type': { type: 'string', const: 'QueryNode' },
    queryId: { type: 'string', format: 'uri' },
    backendId: { type: 'string', format: 'uri' },
    parameterMappings: {
      type: 'array',
      items: { $ref: 'nodeParameterMapping' }, // Reference by $id
    },
  },
  required: ['@id', '@type', 'queryId'],
} as const;

export const parameterMappingSchema = {
  $id: 'parameterMapping',
  type: 'object',
  properties: {
    '@id': { type: 'string', format: 'uri' },
    '@type': { type: 'string', const: 'ParameterMapping' },
    fromParam: { type: 'string' },
    toParam: { type: 'string' },
  },
  required: ['@type', 'fromParam', 'toParam'],
} as const;

export const queryEdgeSchema = {
  $id: 'queryEdge',
  type: 'object',
  properties: {
    '@id': { type: 'string', format: 'uri' },
    '@type': { type: 'string', const: 'QueryEdge' },
    fromNodeId: { type: 'string', format: 'uri' },
    toNodeId: { type: 'string', format: 'uri' },
    mappings: {
      type: 'array',
      items: { $ref: 'parameterMapping' }, // Reference by $id
    },
  },
  required: ['@type', 'fromNodeId', 'toNodeId', 'mappings'],
} as const;

export const queryGroupSchema = {
  $id: 'queryGroup',
  type: 'object',
  properties: {
    '@id': { type: 'string', format: 'uri' },
    '@type': { type: 'string', const: 'QueryGroup' },
    name: { type: 'string' },
    description: { type: 'string' },
    nodes: {
      type: 'array',
      items: { $ref: 'queryNode' }, // Reference by $id
    },
    edges: {
      type: 'array',
      items: { $ref: 'queryEdge' }, // Reference by $id
    },
    startNodeIds: {
        type: 'array',
        items: { type: 'string', format: 'uri' }
    },
    endNodeIds: {
        type: 'array',
        items: { type: 'string', format: 'uri' }
    },
    'http://schema.org/isPartOf': { // Added missing property
      type: 'array',
      items: { $ref: 'idReference' },
      minItems: 1, // Must belong to at least a library
      readOnly: true // Managed by factory/update logic
    },
    'http://schema.org/dateCreated': { type: 'string', format: 'date-time', readOnly: true },
    'http://schema.org/dateModified': { type: 'string', format: 'date-time', readOnly: true },
  },
  // Added isPartOf to required list as it's always added by the factory
  required: ['@id', '@type', 'name', 'http://schema.org/isPartOf', 'http://schema.org/dateCreated', 'http://schema.org/dateModified'],
} as const;

// Schema for the body when creating a QueryGroup (user provides fields)
export const createQueryGroupBodySchema = {
  $id: 'createQueryGroupBody',
  type: 'object',
  properties: {
    // User provides these, server generates @id, @type
    name: queryGroupSchema.properties.name,
    description: queryGroupSchema.properties.description,
    nodes: queryGroupSchema.properties.nodes,
    edges: queryGroupSchema.properties.edges,
    startNodeIds: queryGroupSchema.properties.startNodeIds,
    endNodeIds: queryGroupSchema.properties.endNodeIds,
    libraryId: { type: 'string', format: 'uri', description: 'The @id of the Library this QueryGroup belongs to.' }, // Added libraryId
  },
  required: ['name', 'libraryId'], // Added libraryId to required
  additionalProperties: false,
} as const;

// Schema for the body when updating a QueryGroup (subset of fields allowed)
export const updateQueryGroupBodySchema = {
  $id: 'updateQueryGroupBody',
  type: 'object',
  properties: {
    // User can update these:
    name: queryGroupSchema.properties.name,
    description: queryGroupSchema.properties.description,
    nodes: queryGroupSchema.properties.nodes,
    edges: queryGroupSchema.properties.edges,
    startNodeIds: queryGroupSchema.properties.startNodeIds,
    endNodeIds: queryGroupSchema.properties.endNodeIds,
  },
  additionalProperties: false, // Disallow updating server-generated fields directly
  minProperties: 1 // Must provide at least one field to update
} as const;


// --- NEW Schemas for QueryGroup Nodes & Edges ---

// Params for routes involving nodes or edges within a query group
// Note: Fastify handles URI decoding automatically for params
export const queryGroupNodeEdgeParamsSchema = {
  $id: 'queryGroupNodeEdgeParams',
  type: 'object',
  properties: {
    id: { type: 'string', description: 'The @id of the QueryGroup' },
    nodeId: { type: 'string', description: 'The @id suffix of the QueryNode' },
    edgeId: { type: 'string', description: 'The @id suffix of the QueryEdge' },
  },
  // Required properties will be specified per-route schema
} as const;

// Re-use existing nodeParameterMappingSchema ($id: 'nodeParameterMapping')
// Re-use existing parameterMappingSchema ($id: 'parameterMapping')

// Body for creating a QueryNode (server generates @id, @type)
export const createQueryNodeBodySchema = {
  $id: 'createQueryNodeBody',
  type: 'object',
  properties: {
    queryId: { type: 'string', format: 'uri', description: 'The @id of the StoredQuery for this node.' },
    backendId: { type: 'string', format: 'uri', description: 'Optional: The @id of the Backend to use for this node (overrides library/query default).' },
    parameterMappings: {
      type: 'array',
      items: { $ref: 'nodeParameterMapping' }, // Reference existing schema
      description: 'Optional: Mappings for query parameters.',
    },
    // @id and @type are generated by the server
  },
  required: ['queryId'], // Only queryId is strictly required
  additionalProperties: false,
} as const;

// Body for updating a QueryNode (all fields optional, min 1)
export const updateQueryNodeBodySchema = {
  $id: 'updateQueryNodeBody',
  type: 'object',
  properties: {
    queryId: { type: 'string', format: 'uri' },
    backendId: { type: 'string', format: 'uri' }, // Removed nullable: true
    parameterMappings: {
      type: 'array',
      items: { $ref: 'nodeParameterMapping' },
    },
  },
  minProperties: 1, // Require at least one field
  additionalProperties: false,
} as const;

// Body for creating a QueryEdge (server generates @id, @type)
export const createQueryEdgeBodySchema = {
  $id: 'createQueryEdgeBody',
  type: 'object',
  properties: {
    fromNodeId: { type: 'string', format: 'uri', description: 'The @id of the source QueryNode.' },
    toNodeId: { type: 'string', format: 'uri', description: 'The @id of the target QueryNode.' },
    mappings: {
      type: 'array',
      items: { $ref: 'parameterMapping' }, // Reference existing schema
      description: 'Mappings between output parameters of the source node and input parameters of the target node.',
      // minItems: 1 // An edge should probably have at least one mapping? Or can it be empty? Let's assume minItems: 0 for now.
    },
    // @id and @type are generated by the server
  },
  required: ['fromNodeId', 'toNodeId', 'mappings'],
  additionalProperties: false,
} as const;

// Body for updating a QueryEdge (all fields optional, min 1)
export const updateQueryEdgeBodySchema = {
  $id: 'updateQueryEdgeBody',
  type: 'object',
  properties: {
    fromNodeId: { type: 'string', format: 'uri' },
    toNodeId: { type: 'string', format: 'uri' },
    mappings: {
      type: 'array',
      items: { $ref: 'parameterMapping' },
    },
  },
  minProperties: 1, // Require at least one field
  additionalProperties: false,
} as const;


// --- Route Schemas for QueryGroup Nodes & Edges ---

// POST /queryGroups/{id}/nodes
export const addQueryGroupNodeSchema: FastifySchema = {
  description: 'Add a new QueryNode to a QueryGroup.',
  tags: ['QueryGroup', 'Node'],
  params: {
    type: 'object',
    properties: { id: { $ref: 'queryGroupNodeEdgeParams#/properties/id'} }, // Reference param definition
    required: ['id'],
  },
  body: { $ref: 'createQueryNodeBody' }, // Reference by $id
  response: {
    201: { $ref: 'queryNode' }, // Return the created node (references existing queryNodeSchema)
    400: { $ref: 'errorMessage' },
    404: { $ref: 'errorMessage' }, // Group not found
  },
};

// PUT /queryGroups/{id}/nodes/{nodeId}
export const updateQueryGroupNodeSchema: FastifySchema = {
  description: 'Update an existing QueryNode within a QueryGroup.',
  tags: ['QueryGroup', 'Node'],
   params: {
    type: 'object',
    properties: {
      id: { $ref: 'queryGroupNodeEdgeParams#/properties/id'},
      nodeId: { $ref: 'queryGroupNodeEdgeParams#/properties/nodeId'}
    },
    required: ['id', 'nodeId'],
  },
  body: { $ref: 'updateQueryNodeBody' }, // Reference by $id
  response: {
    200: { $ref: 'queryNode' }, // Return the updated node
    400: { $ref: 'errorMessage' },
    404: { $ref: 'errorMessage' }, // Group or Node not found
  },
};

// DELETE /queryGroups/{id}/nodes/{nodeId}
export const deleteQueryGroupNodeSchema: FastifySchema = {
  description: 'Delete a QueryNode from a QueryGroup (also removes connected edges).',
  tags: ['QueryGroup', 'Node'],
  params: {
    type: 'object',
    properties: {
      id: { $ref: 'queryGroupNodeEdgeParams#/properties/id'},
      nodeId: { $ref: 'queryGroupNodeEdgeParams#/properties/nodeId'}
    },
    required: ['id', 'nodeId'],
  },
  response: {
    204: { type: 'null' },
    404: { $ref: 'errorMessage' }, // Group or Node not found
  },
};

// POST /queryGroups/{id}/edges
export const addQueryGroupEdgeSchema: FastifySchema = {
  description: 'Add a new QueryEdge to a QueryGroup.',
  tags: ['QueryGroup', 'Edge'],
  params: {
    type: 'object',
    properties: { id: { $ref: 'queryGroupNodeEdgeParams#/properties/id'} },
    required: ['id'],
  },
  body: { $ref: 'createQueryEdgeBody' }, // Reference by $id
  response: {
    201: { $ref: 'queryEdge' }, // Return the created edge (references existing queryEdgeSchema)
    400: { $ref: 'errorMessage' }, // Invalid body, or referenced nodes don't exist
    404: { $ref: 'errorMessage' }, // Group not found
  },
};

// PUT /queryGroups/{id}/edges/{edgeId}
export const updateQueryGroupEdgeSchema: FastifySchema = {
  description: 'Update an existing QueryEdge within a QueryGroup.',
  tags: ['QueryGroup', 'Edge'],
  params: {
    type: 'object',
    properties: {
      id: { $ref: 'queryGroupNodeEdgeParams#/properties/id'},
      edgeId: { $ref: 'queryGroupNodeEdgeParams#/properties/edgeId'}
    },
    required: ['id', 'edgeId'],
  },
  body: { $ref: 'updateQueryEdgeBody' }, // Reference by $id
  response: {
    200: { $ref: 'queryEdge' }, // Return the updated edge
    400: { $ref: 'errorMessage' }, // Invalid body, or referenced nodes don't exist
    404: { $ref: 'errorMessage' }, // Group or Edge not found
  },
};

// DELETE /queryGroups/{id}/edges/{edgeId}
export const deleteQueryGroupEdgeSchema: FastifySchema = {
  description: 'Delete a QueryEdge from a QueryGroup.',
  tags: ['QueryGroup', 'Edge'],
  params: {
    type: 'object',
    properties: {
      id: { $ref: 'queryGroupNodeEdgeParams#/properties/id'},
      edgeId: { $ref: 'queryGroupNodeEdgeParams#/properties/edgeId'}
    },
    required: ['id', 'edgeId'],
  },
  response: {
    204: { type: 'null' },
    404: { $ref: 'errorMessage' }, // Group or Edge not found
  },
};


export const getQueryGroupsSchema: FastifySchema = {
  description: 'Get all QueryGroups, optionally filtered by libraryId',
  tags: ['QueryGroup'],
  querystring: { // Add querystring definition
    type: 'object',
    properties: {
      libraryId: {
        type: 'string',
        format: 'uri',
        description: 'Optional: Filter query groups belonging to this Library @id.'
      }
    },
    additionalProperties: false
  },
  response: {
    200: {
      type: 'array',
      items: { $ref: 'queryGroup' }, // Reference by $id
    },
  },
};

export const getQueryGroupSchema: FastifySchema = {
  description: 'Get a specific QueryGroup by ID',
  tags: ['QueryGroup'],
  params: { $ref: 'paramsSchema' }, // Reference by $id
  response: {
    200: { $ref: 'queryGroup' }, // Reference by $id
    404: { $ref: 'errorMessage' },
  },
};

export const createQueryGroupSchema: FastifySchema = {
  description: 'Create a new QueryGroup. Server generates @id and @type.',
  tags: ['QueryGroup'],
  body: { $ref: 'createQueryGroupBody' }, // Use the specific create body schema
  response: {
    201: { $ref: 'queryGroup' }, // Response uses the full queryGroup schema
    400: { $ref: 'errorMessage' },
  },
};

export const updateQueryGroupSchema: FastifySchema = {
  description: 'Update an existing QueryGroup',
  tags: ['QueryGroup'],
  params: { $ref: 'paramsSchema' }, // Reference by $id
  body: { $ref: 'updateQueryGroupBody' }, // Reference the specific update body schema
  response: {
    200: { $ref: 'queryGroup' }, // Reference by $id
    404: { $ref: 'errorMessage' },
    400: { $ref: 'errorMessage' },
  },
};

export const deleteQueryGroupSchema: FastifySchema = {
  description: 'Delete a QueryGroup by ID',
  tags: ['QueryGroup'],
  params: { $ref: 'paramsSchema' }, // Reference by $id
  response: {
    204: { type: 'null' },
    404: { $ref: 'errorMessage' },
  },
};
