import { Parser, Generator as SparqlGenerator } from 'sparqljs';

type ParsedQuery = any;

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
          const subPattern = pattern.filter.exists || pattern.filter.notexists;
          processPatterns(pattern.patterns);
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
   * Apply bindings to a SPARQL query by replacing UNDEF values
   * @param queryString The original SPARQL query string
   * @param bindings The bindings to apply
   * @returns The modified query string with bindings applied
   */
  applyBindings(queryString: string, bindings: any): string {
    const parsedQuery = this.parseQuery(queryString);
    
    // Helper function to apply bindings to VALUES patterns
    const applyBindingsToValuesPattern = (pattern: any): void => {
      if (pattern.type !== 'values' || !pattern.values || pattern.values.length === 0) {
        return;
      }
      
      if (!this.hasRowWithAllUndef(pattern) || !bindings.arguments || !bindings.arguments.bindings) {
        return;
      }
      
      // Find a non-empty row to extract variable names
      const nonEmptyRow = pattern.values.find((row: any) => Object.keys(row).length > 0);
      if (!nonEmptyRow) {
        return;
      }
      
      // Get the variable names without the '?' prefix
      const varNames = Object.keys(nonEmptyRow).map((v: string) => 
        v.startsWith('?') ? v.substring(1) : v
      );
      
      // Check if all variables in this pattern have bindings
      const hasAllVars = varNames.every((varName: string) => 
        bindings.head.vars.includes(varName)
      );
      
      if (!hasAllVars) {
        return;
      }
      
      // Only proceed if we have bindings to apply
      if (bindings.arguments.bindings.length === 0) {
        return;
      }
      
      // Remove the row with all UNDEF values
      const existingValues = pattern.values.filter((row: any) => {
        // Keep rows that don't have all undefined values
        return !Object.values(row).every(value => value === undefined);
      });
      
      // Create new rows for the provided bindings
      const newRows = bindings.arguments.bindings.map((binding: any) => {
        const newRow: any = {};
        
        varNames.forEach((varName: string) => {
          const varKey = varName.startsWith('?') ? varName : `?${varName}`;
          const bindingValue = binding[varName];
          
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
                  } : undefined
                };
                break;
              default:
                newRow[varKey] = undefined; // UNDEF
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
        
        // Check for optional patterns
        if (pattern.optional) {
          processPatterns([pattern.optional]);
        }
        
        // Check for union patterns
        if (pattern.union) {
          pattern.union.forEach((unionPattern: any) => {
            processPatterns([unionPattern]);
          });
        }
        
        // Check for filter patterns with EXISTS or NOT EXISTS
        if (pattern.filter && (pattern.filter.exists || pattern.filter.notexists)) {
          const subPattern = pattern.filter.exists || pattern.filter.notexists;
          processPatterns(pattern.patterns);
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
