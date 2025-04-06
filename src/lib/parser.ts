import { Parser, Generator as SparqlGenerator } from 'sparqljs';
import { logger, SeverityNumber } from './logger'; // Import OTEL logger

type ParsedQuery = any; // Consider defining a more specific type if possible

// Define a structure for the return type of detectParameters
export interface DetectedParameters { // Add export keyword
  valuesParameters: string[][];
  limitParameters: string[]; // Stores all full matched placeholders, e.g., ["LIMIT 001"]
  offsetParameters: string[]; // Stores all full matched placeholders, e.g., ["OFFSET 002"]
  // havingParameters?: string[]; // Placeholder for future implementation
}


export class SparqlQueryParser {
  private parser: any;
  private generator: any;

  constructor() {
    this.parser = new Parser();
    this.generator = new SparqlGenerator();
  }

  /**
   * Check if a VALUES pattern has a row where all values are UNDEF
   * @param pattern The VALUES pattern to check
   * @returns True if there is a row where all values are UNDEF, false otherwise
   */
  private hasRowWithAllUndef(pattern: any): boolean {
    if (pattern.type !== 'values' || !pattern.values) return false;
    
    // In sparqljs, VALUES rows are objects with variable names as keys
    // and the values are either undefined (for UNDEF) or node objects
    logger.emit({ severityNumber: SeverityNumber.DEBUG, body: 'Checking for UNDEF row in pattern:', attributes: { pattern: JSON.stringify(pattern, null, 2) } });
    const result = pattern.values.some((valueRow: any) => {
      logger.emit({ severityNumber: SeverityNumber.DEBUG, body: 'Checking valueRow:', attributes: { valueRow: JSON.stringify(valueRow) } });
      // Check if all properties in this row are undefined
      const allUndef = Object.values(valueRow).every(value => value === undefined);
      logger.emit({ severityNumber: SeverityNumber.DEBUG, body: `Row all UNDEF? ${allUndef}` });
      return allUndef;
    });
    logger.emit({ severityNumber: SeverityNumber.DEBUG, body: `hasRowWithAllUndef result: ${result}` });
    return result;
  }

  /**
   * Parse a SPARQL query string into a structured object
   * @param queryString The SPARQL query string to parse
   * @returns The parsed query object
   */
  parseQuery(queryString: string): any {
    try {
      return this.parser.parse(queryString);
    } catch (error) {
      throw new Error(`Failed to parse SPARQL query: ${(error as Error).message}`);
    }
  }

