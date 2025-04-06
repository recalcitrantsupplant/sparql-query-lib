// Define specific configuration types for different internal backends
interface HttpEndpointConfig {
  type: 'http';
  queryUrl: string;
  updateUrl?: string; // Optional, might be same as queryUrl
  username?: string; // Optional username for basic auth
  password?: string; // Optional password for basic auth
}

interface OxigraphMemoryConfig {
  type: 'oxigraph-memory';
  // Optional path to a file for persistence, otherwise purely in-memory
  dbPath?: string;
}

// Union type for the internal backend configuration
type InternalBackendConfig = HttpEndpointConfig | OxigraphMemoryConfig;

export interface Config {
  enableTimingLogs: boolean;
  internalBackend: InternalBackendConfig;
}

// Function to determine backend config from environment variables or defaults
function getInternalBackendConfig(): InternalBackendConfig {
  const backendType = process.env.INTERNAL_BACKEND_TYPE || 'http'; // Default to http

  if (backendType === 'oxigraph-memory') {
    return {
      type: 'oxigraph-memory',
      dbPath: process.env.INTERNAL_OXIGRAPH_DB_PATH // Optional path
    };
  }

  // Default to HTTP configuration
  const queryUrl = process.env.LIBRARY_STORAGE_SPARQL_ENDPOINT || 'http://localhost:3031/testing123'; // Default endpoint
  const updateUrl = process.env.LIBRARY_STORAGE_SPARQL_UPDATE_ENDPOINT || `${queryUrl}/update`; // Default update endpoint
  const username = process.env.LIBRARY_STORAGE_SPARQL_USERNAME; // Optional username
  const password = process.env.LIBRARY_STORAGE_SPARQL_PASSWORD; // Optional password

  return {
    type: 'http',
    queryUrl: queryUrl,
    updateUrl: updateUrl,
    username: username,
    password: password
  };
}


export const config: Config = {
  enableTimingLogs: process.env.ENABLE_TIMING_LOGS === 'true' || true, // Default to true
  internalBackend: getInternalBackendConfig(),
};
