import Fastify, { FastifyInstance } from 'fastify';
import { EntityManager } from '../../../src/lib/EntityManager';
import { EntityRegister } from '../../../src/lib/entity-register';
import { mockEntityManager, resetMocks } from '../../test-utils/mocks'; // Import shared mocks
import { buildTestApp } from '../../test-utils/app-builder'; // Import shared app builder
import { commonExistingQuery, commonQueryId, commonEncodedQueryId } from '../../test-utils/common-data'; // Import common test data

// --- Test Suite for DELETE /api/queries/:id ---
describe('DELETE /api/queries/:id - Unit Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Build the app once for all tests in this suite
    app = await buildTestApp();
  });

  beforeEach(() => {
    // Reset mocks using the shared utility function
    resetMocks();
    // Reset specific mocks for DELETE tests
    (mockEntityManager.delete as jest.Mock).mockClear();
    (mockEntityManager.get as jest.Mock).mockClear(); // Also clear get as it's used in the handler
  });

  afterAll(async () => {
    // Close the Fastify instance after all tests are done
    await app.close();
  });

  // --- Test cases for DELETE /:id ---
  it('should delete the query and return 204', async () => {
      // --- Mock Setup ---
      // Mock the initial 'get' check inside the route handler to return the existing query
      (mockEntityManager.get as jest.Mock).mockResolvedValueOnce(commonExistingQuery);
      // Mock delete to resolve successfully
      (mockEntityManager.delete as jest.Mock).mockResolvedValue(undefined);
      // --- End Mock Setup ---

      const response = await app.inject({
          method: 'DELETE',
          url: `/api/queries/${commonEncodedQueryId}`,
      });

      // --- Assertions ---
      expect(response.statusCode).toBe(204); // Expect No Content
      expect(response.body).toBe(''); // Expect empty body for 204

      // Check mocks:
      // 1. get was called to check existence
      expect(mockEntityManager.get).toHaveBeenCalledTimes(1);
      expect(mockEntityManager.get).toHaveBeenCalledWith(commonQueryId, expect.any(EntityRegister));
      // 2. delete was called with the correct ID
      expect(mockEntityManager.delete).toHaveBeenCalledTimes(1);
      expect(mockEntityManager.delete).toHaveBeenCalledWith(commonQueryId);
  });

  it('should return 204 even if query not found (idempotency)', async () => {
      const nonExistentId = 'urn:sparql-query-lib:query:does-not-exist-for-delete';
      const encodedNonExistentId = encodeURIComponent(nonExistentId);

      // --- Mock Setup ---
      // Mock the initial 'get' check inside the route handler to return undefined
      (mockEntityManager.get as jest.Mock).mockResolvedValueOnce(undefined);
      // 'delete' should not be called in this case, so no need to mock it here.
      // --- End Mock Setup ---

      const response = await app.inject({
          method: 'DELETE',
          url: `/api/queries/${encodedNonExistentId}`,
      });

      // --- Assertions ---
      expect(response.statusCode).toBe(204); // Expect No Content even if not found
      expect(response.body).toBe('');

      // Check mocks:
      // 1. The initial 'get' check was performed
      expect(mockEntityManager.get).toHaveBeenCalledTimes(1);
      expect(mockEntityManager.get).toHaveBeenCalledWith(nonExistentId, expect.any(EntityRegister));
      // 2. 'delete' should NOT have been called because the get returned undefined
      expect(mockEntityManager.delete).not.toHaveBeenCalled();
  });

  it('should return 500 if delete fails', async () => {
      const deleteError = new Error('Database Delete Failed');
      // --- Mock Setup ---
      // Mock the initial 'get' check to return the existing query
      (mockEntityManager.get as jest.Mock).mockResolvedValueOnce(commonExistingQuery);
      // Mock delete to reject with an error
      (mockEntityManager.delete as jest.Mock).mockRejectedValue(deleteError);
      // --- End Mock Setup ---

      const response = await app.inject({
          method: 'DELETE',
          url: `/api/queries/${commonEncodedQueryId}`,
      });

      // --- Assertions ---
      expect(response.statusCode).toBe(500); // Expect Internal Server Error
      expect(response.json()).toEqual({ error: 'Internal Server Error: Could not delete StoredQuery' });

      // Check mocks:
      // 1. Initial get was called
      expect(mockEntityManager.get).toHaveBeenCalledTimes(1);
      expect(mockEntityManager.get).toHaveBeenCalledWith(commonQueryId, expect.any(EntityRegister));
      // 2. delete was called and failed
      expect(mockEntityManager.delete).toHaveBeenCalledTimes(1);
      expect(mockEntityManager.delete).toHaveBeenCalledWith(commonQueryId);
  });
});
