import { start } from '../src/index';
import Fastify from 'fastify'; // Import Fastify itself for mocking
import { FileSystemLibraryStorage } from '../src/server/libraryStorage';
import { FileSystemBackendStorage } from '../src/server/backendStorage';
import { LibraryManager } from '../src/server/libraryManager';
import { registerBackendRoutes } from '../src/server/backend';
import { registerQueryRoutes } from '../src/server/query';
import { registerLibraryRoutes } from '../src/server/libraries';
import fastifyCors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

// --- Mock Dependencies ---

// Mock Fastify and its methods
const mockListen = jest.fn();
const mockRegister = jest.fn();
const mockDecorate = jest.fn();
const mockClose = jest.fn(); // Although start doesn't return app, good practice to mock
const mockLogError = jest.fn();
const mockFastifyInstance = {
  register: mockRegister,
  decorate: mockDecorate,
  listen: mockListen,
  log: { error: mockLogError },
  close: mockClose,
};
// Mock the default export of 'fastify'
jest.mock('fastify', () => jest.fn(() => mockFastifyInstance));

// Mock plugins (default exports)
jest.mock('@fastify/cors', () => jest.fn((_app, _opts) => Promise.resolve()));
jest.mock('@fastify/swagger', () => jest.fn((_app, _opts) => Promise.resolve()));
jest.mock('@fastify/swagger-ui', () => jest.fn((_app, _opts) => Promise.resolve()));

// Mock Storage constructors
jest.mock('../src/server/libraryStorage');
jest.mock('../src/server/backendStorage');

// Mock Manager constructor and initialize method
const mockInitialize = jest.fn();
jest.mock('../src/server/libraryManager');
const MockLibraryManager = LibraryManager as jest.MockedClass<typeof LibraryManager>;
MockLibraryManager.mockImplementation(() => ({
    initialize: mockInitialize,
} as any)); // Cast to any to satisfy constructor/prototype mocking

// Mock Route registration functions
jest.mock('../src/server/backend', () => ({ registerBackendRoutes: jest.fn() }));
jest.mock('../src/server/query', () => ({ registerQueryRoutes: jest.fn() }));
jest.mock('../src/server/libraries', () => ({ registerLibraryRoutes: jest.fn() }));

// Mock process.exit
const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

// Mock console.error for the EADDRINUSE case
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

// --- Tests ---

describe('index.ts - start function', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    // Ensure mocked constructors are cleared if needed (depends on test specifics)
    (FileSystemLibraryStorage as jest.Mock).mockClear();
    (FileSystemBackendStorage as jest.Mock).mockClear();
    MockLibraryManager.mockClear();
  });

  afterAll(() => {
    // Restore original implementations
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('should initialize Fastify, register plugins/routes, decorate, and listen', async () => {
    mockListen.mockResolvedValueOnce(undefined); // Simulate successful listen
    mockInitialize.mockResolvedValueOnce(undefined); // Simulate successful manager init

    await start();

    expect(Fastify).toHaveBeenCalledTimes(1);
    expect(FileSystemLibraryStorage).toHaveBeenCalledTimes(1);
    expect(FileSystemBackendStorage).toHaveBeenCalledTimes(1);
    expect(LibraryManager).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledTimes(1); // LibraryManager init

    // Check registrations: cors, swagger, swagger-ui, 3 route registers
    expect(mockRegister).toHaveBeenCalledTimes(6);
    expect(mockRegister).toHaveBeenCalledWith(fastifyCors, expect.any(Object));
    expect(mockRegister).toHaveBeenCalledWith(fastifySwagger, expect.any(Object));
    expect(mockRegister).toHaveBeenCalledWith(fastifySwaggerUi, expect.any(Object));
    expect(mockRegister).toHaveBeenCalledWith(registerBackendRoutes);
    expect(mockRegister).toHaveBeenCalledWith(registerQueryRoutes);
    expect(mockRegister).toHaveBeenCalledWith(registerLibraryRoutes);

    // Check decorations
    expect(mockDecorate).toHaveBeenCalledTimes(2);
    expect(mockDecorate).toHaveBeenCalledWith('libraryManager', expect.any(LibraryManager));
    expect(mockDecorate).toHaveBeenCalledWith('backendStorage', expect.any(FileSystemBackendStorage));

    // Check listen call
    expect(mockListen).toHaveBeenCalledWith({ port: 3000, host: '0.0.0.0' });
    expect(mockLogError).not.toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should log error and exit if listen fails with EADDRINUSE', async () => {
    const listenError = new Error('listen EADDRINUSE: address already in use :::3000') as any;
    listenError.code = 'EADDRINUSE';
    mockListen.mockRejectedValueOnce(listenError);
    mockInitialize.mockResolvedValueOnce(undefined);

    await start();

    expect(mockListen).toHaveBeenCalledTimes(1);
    expect(mockLogError).toHaveBeenCalledWith(listenError);
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Port 3000 is already in use'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

   it('should log error and exit if listen fails with other error', async () => {
    const listenError = new Error('Some other listen error');
    mockListen.mockRejectedValueOnce(listenError);
    mockInitialize.mockResolvedValueOnce(undefined);

    await start();

    expect(mockListen).toHaveBeenCalledTimes(1);
    expect(mockLogError).toHaveBeenCalledWith(listenError);
    // Ensure specific EADDRINUSE message isn't logged for other errors
    expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('Port 3000 is already in use'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should log error and exit if manager initialization fails', async () => {
    const setupError = new Error('Failed to initialize manager');
    mockInitialize.mockRejectedValueOnce(setupError); // Simulate manager init failure

    await start();

    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockListen).not.toHaveBeenCalled(); // Should fail before listening
    expect(mockLogError).toHaveBeenCalledWith(setupError);
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should log error and exit if a plugin registration fails', async () => {
    const pluginError = new Error('Failed to register CORS');
    // Make the first register call (CORS) reject
    mockRegister.mockImplementationOnce(() => Promise.reject(pluginError));
    mockInitialize.mockResolvedValueOnce(undefined); // Assume manager would init if plugin didn't fail

    await start();

    expect(mockRegister).toHaveBeenCalledTimes(1); // Only CORS registration attempted
    expect(mockListen).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledWith(pluginError);
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
