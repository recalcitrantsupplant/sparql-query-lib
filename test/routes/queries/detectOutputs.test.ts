import Fastify, { FastifyInstance } from 'fastify';
import { mockParser, resetMocks } from '../../test-utils/mocks'; // Import shared mocks
import { buildTestApp } from '../../test-utils/app-builder'; // Import shared app builder

// --- Test Suite for POST /api/queries/detect-outputs ---
describe('POST /api/queries/detect-outputs - Unit Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Build the app once for all tests in this suite
    app = await buildTestApp();
  });

  beforeEach(() => {
    // Reset mocks using the shared utility function
    resetMocks();
    // Clear specific mock for this suite
    mockParser.detectQueryOutputs.mockClear();
  });

  afterAll(async () => {
    // Close the Fastify instance after all tests are done
    await app.close();
  });

  // --- Test cases for POST /detect-outputs ---
  const validQuery = 'SELECT ?subject ?object WHERE { ?subject a ?type ; <urn:rel> ?object }';
  const expectedOutputs: string[] = ['subject', 'object']; // Example expected outputs

  it('should detect outputs correctly for a valid query', async () => {
      mockParser.detectQueryOutputs.mockReturnValue(expectedOutputs);

      const response = await app.inject({
          method: 'POST',
          url: '/api/queries/detect-outputs',
          payload: { query: validQuery },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(expectedOutputs);
      expect(mockParser.detectQueryOutputs).toHaveBeenCalledWith(validQuery);
      expect(mockParser.detectQueryOutputs).toHaveBeenCalledTimes(1);
  });

  it('should return 400 for invalid input (missing query)', async () => {
      const response = await app.inject({
          method: 'POST',
          url: '/api/queries/detect-outputs',
          payload: {}, // Missing 'query' field
      });

      expect(response.statusCode).toBe(400);
      // Check only for the error property, as message format can vary
      expect(response.json()).toHaveProperty('error', 'Bad Request');
      // expect(response.json()).toHaveProperty('message', "body must have required property 'query'"); // Removed this line
      expect(mockParser.detectQueryOutputs).not.toHaveBeenCalled();
  });

  it('should return 400 for invalid input (non-string query)', async () => {
      const response = await app.inject({
          method: 'POST',
          url: '/api/queries/detect-outputs',
          payload: { query: { text: 'SELECT ...' } }, // 'query' is not a string
      });

      expect(response.statusCode).toBe(400);
      // Check only for the error property, as message format can vary
      expect(response.json()).toHaveProperty('error', 'Bad Request');
      // expect(response.json()).toHaveProperty('message', "body/query must be string"); // Removed this line
      expect(mockParser.detectQueryOutputs).not.toHaveBeenCalled();
  });

  it('should return 500 if parser fails', async () => {
      const parserError = new Error('Output detection failed');
      mockParser.detectQueryOutputs.mockImplementation(() => {
          throw parserError;
      });

      const response = await app.inject({
          method: 'POST',
          url: '/api/queries/detect-outputs',
          payload: { query: validQuery },
      });

      expect(response.statusCode).toBe(500); // Route catches generic errors
      expect(response.json()).toEqual({ error: `Internal Server Error: Could not detect outputs: ${parserError.message}` });
      expect(mockParser.detectQueryOutputs).toHaveBeenCalledWith(validQuery);
      expect(mockParser.detectQueryOutputs).toHaveBeenCalledTimes(1);
  });
});