  /**
   * Detect parameter groups (variables marked with UNDEF in VALUES clauses) in a SPARQL query.
   * @param queryString The SPARQL query string to analyze
   * @returns An object containing detected parameter groups (VALUES) and specific LIMIT/OFFSET parameters.
   */
  detectParameters(queryString: string): DetectedParameters {
    logger.emit({ severityNumber: SeverityNumber.DEBUG, body: 'Starting detectParameters for query:', attributes: { query: queryString } });

    const result: DetectedParameters = {
      valuesParameters: [],
      limitParameters: [],
      offsetParameters: [],
    };

    // --- Detect parameterized LIMIT/OFFSET using regex on the raw string ---
    // Match "LIMIT" followed by whitespace, "000", and capture the parameter name (alphanumeric + underscore)
    const limitRegex = /\bLIMIT\s+000([a-zA-Z0-9_]+)\b/gi; // Case-insensitive, word boundary
    let limitMatch;
    while ((limitMatch = limitRegex.exec(queryString)) !== null) {
      // Store the captured parameter name (group 1)
      result.limitParameters.push(limitMatch[1]);
      logger.emit({ severityNumber: SeverityNumber.DEBUG, body: 'Detected parameterized LIMIT:', attributes: { paramName: limitMatch[1] } });
    }

    // Match "OFFSET" followed by whitespace, "000", and capture the parameter name (alphanumeric + underscore)
    const offsetRegex = /\bOFFSET\s+000([a-zA-Z0-9_]+)\b/gi; // Case-insensitive, word boundary
    let offsetMatch;
    while ((offsetMatch = offsetRegex.exec(queryString)) !== null) {
      // Store the captured parameter name (group 1)
      result.offsetParameters.push(offsetMatch[1]);
      logger.emit({ severityNumber: SeverityNumber.DEBUG, body: 'Detected parameterized OFFSET:', attributes: { paramName: offsetMatch[1] } });
    }
    // --- End LIMIT/OFFSET detection ---


    // --- Detect VALUES parameters (existing logic) ---
    const parsedQuery = this.parseQuery(queryString);
    logger.emit({ severityNumber: SeverityNumber.DEBUG, body: 'Parsed Query for VALUES detection:', attributes: { parsedQuery: JSON.stringify(parsedQuery, null, 2) } });
    // const parameterGroups: string[][] = []; // Use result.valuesParameters instead

    // Helper function to process VALUES patterns
    const processValuesPattern = (pattern: any) => {
      logger.emit({ severityNumber: SeverityNumber.DEBUG, body: 'Processing VALUES pattern:', attributes: { pattern: JSON.stringify(pattern, null, 2) } });
      if (pattern.type === 'values' && pattern.values && pattern.values.length > 0) {
        if (this.hasRowWithAllUndef(pattern)) {
          // Get variable names from the keys of any non-empty row
          // Find a non-empty row to extract variable names
          const nonEmptyRow = pattern.values.find((row: any) => Object.keys(row).length > 0);

          if (nonEmptyRow) {
          // Create a parameter group for this VALUES clause
          const parameters: string[] = Object.keys(nonEmptyRow).map((variable: string) => {
            const varName = variable.startsWith('?') ? variable.substring(1) : variable;
            return varName;
          }).sort(); // Sort parameters alphabetically
          logger.emit({ severityNumber: SeverityNumber.DEBUG, body: 'Found VALUES parameters:', attributes: { parameters: parameters.join(', ') } });
          result.valuesParameters.push(parameters);
        }
      }
      }
    };

    // Process the query recursively to find all relevant VALUES patterns
    const processPatterns = (patterns: any[]): void => {
      if (!patterns) return;

      for (const pattern of patterns) {
        logger.emit({ severityNumber: SeverityNumber.DEBUG, body: 'Processing pattern in processPatterns:', attributes: { pattern: JSON.stringify(pattern, null, 2) } });
        // Check if this pattern is a VALUES clause
        if (pattern.type === 'values') {
          processValuesPattern(pattern);
        }
        // Only recurse into pattern types that can contain groups/values clauses
        // Avoid recursing into VALUES itself again.
        else if (pattern.type === 'group' || pattern.type === 'optional' || pattern.type === 'graph' || pattern.type === 'service' || pattern.type === 'minus') {
           if (pattern.patterns) {
               processPatterns(pattern.patterns);
           }
        }
        // Handle UNION specifically as it contains an array of pattern groups
        else if (pattern.type === 'union' && Array.isArray(pattern.patterns)) {
           pattern.patterns.forEach((unionMember: any) => {
             if (unionMember && unionMember.patterns) { // Recurse into each part of the union
               processPatterns(unionMember.patterns);
            }
         });
         }
         // Handle FILTER EXISTS/NOT EXISTS
         else if (pattern.type === 'filter' && pattern.expression && (pattern.expression.type === 'operation')) {
            if (pattern.expression.operator === 'exists' || pattern.expression.operator === 'notexists') {
               if(pattern.expression.args && pattern.expression.args[0] && pattern.expression.args[0].patterns) {
                  processPatterns(pattern.expression.args[0].patterns);
               }
            }
         }
         // Handle nested SELECT/CONSTRUCT/etc. queries (e.g., within DESCRIBE)
         else if (pattern.type === 'query' && pattern.where) {
             logger.emit({ severityNumber: SeverityNumber.DEBUG, body: 'Recursing into nested query:', attributes: { nestedQueryType: pattern.queryType } });
             processPatterns(pattern.where);
         }
       }
     };


    // Start processing from the query's where clause or update operations
    if (parsedQuery.type === 'update' && Array.isArray(parsedQuery.updates)) {
        // Handle UPDATE queries
        parsedQuery.updates.forEach((updateOperation: any) => {
            // Check if the specific update operation has a 'where' clause
            if (updateOperation.where) {
                // Process the patterns within this update's WHERE clause
                processPatterns(updateOperation.where);
            }
        });
    } else if (parsedQuery.where) {
      // Handle SELECT/ASK/DESCRIBE/CONSTRUCT queries
      processPatterns(parsedQuery.where);
    }
    // --- End VALUES detection ---

    return result;
  }

  // Helper function to find variables within expressions (used in FILTER, BIND, etc.)
  private findVariablesInExpression(expression: any): Set<string> {
      const variables = new Set<string>();
      if (!expression) return variables;

      if (expression.termType === 'Variable') {
          variables.add(expression.value);
      } else if (expression.type === 'operation' && expression.args) {
          expression.args.forEach((arg: any) => {
              this.findVariablesInExpression(arg).forEach(v => variables.add(v));
          });
      } else if (expression.type === 'functionCall' && expression.args) {
          expression.args.forEach((arg: any) => {
              this.findVariablesInExpression(arg).forEach(v => variables.add(v));
          });
      }
      // Add checks for other expression types if necessary (e.g., aggregates)

      return variables;
  }

