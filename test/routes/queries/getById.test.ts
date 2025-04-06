import Fastify, { FastifyInstance } from 'fastify';
import { EntityManager } from '../../../src/lib/EntityManager';
import { EntityRegister } from '../../../src/lib/entity-register';
import type { StoredQuery } from '../../../src/types/schema-dts'; // Import relevant types
import { createStoredQuery, CreateStoredQueryInput } from '../../../src/lib/factories'; // Import factory and input type
import { mockEntityManager, resetMocks } from '../../test-utils/mocks'; // Import shared mocks
import { buildTestApp } from '../../test-utils/app-builder'; // Import shared app builder
// Note: common-data is not strictly needed here as we define specific data

// --- Test Suite for GET /api/queries/:id ---
describe('GET /api/queries/:id - Unit Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Build the app once for all tests in this suite
    app = await buildTestApp();
  });

  beforeEach(() => {
    // Reset mocks using the shared utility function
    resetMocks();
  });

  afterAll(async () => {
    // Close the Fastify instance after all tests are done
    await app.close();
  });

  // --- Test cases for GET /:id ---
  // Use factory for consistent test data within this suite
  const queryInput: CreateStoredQueryInput = { name: 'Specific Query', query: 'ASK { ?s ?p ?o }', libraryId: 'urn:test-library:temp' };
  const expectedQuery = createStoredQuery(queryInput);
  const queryId = expectedQuery['@id'];

  // Ensure queryId is a string before proceeding
  if (!queryId) {
      throw new Error("Test setup failed: Factory did not generate an ID for the query.");
  }
  const encodedQueryId = encodeURIComponent(queryId);

  it('should retrieve a specific query by ID', async () => {
    // Mock the 'get' method to return the specific query
    (mockEntityManager.get as jest.Mock).mockResolvedValue(expectedQuery);

    const response = await app.inject({
      method: 'GET',
      url: `/api/queries/${encodedQueryId}`, // Use encoded ID
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expectedQuery);
    // Check that 'get' was called with the decoded ID and an EntityRegister
    expect(mockEntityManager.get).toHaveBeenCalledWith(queryId, expect.any(EntityRegister));
    expect(mockEntityManager.get).toHaveBeenCalledTimes(1);
  });

  it('should return 404 if query not found', async () => {
    const nonExistentId = 'urn:sparql-query-lib:query:not-found'; // Use realistic ID format
    const encodedNonExistentId = encodeURIComponent(nonExistentId);
    // Mock 'get' to return undefined
    (mockEntityManager.get as jest.Mock).mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'GET',
      url: `/api/queries/${encodedNonExistentId}`, // Use encoded ID
    });

    expect(response.statusCode).toBe(404);
    // Check the specific error message from the route, including the ID
    expect(response.json()).toEqual({ error: `StoredQuery with id ${nonExistentId} not found` });
    expect(mockEntityManager.get).toHaveBeenCalledWith(nonExistentId, expect.any(EntityRegister));
    expect(mockEntityManager.get).toHaveBeenCalledTimes(1);
  });

  it('should retrieve a query with limit/offset parameters', async () => {
    // Create a query object that includes the limit/offset fields
    const queryWithLimitOffset: StoredQuery = {
      ...expectedQuery, // Use the base query from the suite setup
      query: 'SELECT * WHERE { ?s ?p ?o } LIMIT 00010 OFFSET 0005', // Update query text
      queryType: 'SELECT', // Update type
      outputVars: ['o', 'p', 's'], // Update outputs if needed
      hasLimitParameter: ['LIMIT 00010'],
      hasOffsetParameter: ['OFFSET 0005']
    };
    const specificId = queryWithLimitOffset['@id'];
    // Add check for specificId before encoding
    if (!specificId) {
        throw new Error("Test setup failed: Factory did not generate an ID for the limit/offset query.");
    }
    const encodedSpecificId = encodeURIComponent(specificId);

    // Mock 'get' to return this specific query
    (mockEntityManager.get as jest.Mock).mockResolvedValue(queryWithLimitOffset);

    const response = await app.inject({
      method: 'GET',
      url: `/api/queries/${encodedSpecificId}`,
    });

    expect(response.statusCode).toBe(200);
    // Verify the full object, including the new fields, is returned
    expect(response.json()).toEqual(queryWithLimitOffset);
    expect(mockEntityManager.get).toHaveBeenCalledWith(specificId, expect.any(EntityRegister));
    expect(mockEntityManager.get).toHaveBeenCalledTimes(1);
  });

  it('should return 500 if EntityManager.get throws an error', async () => {
      (mockEntityManager.get as jest.Mock).mockRejectedValue(new Error('DB Get Error'));

      const response = await app.inject({
          method: 'GET',
          url: `/api/queries/${encodedQueryId}`,
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: 'Internal Server Error: Could not fetch StoredQuery' });
      expect(mockEntityManager.get).toHaveBeenCalledWith(queryId, expect.any(EntityRegister));
      expect(mockEntityManager.get).toHaveBeenCalledTimes(1);
  });
});
