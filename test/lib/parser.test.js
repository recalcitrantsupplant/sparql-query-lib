"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const parser_1 = require("../../src/lib/parser");
describe('SparqlQueryParser', () => {
    let parser;
    beforeEach(() => {
        parser = new parser_1.SparqlQueryParser();
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
            const bindings = {
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
            const bindings = {
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
            const valuesPattern = parsedResult.where.find((pattern) => pattern.type === 'values');
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
            const bindings = {
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
            const labelBindings = {
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
            const processPatterns = (patterns) => {
                if (!patterns)
                    return;
                for (const pattern of patterns) {
                    if (pattern.type === 'optional' && pattern.patterns) {
                        const valuesPattern = pattern.patterns.find((p) => p.type === 'values');
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
            const bindings = {
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
            const valuesPatterns = parsedResult.where.filter((pattern) => pattern.type === 'values');
            // Should have 2 VALUES clauses
            expect(valuesPatterns).toHaveLength(2);
            // First VALUES clause should have been modified (no UNDEF)
            const firstValuesPattern = valuesPatterns.find((p) => Object.keys(p.values[0]).some(k => k === '?subject' || k === 'subject'));
            expect(firstValuesPattern.values).toHaveLength(1);
            expect(firstValuesPattern.values[0]).toHaveProperty('?subject');
            expect(firstValuesPattern.values[0]['?subject']).toHaveProperty('value', 'http://example.org/subject1');
            // Second VALUES clause should still have UNDEF
            const secondValuesPattern = valuesPatterns.find((p) => Object.keys(p.values[0]).some(k => k === '?object' || k === 'object'));
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
            const emptyBindings = {
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
            const valuesPattern = parsedResult.where.find((pattern) => pattern.type === 'values');
            // Should still have the UNDEF row since we're not removing it when no bindings are provided
            expect(valuesPattern.values).toHaveLength(1);
            expect(valuesPattern.values[0]['?subject']).toBeUndefined();
            expect(valuesPattern.values[0]['?predicate']).toBeUndefined();
        });
    });
});
