// experimental/chained-select/types.ts

/**
 * Represents a standard SPARQL JSON result binding value.
 */
export interface SparqlBindingValue {
  type: 'uri' | 'literal' | 'bnode';
  value: string;
  'xml:lang'?: string;
  datatype?: string;
}

/**
 * Represents a single binding (row) in SPARQL JSON results.
 * Keys are variable names (strings).
 */
export interface SparqlBinding {
  [key: string]: SparqlBindingValue;
}

/**
 * Represents the standard SPARQL JSON results structure.
 */
export interface SparqlResults {
  head: {
    vars: string[];
    link?: string[]; // Optional link headers
  };
  results: {
    bindings: SparqlBinding[];
  };
  boolean?: boolean; // For ASK queries
}

/**
 * Represents a SPARQL binding value that has been augmented
 * with nested results from a chained query.
 */
export interface AugmentedSparqlBindingValue extends SparqlBindingValue {
  // Nested results are added directly to the binding value object
  head?: SparqlResults['head'];
  results?: SparqlResults['results'];
}

/**
 * Represents a SPARQL binding where one or more values might be augmented.
 */
export interface AugmentedSparqlBinding {
  [key: string]: SparqlBindingValue | AugmentedSparqlBindingValue;
}

/**
 * Represents the SPARQL JSON results structure where bindings
 * for linking variables have been augmented with nested results.
 */
export interface AugmentedSparqlResults {
  head: {
    vars: string[];
    link?: string[];
  };
  results: {
    bindings: AugmentedSparqlBinding[];
  };
  boolean?: boolean;
}

/**
 * Configuration for chaining a child query to a parent query.
 */
export interface ChainingConfig {
  /**
   * The variable name in the parent query's results that contains the URIs
   * to link to the child query.
   * e.g., "hobbyUri"
   */
  parentLinkVar: string;

  /**
   * The SPARQL SELECT query string for the child objects.
   * This query MUST include a variable that will be used in the VALUES clause
   * to filter based on the parentLinkVar URIs.
   */
  childQuery: string;

  /**
   * The variable name in the child query that corresponds to the linking URIs
   * from the parent query. This variable will be used in the VALUES clause.
   * e.g., "hobby" (if the child query is SELECT ... WHERE { ?hobby ... })
   */
  childLinkVar: string;

  /**
   * Optional nested chaining configurations if the child query itself
   * needs to be linked to further queries.
   */
  chain?: ChainingConfig | ChainingConfig[]; // Allow single or multiple nested chains
}

/**
 * Represents the overall configuration for a query execution,
 * including the initial query and any chaining configurations.
 */
export interface QueryConfig {
  /**
   * The initial SPARQL SELECT query string.
   */
  rootQuery: string;

  /**
   * Optional chaining configurations for nested data.
   */
  chain?: ChainingConfig | ChainingConfig[]; // Allow single or multiple chains from root
}

/**
 * Interface for a function that executes a SPARQL SELECT query.
 */
export type SparqlExecutor = (query: string) => Promise<SparqlResults>;
