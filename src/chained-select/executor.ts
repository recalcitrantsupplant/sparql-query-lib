// experimental/chained-select/executor.ts
import {
  QueryConfig,
  SparqlExecutor,
  SparqlResults,
  AugmentedSparqlResults,
  ChainingConfig,
  SparqlBinding,
  AugmentedSparqlBinding,
  SparqlBindingValue,
  AugmentedSparqlBindingValue,
} from './types';
import { Parser as SparqlParser, Generator as SparqlGenerator } from 'sparqljs';

// Helper for deep cloning (simple JSON based)
// Note: This won't handle Dates, Functions, Maps, Sets, etc., but is sufficient for SPARQL JSON results.
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Instantiate parser and generator once
const sparqlParser = new SparqlParser();
const sparqlGenerator = new SparqlGenerator();

/**
 * Processes a single level of chaining configuration.
 * Fetches child data based on parent results and augments the parent results.
 * Handles nested chains recursively.
 *
 * @param parentResults The results from the parent query (potentially already augmented).
 * @param chainConfig The chaining configuration for this level.
 * @param sparqlExecutor The function to execute SPARQL queries.
 * @returns The augmented parent results.
 */
async function processSingleChain(
  parentResults: AugmentedSparqlResults,
  chainConfig: ChainingConfig,
  sparqlExecutor: SparqlExecutor
): Promise<AugmentedSparqlResults> {
  const { parentLinkVar, childQuery, childLinkVar, chain: nestedChain } = chainConfig;
  // Removed diagnostic log

  // 1. Collect unique linking URIs from parent results
  const linkingUris = new Set<string>();
  parentResults.results.bindings.forEach(binding => {
    const linkBinding = binding[parentLinkVar];
    // Ensure it's a URI and has a value
    if (linkBinding && linkBinding.type === 'uri' && linkBinding.value) {
      linkingUris.add(linkBinding.value);
    }
  });

  const uniqueUris = Array.from(linkingUris);
  if (uniqueUris.length === 0) {
    // No links found, return parent results as is (no children to fetch)
    // Removed diagnostic log
    return parentResults;
  }

  // 2. Parse the child query and inject VALUES clause using sparqljs AST manipulation
  let modifiedChildQuery: string;
  try {
    // Parse the query using sparqljs
    const parsedQuery: any = sparqlParser.parse(childQuery); // Use 'any' for flexibility with AST structure

    // Ensure it's a SELECT query
    if (parsedQuery.type !== 'query' || parsedQuery.queryType !== 'SELECT') {
        throw new Error('Child query must be a SELECT query.');
    }

    // Ensure there's a WHERE clause, create one if missing (though unlikely for useful queries)
    if (!parsedQuery.where) {
        parsedQuery.where = { type: 'group', patterns: [] };
    }

    // Construct the VALUES clause AST node
    const valuesNode = {
      type: 'values',
      values: uniqueUris.map(uri => ({
        [`?${childLinkVar}`]: { termType: 'NamedNode', value: uri }
      }))
    };

    // Find the target patterns array within the WHERE clause to inject the VALUES node
    // The WHERE clause is typically a 'group' pattern containing a 'patterns' array.
    let targetPatternsArray: any[] | undefined;

    // Check if 'where' itself is the group containing patterns
    if (parsedQuery.where.type === 'group' && Array.isArray(parsedQuery.where.patterns)) {
        targetPatternsArray = parsedQuery.where.patterns;
    } else if (Array.isArray(parsedQuery.where)) {
         // Less common: WHERE clause is directly an array of patterns (sparqljs might wrap this)
         // If this happens, we might need to wrap it in a group first.
         // Let's assume for now sparqljs provides a 'group' structure or handle error.
         // For safety, wrap it if it's just an array.
         parsedQuery.where = { type: 'group', patterns: parsedQuery.where };
         targetPatternsArray = parsedQuery.where.patterns;
    } else {
         // If where is a single pattern (not a group or array), wrap it in a group.
         parsedQuery.where = { type: 'group', patterns: [parsedQuery.where] };
         targetPatternsArray = parsedQuery.where.patterns;
    }

    // Ensure targetPatternsArray is defined and is an array before unshifting
    if (Array.isArray(targetPatternsArray)) {
        targetPatternsArray.unshift(valuesNode);
    } else {
        // This case should ideally be prevented by the checks above, but added for robustness
        throw new Error("Could not find or create a valid patterns array in the WHERE clause to inject VALUES.");
    }

    // Generate the modified query string
    modifiedChildQuery = sparqlGenerator.stringify(parsedQuery);

  } catch (error: any) {
    console.error("Error processing child query:", error);
    // Decide how to handle the error - skip this chain, throw, etc.
    // For now, let's re-throw to indicate failure
    throw new Error(`Failed to parse or modify child query: ${error.message}`);
  }

  // Execute the modified child query
  // TODO: Add specific error handling for sparqlExecutor failure
  let childResults = await sparqlExecutor(modifiedChildQuery);


  // 3. Process nested chains recursively *before* creating the lookup map
  if (nestedChain) {
     // Ensure nestedChain is an array for consistent processing
     const nestedChains = Array.isArray(nestedChain) ? nestedChain : [nestedChain];
     for (const config of nestedChains) {
         // Pass the *unaugmented* child results to the next level
         childResults = await processSingleChain(childResults, config, sparqlExecutor);
     }
  }

  // 4. Create a lookup map for child results (keyed by childLinkVar URI)
  // Removed diagnostic log
  const childLookup = new Map<string, SparqlResults>(); // Store head+bindings per URI
  childResults.results.bindings.forEach(childBinding => {
    const childLinkValue = childBinding[childLinkVar];
    if (childLinkValue && childLinkValue.type === 'uri' && childLinkValue.value) {
      const uri = childLinkValue.value;
      if (!childLookup.has(uri)) {
        // Initialize with head and empty bindings array if first time seeing this URI
        childLookup.set(uri, {
          head: childResults.head, // Use the actual head from the child query result
          results: { bindings: [] }
        });
      }
      // Add the current child binding to the list for this URI
      childLookup.get(uri)!.results.bindings.push(childBinding);
    }
  });
  // Removed diagnostic log

  // 5. Augment the parent results (use the previously cloned results)
  parentResults.results.bindings.forEach(parentBinding => {
    const linkBinding = parentBinding[parentLinkVar];
    if (linkBinding && linkBinding.type === 'uri' && linkBinding.value) {
      const linkingUri = linkBinding.value;
      const matchingChildData = childLookup.get(linkingUri);

      if (matchingChildData) {
        // Augment the binding in the parent results
        const augmentedBinding = parentBinding[parentLinkVar] as AugmentedSparqlBindingValue;
        augmentedBinding.head = matchingChildData.head;
        augmentedBinding.results = matchingChildData.results;
      }
    }
  });
  // Removed diagnostic log

  return parentResults;
}


