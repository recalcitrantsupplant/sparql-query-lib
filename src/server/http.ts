import { request } from 'undici';
import { backendState } from './backend';
import { SparqlQueryParser } from '../lib/parser';
import { config } from './config';

export async function executeQuery(sparqlQuery: string, variables: { [variable: string]: any } = {}, backendId?: string) {
  const backend = backendId
    ? backendState.backends.find(b => b.id === backendId)
    : backendState.backends.find(b => b.id === backendState.currentBackend);

  if (!backend) {
    throw new Error(`Backend "${backendId || backendState.currentBackend}" not found`);
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