  // Helper function to recursively find variables in patterns
  private findVariablesInPatterns(patterns: any[]): Set<string> {
      const variables = new Set<string>();

      const processPattern = (pattern: any) => {
          if (!pattern) return;

          // Basic Triple Pattern (inside BGP)
          if (pattern.type === 'bgp' && pattern.triples) {
              pattern.triples.forEach((triple: any) => {
                  ['subject', 'predicate', 'object'].forEach(pos => {
                      if (triple[pos]?.termType === 'Variable') {
                          variables.add(triple[pos].value);
                      }
                      // Also check variables inside triple terms like TripleNodes if using RDF-star
                  });
              });
          }
          // BIND
          else if (pattern.type === 'bind' && pattern.variable?.termType === 'Variable') {
              variables.add(pattern.variable.value);
              // Also check expression for variables
              if (pattern.expression) {
                  this.findVariablesInExpression(pattern.expression).forEach(v => variables.add(v));
              }
          }
          // Group, Optional, Graph, Service, Minus
          else if (['group', 'optional', 'graph', 'service', 'minus'].includes(pattern.type) && pattern.patterns) {
              this.findVariablesInPatterns(pattern.patterns).forEach(v => variables.add(v));
          }
          // Union
          else if (pattern.type === 'union' && Array.isArray(pattern.patterns)) {
              pattern.patterns.forEach((unionMember: any) => {
                  if (unionMember?.patterns) {
                      this.findVariablesInPatterns(unionMember.patterns).forEach(v => variables.add(v));
                  }
              });
          }
          // Filter (check expression)
          else if (pattern.type === 'filter' && pattern.expression) {
              this.findVariablesInExpression(pattern.expression).forEach(v => variables.add(v));
          }
          // Subquery (SELECT type) - variables inside are locally scoped unless projected.
          // For SELECT *, we generally only care about variables visible *outside* the subquery.
          // A simple approach is to ignore subquery variables here, as SELECT * usually refers
          // to the variables available in the *current* scope.
          // TODO: Refine if subquery projection analysis is needed for specific use cases.

          // Values - variables defined here are part of the pattern
          else if (pattern.type === 'values' && pattern.values && pattern.values.length > 0) {
              const firstRow = pattern.values[0];
              Object.keys(firstRow).forEach(varKey => {
                  if (varKey.startsWith('?')) {
                      variables.add(varKey.substring(1));
                  }
              });
          }
      };

      patterns.forEach(processPattern);
      return variables;
  }


  /**
   * Detect output variables or aliased expressions in a SELECT query.
   * Returns the names as they would appear in the SPARQL JSON results header.
   * Handles SELECT * by finding variables in the WHERE clause.
   * @param queryString The SPARQL query string to analyze
   * @returns Array of output variable/alias names for SELECT queries. Returns an empty array for non-SELECT queries (including CONSTRUCT, ASK, DESCRIBE).
   */
  detectQueryOutputs(queryString: string): string[] {
      const parsedQuery = this.parseQuery(queryString);

      // Only SELECT queries have tabular output variables
      if (parsedQuery.queryType !== 'SELECT' || !parsedQuery.variables) {
          return []; // Return empty array for CONSTRUCT, ASK, DESCRIBE, or invalid SELECT
      }

      // Handle SELECT queries (existing logic)
      // Check for SELECT *
      // sparqljs represents SELECT * as [{}] in some cases, or ["*"] in others.
      const isSelectStar = parsedQuery.variables.length === 1 && 
                           ( (typeof parsedQuery.variables[0] === 'string' && parsedQuery.variables[0] === '*') ||
                             (typeof parsedQuery.variables[0] === 'object' && Object.keys(parsedQuery.variables[0]).length === 0));

      if (isSelectStar) {
          // If SELECT *, find variables in the WHERE clause
          if (!parsedQuery.where) {
              return []; // No WHERE clause, no variables
          }
          // Use the helper to find variables in the WHERE patterns
          const foundVariables = this.findVariablesInPatterns(parsedQuery.where);
          const sortedVars = Array.from(foundVariables).sort();
          // Return a sorted list for consistency
          return sortedVars;
      } else {
          // Original logic for explicit variables/aliases
          const outputs: string[] = [];
          for (const item of parsedQuery.variables) {
              // Note: sparqljs represents variables slightly differently depending on context
              // Simple variable: { termType: 'Variable', value: 'varName' }
              // Expression alias: { expression: {...}, variable: { termType: 'Variable', value: 'aliasName' } }
              if (item.termType === 'Variable') {
                  outputs.push(item.value);
              } else if (item.variable && item.variable.termType === 'Variable') {
                  // This covers the (expression AS ?alias) case
                  outputs.push(item.variable.value);
              }
              // Ignore items without a clear output variable name (e.g., expressions without AS)
          }
          // Sort the outputs alphabetically for consistency
          return outputs.sort();
      }
      // No need for specific CONSTRUCT handling here, the initial check covers it.
  }


