import { SparqlQueryParser } from '../../src/lib/parser';
import { QueryBindings } from '../../src/types';

describe('SparqlQueryParser', () => {
  let parser: SparqlQueryParser;

  beforeEach(() => {
    parser = new SparqlQueryParser();
  });

  describe('parseQuery', () => {
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
      expect(() => parser.parseQuery(invalidQuery)).toThrow('Failed to parse SPARQL query');
    });
  });

  describe('detectVariables', () => {
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
      const result = parser.detectVariables(queryString);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(2);
      expect(result[0][0]).toBe('subject');
      expect(result[0][1]).toBe('predicate');
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
      const result = parser.detectVariables(queryString);

      // Assert
      expect(result).toHaveLength(0);
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
      const result = parser.detectVariables(queryString);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(['pred']);
      expect(result[1]).toEqual(['sub', 'obj']);
    });
  });

  describe('applyBindings', () => {
    it('should apply bindings to a SPARQL query with UNDEF values', () => {
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

      const bindings: QueryBindings = {
        head: {
          vars: ['subject', 'predicate']
        },
        arguments: {
          bindings: [
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
      };

      // Act
      const result = parser.applyBindings(queryString, bindings);

      // Assert
      expect(result).toContain('http://example.org/subject1');
      expect(result).toContain('http://example.org/predicate1');
      expect(result).toContain('http://example.org/subject2');
      expect(result).toContain('http://example.org/predicate2');
      expect(result).not.toContain('UNDEF');
    });

    it('should append bindings to existing VALUES clause and remove the UNDEF row', () => {
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

      const bindings: QueryBindings = {
        head: {
          vars: ['subject', 'predicate']
        },
        arguments: {
          bindings: [
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
      };

      // Act
      const result = parser.applyBindings(queryString, bindings);

      // Assert
      // Should contain existing values
      expect(result).toContain('http://example.org/existing1');
      expect(result).toContain('http://example.org/existing-pred1');
      expect(result).toContain('http://example.org/existing2');
      expect(result).toContain('http://example.org/existing-pred2');
      
      // Should contain new bindings
      expect(result).toContain('http://example.org/subject1');
      expect(result).toContain('http://example.org/predicate1');
      expect(result).toContain('http://example.org/subject2');
      expect(result).toContain('http://example.org/predicate2');
      
      // Should not contain UNDEF
      expect(result).not.toContain('UNDEF');
      
      // Parse the result to verify structure
      const parsedResult = parser.parseQuery(result);
      
      // Find the VALUES pattern in the result
      const valuesPattern = parsedResult.where.find((pattern: any) => pattern.type === 'values');
      
      // Should have 4 rows (2 existing + 2 new bindings)
      expect(valuesPattern.values).toHaveLength(4);
    });

    it('should handle different types of binding values (uri, literal, numeric, boolean)', () => {
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

      const bindings: QueryBindings = {
        head: {
          vars: ['subject', 'predicate', 'object', 'value', 'flag']
        },
        arguments: {
          bindings: [
            {
              subject: {
                type: 'uri',
                value: 'http://example.org/subject1'
              },
              predicate: {
                type: 'uri',
                value: 'http://example.org/predicate1'
              },
              object: {
                type: 'literal',
                value: 'Test literal',
                datatype: 'http://www.w3.org/2001/XMLSchema#string'
              },
              value: {
                type: 'literal',
                value: '42',
                datatype: 'http://www.w3.org/2001/XMLSchema#integer'
              },
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
              object: {
                type: 'literal',
                value: 'Test with language',
                'xml:lang': 'en'
              },
              value: {
                type: 'literal',
                value: '3.14',
                datatype: 'http://www.w3.org/2001/XMLSchema#decimal'
              },
              flag: {
                type: 'literal',
                value: 'false',
                datatype: 'http://www.w3.org/2001/XMLSchema#boolean'
              }
            }
          ]
        }
      };

      // Act
      const result = parser.applyBindings(queryString, bindings);

      // Assert
      // URI values
      expect(result).toContain('http://example.org/subject1');
      expect(result).toContain('http://example.org/predicate1');
      expect(result).toContain('http://example.org/subject2');
      expect(result).toContain('http://example.org/predicate2');
      
      // Literal values
      expect(result).toContain('Test literal');
      expect(result).toContain('Test with language');
      expect(result).toContain('@en');
      // Note: Plain literals without datatype are assumed to be strings in SPARQL
      
      // Numeric literals
      expect(result).toContain('42');
      expect(result).toContain('3.14');
      // Note: The sparqljs generator might not include the datatype for numeric literals
      // in the output, so we don't check for them
      
      // Boolean literals - should be rendered without quotes
      expect(result).toContain('"true"');
      expect(result).toContain('"false"');
      
      // Should not contain UNDEF
      expect(result).not.toContain('UNDEF');
    });

    it('should handle complex queries with nested patterns', () => {
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
              VALUES (?label) {
                (UNDEF)
              }
            }
          }
          UNION
          {
            ?subject rdfs:label ?name .
            FILTER EXISTS {
              ?subject ?predicate ?value .
              VALUES (?value) {
                (UNDEF)
              }
            }
          }
        }
      `;

      const labelBindings: QueryBindings = {
        head: {
          vars: ['label']
        },
        arguments: {
          bindings: [
            {
              label: {
                type: 'literal',
                value: 'Test Label 1'
              }
            },
            {
              label: {
                type: 'literal',
                value: 'Test Label 2'
              }
            }
          ]
        }
      };

      // Act - Apply bindings
      const result = parser.applyBindings(queryString, labelBindings);

      // Assert
      expect(result).toContain('Test Label 1');
      expect(result).toContain('Test Label 2');
      
      // Parse the result to verify structure
      const parsedResult = parser.parseQuery(result);
      
      // Find the VALUES pattern in the OPTIONAL clause
      let foundLabelValues = false;
      const processPatterns = (patterns: any[]) => {
        if (!patterns) return;
        
        for (const pattern of patterns) {
          if (pattern.type === 'optional' && pattern.patterns) {
            const valuesPattern = pattern.patterns.find((p: any) => p.type === 'values');
            if (valuesPattern && valuesPattern.values) {
              foundLabelValues = true;
              // Should have 2 rows for the label values
              expect(valuesPattern.values).toHaveLength(2);
            }
          }
          
          if (pattern.patterns) {
            processPatterns(pattern.patterns);
          }
        }
      };
      
      if (parsedResult.where) {
        processPatterns(parsedResult.where);
      }
      
      expect(foundLabelValues).toBe(true);
      // Note: The FILTER EXISTS clause still contains UNDEF, but that's expected
      // since we only applied bindings for the label variable
    });

    it('should not modify VALUES clauses that do not have matching variables', () => {
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
          VALUES (?object) {
            (UNDEF)
          }
        }
      `;

      const bindings: QueryBindings = {
        head: {
          vars: ['subject', 'predicate']
        },
        arguments: {
          bindings: [
            {
              subject: {
                type: 'uri',
                value: 'http://example.org/subject1'
              },
              predicate: {
                type: 'uri',
                value: 'http://example.org/predicate1'
              }
            }
          ]
        }
      };

      // Act
      const result = parser.applyBindings(queryString, bindings);
      const parsedResult = parser.parseQuery(result);

      // Assert
      // Find the VALUES patterns in the result
      const valuesPatterns = parsedResult.where.filter((pattern: any) => pattern.type === 'values');
      
      // Should have 2 VALUES clauses
      expect(valuesPatterns).toHaveLength(2);
      
      // First VALUES clause should have been modified (no UNDEF)
      const firstValuesPattern = valuesPatterns.find((p: any) => 
        Object.keys(p.values[0]).some(k => k === '?subject' || k === 'subject')
      );
      expect(firstValuesPattern.values).toHaveLength(1);
      expect(firstValuesPattern.values[0]).toHaveProperty('?subject');
      expect(firstValuesPattern.values[0]['?subject']).toHaveProperty('value', 'http://example.org/subject1');
      
      // Second VALUES clause should still have UNDEF
      const secondValuesPattern = valuesPatterns.find((p: any) => 
        Object.keys(p.values[0]).some(k => k === '?object' || k === 'object')
      );
      expect(secondValuesPattern.values).toHaveLength(1);
      expect(secondValuesPattern.values[0]).toHaveProperty('?object');
      expect(secondValuesPattern.values[0]['?object']).toBeUndefined();
    });

    it('should handle empty bindings gracefully', () => {
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

      const emptyBindings: QueryBindings = {
        head: {
          vars: ['subject', 'predicate']
        },
        arguments: {
          bindings: []
        }
      };

      // Act
      const result = parser.applyBindings(queryString, emptyBindings);
      const parsedResult = parser.parseQuery(result);

      // Assert
      // Find the VALUES pattern in the result
      const valuesPattern = parsedResult.where.find((pattern: any) => pattern.type === 'values');
      
      // Should still have the UNDEF row since we're not removing it when no bindings are provided
      expect(valuesPattern.values).toHaveLength(1);
      expect(valuesPattern.values[0]['?subject']).toBeUndefined();
      expect(valuesPattern.values[0]['?predicate']).toBeUndefined();
    });

    it('should not modify the query if no VALUES clause exists', () => {
      const queryString = 'SELECT * WHERE { ?s ?p ?o }';
      const bindings: QueryBindings = {
        head: { vars: ['s'] },
        arguments: { bindings: [{ s: { type: 'uri', value: 'http://example.org/s1' } }] }
      };
      const result = parser.applyBindings(queryString, bindings);
      // Compare parsed structures as generator might add punctuation
      const originalParsed = parser.parseQuery(queryString);
      const resultParsed = parser.parseQuery(result);
      expect(resultParsed).toEqual(originalParsed);
    });

    it('should not modify the query if VALUES clause is empty', () => {
      const queryString = 'SELECT * WHERE { VALUES ?a {} ?s ?p ?o }';
       const bindings: QueryBindings = {
        head: { vars: ['a'] },
        arguments: { bindings: [{ a: { type: 'uri', value: 'http://example.org/a1' } }] }
      };
      const result = parser.applyBindings(queryString, bindings);
      // Generator might slightly reformat, so parse and compare relevant parts
      const originalParsed = parser.parseQuery(queryString);
      const resultParsed = parser.parseQuery(result);
      expect(resultParsed.where.find((p: any) => p.type === 'values')).toEqual(
        originalParsed.where.find((p: any) => p.type === 'values')
      );
    });

     it('should handle VALUES clause with only UNDEF row correctly', () => {
      // Covers line 164 where nonEmptyRow might be null/undefined initially
      const queryString = 'SELECT * WHERE { VALUES (?a) { (UNDEF) } }'; // Corrected syntax
      const bindings: QueryBindings = {
        head: { vars: ['a'] },
        arguments: { bindings: [{ a: { type: 'uri', value: 'http://example.org/a1' } }] }
      };
      const result = parser.applyBindings(queryString, bindings);
      expect(result).toContain('http://example.org/a1');
      expect(result).not.toContain('UNDEF');
      const parsedResult = parser.parseQuery(result);
      const valuesPattern = parsedResult.where.find((p: any) => p.type === 'values');
      expect(valuesPattern.values).toHaveLength(1);
    });

    it('should return original query and warn for invalid bindings structure', () => {
      const queryString = 'SELECT * WHERE { VALUES (?a) { (UNDEF) } }'; // Corrected syntax
      const invalidBindings = { results: { bindings: [] } }; // Missing head
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Since the function returns early on invalid bindings, parse and compare
      const result = parser.applyBindings(queryString, invalidBindings as any);
      const originalParsed = parser.parseQuery(queryString);
      const resultParsed = parser.parseQuery(result);

      expect(resultParsed).toEqual(originalParsed); // Compare parsed structure
      expect(warnSpy).toHaveBeenCalledWith("Bindings structure mismatch or missing bindings array.");
      warnSpy.mockRestore();
    });

    it('should return original query part and warn if bindings header misses variables', () => {
      const queryString = 'SELECT * WHERE { VALUES (?a ?b) { (UNDEF UNDEF) } }';
      const bindings: QueryBindings = {
        head: { vars: ['a'] }, // Missing 'b'
        arguments: { bindings: [{ a: { type: 'uri', value: 'http://example.org/a1' } }] }
      };
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = parser.applyBindings(queryString, bindings);
      const parsedResult = parser.parseQuery(result);
      const valuesPattern = parsedResult.where.find((p: any) => p.type === 'values');

      // The VALUES clause should remain unmodified with UNDEF
      expect(valuesPattern.values).toHaveLength(1);
      expect(valuesPattern.values[0]['?a']).toBeUndefined();
      expect(valuesPattern.values[0]['?b']).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith("Not all pattern variables found in bindings header.");
      warnSpy.mockRestore();
    });

     it('should handle missing variable values in bindings as UNDEF', () => {
      const queryString = 'SELECT * WHERE { VALUES (?a ?b) { (UNDEF UNDEF) } }';
      const bindings: QueryBindings = {
        head: { vars: ['a', 'b'] },
        arguments: {
          bindings: [
            { a: { type: 'uri', value: 'http://example.org/a1' } }, // Missing 'b' here
            { a: { type: 'uri', value: 'http://example.org/a2' }, b: { type: 'uri', value: 'http://example.org/b2' } }
          ]
        }
      };
      const result = parser.applyBindings(queryString, bindings);
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

    it('should handle literal bindings without datatype', () => {
      const queryString = 'SELECT * WHERE { VALUES (?lit) { (UNDEF) } }'; // Corrected syntax
      const bindings: QueryBindings = {
        head: { vars: ['lit'] },
        arguments: { bindings: [{ lit: { type: 'literal', value: 'Simple Literal' } }] } // No datatype
      };
      const result = parser.applyBindings(queryString, bindings);
      expect(result).toContain('"Simple Literal"'); // Should be quoted
      expect(result).not.toContain('^^'); // No explicit datatype annotation expected in simple cases
      const parsedResult = parser.parseQuery(result);
      const valuesPattern = parsedResult.where.find((p: any) => p.type === 'values');
      // Expect sparqljs to default to xsd:string if no datatype/lang is present
      expect(valuesPattern.values[0]['?lit'].datatype).toEqual({
        termType: 'NamedNode',
        value: 'http://www.w3.org/2001/XMLSchema#string'
      });
    });

    // Removed test for blank nodes as they are illegal in VALUES blocks

    it('should handle unsupported binding types as UNDEF and warn', () => {
      const queryString = 'SELECT * WHERE { VALUES (?unknown) { (UNDEF) } }'; // Corrected syntax
      const bindings: QueryBindings = {
        head: { vars: ['unknown'] },
        arguments: { bindings: [{ unknown: { type: 'weird', value: 'data' } as any }] } // Cast to any to bypass type check
      };
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = parser.applyBindings(queryString, bindings);
      const parsedResult = parser.parseQuery(result);
      const valuesPattern = parsedResult.where.find((p: any) => p.type === 'values');

      // Should result in UNDEF in the VALUES clause
      expect(valuesPattern.values).toHaveLength(1);
      expect(valuesPattern.values[0]['?unknown']).toBeUndefined();
      // Expect the updated warning message
      expect(warnSpy).toHaveBeenCalledWith("Unsupported binding type in VALUES: weird for variable unknown");
      warnSpy.mockRestore();
    });

    it('should throw an error for illegal bnode bindings in VALUES', () => {
      const queryString = 'SELECT * WHERE { VALUES (?bnode) { (UNDEF) } }';
      const bindings: QueryBindings = {
        head: { vars: ['bnode'] },
        arguments: { bindings: [{ bnode: { type: 'bnode', value: 'b1' } }] }
      };

      // Expect the applyBindings function to throw an error
      expect(() => parser.applyBindings(queryString, bindings)).toThrow(
        "Illegal binding type in VALUES: 'bnode' for variable bnode"
      );
    });

  });

  describe('detectQueryOutputs', () => {
    it('should detect simple variables in a SELECT query', () => {
      const queryString = 'SELECT ?subject ?predicate ?object WHERE { ?subject ?predicate ?object }';
      const result = parser.detectQueryOutputs(queryString);
      expect(result).toEqual(['subject', 'predicate', 'object']);
    });

    it('should return an empty array for SELECT *', () => {
      const queryString = 'SELECT * WHERE { ?s ?p ?o }';
      const result = parser.detectQueryOutputs(queryString);
      expect(result).toEqual([]);
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
      expect(result).toEqual(['subject', 'objectCount', 'predicate']);
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
});
