import { jest } from '@jest/globals'; // Use jest from @jest/globals
import { EntityManager } from '../../src/lib/EntityManager';
import { SparqlQueryParser } from '../../src/lib/parser'; // Import the actual type

// --- Mock EntityManager ---
// Provide mock implementations for methods used by the routes
export const mockEntityManager = {
  saveOrUpdate: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
  loadAll: jest.fn(),
} as unknown as EntityManager; // Cast for type compatibility

// --- Mock SparqlQueryParser (Instance) ---
// Create a simple mock object for the parser instance
// Note: We mock the *instance* methods, not the class constructor directly here
// If the routes expected `new SparqlQueryParser()`, we'd mock the class differently.
export const mockParser = {
    parseQuery: jest.fn(),
    detectParameters: jest.fn(),
    detectQueryOutputs: jest.fn(),
} as jest.Mocked<Pick<SparqlQueryParser, 'parseQuery' | 'detectParameters' | 'detectQueryOutputs'>>; // More specific mock type

// Helper function to reset all mocks defined in this file
export function resetMocks() {
    (mockEntityManager.saveOrUpdate as jest.Mock).mockClear();
    (mockEntityManager.get as jest.Mock).mockClear();
    (mockEntityManager.delete as jest.Mock).mockClear();
    (mockEntityManager.loadAll as jest.Mock).mockClear();

    mockParser.parseQuery.mockClear();
    mockParser.detectParameters.mockClear();
    mockParser.detectQueryOutputs.mockClear();

    // Reset any specific implementations if needed (e.g., default return values)
    // Example: (mockEntityManager.get as jest.Mock).mockResolvedValue(undefined);
}
