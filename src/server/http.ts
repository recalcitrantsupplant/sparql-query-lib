import { request } from 'undici';
// Removed: import { backendState } from './backend';
import { SparqlQueryParser } from '../lib/parser';
import { config } from './config';
import { IBackendStorage } from './backendStorage'; // Added storage interface

// Updated function signature
export async function executeQuery(
    backendStorage: IBackendStorage, // Added storage parameter
    sparqlQuery: string,
    backendId: string, // Made backendId required
    variables: { [variable: string]: any } = {}
) {
  // Fetch backend using the provided storage instance and ID
  const backend = await backendStorage.getBackendById(backendId);

  if (!backend) {
    // Updated error message
    throw new Error(`Backend "${backendId}" not found`);
  }

  try {
    const parser = new SparqlQueryParser();
    let replacedQuery = sparqlQuery;
    if (variables) {
      if (config.enableTimingLogs) console.time('Variable substitution');
      replacedQuery = parser.applyBindings(sparqlQuery, variables);
      if (config.enableTimingLogs) console.timeEnd('Variable substitution');
    }

    const { username, password } = backend;
    const auth = username && password ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : undefined;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/sparql-results+json',
      ...(auth ? { 'Authorization': auth } : {})
    };
    const body = `query=${encodeURIComponent(replacedQuery)}`;
    const response = await request(backend.endpoint, {
      method: 'POST',
      headers,
      body
    });
    // Return the entire response object
    return response;
  } catch (error) {
    console.error('Error executing query:', error);
    throw error;
  }
}
