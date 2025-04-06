import { request, Dispatcher, Agent } from 'undici'; // Import Agent
import { ISparqlExecutor, SparqlSelectJsonOutput, SparqlQueryOptions } from './ISparqlExecutor'; // Import SparqlQueryOptions
import { config } from './config';
// Define a simpler config type specifically for the HTTP executor's needs
// This avoids requiring a full Backend entity for internal setup.
interface HttpExecutorConfig {
    queryUrl: string;
    updateUrl?: string; // Optional, defaults to queryUrl if not provided
    username?: string; // Optional basic auth username
    password?: string; // Optional basic auth password
}


// Keep-Alive Agent for connection reuse
const keepAliveAgent = new Agent({
    keepAliveTimeout: 60 * 1000, // 1 minute
    keepAliveMaxTimeout: 5 * 60 * 1000 // 5 minutes
});


// --- Helper Functions (Internal to HTTP Executor) ---

/**
 * Executes a raw SPARQL request via HTTP and returns the undici response object.
 * Handles authentication and content negotiation.
 * @internal
 */
async function executeHttpRequestRaw(
  executorConfig: HttpExecutorConfig, // Use the simpler config type
  query: string,
  acceptHeader: string,
  isUpdate: boolean = false // Flag to determine which endpoint to use
): Promise<Dispatcher.ResponseData> {
  // Destructure the simpler config type
  const { username, password, queryUrl, updateUrl: configUpdateUrl } = executorConfig;

  // Determine the endpoint URL to use
  const updateEndpoint = configUpdateUrl || queryUrl; // Default update URL to query URL
  const endpointUrl = isUpdate ? updateEndpoint : queryUrl;

  if (!endpointUrl) { // Should not happen if constructor validates, but check anyway
    throw new Error(`HTTP SPARQL ${isUpdate ? 'update' : 'query'} endpoint URL is not configured.`);
  }

  const auth = username && password ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : undefined;
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': acceptHeader,
    ...(auth ? { 'Authorization': auth } : {})
  };

  let requestOptions: Dispatcher.RequestOptions; // Use the standard RequestOptions type
  let targetUrl = new URL(endpointUrl); // Start with the base URL as a URL object

  if (isUpdate) {
    // --- SPARQL Update (POST) ---
    const body = `update=${encodeURIComponent(query)}`;
    requestOptions = {
      method: 'POST',
      headers,
      body,
      path: targetUrl.pathname + targetUrl.search // Provide path
      // dispatcher removed, using agent.request
    };
  } else {
    // --- SPARQL Query (GET) ---
    // Append query parameter to the URL object's search parameters
    targetUrl.searchParams.set('query', query);
    requestOptions = {
      method: 'GET',
      headers: { // Remove Content-Type for GET
        'Accept': acceptHeader,
        ...(auth ? { 'Authorization': auth } : {})
      },
      path: targetUrl.pathname + targetUrl.search // Provide path with query string
      // No body for GET
      // dispatcher removed, using agent.request
    };
  }

  const requestUrlString = targetUrl.toString(); // Get the full URL string for logging/request
  const requestLabel = `HTTP SPARQL ${isUpdate ? 'UPDATE' : 'Query'} Request to ${requestUrlString}`;
  // Log the raw query string before making the request
  console.log(`Executing SPARQL ${isUpdate ? 'UPDATE' : 'Query'}:\n${query}`);
  if (config.enableTimingLogs) console.time(requestLabel);
  try {
    // Use keepAliveAgent.request instead of global request
    const response = await keepAliveAgent.request({
        origin: targetUrl.origin, // Need to provide origin separately for agent.request
        ...requestOptions // Spread the rest of the options (method, path, headers, body)
    });
    if (config.enableTimingLogs) console.timeEnd(requestLabel);
    return response;
  } catch (error) {
    if (config.enableTimingLogs) console.timeEnd(requestLabel); // Ensure timer ends on error
    console.error(`Error executing ${requestLabel}:`, error);
    throw error; // Re-throw network or setup errors
  }
}

/**
 * Checks the HTTP response status code and throws an error if not successful (2xx).
 * Reads the body text for inclusion in the error message.
 * @internal
 */
async function checkHttpResponseStatus(response: Dispatcher.ResponseData): Promise<void> {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    let responseBody = '';
    try {
      responseBody = await response.body.text();
    } catch (e) {
      responseBody = '(Failed to read response body)';
    }
    throw new Error(`HTTP SPARQL query failed with status ${response.statusCode}: ${responseBody}`);
  }
}


// --- HTTP SPARQL Executor Implementation ---

/**
 * Implements ISparqlExecutor for standard SPARQL endpoints via HTTP.
 * Expects fully formed query strings as input.
 */
export class HttpSparqlExecutor implements ISparqlExecutor {
  private executorConfig: HttpExecutorConfig; // Store the simpler config