/**
 * Executes a root SPARQL query and recursively handles chained queries
 * to augment the results with nested data.
 *
 * @param config The query configuration including the root query and chaining details.
 * @param sparqlExecutor A function that takes a SPARQL query string and returns parsed JSON results.
 * @returns A promise resolving to the augmented SPARQL results.
 */
export async function executeChainedQuery(
  config: QueryConfig,
  sparqlExecutor: SparqlExecutor
): Promise<AugmentedSparqlResults> {
  // 1. Execute the root query
  // Removed diagnostic log
  // TODO: Add error handling for query execution
  const rootResults = await sparqlExecutor(config.rootQuery);
  // Removed diagnostic log

  // If no chaining config, return results directly
  if (!config.chain) {
    // Removed diagnostic log
    // Need to cast SparqlResults to AugmentedSparqlResults even if no augmentation happened
    return rootResults as AugmentedSparqlResults;
  }

  // 2. Make a deep copy of the root results to augment
  // Removed diagnostic log
  let augmentedResults: AugmentedSparqlResults = deepClone(rootResults);
  // Removed diagnostic log

  // 3. Process chaining configurations
  // Removed diagnostic log
  const chains = Array.isArray(config.chain) ? config.chain : [config.chain];

  for (const chainConfig of chains) {
      // Removed diagnostic log
      // Each chain operates on the results augmented by the previous chain
      augmentedResults = await processSingleChain(augmentedResults, chainConfig, sparqlExecutor);
      // Removed diagnostic log
  }

  // Removed diagnostic log
  return augmentedResults;
}
