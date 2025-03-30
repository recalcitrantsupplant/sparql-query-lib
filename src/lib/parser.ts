import { Parser, Generator as SparqlGenerator } from 'sparqljs';

type ParsedQuery = any; // Consider defining a more specific type if possible

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
    return pattern.values.some((valueRow: any) => {
      // Check if all properties in this row are undefined
      return Object.values(valueRow).every(value => value === undefined);
    });
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
   * Detect variables in a SPARQL query that are marked with UNDEF in VALUES clauses
   * @param queryString The SPARQL query string to analyze
   * @returns Array of variable groups found in the query
   */
  detectVariables(queryString: string): string[][] {
    const parsedQuery = this.parseQuery(queryString);
    const variableGroups: string[][] = [];

    // Helper function to process VALUES patterns
    const processValuesPattern = (pattern: any) => {
      if (pattern.type === 'values' && pattern.values && pattern.values.length > 0) {
        if (this.hasRowWithAllUndef(pattern)) {
          // Get variable names from the keys of any non-empty row
          // Find a non-empty row to extract variable names
          const nonEmptyRow = pattern.values.find((row: any) => Object.keys(row).length > 0);

          if (nonEmptyRow) {
            // Create a variable group for this VALUES clause
            const variables: string[] = Object.keys(nonEmptyRow).map((variable: string) => {
              const varName = variable.startsWith('?') ? variable.substring(1) : variable;
              return varName;
            });

            variableGroups.push(variables);
          }
        }
      }
    };

    // Process the query to find VALUES patterns
    const processPatterns = (patterns: any[]) => {
      if (!patterns) return;
      
      for (const pattern of patterns) {
        // Check if this pattern is a VALUES clause
        if (pattern.type === 'values') {
          processValuesPattern(pattern);
        }
        
        // Recursively process nested patterns
        if (pattern.patterns) {
          processPatterns(pattern.patterns);
        }
        
        // Check for optional patterns
        if (pattern.optional) {
          processPatterns(pattern.optional);
        }
        
        // Check for union patterns
        if (pattern.union) {
          pattern.union.forEach((unionPattern: any) => {
            processPatterns([unionPattern]);
          });
        }
        // Check for filter patterns with EXISTS or NOT EXISTS
        if (pattern.filter && (pattern.filter.exists || pattern.filter.notexists)) {
          // const subPattern = pattern.filter.exists || pattern.filter.notexists; // Original code had unused variable
          // Assuming we need to process patterns within EXISTS/NOT EXISTS
          if (pattern.filter.patterns) {
             processPatterns(pattern.filter.patterns);
          }
        }
      }
    };

    // Start processing from the query's where clause
    if (parsedQuery.where) {
      processPatterns(parsedQuery.where);
    }

    return variableGroups;
  }

  /**
   * Detect output variables or aliased expressions in a SELECT query.
   * Returns the names as they would appear in the SPARQL JSON results header.
   * @param queryString The SPARQL query string to analyze
   * @returns Array of output variable/alias names. Returns an empty array for non-SELECT queries or SELECT *.
   */
  detectQueryOutputs(queryString: string): string[] {
    const parsedQuery = this.parseQuery(queryString);

    if (parsedQuery.queryType !== 'SELECT' || !parsedQuery.variables) {
      return []; // Not a SELECT query or invalid structure
    }

    const outputs: string[] = [];
    for (const item of parsedQuery.variables) {
      if (typeof item === 'string' && item === '*') {
        // For SELECT *, the specific variables depend on the WHERE clause.
        // Returning an empty array as the explicit list is unknown from SELECT clause alone.
        return []; 
      } else if (item.termType === 'Variable') {
        // Simple variable like ?var
        outputs.push(item.value);
      } else if (item.variable && item.variable.termType === 'Variable') {
        // Expression with alias like (COUNT(?s) AS ?count)
        outputs.push(item.variable.value);
      }
      // Ignore items without a clear output variable name (e.g., expressions without AS)
    }

    return outputs;
  }


  /**
   * Apply bindings to a SPARQL query by replacing UNDEF values
   * @param queryString The original SPARQL query string
   * @param bindings The bindings to apply
   * @returns The modified query string with bindings applied
   */
  applyBindings(queryString: string, bindings: any): string {
    const parsedQuery = this.parseQuery(queryString);
    
    // Helper function to apply bindings to VALUES patterns
    const applyBindingsToValuesPattern = (pattern: any): void => {
      // Initial check for VALUES pattern type
      if (pattern.type !== 'values' || !pattern.values || pattern.values.length === 0) {
        return;
      }

      // Check if there's a row with UNDEF to replace
      if (!this.hasRowWithAllUndef(pattern)) {
        return; // Nothing to bind if no UNDEF row exists
      }

      // Check bindings structure validity (supports SPARQL JSON results or original assumed format)
      const isSparqlJsonFormat = bindings && bindings.head && bindings.head.vars && bindings.results && bindings.results.bindings;
      const isOriginalFormat = bindings && bindings.arguments && bindings.arguments.bindings;

      if (!isSparqlJsonFormat && !isOriginalFormat) {
          console.warn("Bindings structure mismatch or missing bindings array.");
          return; // Invalid bindings structure
      }

      // Find a non-empty row to extract variable names (safe to do after checks)
      const nonEmptyRow = pattern.values.find((row: any) => Object.keys(row).length > 0);
      if (!nonEmptyRow) {
        return;
      }
      
      // Get the variable names without the '?' prefix
      const varNames = Object.keys(nonEmptyRow).map((v: string) => 
        v.startsWith('?') ? v.substring(1) : v
      );

      // Determine the source of bindings based on structure
      let bindingSource: any[] = [];
      let bindingVars: string[] = [];

      if (bindings.results && bindings.results.bindings) { // SPARQL JSON Result format
        bindingSource = bindings.results.bindings;
        bindingVars = bindings.head.vars;
      } else if (bindings.arguments && bindings.arguments.bindings) { // Original assumed format
         bindingSource = bindings.arguments.bindings;
         // Use head.vars if available, otherwise infer from first binding
         bindingVars = bindings.head?.vars ?? (bindingSource.length > 0 ? Object.keys(bindingSource[0]) : []);
      } else {
         console.warn("Unsupported bindings format.");
         return;
      }

      // Check if all variables in this pattern have bindings available in the source
      const hasAllVars = varNames.every((varName: string) => 
        bindingVars.includes(varName)
      );
      
      if (!hasAllVars) {
         console.warn("Not all pattern variables found in bindings header.");
        return;
      }
      
      // Only proceed if we have bindings to apply
      if (bindingSource.length === 0) {
        return;
      }
      
      // Remove the row with all UNDEF values
      const existingValues = pattern.values.filter((row: any) => {
        // Keep rows that don't have all undefined values
        return !Object.values(row).every(value => value === undefined);
      });
      
      // Create new rows for the provided bindings
      const newRows = bindingSource.map((binding: any) => {
        const newRow: any = {};
        
        varNames.forEach((varName: string) => {
          const varKey = varName.startsWith('?') ? varName : `?${varName}`;
          const bindingValue = binding[varName]; // Access binding using the variable name
          
          if (!bindingValue) {
            newRow[varKey] = undefined; // UNDEF
          } else {
            // Create the appropriate node based on the binding type
            switch (bindingValue.type) {
              case 'uri':
                newRow[varKey] = {
                  termType: 'NamedNode',
                  value: bindingValue.value
                };
                break;
              case 'literal':
                newRow[varKey] = {
                  termType: 'Literal',
                  value: bindingValue.value,
                  language: bindingValue['xml:lang'] || '',
                  datatype: bindingValue.datatype ? {
                    termType: 'NamedNode',
                    value: bindingValue.datatype
                  } : undefined // Handle missing datatype
                 };
                 break;
              case 'bnode': // bnode (Blank Nodes) are illegal in VALUES blocks per SPARQL spec.
                 throw new Error(`Illegal binding type in VALUES: 'bnode' for variable ${varName}`);
              default:
                 console.warn(`Unsupported binding type in VALUES: ${bindingValue.type} for variable ${varName}`);
                newRow[varKey] = undefined; // UNDEF for other unsupported types
            }
          }
        });
        
        return newRow;
      });
      
      // Append the new rows to the existing values
      pattern.values = [...existingValues, ...newRows];
    };

    // Process the query to find and modify VALUES patterns
    const processPatterns = (patterns: any[]): void => {
      if (!patterns) return;
      
      for (const pattern of patterns) {
        // Check if this pattern is a VALUES clause
        if (pattern.type === 'values') {
          applyBindingsToValuesPattern(pattern);
        }
        
        // Recursively process nested patterns
        if (pattern.patterns) {
          processPatterns(pattern.patterns);
        }
        
        // Check for graph patterns
        if (pattern.type === 'graph' && pattern.patterns) {
           processPatterns(pattern.patterns);
        }

        // Check for service patterns
        if (pattern.type === 'service' && pattern.patterns) {
           processPatterns(pattern.patterns);
        }
        
        // Check for group patterns (common wrapper)
        if (pattern.type === 'group' && pattern.patterns) {
           processPatterns(pattern.patterns);
        }

        // Check for optional patterns - process patterns inside optional
        if (pattern.type === 'optional' && pattern.patterns) {
          processPatterns(pattern.patterns);
        }
        
        // Check for union patterns - process patterns inside each part of the union
        if (pattern.type === 'union') {
          // sparqljs uses pattern.patterns for union members, each member is typically a group
          pattern.patterns.forEach((unionMember: any) => {
            // Process the patterns *within* the union member (e.g., the group)
            if (unionMember && unionMember.patterns) {
              processPatterns(unionMember.patterns);
            } else {
              // Handle cases where a union member might not be a standard group or might be empty
              // Depending on expected SPARQL structures, might need more robust handling
              console.warn("Unexpected structure within UNION pattern:", unionMember);
            }
          });
        }
        
        // Check for minus patterns
        if (pattern.type === 'minus' && pattern.patterns) {
           processPatterns(pattern.patterns);
        }

        // Check for filter patterns with EXISTS or NOT EXISTS
        if (pattern.type === 'filter' && pattern.expression && (pattern.expression.type === 'operation')) {
           if (pattern.expression.operator === 'exists' || pattern.expression.operator === 'notexists') {
              // Process patterns within EXISTS/NOT EXISTS
              if(pattern.expression.args && pattern.expression.args[0] && pattern.expression.args[0].patterns) {
                 processPatterns(pattern.expression.args[0].patterns);
              }
           }
        }
      }
    };

    // Start processing from the query's where clause
    if (parsedQuery.where) {
      processPatterns(parsedQuery.where);
    }

    // Generate the modified query string
    return this.generator.stringify(parsedQuery);
  }
}
