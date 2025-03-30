/**
 * Types for the SPARQL query proxy server
 */

// Interface for SPARQL binding value
export interface SparqlBindingValue {
  type: 'uri' | 'literal' | 'bnode';
  value: string;
  datatype?: string;
  'xml:lang'?: string;
}

// Interface for a single binding row
export interface SparqlBinding {
  [variable: string]: SparqlBindingValue;
}

// Interface for query bindings in SPARQL JSON results format
export interface QueryBindings {
  head: {
    vars: string[];
  };
  arguments: {
    bindings: SparqlBinding[];
  };
}

// Interface for query execution options
export interface QueryExecutionOptions {
  endpoint: string;
  bindings?: QueryBindings;
  timeout?: number;
  defaultGraphUri?: string[];
  namedGraphUri?: string[];
  headers?: Record<string, string>;
}

// Interface for query execution result
export interface Backend {
  id: string;
  name: string;
  endpoint: string;
  username?: string;
  password?: string;
  description?: string;
}

export interface BackendState {
  currentBackend: string | null;
  backends: Backend[];
}

export interface VariableRestrictions {
  type: ('uri' | 'literal')[];
  language?: string[];
  datatype?: string[];
  direction?: ('ltr' | 'rtl')[];
}

export interface VariableGroup {
  vars: {
    [variableName: string]: VariableRestrictions;
  };
}

export interface StoredQuery {
  id: string;
  name: string;
  description?: string;
  query: string;
  createdAt: Date;
  updatedAt: Date;
  variables?: VariableGroup[];
}

export interface Library {
    id: string;
    name: string;
    queries: StoredQuery[];
}
