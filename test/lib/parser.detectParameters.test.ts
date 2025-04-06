import { SparqlQueryParser } from '../../src/lib/parser';

// Define the expected return type structure for clarity in tests
interface ExpectedDetectedParameters {
  valuesParameters: string[][];
  limitParameters?: string[];
  offsetParameters?: string[];
}

describe('SparqlQueryParser - detectParameters', () => {
  let parser: SparqlQueryParser;

  beforeEach(() => {
    parser = new SparqlQueryParser();
  });

  it('should detect variables in a VALUES clause with a row where all values are UNDEF', () => {
    // Arrange
    const queryString = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT ?subject ?predicate ?object
      WHERE {
        ?subject ?predicate ?object .
        VALUES (?subject ?predicate) {
          (<http://example.org/subject1> <http://example.org/predicate1>)
          (UNDEF UNDEF)
        }
      }
    `;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(1);
    expect(result.valuesParameters[0]).toHaveLength(2);
    expect(result.valuesParameters[0]).toEqual(['predicate', 'subject']); // Sorted alphabetically
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
  });

  it('should not detect variables in a VALUES clause without a row where all values are UNDEF', () => {
    // Arrange
    const queryString = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT ?subject ?predicate ?object
      WHERE {
        ?subject ?predicate ?object .
        VALUES (?subject ?predicate) {
          (<http://example.org/subject1> <http://example.org/predicate1>)
          (UNDEF <http://example.org/predicate2>)
          (<http://example.org/subject3> UNDEF)
        }
      }
    `;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(0);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
  });

  it('should detect variables correctly for multiple UNDEF groups', () => {
    // Arrange
    const queryString = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

      SELECT * WHERE {
        VALUES ?pred { UNDEF }
        VALUES ( ?sub ?obj ) { ( UNDEF UNDEF ) }
        ?sub ?pred ?obj .
      } LIMIT 10
    `;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(2);
    expect(result.valuesParameters[0]).toEqual(['pred']);
    expect(result.valuesParameters[1]).toEqual(['obj', 'sub']); // Sorted alphabetically
    expect(result.limitParameters).toEqual([]); // No LIMIT 000N
    expect(result.offsetParameters).toEqual([]);
  });

  it('should detect a single variable in a simple VALUES clause with UNDEF', () => {
    // Arrange
    const queryString = `SELECT * {VALUES ?s { UNDEF } ?s ?p ?o} LIMIT 10`;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(1);
    expect(result.valuesParameters[0]).toEqual(['s']);
    expect(result.limitParameters).toEqual([]); // No LIMIT 000N
    expect(result.offsetParameters).toEqual([]);
  });

  it('should detect variables in a VALUES clause within an INSERT WHERE query', () => {
    // Arrange
    const queryString = `
      PREFIX ex: <http://example.org/>
      INSERT { ex:s ex:p ex:o }
      WHERE {
        VALUES ?param { UNDEF }
        ?s ?p ?o .
      }
    `;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(1);
    expect(result.valuesParameters[0]).toEqual(['param']);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
  });

  it('should detect variables in a VALUES clause within a DELETE WHERE query', () => {
    // Arrange
    const queryString = `
      PREFIX ex: <http://example.org/>
      DELETE { ?s ?p ?o }
      WHERE {
        VALUES (?s ?p) { (UNDEF UNDEF) }
        ?s ?p ?o .
      }
    `;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(1);
    expect(result.valuesParameters[0]).toEqual(['p', 's']); // Sorted alphabetically
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
  });

  it('should detect variables in a VALUES clause within a DELETE WHERE query (DELETE { } WHERE { } form)', () => {
    // Arrange
    // Corrected syntax for DELETE with WHERE and VALUES
    const queryString = `
      PREFIX ex: <http://example.org/>
      DELETE { ?dummy ?p ?o . }
      WHERE {
        ?dummy ?p ?o .
        VALUES ?item { UNDEF }
        ?item ex:status ex:old .
      }
    `;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(1);
    expect(result.valuesParameters[0]).toEqual(['item']);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
  });

  it('should detect variables in an INSERT WHERE query with VALUES UNDEF (single update)', () => {
    // Arrange
    const queryString = `
      PREFIX ex: <http://example.org/>
      INSERT { ex:new ex:prop ?val }
      WHERE {
        VALUES ?val { UNDEF }
        ex:old ex:prop ?val .
      }
    `;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(1);
    expect(result.valuesParameters[0]).toEqual(['val']);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
  });

  it('should detect variables in a DELETE WHERE query with VALUES UNDEF (single update)', () => {
    // Arrange
    const queryString = `
      PREFIX ex: <http://example.org/>
      DELETE { ?s ?p ?o }
      WHERE {
        VALUES ?id { UNDEF }
        ?s ex:id ?id ;
           ?p ?o .
      }
    `;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(1);
    expect(result.valuesParameters[0]).toEqual(['id']);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
  });


  it('should not detect variables in UPDATE operations without a WHERE clause or without UNDEF', () => {
    // Arrange
    // Split multi-statement update into individual tests if needed, or simplify this test
    // This test focuses on operations that shouldn't have parameters detected.
    const queryString = `
      PREFIX ex: <http://example.org/>
      INSERT DATA { ex:s ex:p ex:o }
    `;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(0);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
  });

    it('should not detect variables in DELETE DATA operations', () => {
    // Arrange
    const queryString = `
      PREFIX ex: <http://example.org/>
      DELETE DATA { ex:a ex:b ex:c }
    `;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(0);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
  });

    it('should not detect variables in LOAD operations', () => {
    // Arrange
    const queryString = `
      LOAD <http://example.org/graph> INTO GRAPH <http://example.org/target>
    `;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(0);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
  });

    it('should not detect variables in CREATE GRAPH operations', () => {
    // Arrange
    const queryString = `
      CREATE GRAPH <http://example.org/newGraph>
    `;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(0);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
  });

    it('should not detect variables in DELETE WHERE with VALUES but no UNDEF', () => {
    // Arrange
    const queryString = `
      PREFIX ex: <http://example.org/>
      DELETE { ?s ?p ?o } WHERE { ?s ?p ?o . VALUES ?x { "abc" } }
    `;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(0);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
  });

  // Tests for DESCRIBE with nested SELECT
  const describeQueryBase = `
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX asmt: <https://koenigsnet/assessment-ontology/>
  `;

  const describeQuerySelectOnly = `
    ${describeQueryBase}
    #DESCRIBE ?bn ?next_criteria ?opt {
    #  {
        SELECT ?bn ?next_criteria WHERE {
          VALUES ?assessment { UNDEF }
          ?assessment <https://koenigsnet/assessment-ontology/hasEvaluation> ?bn .
          ?bn <https://koenigsnet/assessment-ontology/evaluatesCriterion> ?next_criteria .
          {
            VALUES ?pref_1_status { <https://koenigsnet/workflow-status/InProgress> }
            ?bn <https://koenigsnet/assessment-ontology/evaluationStatus> ?pref_1_status .
          }
          UNION
          {
            VALUES ?pref_2_status { <https://koenigsnet/workflow-status/NotEvaluated> }
            ?bn <https://koenigsnet/assessment-ontology/evaluationStatus> ?pref_2_status .
          }
          ?next_criteria sh:order ?order .
          BIND(COALESCE(?pref_1_status, ?pref_2_status) AS ?status)
        } 
        ORDER BY DESC(?pref_1_status) ?order
        LIMIT 1
    #  }
    #  ?opt asmt:isOptionFor ?next_criteria .
    #}
  `;

  const describeQueryFull = `
    ${describeQueryBase}
    DESCRIBE ?bn ?next_criteria ?opt {
      {
        SELECT ?bn ?next_criteria WHERE {
          VALUES ?assessment { UNDEF }
          ?assessment <https://koenigsnet/assessment-ontology/hasEvaluation> ?bn .
          ?bn <https://koenigsnet/assessment-ontology/evaluatesCriterion> ?next_criteria .
          {
            VALUES ?pref_1_status { <https://koenigsnet/workflow-status/InProgress> }
            ?bn <https://koenigsnet/assessment-ontology/evaluationStatus> ?pref_1_status .
          }
          UNION
          {
            VALUES ?pref_2_status { <https://koenigsnet/workflow-status/NotEvaluated> }
            ?bn <https://koenigsnet/assessment-ontology/evaluationStatus> ?pref_2_status .
          }
          ?next_criteria sh:order ?order .
          BIND(COALESCE(?pref_1_status, ?pref_2_status) AS ?status)
        } 
        ORDER BY DESC(?pref_1_status) ?order
        LIMIT 1
      }
      ?opt asmt:isOptionFor ?next_criteria .
    }
  `;

  it('should detect parameters in a nested SELECT query (control case)', () => {
    // Arrange
    const queryString = describeQuerySelectOnly;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    expect(result.valuesParameters).toHaveLength(1);
    expect(result.valuesParameters[0]).toEqual(['assessment']);
    expect(result.limitParameters).toEqual([]); // No LIMIT 000N
    expect(result.offsetParameters).toEqual([]);
  });

  it('should detect parameters in a nested SELECT query within a DESCRIBE query', () => {
    // Arrange
    const queryString = describeQueryFull;

    // Act
    const result = parser.detectParameters(queryString);

    // Assert
    // This test should pass after the fix to recurse into nested queries
    expect(result.valuesParameters).toHaveLength(1);
    expect(result.valuesParameters[0]).toEqual(['assessment']);
    expect(result.limitParameters).toEqual([]); // No LIMIT 000N
    expect(result.offsetParameters).toEqual([]);
  });

  // --- Tests for LIMIT/OFFSET parameters ---

  it('should detect LIMIT 000N parameter', () => {
    const queryString = `SELECT * WHERE { ?s ?p ?o } LIMIT 00010`;
    const result = parser.detectParameters(queryString);
    expect(result.limitParameters).toEqual(['LIMIT 00010']);
    expect(result.offsetParameters).toEqual([]);
    expect(result.valuesParameters).toEqual([]);
  });

  it('should detect OFFSET 000N parameter', () => {
    const queryString = `SELECT * WHERE { ?s ?p ?o } OFFSET 0005`;
    const result = parser.detectParameters(queryString);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual(['OFFSET 0005']);
    expect(result.valuesParameters).toEqual([]);
  });

  it('should detect both LIMIT 000N and OFFSET 000N parameters', () => {
    const queryString = `SELECT * WHERE { ?s ?p ?o } LIMIT 00020 OFFSET 00010`;
    const result = parser.detectParameters(queryString);
    expect(result.limitParameters).toEqual(['LIMIT 00020']);
    expect(result.offsetParameters).toEqual(['OFFSET 00010']);
    expect(result.valuesParameters).toEqual([]);
  });

  it('should detect LIMIT 000N parameter case-insensitively', () => {
    const queryString = `SELECT * WHERE { ?s ?p ?o } limit 00015`;
    const result = parser.detectParameters(queryString);
    expect(result.limitParameters).toEqual(['limit 00015']);
    expect(result.offsetParameters).toEqual([]);
    expect(result.valuesParameters).toEqual([]);
  });

  it('should detect OFFSET 000N parameter case-insensitively', () => {
    const queryString = `SELECT * WHERE { ?s ?p ?o } offset 0003`;
    const result = parser.detectParameters(queryString);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual(['offset 0003']);
    expect(result.valuesParameters).toEqual([]);
  });

  it('should not detect LIMIT if not in 000N format', () => {
    const queryString = `SELECT * WHERE { ?s ?p ?o } LIMIT 10`;
    const result = parser.detectParameters(queryString);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
    expect(result.valuesParameters).toEqual([]);
  });

  it('should not detect OFFSET if not in 000N format', () => {
    const queryString = `SELECT * WHERE { ?s ?p ?o } OFFSET 5`;
    const result = parser.detectParameters(queryString);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
    expect(result.valuesParameters).toEqual([]);
  });

  it('should not detect LIMIT if digits are less than 3 zeros', () => {
    const queryString = `SELECT * WHERE { ?s ?p ?o } LIMIT 005`;
    const result = parser.detectParameters(queryString);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual([]);
    expect(result.valuesParameters).toEqual([]);
  });

  it('should detect LIMIT 000N and VALUES parameters together', () => {
    const queryString = `SELECT * WHERE { VALUES ?x { UNDEF } ?s ?p ?o } LIMIT 00050`;
    const result = parser.detectParameters(queryString);
    expect(result.limitParameters).toEqual(['LIMIT 00050']);
    expect(result.offsetParameters).toEqual([]);
    expect(result.valuesParameters).toEqual([['x']]);
  });

  it('should detect OFFSET 000N and VALUES parameters together', () => {
    const queryString = `SELECT * WHERE { VALUES ?y { UNDEF } ?s ?p ?o } OFFSET 0001`;
    const result = parser.detectParameters(queryString);
    expect(result.limitParameters).toEqual([]);
    expect(result.offsetParameters).toEqual(['OFFSET 0001']);
    expect(result.valuesParameters).toEqual([['y']]);
  });

  it('should detect LIMIT 000N, OFFSET 000N, and VALUES parameters together', () => {
    const queryString = `SELECT * WHERE { VALUES (?a ?b) { (UNDEF UNDEF) } ?s ?p ?o } LIMIT 000100 OFFSET 00025`;
    const result = parser.detectParameters(queryString);
    expect(result.limitParameters).toEqual(['LIMIT 000100']);
    expect(result.offsetParameters).toEqual(['OFFSET 00025']);
    expect(result.valuesParameters).toEqual([['a', 'b']]); // Sorted
  });

  it('should throw an error for multiple LIMIT clauses (invalid SPARQL)', () => {
    const queryString = `SELECT * WHERE { ?s ?p ?o } LIMIT 00010 LIMIT 00020`;
    // Expect the parser to throw an error because multiple LIMITs are invalid
    expect(() => parser.detectParameters(queryString)).toThrow(/Parse error/);
    // Or, if detectParameters catches and re-throws:
    // expect(() => parser.detectParameters(queryString)).toThrow(/Failed to parse SPARQL query/);
  });

  it('should throw an error for multiple OFFSET clauses (invalid SPARQL)', () => {
    const queryString = `SELECT * WHERE { ?s ?p ?o } OFFSET 0005 OFFSET 00015`;
    // Expect the parser to throw an error because multiple OFFSETs are invalid
    expect(() => parser.detectParameters(queryString)).toThrow(/Parse error/);
    // Or, if detectParameters catches and re-throws:
    // expect(() => parser.detectParameters(queryString)).toThrow(/Failed to parse SPARQL query/);
  });

});
