import Fastify, { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { registerBackendRoutes, backendState } from '../../src/server/backend'; // Import routes and the state
import { Backend, BackendState } from '../../src/types'; // Import types

// Paths for temporary test storage files
const TEST_BACKEND_STORAGE_PATH = path.join(__dirname, 'test-backends-inject.json');
const EMPTY_BACKENDS_PATH = path.join(__dirname, 'empty-backends.json'); // Source for clean state

// Helper function to build the Fastify app for testing
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false }); // Disable logger for cleaner test output

  // Use temporary copy for test isolation
  fs.copyFileSync(EMPTY_BACKENDS_PATH, TEST_BACKEND_STORAGE_PATH);

  // --- Crucial Step: Override the imported backendState ---
  // Read the state from the temporary file and assign it directly
  // This isolates the test from the production backends.json
  const testStateData = fs.readFileSync(TEST_BACKEND_STORAGE_PATH, 'utf-8');
  const testState: BackendState = JSON.parse(testStateData);
  // Directly modify the exported variable from the backend module
  Object.assign(backendState, testState);
  // ---------------------------------------------------------

  // Register only the backend routes
  await app.register(registerBackendRoutes);

  await app.ready(); // Ensure all plugins are loaded

  return app;
}

describe('Backend Routes Tests (Inject)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Build a fresh app instance for each test
    app = await buildTestApp();
  });

  afterEach(async () => {
    // Close the Fastify instance
    await app.close();
    // Clean up the temporary storage file
    try {
      fs.unlinkSync(TEST_BACKEND_STORAGE_PATH);
    } catch (err) {
      // Ignore errors (e.g., file not found)
    }
    // --- Important: Reset backendState after test to avoid side effects ---
    // Reload from the original file or set to a known default if necessary
    // For simplicity here, we'll just reset to empty, assuming tests don't overlap badly
    // A more robust solution might involve mocking fs.readFileSync/writeFileSync
    // or properly reloading the original state.
    Object.assign(backendState, { currentBackend: null, backends: [] });
    // ----------------------------------------------------------------------
  });

  it('should add a backend', async () => {
    const backendName = 'wikidata-test';
    const backendEndpoint = 'https://query.wikidata.org/sparql';
    const response = await app.inject({
      method: 'POST',
      url: '/backends', // Corrected URL
      payload: {
        name: backendName,
        endpoint: backendEndpoint
      }
    });

    expect(response.statusCode).toBe(200); // Route returns 200 on success
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('id');
    expect(typeof body.id).toBe('string');

    // Verify state (optional but good practice)
    const addedBackend = backendState.backends.find(b => b.id === body.id);
    expect(addedBackend).toBeDefined();
    expect(addedBackend?.name).toBe(backendName);
    expect(addedBackend?.endpoint).toBe(backendEndpoint);
  });

  it('should list backends (excluding credentials)', async () => {
    // First, add a backend
    const backendName = 'dbpedia-test';
    const backendEndpoint = 'https://dbpedia.org/sparql';
    const addResponse = await app.inject({
      method: 'POST',
      url: '/backends',
      payload: {
        name: backendName,
        endpoint: backendEndpoint,
        username: 'user', // Add credentials to test filtering
        password: 'pass'
      }
    });
    expect(addResponse.statusCode).toBe(200);
    const { id } = JSON.parse(addResponse.payload);

    // Then, list the backends
    const listResponse = await app.inject({
      method: 'GET',
      url: '/backends', // Corrected URL
    });

    expect(listResponse.statusCode).toBe(200);
    const backends = JSON.parse(listResponse.payload) as Partial<Backend>[]; // Use Partial as credentials are removed
    expect(Array.isArray(backends)).toBe(true);
    const listedBackend = backends.find(b => b.id === id);
    expect(listedBackend).toBeDefined();
    expect(listedBackend).toEqual(
      expect.objectContaining({
        id: id,
        name: backendName,
        endpoint: backendEndpoint
      })
    );
    // Ensure credentials are NOT present
    expect(listedBackend).not.toHaveProperty('username');
    expect(listedBackend).not.toHaveProperty('password');
  });

  it('should get a specific backend by ID (excluding credentials)', async () => {
    // First, add a backend
    const backendName = 'specific-test';
    const backendEndpoint = 'https://specific.example.com/sparql';
    const addResponse = await app.inject({
      method: 'POST',
      url: '/backends',
      payload: { name: backendName, endpoint: backendEndpoint, username: 'test', password: 'pwd' }
    });
    expect(addResponse.statusCode).toBe(200);
    const { id } = JSON.parse(addResponse.payload);

    // Then, get the backend by ID
    const getResponse = await app.inject({
      method: 'GET',
      url: `/backends/${id}`, // Corrected URL
    });

    expect(getResponse.statusCode).toBe(200);
    const backend = JSON.parse(getResponse.payload) as Partial<Backend>;
    expect(backend.id).toBe(id);
    expect(backend.name).toBe(backendName);
    expect(backend.endpoint).toBe(backendEndpoint);
    expect(backend).not.toHaveProperty('username');
    expect(backend).not.toHaveProperty('password');
  });

  it('should return 404 when getting a non-existent backend ID', async () => {
    const getResponse = await app.inject({
      method: 'GET',
      url: '/backends/non-existent-backend-id',
    });
    expect(getResponse.statusCode).toBe(404);
  });


  it('should set the current backend', async () => {
    // First, add a backend
    const backendName = 'current-test';
    const backendEndpoint = 'https://current.example.com/sparql';
    const addResponse = await app.inject({
      method: 'POST',
      url: '/backends',
      payload: { name: backendName, endpoint: backendEndpoint }
    });
    expect(addResponse.statusCode).toBe(200);
    const { id } = JSON.parse(addResponse.payload);

    // Then, set the backend as current
    const setResponse = await app.inject({
      method: 'PUT', // Corrected method
      url: '/backends/current', // Corrected URL
      payload: { id: id } // Corrected payload
    });

    expect(setResponse.statusCode).toBe(200); // Route returns 200 on success
    expect(JSON.parse(setResponse.payload)).toEqual({ success: true });

    // Verify state
    expect(backendState.currentBackend).toBe(id);
  });

   it('should return 404 when setting a non-existent backend as current', async () => {
    const setResponse = await app.inject({
      method: 'PUT',
      url: '/backends/current',
      payload: { id: 'non-existent-set-id' }
    });
    expect(setResponse.statusCode).toBe(404);
  });

  it('should get the current backend (excluding credentials)', async () => {
    // Add and set a backend
    const backendName = 'get-current-test';
    const backendEndpoint = 'https://get-current.example.com/sparql';
    const addResponse = await app.inject({
      method: 'POST',
      url: '/backends',
      payload: { name: backendName, endpoint: backendEndpoint, username: 'user', password: 'password' }
    });
    const { id } = JSON.parse(addResponse.payload);
    await app.inject({ method: 'PUT', url: '/backends/current', payload: { id: id } });

    // Get the current backend
    const getResponse = await app.inject({
      method: 'GET',
      url: '/backends/current',
    });

    expect(getResponse.statusCode).toBe(200);
    const currentBackend = JSON.parse(getResponse.payload) as Partial<Backend>;
    expect(currentBackend.id).toBe(id);
    expect(currentBackend.name).toBe(backendName);
    expect(currentBackend.endpoint).toBe(backendEndpoint);
    expect(currentBackend).not.toHaveProperty('username');
    expect(currentBackend).not.toHaveProperty('password');
  });

  it('should return 404 when getting current backend if none is set', async () => {
    // Ensure no backend is set (should be default state after beforeEach)
    const getResponse = await app.inject({
      method: 'GET',
      url: '/backends/current',
    });
    expect(getResponse.statusCode).toBe(404);
  });


  it('should delete a backend', async () => {
    // First, add a backend
    const backendName = 'delete-test';
    const backendEndpoint = 'https://delete.example.com/sparql';
    const addResponse = await app.inject({
      method: 'POST',
      url: '/backends',
      payload: { name: backendName, endpoint: backendEndpoint }
    });
    expect(addResponse.statusCode).toBe(200);
    const { id } = JSON.parse(addResponse.payload);

    // Then, delete the backend
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/backends/${id}`, // Corrected URL
    });

    expect(deleteResponse.statusCode).toBe(200); // Route returns 200 on success
    expect(JSON.parse(deleteResponse.payload)).toEqual({ success: true });

    // Verify that the backend is no longer in the list
    const listResponse = await app.inject({
      method: 'GET',
      url: '/backends',
    });
    expect(listResponse.statusCode).toBe(200);
    const backends = JSON.parse(listResponse.payload) as Backend[];
    expect(backends.find(b => b.id === id)).toBeUndefined();

    // Verify state
    expect(backendState.backends.find(b => b.id === id)).toBeUndefined();
  });

  it('should return success when deleting a non-existent backend (idempotent)', async () => {
    // Attempt to delete an ID that doesn't exist
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/backends/non-existent-delete-id`,
    });

    // The route doesn't check if the ID existed, it just filters the array
    expect(deleteResponse.statusCode).toBe(200);
    expect(JSON.parse(deleteResponse.payload)).toEqual({ success: true });
  });
});
