import oxigraph, { type Term, type Variable, type Store } from 'oxigraph'; // Use standard package import
// Import necessary types from the local types file
import type {
  SparqlExecutor as SparqlQueryExecutor, // Alias to match original usage
  SparqlBinding,
  SparqlResults, // Added import
  SparqlBindingValue // Added import
} from './types';

// Re-export SparqlBinding if needed elsewhere, or adjust imports in consuming files
// Note: Renamed SparqlExecutor to SparqlQueryExecutor locally to match original usage, but imported from ./types
export type { SparqlBinding };

/**
 * Creates a SPARQL query executor that operates on a given Oxigraph store.
 *
 * @param store An initialized Oxigraph store instance (type imported).
 * @returns A SparqlQueryExecutor function.
 */
export function createOxigraphExecutor(store: Store): SparqlQueryExecutor {
  /**
   * Executes a SPARQL SELECT query against the provided Oxigraph store.
   * @param query The SPARQL SELECT query string.
 * @returns A promise resolving to a SparqlResults object.
 */
  const executeQuery: SparqlQueryExecutor = async (query: string): Promise<SparqlResults> => { // Changed return type annotation
    try {
      const resultsIterator = store.query(query); // Returns an iterator for bindings

      // Convert Oxigraph bindings iterator to the SparqlBinding[] format
      const bindingsArray: SparqlBinding[] = [];

      // Oxigraph's query result is synchronous if the store is sync (like MemoryStore)
      // but the API might return an async iterator in the future or for other store types.
      // We'll handle it as potentially async for robustness.
      // Type for individual binding sets seems to be Map<string, Term> based on observed behavior
      type OxigraphBindingSet = Map<string, Term>;

      // Type guards to check iterator types
      const isAsyncIterable = (obj: any): obj is AsyncIterable<OxigraphBindingSet> =>
          obj && typeof obj[Symbol.asyncIterator] === 'function';

      const isSyncIterable = (obj: any): obj is Iterable<OxigraphBindingSet> =>
          obj && typeof obj[Symbol.iterator] === 'function';


      if (isAsyncIterable(resultsIterator)) {
        // Async iterator case
         for await (const oxBindings of resultsIterator) {
            bindingsArray.push(convertOxigraphBindings(oxBindings));
         }
      } else if (isSyncIterable(resultsIterator)) {
         // Sync iterator case
         for (const oxBindings of resultsIterator) {
            bindingsArray.push(convertOxigraphBindings(oxBindings));
         }
      } else if (typeof resultsIterator === 'boolean') {
          // Handle ASK query result (though executor is designed for SELECT)
          console.warn("Oxigraph query returned a boolean (ASK result?) but expected SELECT results.");
          // Return an empty SparqlResults object
          return { head: { vars: [] }, results: { bindings: [] } };
      }
      else {
        // Handle other unexpected return types (e.g., void, potentially errors thrown earlier)
        console.warn("Oxigraph query did not return an expected iterator or boolean type. Query:", query, "Result type:", typeof resultsIterator);
      }

      // Construct the SparqlResults object
      const headVars = bindingsArray.length > 0 ? Object.keys(bindingsArray[0]) : [];
      const results: SparqlResults = {
        head: { vars: headVars },
        results: { bindings: bindingsArray }
      };

      return results; // Return the full SparqlResults object
    } catch (error) {
      console.error('Error executing SPARQL query with Oxigraph:', error);
      console.error('Query:', query); // Log the problematic query
      throw error; // Re-throw the error to be handled by the caller
    }
  };

  return executeQuery;
}

/**
 * Converts a single Oxigraph Bindings object to the SparqlBinding format.
 * Oxigraph terms are directly compatible with RDF/JS terms.
 *
 * @param oxBindings An Oxigraph binding set (Map<string, Term>).
 * @returns A SparqlBinding object.
 */
function convertOxigraphBindings(oxBindings: Map<string, Term>): SparqlBinding {
  const sparqlBinding: SparqlBinding = {};
  // Iterate over the Map entries
  for (const [variableName, term] of oxBindings.entries()) {
    if (typeof variableName === 'string') {
       // Convert Oxigraph Term to SparqlBindingValue
       const bindingValue: SparqlBindingValue = {
         type: term.termType === 'NamedNode' ? 'uri' : term.termType === 'Literal' ? 'literal' : 'bnode',
         value: term.value,
       };
       if (term.termType === 'Literal') {
         if (term.language) {
           bindingValue['xml:lang'] = term.language;
         }
         // Ensure datatype is a NamedNode before accessing its value
         if (term.datatype && term.datatype.termType === 'NamedNode') {
           bindingValue.datatype = term.datatype.value;
         }
       }
       sparqlBinding[variableName] = bindingValue; // Assign the converted value
    } else {
       // Should not happen if keys are strings, but log defensively
       console.warn(`Skipping unexpected non-string variable name in Oxigraph binding:`, variableName);
    }
  }
  return sparqlBinding;
}

// Example of creating an in-memory store (can be moved or adapted)
// export function createInMemoryStore(): oxigraph.Store {
//   return new oxigraph.MemoryStore();
// }
