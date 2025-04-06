import Fastify, { FastifyInstance } from 'fastify';
import { EntityManager } from '../../../src/lib/EntityManager';
import { EntityRegister } from '../../../src/lib/entity-register';
import type { StoredQuery, Thing } from '../../../src/types/schema-dts'; // Import relevant types
import { createStoredQuery, CreateStoredQueryInput } from '../../../src/lib/factories'; // Import factory and input type
import { mockEntityManager, resetMocks } from '../../test-utils/mocks'; // Import shared mocks
import { buildTestApp } from '../../test-utils/app-builder'; // Import shared app builder

// --- Test Suite for GET /api/queries ---
describe('GET /api/queries - Unit Tests', () => {
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

  // --- Test cases for GET / ---
  it('should retrieve all stored queries, filtering out non-query entities', async () => {
    // Use factory to create mock queries
    const queryInput1: CreateStoredQueryInput = { name: 'Query One', query: 'SELECT ?a { ?a ?b ?c }', libraryId: 'urn:test-library:temp' };
    const queryInput2: CreateStoredQueryInput = { name: 'Query Two', query: 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }', libraryId: 'urn:test-library:temp' };
    const queryInput3: CreateStoredQueryInput = { name: 'Query Three with Limit/Offset', query: 'SELECT * { ?x ?y ?z } LIMIT 00010 OFFSET 0005', libraryId: 'urn:test-library:temp' };
    const query1 = createStoredQuery(queryInput1);
    const query2 = createStoredQuery(queryInput2);
    const query3 = createStoredQuery(queryInput3);
    // Manually add the limit/offset params to query3 for the test
    query3.hasLimitParameter = ['LIMIT 00010'];
    query3.hasOffsetParameter = ['OFFSET 0005'];

    const mockQueries = [query1, query2, query3]; // Include query3 in the expected list

    // Mock loadAll to return a map containing queries and other things
    const mockMap = new Map<string, Thing>();
    mockQueries.forEach(q => {
        if (q['@id']) mockMap.set(q['@id'], q);
    });
    // Add a non-query entity to ensure filtering works
    const otherThing: Thing = { '@id': 'other-1', '@type': 'Library', name: 'Not a Query' } as Thing;
    if (otherThing['@id']) mockMap.set(otherThing['@id'], otherThing);

    (mockEntityManager.loadAll as jest.Mock).mockResolvedValue(mockMap);

    const response = await app.inject({
        method: 'GET',
        url: '/api/queries',
    });

    expect(response.statusCode).toBe(200);
    // The route should filter the results from loadAll to return only StoredQuery entities
    expect(response.json()).toEqual(mockQueries);
    // Check that loadAll was called with an EntityRegister
    expect(mockEntityManager.loadAll).toHaveBeenCalledWith(expect.any(EntityRegister));
    expect(mockEntityManager.loadAll).toHaveBeenCalledTimes(1);
  });

  it('should return 500 if EntityManager.loadAll throws an error', async () => {
      (mockEntityManager.loadAll as jest.Mock).mockRejectedValue(new Error('DB LoadAll Error'));

      const response = await app.inject({
          method: 'GET',
          url: '/api/queries',
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: 'Internal Server Error: Could not fetch StoredQueries' });
      expect(mockEntityManager.loadAll).toHaveBeenCalledTimes(1);
  });
});
