import Fastify, { FastifyInstance } from 'fastify'; // Import Fastify
import executeRoutes from '../../src/routes/execute'; // Import the execute routes
import * as schemas from '../../src/schemas'; // Import schemas
import { EntityManager } from '../../src/lib/EntityManager';
import { EntityRegister } from '../../src/lib/entity-register';
import { Backend, StoredQuery, Thing } from '../../src/types/schema-dts'; // Add Thing
import { HttpSparqlExecutor } from '../../src/server/HttpSparqlExecutor';
import { SparqlQueryParser } from '../../src/lib/parser'; // Import the parser
// Removed unused import of commonData

// Mock the HttpSparqlExecutor and SparqlQueryParser
jest.mock('../../src/server/HttpSparqlExecutor');
jest.mock('../../src/lib/parser'); // Mock the parser
const MockHttpSparqlExecutor = HttpSparqlExecutor as jest.MockedClass<typeof HttpSparqlExecutor>;
const MockSparqlQueryParser = SparqlQueryParser as jest.MockedClass<typeof SparqlQueryParser>;

// Helper function to build the Fastify app for testing execute routes
async function buildTestApp(entityManager: EntityManager): Promise<FastifyInstance> {
  const app = Fastify({ logger: false }); // Disable logger for tests

  // Add schemas
  for (const schema of Object.values(schemas)) {
    if (schema && typeof schema === 'object' && '$id' in schema) {
      app.addSchema(schema);
    }
  }

  // Register execute routes with the mock EntityManager
  await app.register(executeRoutes, {
    prefix: '/execute', // Match the actual prefix if defined, otherwise root '/'
    entityManager: entityManager
  });

  await app.ready();
  return app;
}


