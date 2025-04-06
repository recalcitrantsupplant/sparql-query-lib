import { SparqlQueryParser } from '../../src/lib/parser';

describe('SparqlQueryParser - parseQuery', () => {
  let parser: SparqlQueryParser;

  beforeEach(() => {
    parser = new SparqlQueryParser();
  });

  it('should parse a valid SPARQL query', () => {
    // Arrange
    const queryString = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT ?subject ?predicate ?object
      WHERE {
        ?subject ?predicate ?object .
      }
      LIMIT 10
    `;

    // Act
    const result = parser.parseQuery(queryString);

    // Assert
    expect(result).toBeDefined();
    expect(result.type).toBe('query');
    expect(result.queryType).toBe('SELECT');
    expect(result.variables).toEqual([
      { termType: 'Variable', value: 'subject' },
      { termType: 'Variable', value: 'predicate' },
      { termType: 'Variable', value: 'object' }
    ]);
    expect(result.where).toHaveLength(1);
    expect(result.limit).toBe(10);
  });

  it('should throw an error for an invalid SPARQL query', () => {
    // Arrange
    const invalidQuery = 'SELECT * WHERE { INVALID SYNTAX }';

    // Act & Assert
    // Wrap the call in a function for expect(...).toThrow()
    const parseAction = () => parser.parseQuery(invalidQuery);
    expect(parseAction).toThrow(/^Failed to parse SPARQL query:/); // Check for specific error message start
  });
});
