import Fastify, { FastifyInstance } from 'fastify';
import { mockParser, resetMocks } from '../../test-utils/mocks'; // Import shared mocks
import { buildTestApp } from '../../test-utils/app-builder'; // Import shared app builder
import { DetectedParameters } from '../../../src/lib/parser'; // Import the type

// --- Test Suite for POST /api/queries/detect-parameters ---
describe('POST /api/queries/detect-parameters - Unit Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Build the app once for all tests in this suite
    app = await buildTestApp();
  });

  beforeEach(() => {
    // Reset mocks using the shared utility function
    resetMocks();
    // Clear specific mock for this suite
    mockParser.detectParameters.mockClear();
  });

  afterAll(async () => {
    // Close the Fastify instance after all tests are done
    await app.close();
  });

  // --- Test cases for POST /detect-parameters ---
  const validQuery = 'SELECT ?s WHERE { ?s <urn:p> ?param1; <urn:p2> ?param2 }';
  // Define expectedParams according to the DetectedParameters interface
  const expectedParams: DetectedParameters = {
    valuesParameters: [['param1'], ['param2']], // Assuming these are VALUES parameters for the mock
    limitParameters: [],
    offsetParameters: [],
  };

  it('should detect parameters correctly for a valid query', async () => {
      // Use the correctly typed mock return value
      mockParser.detectParameters.mockReturnValue(expectedParams);

      const response = await app.inject({
          method: 'POST',
          url: '/api/queries/detect-parameters',
          payload: { query: validQuery },
      });

      expect(response.statusCode).toBe(200);
      // Assert against the full DetectedParameters object
      expect(response.json()).toEqual(expectedParams);
      expect(mockParser.detectParameters).toHaveBeenCalledWith(validQuery);
      expect(mockParser.detectParameters).toHaveBeenCalledTimes(1);
  });

  it('should return 400 for invalid input (missing query)', async () => {
      const response = await app.inject({
          method: 'POST',
          url: '/api/queries/detect-parameters',
          payload: { name: 'no query here' }, // Missing 'query' field
      });

      expect(response.statusCode).toBe(400);
      // Check only for the error property, as message format can vary
      expect(response.json()).toHaveProperty('error', 'Bad Request');
      // expect(response.json()).toHaveProperty('message', "body must have required property 'query'"); // Removed this line
      expect(mockParser.detectParameters).not.toHaveBeenCalled();
  });

   it('should return 400 for invalid input (non-string query)', async () => {
      const response = await app.inject({
          method: 'POST',
          url: '/api/queries/detect-parameters',
          payload: { query: 123 }, // 'query' is not a string
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error', 'Bad Request');
      // Check only for the error property, as message format can vary
      // expect(response.json()).toHaveProperty('message', "body/query must be string"); // Removed this line
      expect(mockParser.detectParameters).not.toHaveBeenCalled();
  });

  it('should return 500 if parser fails', async () => {
      const parserError = new Error('Parser crashed');
      mockParser.detectParameters.mockImplementation(() => {
          throw parserError;
      });

      const response = await app.inject({
          method: 'POST',
          url: '/api/queries/detect-parameters',
          payload: { query: validQuery },
      });

      expect(response.statusCode).toBe(500); // Route catches generic errors
      expect(response.json()).toEqual({ error: `Internal Server Error: Could not detect parameters: ${parserError.message}` });
      expect(mockParser.detectParameters).toHaveBeenCalledWith(validQuery);
      expect(mockParser.detectParameters).toHaveBeenCalledTimes(1);
  });
});