describe('POST /execute', () => {
  let app: FastifyInstance;
  let mockEntityManager: jest.Mocked<EntityManager>;

  const testQueryId = 'query:test-select';
  const testBackendId = 'backend:test-http';

  const testStoredQuery: StoredQuery = {
    '@id': testQueryId,
    '@type': 'StoredQuery',
    name: 'Test Select Query',
    query: 'SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10',
    queryType: 'SELECT',
  };

  const testHttpBackend: Backend = {
    '@id': testBackendId,
    '@type': 'Backend',
    name: 'Test HTTP Backend',
    backendType: 'HTTP',
    endpoint: 'http://example.com/sparql',
  };

  beforeEach(async () => {
    // Reset mocks before each test
    MockHttpSparqlExecutor.mockClear();
    // Mock the constructor and methods for Executor and Parser
    MockHttpSparqlExecutor.mockImplementation(() => ({
        selectQueryParsed: jest.fn(),
        constructQueryParsed: jest.fn(),
    } as unknown as HttpSparqlExecutor));
    // Mock the parser's applyArguments method
    MockSparqlQueryParser.prototype.applyArguments = jest.fn();

    // Create a mock EntityManager
    mockEntityManager = {
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
      // Add other methods required by the Mocked<EntityManager> type
      saveOrUpdate: jest.fn(),
      loadAll: jest.fn(),
      // executor is private and cannot be mocked directly
    } as unknown as jest.Mocked<EntityManager>; // Cast to unknown first

    // Setup the app instance using the local builder
    app = await buildTestApp(mockEntityManager);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should execute a SELECT query via HTTP backend successfully', async () => {
    // Arrange
    const expectedResult = { head: { vars: ['s', 'p', 'o'] }, results: { bindings: [] } };
    mockEntityManager.get
      .mockResolvedValueOnce(testStoredQuery) // First call gets the query
      .mockResolvedValueOnce(testHttpBackend); // Second call gets the backend

    // Mock the executor's select method for this test
    // Need to get the instance *after* the route handler calls the constructor
    const mockSelectFn = jest.fn().mockResolvedValue(expectedResult);
    MockHttpSparqlExecutor.mockImplementation(() => ({
        selectQueryParsed: mockSelectFn,
        constructQueryParsed: jest.fn(),
    } as unknown as HttpSparqlExecutor));


    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: testQueryId, // Revert back to the original ID for the SELECT test
        backendId: testBackendId,
      },
    });

    // Assert
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expectedResult);
    expect(mockEntityManager.get).toHaveBeenCalledTimes(2);
    expect(mockEntityManager.get).toHaveBeenCalledWith(testQueryId, expect.any(EntityRegister));
    expect(mockEntityManager.get).toHaveBeenCalledWith(testBackendId, expect.any(EntityRegister));
    expect(MockHttpSparqlExecutor).toHaveBeenCalledTimes(1); // Ensure constructor was called
    expect(mockSelectFn).toHaveBeenCalledTimes(1);
    expect(mockSelectFn).toHaveBeenCalledWith(testStoredQuery.query, {"acceptHeader": "application/sparql-results+json"});
  });

  it('should execute a CONSTRUCT query via HTTP backend successfully', async () => {
    // Arrange
    const testConstructQuery: StoredQuery = {
        ...testStoredQuery,
        '@id': 'query:test-construct',
        query: 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o } LIMIT 10',
        queryType: 'CONSTRUCT',
    };
    const expectedResult = '_:b0 <http://example.org/p> "o" .'; // Example N-Quads string
    mockEntityManager.get
      .mockResolvedValueOnce(testConstructQuery)
      .mockResolvedValueOnce(testHttpBackend);

    const mockConstructFn = jest.fn().mockResolvedValue(expectedResult);
    MockHttpSparqlExecutor.mockImplementation(() => ({
        selectQueryParsed: jest.fn(),
        constructQueryParsed: mockConstructFn,
    } as unknown as HttpSparqlExecutor));

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: testConstructQuery['@id'],
        backendId: testBackendId,
      },
    });

    // Assert
    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual(expectedResult); // CONSTRUCT returns a string
    expect(mockEntityManager.get).toHaveBeenCalledTimes(2);
    expect(mockEntityManager.get).toHaveBeenCalledWith(testConstructQuery['@id'], expect.any(EntityRegister));
    expect(mockEntityManager.get).toHaveBeenCalledWith(testBackendId, expect.any(EntityRegister));
    expect(MockHttpSparqlExecutor).toHaveBeenCalledTimes(1);
    expect(mockConstructFn).toHaveBeenCalledTimes(1);
    expect(mockConstructFn).toHaveBeenCalledWith(testConstructQuery.query, {"acceptHeader": "application/n-triples"});
  });

  it('should apply arguments to the query before execution', async () => {
    // Arrange
    const queryWithParams: StoredQuery = {
      ...testStoredQuery,
      '@id': 'query:with-params',
      query: 'SELECT ?s WHERE { ?s a <{{classUri}}> }', // Query with a parameter
    };
    // Correct args structure according to argumentSetSchema
    const args = [
      {
        head: { vars: ['classUri'] },
        arguments: [ // Array of argument rows
          { // Argument row 1
            classUri: { type: 'uri', value: 'http://example.org/MyClass' } // Correct ArgumentValue structure
          }
        ]
      }
    ];
    const expectedAppliedQuery = 'SELECT ?s WHERE { ?s a <http://example.org/MyClass> }';
    const expectedResult = { head: { vars: ['s'] }, results: { bindings: [] } };

    mockEntityManager.get
      .mockResolvedValueOnce(queryWithParams)
      .mockResolvedValueOnce(testHttpBackend);

    // Mock the parser's applyArguments to return the expected query string
    (MockSparqlQueryParser.prototype.applyArguments as jest.Mock).mockReturnValue(expectedAppliedQuery);

    // Mock the executor's select method
    const mockSelectFn = jest.fn().mockResolvedValue(expectedResult);
    MockHttpSparqlExecutor.mockImplementation(() => ({
        selectQueryParsed: mockSelectFn,
        constructQueryParsed: jest.fn(),
    } as unknown as HttpSparqlExecutor));

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: queryWithParams['@id'],
        backendId: testBackendId,
        arguments: args, // Include arguments in the payload
      },
    });

    // Assert
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expectedResult);
    expect(mockEntityManager.get).toHaveBeenCalledTimes(2);
    // Check parser was called correctly
    expect(MockSparqlQueryParser.prototype.applyArguments).toHaveBeenCalledTimes(1);
    expect(MockSparqlQueryParser.prototype.applyArguments).toHaveBeenCalledWith(queryWithParams.query, args);
    // Check executor was called with the *applied* query
    expect(mockSelectFn).toHaveBeenCalledTimes(1);
    expect(mockSelectFn).toHaveBeenCalledWith(expectedAppliedQuery, {"acceptHeader": "application/sparql-results+json"});
  });

  it('should return 400 if applying arguments fails', async () => {
    // Arrange
    const queryWithParams: StoredQuery = {
      ...testStoredQuery,
      '@id': 'query:bad-args',
      query: 'SELECT ?s WHERE { ?s a <{{classUri}}> }',
    };
    // Correct args structure for the failure test
    const args = [
      {
        head: { vars: ['classUri'] },
        arguments: [
          { classUri: { type: 'uri', value: 'http://example.org/InvalidClass' } }
        ]
      }
    ];
    const applyError = new Error('Invalid argument format');

    mockEntityManager.get
      .mockResolvedValueOnce(queryWithParams)
      .mockResolvedValueOnce(testHttpBackend);

    // Mock the parser's applyArguments to throw an error
    (MockSparqlQueryParser.prototype.applyArguments as jest.Mock).mockImplementation(() => {
      throw applyError;
    });

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: queryWithParams['@id'],
        backendId: testBackendId,
        arguments: args,
      },
    });

    // Assert
    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('error', `Failed to apply arguments: ${applyError.message}`);
    expect(mockEntityManager.get).toHaveBeenCalledTimes(2);
    expect(MockSparqlQueryParser.prototype.applyArguments).toHaveBeenCalledTimes(1);
    expect(MockSparqlQueryParser.prototype.applyArguments).toHaveBeenCalledWith(queryWithParams.query, args);
    expect(MockHttpSparqlExecutor).not.toHaveBeenCalled(); // Executor constructor should not be called if args fail
  });


  // --- Error Handling Tests ---

  it('should return 404 if target query not found', async () => {
    // Arrange
    mockEntityManager.get
      .mockResolvedValueOnce(undefined) // Query not found
      .mockResolvedValueOnce(testHttpBackend); // Backend is still fetched

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: 'query:non-existent',
        backendId: testBackendId,
      },
    });

    // Assert
    expect(response.statusCode).toBe(404);
    expect(response.json()).toHaveProperty('error', expect.stringContaining('Target entity with ID query:non-existent not found'));
    // Both target and backend are fetched before the check, so get is called twice
    expect(mockEntityManager.get).toHaveBeenCalledTimes(2);
    expect(MockHttpSparqlExecutor).not.toHaveBeenCalled();
  });

  it('should return 404 if backend not found', async () => {
    // Arrange
    mockEntityManager.get
      .mockResolvedValueOnce(testStoredQuery) // Query found
      .mockResolvedValueOnce(undefined); // Backend not found

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: testQueryId,
        backendId: 'backend:non-existent',
      },
    });

    // Assert
    expect(response.statusCode).toBe(404);
    expect(response.json()).toHaveProperty('error', expect.stringContaining('Backend with ID backend:non-existent not found'));
    expect(mockEntityManager.get).toHaveBeenCalledTimes(2);
    expect(MockHttpSparqlExecutor).not.toHaveBeenCalled();
  });

   it('should return 404 if backend is not a Backend type', async () => {
    // Arrange
    const notABackend = { '@id': testBackendId, '@type': 'StoredQuery', name: 'Wrong Type' };
    mockEntityManager.get
      .mockResolvedValueOnce(testStoredQuery)
      .mockResolvedValueOnce(notABackend as any); // Return wrong type

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: testQueryId, // Correct this test case back to using testQueryId
        backendId: testBackendId,
      },
    });

    // Assert
    expect(response.statusCode).toBe(404); // Route logic returns 404 in this specific case
    expect(response.json()).toHaveProperty('error', expect.stringContaining(`Backend with ID ${testBackendId} not found or is not a Backend.`));
    expect(mockEntityManager.get).toHaveBeenCalledTimes(2);
    expect(MockHttpSparqlExecutor).not.toHaveBeenCalled();
  });


  it('should return 400 if target entity is not executable', async () => {
    // Arrange
    const notAQuery = { '@id': testQueryId, '@type': 'Library', name: 'Not a Query' };
    mockEntityManager.get
      .mockResolvedValueOnce(notAQuery as any) // Return wrong type
      .mockResolvedValueOnce(testHttpBackend);

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: testQueryId,
        backendId: testBackendId,
      },
    });

    // Assert
    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('error', expect.stringContaining(`Target entity ${testQueryId} is not an executable type`));
    expect(mockEntityManager.get).toHaveBeenCalledTimes(2); // Both are fetched before type check
    expect(MockHttpSparqlExecutor).not.toHaveBeenCalled();
  });

  it('should return 400 if StoredQuery has no query string', async () => {
    // Arrange
    const queryWithoutString: StoredQuery = { ...testStoredQuery, query: undefined };
    mockEntityManager.get
      .mockResolvedValueOnce(queryWithoutString)
      .mockResolvedValueOnce(testHttpBackend);

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: testQueryId,
        backendId: testBackendId,
      },
    });

    // Assert
    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('error', expect.stringContaining(`StoredQuery ${testQueryId} does not contain a query string`));
    expect(mockEntityManager.get).toHaveBeenCalledTimes(2);
    expect(MockHttpSparqlExecutor).not.toHaveBeenCalled();
  });

   it('should return 400 if Backend is missing backendType', async () => {
    // Arrange
    const backendWithoutType: Backend = { ...testHttpBackend, backendType: undefined };
    mockEntityManager.get
      .mockResolvedValueOnce(testStoredQuery)
      .mockResolvedValueOnce(backendWithoutType);

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: testQueryId,
        backendId: testBackendId,
      },
    });

    // Assert
    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('error', expect.stringContaining(`Backend ${testBackendId} is missing the required 'backendType' property`));
    expect(mockEntityManager.get).toHaveBeenCalledTimes(2);
    expect(MockHttpSparqlExecutor).not.toHaveBeenCalled();
  });

   it('should return 400 if HTTP Backend is missing endpoint', async () => {
    // Arrange
    const backendWithoutEndpoint: Backend = { ...testHttpBackend, endpoint: undefined };
    mockEntityManager.get
      .mockResolvedValueOnce(testStoredQuery)
      .mockResolvedValueOnce(backendWithoutEndpoint);

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: testQueryId,
        backendId: testBackendId,
      },
    });

    // Assert
    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('error', expect.stringContaining(`HTTP Backend ${testBackendId} does not have an endpoint configured`));
    expect(mockEntityManager.get).toHaveBeenCalledTimes(2);
    expect(MockHttpSparqlExecutor).not.toHaveBeenCalled(); // Executor not instantiated
  });

  it('should return 400 for unsupported backend type', async () => {
    // Arrange
    const unsupportedBackend: Backend = { ...testHttpBackend, backendType: 'FTP' };
    mockEntityManager.get
      .mockResolvedValueOnce(testStoredQuery)
      .mockResolvedValueOnce(unsupportedBackend);

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: testQueryId,
        backendId: testBackendId,
      },
    });

    // Assert
    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('error', 'Unsupported backend type: FTP');
    expect(mockEntityManager.get).toHaveBeenCalledTimes(2);
    expect(MockHttpSparqlExecutor).not.toHaveBeenCalled(); // Executor not instantiated
  });

  it('should execute an UPDATE query successfully', async () => {
    // Arrange
    const updateQuery: StoredQuery = {
        ...testStoredQuery,
        '@id': 'query:test-update',
        query: 'INSERT DATA { <urn:a> <urn:b> <urn:c> }', // Example UPDATE query
        queryType: 'UPDATE'
    };
    mockEntityManager.get
      .mockResolvedValueOnce(updateQuery)
      .mockResolvedValueOnce(testHttpBackend);

     // Mock the constructor and include the 'update' method for this test case
     const mockUpdateFn = jest.fn().mockResolvedValue(undefined); // UPDATE typically resolves with no data
     MockHttpSparqlExecutor.mockImplementation(() => ({
         selectQueryParsed: jest.fn(),
         constructQueryParsed: jest.fn(),
         update: mockUpdateFn, // Add the mock update method
     } as unknown as HttpSparqlExecutor));


    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: testQueryId,
        backendId: testBackendId,
      },
    });

    // Assert
    expect(response.statusCode).toBe(200); // Expect success
    expect(response.json()).toEqual({ success: true }); // Route returns this on successful update
    expect(mockEntityManager.get).toHaveBeenCalledTimes(2);
    expect(mockEntityManager.get).toHaveBeenCalledWith(updateQuery['@id'], expect.any(EntityRegister));
    expect(mockEntityManager.get).toHaveBeenCalledWith(testBackendId, expect.any(EntityRegister));
    expect(MockHttpSparqlExecutor).toHaveBeenCalledTimes(1); // Executor is instantiated
    // Ensure the update method was called
    expect(mockUpdateFn).toHaveBeenCalledTimes(1);
    expect(mockUpdateFn).toHaveBeenCalledWith(updateQuery.query);
  });

  it('should return 501 for ASK query type (not implemented)', async () => {
    // Arrange
    const askQuery: StoredQuery = { ...testStoredQuery, queryType: 'ASK' };
    mockEntityManager.get
      .mockResolvedValueOnce(askQuery)
      .mockResolvedValueOnce(testHttpBackend);

     // Mock the constructor for this specific test case
     const mockSelectFn = jest.fn();
     const mockConstructFn = jest.fn();
     MockHttpSparqlExecutor.mockImplementation(() => ({
         selectQueryParsed: mockSelectFn,
         constructQueryParsed: mockConstructFn,
     } as unknown as HttpSparqlExecutor));

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: testQueryId,
        backendId: testBackendId,
      },
    });

    // Assert
    expect(response.statusCode).toBe(501);
    expect(response.json()).toHaveProperty('error', 'ASK query execution is not yet implemented.');
    expect(mockEntityManager.get).toHaveBeenCalledTimes(2);
    expect(MockHttpSparqlExecutor).toHaveBeenCalledTimes(1);
  });

  it('should return 502 if executor throws fetch-related error', async () => {
    // Arrange
    mockEntityManager.get
      .mockResolvedValueOnce(testStoredQuery)
      .mockResolvedValueOnce(testHttpBackend);

    const mockSelectFn = jest.fn().mockRejectedValue(new Error('Failed to fetch')); // Simulate network error
    MockHttpSparqlExecutor.mockImplementation(() => ({
        selectQueryParsed: mockSelectFn,
        constructQueryParsed: jest.fn(),
    } as unknown as HttpSparqlExecutor));

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: testQueryId,
        backendId: testBackendId,
      },
    });

    // Assert
    expect(response.statusCode).toBe(502);
    expect(response.json()).toHaveProperty('error', expect.stringContaining(`Failed to connect to backend ${testBackendId}: Failed to fetch`));
    expect(mockSelectFn).toHaveBeenCalledTimes(1);
  });

  it('should return 500 if executor throws generic error', async () => {
    // Arrange
    mockEntityManager.get
      .mockResolvedValueOnce(testStoredQuery)
      .mockResolvedValueOnce(testHttpBackend);

    const mockSelectFn = jest.fn().mockRejectedValue(new Error('Something unexpected happened')); // Simulate generic error
    MockHttpSparqlExecutor.mockImplementation(() => ({
        selectQueryParsed: mockSelectFn,
        constructQueryParsed: jest.fn(),
    } as unknown as HttpSparqlExecutor));

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: {
        targetId: testQueryId,
        backendId: testBackendId,
      },
    });

    // Assert
    expect(response.statusCode).toBe(500);
    expect(response.json()).toHaveProperty('error', expect.stringContaining('Internal server error during execution: Something unexpected happened'));
    expect(mockSelectFn).toHaveBeenCalledTimes(1);
  });

  // TODO: Add tests for argument application (success and failure)
  // TODO: Add tests for metrics recording (might require mocking OpenTelemetry meter)
  // TODO: Add tests for QueryGroup execution once implemented
  // TODO: Add tests for Oxigraph execution once implemented

});