  constructor(executorConfig: HttpExecutorConfig) { // Accept simpler config
    // Validate the configuration
    if (!executorConfig || !executorConfig.queryUrl) {
      throw new Error("Cannot initialize HttpSparqlExecutor: queryUrl is required in configuration.");
    }
    // Store the validated config
    this.executorConfig = {
        ...executorConfig,
        // Ensure updateUrl defaults to queryUrl if not provided
        updateUrl: executorConfig.updateUrl || executorConfig.queryUrl
    };
  }

  /**
   * Executes a SPARQL SELECT query and returns the parsed JSON output object.
   */
  async selectQueryParsed(
    sparqlQuery: string, // Expects final query string
    options?: SparqlQueryOptions
  ): Promise<SparqlSelectJsonOutput> {
    // Determine the Accept header: use provided option or default
    const acceptHeader = options?.acceptHeader || 'application/sparql-results+json';
    // Use the stored executorConfig
    const response = await executeHttpRequestRaw(this.executorConfig, sparqlQuery, acceptHeader, false);
    await checkHttpResponseStatus(response); // Throw on non-2xx status

    try {
      const results = await response.body.json() as SparqlSelectJsonOutput;
      // Basic validation of the result structure
      if (!results || !results.head || !results.results) {
        throw new Error('Invalid SPARQL JSON output format received.');
      }
      return results;
    } catch (error) {
      console.error('Error parsing SPARQL JSON output:', error);
      throw new Error(`Failed to parse SPARQL JSON output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Executes a SPARQL CONSTRUCT query and returns the resulting RDF graph as a string.
   */
  async constructQueryParsed(
    sparqlQuery: string, // Expects final query string
    options?: SparqlQueryOptions
  ): Promise<string> {
    // Determine the Accept header: use provided option or default (N-Quads is a reasonable default for parsed string)
    const acceptHeader = options?.acceptHeader || 'application/n-quads';
    // Use the stored executorConfig
    const response = await executeHttpRequestRaw(this.executorConfig, sparqlQuery, acceptHeader, false);
    await checkHttpResponseStatus(response); // Throw on non-2xx status

    try {
      const nquadsString = await response.body.text();
      // Optional: Add basic validation (e.g., check if empty) if needed
      return nquadsString;
    } catch (error) {
      console.error('Error reading N-Quads response body:', error);
      throw new Error(`Failed to read N-Quads response body: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Executes a SPARQL SELECT query and returns the raw undici response object for streaming.
   */
  async selectQueryStream(
    sparqlQuery: string, // Expects final query string
    options?: SparqlQueryOptions
  ): Promise<Dispatcher.ResponseData> {
      // Determine the Accept header: use provided option or default
      const acceptHeader = options?.acceptHeader || 'application/sparql-results+json';
      // Use the stored executorConfig
      const response = await executeHttpRequestRaw(this.executorConfig, sparqlQuery, acceptHeader, false);
      await checkHttpResponseStatus(response); // Ensure it's a successful response before returning stream
      return response;
  }

  /**
   * Executes a SPARQL CONSTRUCT query and returns the raw undici response object for streaming.
   */
  async constructQueryStream(
    sparqlQuery: string, // Expects final query string
    options?: SparqlQueryOptions
  ): Promise<Dispatcher.ResponseData> {
      // Determine the Accept header: use provided option or default
      const acceptHeader = options?.acceptHeader || 'application/n-triples';
      // Use the stored executorConfig
      const response = await executeHttpRequestRaw(this.executorConfig, sparqlQuery, acceptHeader, false);
      await checkHttpResponseStatus(response); // Ensure it's a successful response before returning stream
      return response;
  }

  /**
   * Executes a SPARQL UPDATE query (e.g., INSERT, DELETE).
   */
  async update(sparqlUpdateQuery: string): Promise<void> {
    // Use the stored executorConfig, executeHttpRequestRaw handles using updateUrl
    const response = await executeHttpRequestRaw(this.executorConfig, sparqlUpdateQuery, '*/*', true);
    await checkHttpResponseStatus(response); // Check status even for updates
  }

  /**
   * Executes a SPARQL ASK query and returns the boolean result.
   */
  async askQuery(
    sparqlAskQuery: string,
    options?: SparqlQueryOptions
  ): Promise<boolean> {
    // ASK queries typically return JSON with a "boolean" field
    const acceptHeader = options?.acceptHeader || 'application/sparql-results+json';
    const response = await executeHttpRequestRaw(this.executorConfig, sparqlAskQuery, acceptHeader, false);
    await checkHttpResponseStatus(response); // Throw on non-2xx status

    try {
      // The result structure is { head: {}, boolean: true/false }
      const results = await response.body.json() as { head: object; boolean: boolean };
      if (typeof results.boolean !== 'boolean') {
        throw new Error('Invalid SPARQL ASK JSON output format received: "boolean" field missing or not a boolean.');
      }
      return results.boolean;
    } catch (error) {
      console.error('Error parsing SPARQL ASK JSON output:', error);
      throw new Error(`Failed to parse SPARQL ASK JSON output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