  /**
   * Applies structured arguments to a SPARQL query by replacing UNDEF values in matching VALUES clauses.
   * Each argument set in the input array should correspond to one VALUES clause with an UNDEF row, matched in order of appearance.
   *
   * @param queryString The original SPARQL query string.
   * @param argumentSets An array of argument sets, each mimicking SPARQL JSON results format but with an 'arguments' key instead of 'bindings'.
   *                     Example: [{ head: { vars: ["var1", "var2"] }, arguments: [{ var1: { type: "literal", value: "a" }, var2: { type: "uri", value: "http://example.com/a" } }] }]
   * @returns The modified query string with arguments applied.
   * @throws Error if the number of UNDEF VALUES clauses doesn't match the number of argument sets,
   *         if variables in a VALUES clause don't match the corresponding argument set header,
   *         or if invalid argument types are provided.
   */
  applyArguments(queryString: string, argumentSets: any[]): string {
    if (!Array.isArray(argumentSets)) {
      throw new Error("Invalid arguments format: Expected an array of argument sets.");
    }

    const parsedQuery = this.parseQuery(queryString);
    const undefValuesPatterns: any[] = []; // Store patterns to process later

    // Helper function to find VALUES patterns with an UNDEF row
    const findAndStoreUndefValuesPattern = (pattern: any): void => {
      // Initial check for VALUES pattern type
      if (pattern.type !== 'values' || !pattern.values || pattern.values.length === 0) {
        return;
      }

      // Check if there's a row with UNDEF to replace
      if (!this.hasRowWithAllUndef(pattern)) {
        return; // Nothing to bind if no UNDEF row exists
      }

      // Store the pattern if it has an UNDEF row
      const nonEmptyRow = pattern.values.find((row: any) => Object.keys(row).length > 0);
      if (!nonEmptyRow) {
        // This case should ideally not happen if hasRowWithAllUndef is true, but safety check
        return;
      }
      // Store variable names found in the UNDEF pattern for later matching
      pattern._variables = Object.keys(nonEmptyRow).map((v: string) => v.startsWith('?') ? v.substring(1) : v);
      undefValuesPatterns.push(pattern);
    };

    // Process the query recursively to find all relevant VALUES patterns
    // This needs to be careful not to double-count or miscount nested patterns.
    const processPatterns = (patterns: any[]): void => {
      if (!patterns) return;

      for (const pattern of patterns) {
        // Check if this pattern is a VALUES clause
        if (pattern.type === 'values') {
          findAndStoreUndefValuesPattern(pattern); // Find and store if it has UNDEF
        }
        // Only recurse into pattern types that can contain groups/values clauses
        // Avoid recursing into VALUES itself again.
        else if (pattern.type === 'group' || pattern.type === 'optional' || pattern.type === 'graph' || pattern.type === 'service' || pattern.type === 'minus') {
           if (pattern.patterns) {
               processPatterns(pattern.patterns);
           }
        }
        // Handle UNION specifically as it contains an array of pattern groups
        else if (pattern.type === 'union' && Array.isArray(pattern.patterns)) {
           pattern.patterns.forEach((unionMember: any) => {
             if (unionMember && unionMember.patterns) { // Recurse into each part of the union
               processPatterns(unionMember.patterns);
             }
           });
        }
        // Handle FILTER EXISTS/NOT EXISTS
        else if (pattern.type === 'filter' && pattern.expression && (pattern.expression.type === 'operation')) {
           if (pattern.expression.operator === 'exists' || pattern.expression.operator === 'notexists') {
              if(pattern.expression.args && pattern.expression.args[0] && pattern.expression.args[0].patterns) {
                 processPatterns(pattern.expression.args[0].patterns);
               }
            }
         }
         // Handle nested SELECT/CONSTRUCT/etc. queries (e.g., within DESCRIBE)
         else if (pattern.type === 'query' && pattern.where) {
             // Recurse into the nested query's where clause
             processPatterns(pattern.where);
         }
       }
     };

    // Start processing based on query type
    if (parsedQuery.type === 'update' && Array.isArray(parsedQuery.updates)) {
        // Handle UPDATE queries (INSERT/DELETE/MODIFY)
        parsedQuery.updates.forEach((updateOperation: any) => {
            // Process INSERT patterns if they exist
            if (updateOperation.insert) {
                processPatterns(updateOperation.insert);
            }
            // Process DELETE patterns if they exist
            if (updateOperation.delete) {
                processPatterns(updateOperation.delete);
            }
            // Process WHERE clause patterns if they exist (for MODIFY or DELETE WHERE)
            if (updateOperation.where) {
                processPatterns(updateOperation.where);
            }
            // Note: MODIFY might have separate insert/delete sections within it,
            // sparqljs structure might need closer inspection if MODIFY is used heavily.
            // The above covers common INSERT DATA, DELETE DATA, DELETE WHERE cases.
        });
    } else if (parsedQuery.where) {
      // Handle SELECT/ASK/DESCRIBE/CONSTRUCT queries
      processPatterns(parsedQuery.where);
    }


    // --- Now apply arguments to the found patterns ---
    if (undefValuesPatterns.length !== argumentSets.length) {
      throw new Error(`Mismatch: Found ${undefValuesPatterns.length} UNDEF VALUES clauses, but received ${argumentSets.length} argument sets.`);
    }

    undefValuesPatterns.forEach((pattern, index) => {
      const argSet = argumentSets[index];

      // Validate argument set structure
      if (!argSet || !argSet.head || !Array.isArray(argSet.head.vars) || !Array.isArray(argSet.arguments)) {
        throw new Error(`Invalid structure for argument set at index ${index}. Expected { head: { vars: [...] }, arguments: [...] }.`);
      }

      const patternVars = pattern._variables.sort();
      const argVars = [...argSet.head.vars].sort() as string[]; // Sort copies for comparison

      if (patternVars.length !== argVars.length || !patternVars.every((v: string, i: number) => v === argVars[i])) {
        throw new Error(`Variable mismatch for VALUES clause ${index + 1}. Query expects [${patternVars.join(', ')}], arguments provide [${argVars.join(', ')}].`);
      }

      // If the arguments list for this set is empty, skip modification for this pattern entirely
      if (argSet.arguments.length === 0) {
          logger.emit({ severityNumber: SeverityNumber.WARN, body: `Argument set at index ${index} has an empty arguments list. Skipping modification for VALUES clause with variables [${patternVars.join(', ')}].` });
          // DO NOT modify pattern.values - leave the UNDEF row as is.
      } else {
          // Only filter UNDEF and add new rows if arguments are actually provided
          
          // Filter out the UNDEF row(s) - should only be one per spec, but filter defensively
          pattern.values = pattern.values.filter((row: any) => !Object.values(row).every((value: any) => value === undefined));

          // Create and add new rows from arguments
          argSet.arguments.forEach((argRow: any) => {
            const newSparqlJsRow: any = {};
            argSet.head.vars.forEach((varName: string) => {
              const varKey = `?${varName}`; // sparqljs uses keys with '?'
              const argValue = argRow[varName];

              if (!argValue) {
                newSparqlJsRow[varKey] = undefined; // UNDEF
              } else if (argValue.type === 'uri') {
                newSparqlJsRow[varKey] = { termType: 'NamedNode', value: argValue.value };
              } else if (argValue.type === 'literal') {
                newSparqlJsRow[varKey] = {
                  termType: 'Literal',
                  value: argValue.value,
                  language: argValue['xml:lang'] || '', // Handle language tag
                  datatype: argValue.datatype ? { termType: 'NamedNode', value: argValue.datatype } : undefined
                };
                 // Remove language if datatype is present (RDF 1.1)
                 if (newSparqlJsRow[varKey].datatype && newSparqlJsRow[varKey].language) {
                     delete newSparqlJsRow[varKey].language;
                 }
              } else {
                // bnode is invalid in VALUES, other types unsupported for now
                throw new Error(`Invalid argument type '${argValue.type}' for variable '${varName}' in argument set ${index + 1}. Only 'uri' and 'literal' are supported.`);
              }
            });
            pattern.values.push(newSparqlJsRow);
          });
      }

      // Clean up temporary variable storage regardless
      delete pattern._variables;
    });
    // --- End Applying ---

    // Generate the modified query string
    return this.generator.stringify(parsedQuery);
  }
}
