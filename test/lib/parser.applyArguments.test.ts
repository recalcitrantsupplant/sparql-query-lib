import { SparqlQueryParser } from '../../src/lib/parser';

// Define a type for the argument set structure for clarity in tests
type ArgumentSet = {
  head: { vars: string[] };
  arguments: Array<Record<string, { type: 'uri' | 'literal'; value: string; datatype?: string; 'xml:lang'?: string }>>;
};

describe('SparqlQueryParser - applyArguments', () => {
  let parser: SparqlQueryParser;

  beforeEach(() => {
    parser = new SparqlQueryParser();
  });

  it('should apply arguments to a SPARQL query with UNDEF values', () => { // Renamed test description
    // Arrange
    const queryString = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT ?subject ?predicate ?object
      WHERE {
        ?subject ?predicate ?object .
        VALUES (?subject ?predicate) {
          (UNDEF UNDEF)
        }
      }
    `;

    // New argument structure: Array of argument sets
    const argumentSets: ArgumentSet[] = [
      {
        head: {
          vars: ['subject', 'predicate']
        },
        arguments: [ // Note: 'arguments' key here matches the structure expected by the parser method
          {
            subject: {
              type: 'uri',
              value: 'http://example.org/subject1'
            },
            predicate: {
              type: 'uri',
              value: 'http://example.org/predicate1'
            }
          },
          {
            subject: {
              type: 'uri',
              value: 'http://example.org/subject2'
            },
            predicate: {
              type: 'uri',
              value: 'http://example.org/predicate2'
            }
          }
        ]
      }
    ];

    // Act
    const result = parser.applyArguments(queryString, argumentSets); // Use applyArguments

    // Assert
    expect(result).toContain('<http://example.org/subject1>'); // Check for URI format
    expect(result).toContain('<http://example.org/predicate1>');
    expect(result).toContain('<http://example.org/subject2>');
    expect(result).toContain('<http://example.org/predicate2>');
    expect(result).not.toContain('UNDEF');
  });

  it('should append arguments to existing VALUES clause and remove the UNDEF row', () => { // Renamed test description
    // Arrange
    const queryString = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT ?subject ?predicate ?object
      WHERE {
        ?subject ?predicate ?object .
        VALUES (?subject ?predicate) {
          (<http://example.org/existing1> <http://example.org/existing-pred1>)
          (<http://example.org/existing2> <http://example.org/existing-pred2>)
          (UNDEF UNDEF)
        }
      }
    `;

    // New argument structure
    const argumentSets: ArgumentSet[] = [
      {
        head: {
          vars: ['subject', 'predicate']
        },
        arguments: [ // Note: 'arguments' key here
          {
            subject: {
              type: 'uri',
              value: 'http://example.org/subject1'
            },
            predicate: {
              type: 'uri',
              value: 'http://example.org/predicate1'
            }
          },
          {
            subject: {
              type: 'uri',
              value: 'http://example.org/subject2'
            },
            predicate: {
              type: 'uri',
              value: 'http://example.org/predicate2'
            }
          }
        ]
      }
    ];

    // Act
    const result = parser.applyArguments(queryString, argumentSets); // Use applyArguments

    // Assert
    // Should contain existing values
    expect(result).toContain('<http://example.org/existing1>');
    expect(result).toContain('<http://example.org/existing-pred1>');
    expect(result).toContain('<http://example.org/existing2>');
    expect(result).toContain('<http://example.org/existing-pred2>');
    
    // Should contain new arguments
    expect(result).toContain('<http://example.org/subject1>');
    expect(result).toContain('<http://example.org/predicate1>');
    expect(result).toContain('<http://example.org/subject2>');
    expect(result).toContain('<http://example.org/predicate2>');
    
    // Should not contain UNDEF
    expect(result).not.toContain('UNDEF');
    
    // Parse the result to verify structure
    const parsedResult = parser.parseQuery(result);
    
    // Find the VALUES pattern in the result
    const valuesPattern = parsedResult.where.find((pattern: any) => pattern.type === 'values');
    
    // Should have 4 rows (2 existing + 2 new arguments)
    expect(valuesPattern.values).toHaveLength(4);
  });

  it('should handle different types of argument values (uri, literal with datatype, literal with lang)', () => { // Adjusted description
    // Arrange
    const queryString = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT ?subject ?predicate ?object ?value ?flag
      WHERE {
        ?subject ?predicate ?object .
        VALUES (?subject ?predicate ?object ?value ?flag) {
          (UNDEF UNDEF UNDEF UNDEF UNDEF)
        }
      }
    `;

    // New argument structure
    const argumentSets: ArgumentSet[] = [
      {
        head: { // Updated vars to match test data
          vars: ['subject', 'predicate', 'object', 'value', 'flag']
        },
        arguments: [ // Note: 'arguments' key here
          {
            // URI
            subject: {
              type: 'uri',
              value: 'http://example.org/subject1'
            },
            predicate: {
              type: 'uri',
              value: 'http://example.org/predicate1'
            },
            // Literal with datatype (string)
            object: {
              type: 'literal',
              value: 'Test literal',
              datatype: 'http://www.w3.org/2001/XMLSchema#string'
            },
            // Literal with datatype (integer)
            value: {
              type: 'literal',
              value: '42',
              datatype: 'http://www.w3.org/2001/XMLSchema#integer'
            },
            // Literal with datatype (boolean)
            flag: {
              type: 'literal',
              value: 'true',
              datatype: 'http://www.w3.org/2001/XMLSchema#boolean'
            }
          },
          {
            subject: {
              type: 'uri',
              value: 'http://example.org/subject2'
            },
            predicate: {
              type: 'uri',
              value: 'http://example.org/predicate2'
            },
            // Literal with language tag
            object: {
              type: 'literal',
              value: 'Test with language',
              'xml:lang': 'en'
            },
            // Literal with datatype (decimal)
            value: {
              type: 'literal',
              value: '3.14',
              datatype: 'http://www.w3.org/2001/XMLSchema#decimal'
            },
            // Literal with datatype (boolean)
            flag: {
              type: 'literal',
              value: 'false',
              datatype: 'http://www.w3.org/2001/XMLSchema#boolean'
            }
          }
        ]
      }
    ];

    // Act
    const result = parser.applyArguments(queryString, argumentSets); // Use applyArguments

    // Assert
    // URI values
    expect(result).toContain('<http://example.org/subject1>');
    expect(result).toContain('<http://example.org/predicate1>');
    expect(result).toContain('<http://example.org/subject2>');
    expect(result).toContain('<http://example.org/predicate2>');
    
    // Literal values - Check exact generated syntax
    // Adjust assertion: sparqljs might omit the default string datatype
    expect(result).toContain('"Test literal"'); 
    expect(result).toContain('"Test with language"@en');
    
    // Numeric literals
    // Adjust assertion: sparqljs might omit quotes/datatype for numbers
    expect(result).toContain(' 42 '); // Add spaces to avoid matching parts of other numbers/strings
    expect(result).toContain('"3.14"^^<http://www.w3.org/2001/XMLSchema#decimal>');

    // Boolean literals
    expect(result).toContain('"true"^^<http://www.w3.org/2001/XMLSchema#boolean>'); // sparqljs typically quotes booleans
    expect(result).toContain('"false"^^<http://www.w3.org/2001/XMLSchema#boolean>');
    
    // Should not contain UNDEF
    expect(result).not.toContain('UNDEF');
  });

  it('should handle complex queries with nested patterns and multiple argument sets', () => {
    // Arrange
    const queryString = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT ?subject ?predicate ?object
      WHERE {
        ?subject ?predicate ?object .
        {
          ?subject rdf:type ?type .
          OPTIONAL {
            ?object rdfs:label ?label .
            VALUES (?label) { # First UNDEF clause
              (UNDEF)
            }
          }
        }
        UNION
        {
          ?subject rdfs:label ?name .
          FILTER EXISTS {
            ?subject ?predicate ?value .
            VALUES (?value) { # Second UNDEF clause
              (UNDEF)
            }
          }
        }
      }
    `;

    // New argument structure - targeting both UNDEF clauses
    const argumentSets: ArgumentSet[] = [
      { // For VALUES (?label)
        head: {
          vars: ['label']
        },
        arguments: [
          {
            label: {
              type: 'literal',
              value: 'Test Label 1'
            }
          },
          {
            label: {
              type: 'literal',
              value: 'Test Label 2',
              'xml:lang': 'fr'
            }
          }
        ]
      },
      { // For VALUES (?value)
        head: {
          vars: ['value']
        },
        arguments: [
          {
            value: {
              type: 'literal',
              value: '123',
              datatype: 'http://www.w3.org/2001/XMLSchema#integer'
            }
          }
        ]
      }
    ];

    // Act - Apply arguments
    const result = parser.applyArguments(queryString, argumentSets); // Use applyArguments

    // Assert
    expect(result).toContain('"Test Label 1"');
    expect(result).toContain('"Test Label 2"@fr');
    // Adjust assertion: sparqljs might omit quotes/datatype for numbers
    expect(result).toContain(' 123 '); // Add spaces
    expect(result).not.toContain('UNDEF');
    
    // Parse the result to verify structure
    const parsedResult = parser.parseQuery(result);
    
    // Find the VALUES patterns
    let foundLabelValues = false;
    let foundValueValues = false;
    const processPatterns = (patterns: any[]) => {
      if (!patterns) return;
      
      for (const pattern of patterns) {
        if (pattern.type === 'values') {
           // Check based on variable name
           if (pattern.values[0] && pattern.values[0]['?label']) {
               foundLabelValues = true;
               expect(pattern.values).toHaveLength(2); // Check rows applied
           } else if (pattern.values[0] && pattern.values[0]['?value']) {
               foundValueValues = true;
               expect(pattern.values).toHaveLength(1); // Check rows applied
           }
        }
        
        // Recurse
        if (pattern.patterns) processPatterns(pattern.patterns);
        if (pattern.type === 'optional' && pattern.patterns) processPatterns(pattern.patterns);
        if (pattern.type === 'union') pattern.patterns.forEach((p: any) => processPatterns(p.patterns));
        if (pattern.type === 'group' && pattern.patterns) processPatterns(pattern.patterns);
        if (pattern.type === 'filter' && pattern.expression && pattern.expression.args && pattern.expression.args[0] && pattern.expression.args[0].patterns) {
            processPatterns(pattern.expression.args[0].patterns);
        }
      }
    };
    
    if (parsedResult.where) {
      processPatterns(parsedResult.where);
    }
    
    expect(foundLabelValues).toBe(true);
    expect(foundValueValues).toBe(true);
  });

  it('should throw error if argument set count does not match UNDEF VALUES count', () => { // Test unchanged, but confirms error handling
     // Arrange
     const queryString = `
       SELECT * WHERE {
         VALUES ?a { UNDEF }
         VALUES ?b { UNDEF }
       }
     `; // Query has 2 UNDEF clauses
     const argumentSets: ArgumentSet[] = [ // Only one set provided
       { head: { vars: ['a'] }, arguments: [{ a: { type: 'uri', value: 'http://example.org/a1' } }] }
     ];

     // Act & Assert
     expect(() => parser.applyArguments(queryString, argumentSets)).toThrow(
       'Mismatch: Found 2 UNDEF VALUES clauses, but received 1 argument sets.'
     );
   });

  it('should throw error if argument header misses variables', () => { // Test unchanged, but confirms error handling
    const queryString = 'SELECT * WHERE { VALUES (?a ?b) { (UNDEF UNDEF) } }';
    const argumentSets: ArgumentSet[] = [
      {
        head: { vars: ['a'] }, // Missing 'b'
        arguments: [ { a: { type: 'uri', value: 'http://example.org/a1' } } ]
      } // Argument set header doesn't match VALUES clause variables
    ];
    expect(() => parser.applyArguments(queryString, argumentSets)).toThrow(
      'Variable mismatch for VALUES clause 1. Query expects [a, b], arguments provide [a].'
    );
  });

   it('should handle missing variable values in arguments as UNDEF', () => {
    const queryString = 'SELECT * WHERE { VALUES (?a ?b) { (UNDEF UNDEF) } }';
    const argumentSets: ArgumentSet[] = [
      {
        head: { vars: ['a', 'b'] },
        arguments: [
          { a: { type: 'uri', value: 'http://example.org/a1' } }, // Missing 'b' here
          { a: { type: 'uri', value: 'http://example.org/a2' }, b: { type: 'uri', value: 'http://example.org/b2' } }
        ]
      }
    ];
    const result = parser.applyArguments(queryString, argumentSets); // Use applyArguments
    const parsedResult = parser.parseQuery(result);
    const valuesPattern = parsedResult.where.find((p: any) => p.type === 'values');

    expect(valuesPattern.values).toHaveLength(2);
    // First row should have ?a bound, ?b UNDEF
    expect(valuesPattern.values[0]['?a'].value).toBe('http://example.org/a1');
    expect(valuesPattern.values[0]['?b']).toBeUndefined();
    // Second row should have both bound
    expect(valuesPattern.values[1]['?a'].value).toBe('http://example.org/a2');
    expect(valuesPattern.values[1]['?b'].value).toBe('http://example.org/b2');
  });

  it('should handle literal arguments without datatype', () => {
    const queryString = 'SELECT * WHERE { VALUES (?lit) { (UNDEF) } }'; // Corrected syntax
    const argumentSets: ArgumentSet[] = [
      {
        head: { vars: ['lit'] },
        arguments: [ { lit: { type: 'literal', value: 'Simple Literal' } } ] // No datatype
      }
    ];
    const result = parser.applyArguments(queryString, argumentSets); // Use applyArguments
    expect(result).toContain('"Simple Literal"'); // Should be quoted, datatype might be omitted by generator
    expect(result).not.toContain('^^<http://www.w3.org/2001/XMLSchema#string>'); // Generator might omit default string datatype
    const parsedResult = parser.parseQuery(result);
    const valuesPattern = parsedResult.where.find((p: any) => p.type === 'values');
    // Check the parsed structure for the literal node
    expect(valuesPattern.values[0]['?lit'].termType).toBe('Literal');
    expect(valuesPattern.values[0]['?lit'].value).toBe('Simple Literal');
    // sparqljs adds default string datatype if none/lang provided
    expect(valuesPattern.values[0]['?lit'].datatype.value).toBe('http://www.w3.org/2001/XMLSchema#string');
  });

  it('should throw error for unsupported argument types', () => { // Test unchanged, but confirms error handling
    const queryString = 'SELECT * WHERE { VALUES (?unknown) { (UNDEF) } }'; // Corrected syntax
    const argumentSets: ArgumentSet[] = [
      {
        head: { vars: ['unknown'] },
        arguments: [ { unknown: { type: 'weird', value: 'data' } as any } ] // Cast to any to bypass type check
      }
    ];
    expect(() => parser.applyArguments(queryString, argumentSets)).toThrow(
      "Invalid argument type 'weird' for variable 'unknown' in argument set 1. Only 'uri' and 'literal' are supported."
    );
  });

  it('should throw an error for illegal bnode arguments in VALUES', () => { // Test unchanged, but confirms error handling
    const queryString = 'SELECT * WHERE { VALUES (?bnode) { (UNDEF) } }';
    const argumentSets: ArgumentSet[] = [
      {
        head: { vars: ['bnode'] },
        arguments: [ { bnode: { type: 'bnode', value: 'b1' } as any } ] // Cast to allow bnode type for test
      }
    ];
    expect(() => parser.applyArguments(queryString, argumentSets)).toThrow(
      "Invalid argument type 'bnode' for variable 'bnode' in argument set 1. Only 'uri' and 'literal' are supported."
    );
  });

  it('should throw error for empty arguments array when UNDEF exists', () => { // Changed expectation
     const queryString = `
       SELECT * WHERE {
         VALUES (?a) { (UNDEF) }
       }
     `;
     const argumentSets: ArgumentSet[] = []; // Empty array
     // Expect applyArguments to throw an error because 1 UNDEF clause exists but 0 sets provided
     expect(() => parser.applyArguments(queryString, argumentSets)).toThrow(
       'Mismatch: Found 1 UNDEF VALUES clauses, but received 0 argument sets.'
     );
   });

   it('should handle argument set with empty arguments list gracefully (leaves UNDEF)', () => { // Adjusted assertion and description
     const queryString = `
       SELECT * WHERE {
         VALUES (?a) { (UNDEF) }
       }
     `;
     const argumentSets: ArgumentSet[] = [
       { head: { vars: ['a'] }, arguments: [] } // Empty arguments list
     ];
     
     // Import the logger and spy on its emit method
     const logger = require('../../src/lib/logger'); 
     const emitSpy = jest.spyOn(logger.logger, 'emit');

     const result = parser.applyArguments(queryString, argumentSets);
     
     // Expect UNDEF row to remain because the arguments list was empty
     expect(result).toContain('UNDEF');
     // Use toMatch with regex to handle potential whitespace/newline differences from sparqljs generation
     expect(result).toMatch(/VALUES\s+\?a\s*\{\s*UNDEF\s*\}/); // Check the clause remains
     
     // Check that the logger's emit method was called with the expected warning
     expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({
       severityNumber: logger.SeverityNumber.WARN,
       body: 'Argument set at index 0 has an empty arguments list. Skipping modification for VALUES clause with variables [a].'
     }));
     
     emitSpy.mockRestore(); // Clean up the spy
   });

  it('should apply arguments to a VALUES clause within a nested SELECT inside a DESCRIBE query', () => {
    // Arrange
    const describeQueryFull = `
      PREFIX sh: <http://www.w3.org/ns/shacl#>
      PREFIX asmt: <https://koenigsnet/assessment-ontology/>
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

    const argumentSets: ArgumentSet[] = [
      {
        head: { vars: ['assessment'] },
        arguments: [
          { assessment: { type: 'uri', value: 'http://example.org/assessment/123' } },
          { assessment: { type: 'uri', value: 'http://example.org/assessment/456' } }
        ]
      }
    ];

    // Act
    const result = parser.applyArguments(describeQueryFull, argumentSets);

    // Assert
    expect(result).toContain('<http://example.org/assessment/123>');
    expect(result).toContain('<http://example.org/assessment/456>');
    expect(result).not.toContain('UNDEF');

    // Optional: Parse and check structure more deeply if needed
    const parsedResult = parser.parseQuery(result);
    let foundValues = false;
    const checkPatterns = (patterns: any[]) => {
      if (!patterns) return;
      for (const pattern of patterns) {
        if (pattern.type === 'values' && pattern.values[0] && pattern.values[0]['?assessment']) {
          foundValues = true;
          expect(pattern.values).toHaveLength(2); // 2 arguments applied
          expect(pattern.values[0]['?assessment'].value).toBe('http://example.org/assessment/123');
          expect(pattern.values[1]['?assessment'].value).toBe('http://example.org/assessment/456');
        }
        // Recurse into nested structures
        if (pattern.patterns) checkPatterns(pattern.patterns);
        if (pattern.type === 'query' && pattern.where) checkPatterns(pattern.where);
        if (pattern.type === 'group' && pattern.patterns) checkPatterns(pattern.patterns);
        if (pattern.type === 'optional' && pattern.patterns) checkPatterns(pattern.patterns);
        if (pattern.type === 'union') pattern.patterns.forEach((p: any) => checkPatterns(p.patterns));
        if (pattern.type === 'filter' && pattern.expression?.args?.[0]?.patterns) checkPatterns(pattern.expression.args[0].patterns);
      }
    };
    if (parsedResult.where) {
      checkPatterns(parsedResult.where);
    }
    expect(foundValues).toBe(true); // Ensure the specific VALUES clause was found and modified
  });

});
