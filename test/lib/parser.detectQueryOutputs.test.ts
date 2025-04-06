import { SparqlQueryParser } from '../../src/lib/parser';

describe('SparqlQueryParser - detectQueryOutputs', () => {
  let parser: SparqlQueryParser;

  beforeEach(() => {
    parser = new SparqlQueryParser();
  });

  it('should detect simple variables in a SELECT query', () => {
    const queryString = 'SELECT ?subject ?predicate ?object WHERE { ?subject ?predicate ?object }';
    const result = parser.detectQueryOutputs(queryString);
    expect(result).toEqual(['object', 'predicate', 'subject']); // Sorted alphabetically
  });

  it('should detect variables from the WHERE clause for SELECT *', () => {
    const queryString = 'SELECT * WHERE { ?s ?p ?o }';
    const result = parser.detectQueryOutputs(queryString);
    // SELECT * should return the variables found in the WHERE clause, sorted
    expect(result).toEqual(['o', 'p', 's']);
  });

  it('should detect aliased expressions in a SELECT query with GROUP BY', () => {
    // Added GROUP BY ?p to make the query valid
    const queryString = 'SELECT (COUNT(?s) AS ?count) (?p AS ?pred) WHERE { ?s ?p ?o } GROUP BY ?p';
    const result = parser.detectQueryOutputs(queryString);
    expect(result).toEqual(['count', 'pred']);
  });

  it('should detect a mix of simple variables and aliases with GROUP BY', () => {
    // Added GROUP BY ?subject ?predicate to make the query valid
    const queryString = 'SELECT ?subject (COUNT(?o) AS ?objectCount) ?predicate WHERE { ?subject ?predicate ?object } GROUP BY ?subject ?predicate';
    const result = parser.detectQueryOutputs(queryString);
    expect(result).toEqual(['objectCount', 'predicate', 'subject']); // Sorted alphabetically
  });

  // Removed the test for 'should ignore expressions without aliases' because
  // 'SELECT ?subject (COUNT(?o)) ...' is invalid SPARQL syntax and causes a parse error.
  // The detectQueryOutputs function relies on a successful parse.

  it('should return an empty array for non-SELECT queries (CONSTRUCT)', () => {
    const queryString = 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }';
    const result = parser.detectQueryOutputs(queryString);
    expect(result).toEqual([]);
  });

  it('should return an empty array for non-SELECT queries (ASK)', () => {
    const queryString = 'ASK WHERE { ?s ?p ?o }';
    const result = parser.detectQueryOutputs(queryString);
    expect(result).toEqual([]);
  });

  it('should return an empty array for non-SELECT queries (DESCRIBE)', () => {
    const queryString = 'DESCRIBE ?s WHERE { ?s ?p ?o }';
    const result = parser.detectQueryOutputs(queryString);
    expect(result).toEqual([]);
  });

  it('should detect outputs from the outer query only in a subselect', () => {
    const queryString = `
      SELECT ?outerVar (SUM(?innerCount) AS ?totalCount)
      WHERE {
        ?outerVar <http://example.org/prop> ?intermediate .
        {
          SELECT ?intermediate (COUNT(?inner) AS ?innerCount)
          WHERE {
            ?intermediate <http://example.org/innerProp> ?inner .
          }
          GROUP BY ?intermediate
        }
      }
      GROUP BY ?outerVar
    `;
    const result = parser.detectQueryOutputs(queryString);
    // Should only detect ?outerVar and ?totalCount from the outer SELECT
    expect(result).toEqual(['outerVar', 'totalCount']);
  });

  // Note: UPDATE queries might throw parse errors depending on sparql.js version
  // or might be parsed differently. Testing basic non-SELECT types is sufficient.
});
