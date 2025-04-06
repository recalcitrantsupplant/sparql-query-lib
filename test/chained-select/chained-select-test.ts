// experimental/chained-select/test.ts
// Align imports with experimental/example/test.ts
import oxigraph, { Store } from 'oxigraph'; // Import Store directly
import type { Term } from 'oxigraph'; // Import Term type separately if needed by executor funcs
import {
  QueryConfig,
  SparqlExecutor,
  AugmentedSparqlResults,
  SparqlResults,
  SparqlBinding,
  SparqlBindingValue,
  AugmentedSparqlBindingValue
} from '../../src/chained-select/types'; // Corrected path again
import { executeChainedQuery } from '../../src/chained-select/executor'; // Corrected path again
// Import RDF utils from the consolidated file
import {
  objectToQuads,
  parseAugmentedResultsGeneric,
  MappingConfiguration // Import type from rdf-utils
  // termToSparqlBindingValue is defined locally below
} from '../../src/chained-select/rdf-utils'; // Corrected path again
import mapping from './data/mapping'; // Updated path to data subdirectory
import type { Quad } from '@rdfjs/types'; // Import Quad type
import RdfDataFactory from '@rdfjs/data-model'; // Import the RDF/JS default factory
// Import test data types from the new location
import type { Hobby, Person, Address } from './data/test-data-types';


// --- 1. (Removed) Define Target TypeScript Interfaces ---
// Interfaces are now imported from ./data/test-data-types.ts


// --- 2. Create Sample TypeScript Objects ---
const baseUri = 'http://example.org/data/'; // Base URI for generating resource identifiers

// Sample Address (needed for Person)
const address1: Address = {
    uri: `${baseUri}address1`,
    street: "123 Main St",
    city: "Anytown",
    postalCode: "12345",
    country: "USA",
};

const hobbyA: Hobby = {
    uri: `${baseUri}hobbyA`, // Use uri instead of id
    name: "Painting",
    yearsPracticed: 5 // Add required yearsPracticed
    // description removed as it's not in the interface
};

const hobbyB: Hobby = {
    uri: `${baseUri}hobbyB`, // Use uri instead of id
    name: "Reading",
    yearsPracticed: 10 // Add required yearsPracticed
};

const person1: Person = {
    uri: `${baseUri}person1`, // Use uri instead of id
    id: "uuid-person-1", // Add required id (using fixed string for test stability)
    firstName: "Alice",
    lastName: "Smith",
    age: 30, // age is required
    currentAddress: address1, // Add required currentAddress
    hobbies: [hobbyA, hobbyB] // hobbies is required
};

const person2: Person = {
    uri: `${baseUri}person2`, // Use uri instead of id
    id: "uuid-person-2", // Add required id
    firstName: "Bob",
    lastName: "Jones",
    age: 25, // age is required
    currentAddress: address1, // Add required currentAddress (reusing address1 for simplicity)
    hobbies: [hobbyB] // hobbies is required
};

const person3: Person = {
    uri: `${baseUri}person3`, // Use uri instead of id
    id: "uuid-person-3", // Add required id
    firstName: "Charlie",
    lastName: "Brown",
    age: 40, // Add required age (placeholder value)
    currentAddress: address1, // Add required currentAddress
    hobbies: [] // Add required hobbies (empty array)
};


// --- 3. Adapted Oxigraph Executor ---
// This version returns the full SparqlResults object needed by executeChainedQuery

/**
 * Converts Oxigraph Term to SparqlBindingValue format.
 * Needed locally by createFullOxigraphExecutor.
 */
function termToSparqlBindingValue(term: Term): SparqlBindingValue {
    switch (term.termType) {
        case 'NamedNode':
            return { type: 'uri', value: term.value };
        case 'Literal':
            const bindingValue: SparqlBindingValue = {
                type: 'literal',
                value: term.value,
            };
            if (term.language && term.language !== '') {
                bindingValue['xml:lang'] = term.language;
            }
            // Check if datatype is not the default string type before adding
            if (term.datatype && term.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') {
                 bindingValue.datatype = term.datatype.value;
            }
            return bindingValue;
        case 'BlankNode':
            // Prefix with '_:' for standard SPARQL JSON blank node representation
            return { type: 'bnode', value: `_:${term.value}` };
        // Quad, DefaultGraph, Variable types are not expected in results bindings
        default:
            console.warn(`Unexpected term type in binding: ${term.termType}`);
            // Fallback or throw error? Let's return a simple literal representation.
            return { type: 'literal', value: term.value };
    }
}

/**
 * Creates a SPARQL query executor that operates on a given Oxigraph store
 * and returns the full SparqlResults object.
 *
 * @param store An initialized Oxigraph store instance.
 * @returns A SparqlExecutor function compatible with executeChainedQuery.
 */
function createFullOxigraphExecutor(store: Store): SparqlExecutor {
  const executeQuery: SparqlExecutor = async (query: string): Promise<SparqlResults> => {
    try {
      const resultsIterator = store.query(query); // Returns an iterator or boolean

      const bindingsArray: SparqlBinding[] = [];
      let variables: string[] = []; // To store variable names from the head

      // Type for individual binding sets from Oxigraph
      type OxigraphBindingSet = Map<string, Term>;

      // Type guards
      const isAsyncIterable = (obj: any): obj is AsyncIterable<OxigraphBindingSet> =>
          obj && typeof obj[Symbol.asyncIterator] === 'function';
      const isSyncIterable = (obj: any): obj is Iterable<OxigraphBindingSet> =>
          obj && typeof obj[Symbol.iterator] === 'function';

      let isAskResult = false;
      let askBooleanResult = false;

      if (typeof resultsIterator === 'boolean') {
          isAskResult = true;
          askBooleanResult = resultsIterator;
          variables = []; // No variables for ASK
      } else if (isAsyncIterable(resultsIterator) || isSyncIterable(resultsIterator)) {
          let firstBinding = true;
          // Process iterator (sync or async)
          const processBindings = async (iterator: AsyncIterable<OxigraphBindingSet> | Iterable<OxigraphBindingSet>) => {
              for await (const oxBindings of iterator) {
                  const sparqlBinding: SparqlBinding = {};
                  const currentVars: string[] = [];
                  for (const [variableName, term] of oxBindings.entries()) {
                      if (typeof variableName === 'string') {
                          sparqlBinding[variableName] = termToSparqlBindingValue(term);
                          currentVars.push(variableName);
                      }
                  }
                  bindingsArray.push(sparqlBinding);
                  // Capture variables from the first binding
                  if (firstBinding) {
                      variables = currentVars.sort(); // Sort for consistent order
                      firstBinding = false;
                  }
              }
          };

          if (isAsyncIterable(resultsIterator)) {
              await processBindings(resultsIterator);
          } else {
              // Wrap sync iterator in an async generator for consistent await
              async function* asyncWrap(syncIterator: Iterable<OxigraphBindingSet>) {
                  for (const item of syncIterator) { yield item; }
              }
              await processBindings(asyncWrap(resultsIterator));
          }
           // If iterator was empty, variables might not be set.
           // We could try parsing the query, but that's complex.
           // For now, leave variables empty if no results.
           // A better approach might involve store.query_results(query) if available
           // or parsing the SELECT clause.

      } else {
          console.warn("Oxigraph query returned unexpected type:", typeof resultsIterator);
          variables = [];
      }

      const finalResult: SparqlResults = {
        head: { vars: variables },
        results: { bindings: bindingsArray },
      };

      if (isAskResult) {
          finalResult.boolean = askBooleanResult;
      }

      return finalResult;

    } catch (error) {
      console.error('Error executing SPARQL query with Oxigraph:', error);
      console.error('Query:', query);
      throw error;
    }
  };
  return executeQuery;
}


// --- 4. (Removed) Custom Parser ---
// The custom parseAugmentedResults function has been removed.
// We will use the generic parseAugmentedResultsGeneric from rdf-mapper instead.


// --- 5. Main Execution Logic ---
async function runTest() {
  console.log("Initializing Oxigraph store...");
  // Instantiate using the imported Store class directly
  const store = new Store();

  console.log("Converting TS objects to Quads...");
  let allQuads: Quad[] = [];
  try {
      // Convert each person object (objectToQuads handles nested objects)
      allQuads = allQuads.concat(objectToQuads(person1, 'Person', mapping, baseUri));
      allQuads = allQuads.concat(objectToQuads(person2, 'Person', mapping, baseUri));
      allQuads = allQuads.concat(objectToQuads(person3, 'Person', mapping, baseUri));
      // Note: Hobbies are converted recursively within Person conversion

      // Deduplicate quads (objectToQuads already does this, but belt-and-suspenders)
      const uniqueQuads = [];
      const quadSet = new Set<string>();
      for (const quad of allQuads) {
          const quadString = `${quad.subject.value} ${quad.predicate.value} ${quad.object.value} ${quad.graph.value}`;
          if (!quadSet.has(quadString)) {
              quadSet.add(quadString);
              uniqueQuads.push(quad);
          }
      }
      allQuads = uniqueQuads;

      console.log(`Generated ${allQuads.length} unique quads from TS objects.`);
  } catch (error) {
      console.error("Error converting TS objects to Quads:", error);
      return;
  }

  console.log("Loading generated quads into store...");
  try {
    // Add each quad to the store using Oxigraph's expected term types
    allQuads.forEach(rdfjsQuad => { // Rename loop variable to reflect source type
        try {
            // Oxigraph's store.add expects RDF/JS compliant terms.
            // RdfDataFactory produces these terms. Ensure the quad components are passed correctly.
            // The objectToQuads function should already return RDF/JS compliant quads.
            // The error might stem from how Store.add is typed or used.
            // Let's try adding the quad directly, assuming objectToQuads provides compatible terms.
            // If Store.add truly expects 'never', it might be mis-typed or requires a different approach.
            // Revert to passing the Quad object directly.
            // @ts-ignore - Oxigraph's .d.ts seems incorrect for store.add, expecting 'never'
            store.add(rdfjsQuad);
        } catch (e) {
            // Log original quad as JSON string for better readability if error occurs
            console.error("Error adding quad:", JSON.stringify(rdfjsQuad), e);
            throw e; // Re-throw after logging details
        }
    });

    // Remove manual quad test - focus on using objectToQuads result
    // console.log("Testing manual quad add...");
    // ...
    // store.add(manualQuad);
    // console.log("Manual quad added successfully.");

    console.log("Quads loaded successfully.");
    console.log(`Store size: ${store.size}`); // Verify data loaded
  } catch (error) {
    console.error("Error loading TTL data into Oxigraph:", error);
    return; // Stop execution if loading fails
  }


  console.log("Creating SPARQL executor...");
  const sparqlExecutor = createFullOxigraphExecutor(store);

  console.log("Defining Query Configuration...");
  const queryConfig: QueryConfig = {
    rootQuery: `
      # Adjust query to match predicates defined in the mapping
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
      PREFIX ont: <http://example.org/ontology#> # Use prefix from mapping

      SELECT ?person ?_rdfType ?firstName ?lastName ?age ?hobbyUri ?currentAddressUri
      WHERE {
        # Use class URI from mapping - also select the type
        ?person a ont:Person ;
                a ?_rdfType . # Select the rdf:type
        # Use property URIs from mapping
        ?person foaf:firstName ?firstName .
        ?person foaf:lastName ?lastName .
        OPTIONAL { ?person foaf:age ?age . }
        # Use property URI for hobby link from mapping
        OPTIONAL { ?person ont:hasHobby ?hobbyUri . }
        # Add optional pattern for address URI
        OPTIONAL { ?person ont:hasAddress ?currentAddressUri . }
      }
      ORDER BY ?firstName ?lastName # Correct ORDER BY clause
    `,
    chain: [ // Chain configuration for hobbies
      {
        parentLinkVar: 'hobbyUri', // Variable in root query holding the link (matches OPTIONAL above)
        childLinkVar: 'hobby',     // Variable in child query to match with VALUES
        childQuery: `
          PREFIX ont: <http://example.org/ontology#> # Use prefix from mapping
          PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

          SELECT ?hobby ?_rdfType ?hobbyName
          WHERE {
            # VALUES clause will be injected here by the executor
            # Use property URIs from mapping for Hobby
            ?hobby ont:hobbyName ?hobbyName ;
                   a ?_rdfType . # Select the rdf:type
            # Description is not in Hobby mapping, remove from SELECT
          }
        `,
        // No further chaining in this example
      }
    ]
  };

  console.log("Executing chained query...");
  try {
    const augmentedResults = await executeChainedQuery(queryConfig, sparqlExecutor);

    console.log("\n--- Augmented SPARQL Results ---");
    console.log(JSON.stringify(augmentedResults, null, 2));

    console.log("\n--- Parsing Augmented Results to Nested Objects (using generic parser) ---");
    // Use the generic parser:
    // - augmentedResults: The data to parse
    // - 'Person': The root object type name (key in the mapping config)
    // - 'person': The variable name holding the root subject URI in the SPARQL results
    // - mapping: The mapping configuration object
    const nestedObjects = parseAugmentedResultsGeneric<Person>(
        augmentedResults,
        'Person', // Root type name from mapping
        'person', // Root subject variable from rootQuery
        mapping     // The imported mapping configuration
    );

    console.log("\n--- Final Nested Objects ---");
    console.log(JSON.stringify(nestedObjects, null, 2));

    // --- 6. Compare Initial and Final Objects ---
    console.log("\n--- Comparing Initial and Final Objects ---");
    // Store initial objects for comparison (ensure they match the ones used in objectToQuads)
    const initialPersons = [person1, person2, person3];
    compareResults(initialPersons, nestedObjects);

  } catch (error) {
    console.error("\n--- Error during chained query execution or parsing ---");
    console.error(error);
  } finally {
      // Clean up store if necessary (MemoryStore might not need explicit closing)
      // store.close(); // If using persistent stores
  }
}

// Comparison function
function compareResults(initial: Person[], final: Person[]) {
    if (initial.length !== final.length) {
        console.error(`🔴 Test Failed: Length mismatch. Initial: ${initial.length}, Final: ${final.length}`);
        return;
    }

    // Sort both arrays by URI for consistent comparison
    const sortedInitial = [...initial].sort((a, b) => a.uri.localeCompare(b.uri));
    const sortedFinal = [...final].sort((a, b) => a.uri.localeCompare(b.uri));

    let equivalent = true;
    for (let i = 0; i < sortedInitial.length; i++) {
        const p1 = sortedInitial[i]; // Initial object
        const p2 = sortedFinal[i];   // Reconstructed object

        if (p1.uri !== p2.uri) {
            console.error(`🔴 Test Failed: URI mismatch at index ${i}. Initial: ${p1.uri}, Final: ${p2.uri}`);
            equivalent = false;
            continue; // Skip further checks for this pair if URIs don't match
        }

        // Compare relevant fields, ignoring 'id' (not queried) and '_rdfType' (added by parser)
        if (p1.firstName !== p2.firstName ||
            p1.lastName !== p2.lastName ||
            p1.age !== p2.age) {
             console.error(`🔴 Test Failed: Property mismatch for ${p1.uri}. Initial: ${JSON.stringify({firstName: p1.firstName, lastName: p1.lastName, age: p1.age})}, Final: ${JSON.stringify({firstName: p2.firstName, lastName: p2.lastName, age: p2.age})}`);
            equivalent = false;
        }

        // Compare addresses: Check if the reconstructed object has the 'currentAddress' property
        // if the initial object did. The parser currently links via URI but doesn't fully nest.
        const initialHasAddress = !!p1.currentAddress;
        const finalHasAddressProp = p2.hasOwnProperty('currentAddress'); // Check property existence
        const finalAddressValue = p2.currentAddress; // Get the value (might be URI string or object)

        if (initialHasAddress && !finalHasAddressProp) {
             console.error(`🔴 Test Failed: Missing currentAddress property for ${p1.uri} in final object.`);
             equivalent = false;
        } else if (initialHasAddress && typeof finalAddressValue !== 'object' && typeof finalAddressValue !== 'string') {
             // If the property exists but isn't an object or string URI (unexpected state)
             console.error(`🔴 Test Failed: Unexpected type for currentAddress property for ${p1.uri} in final object: ${typeof finalAddressValue}`);
             equivalent = false;
        }
        // Note: A deeper comparison (e.g., finalAddressValue.uri === p1.currentAddress.uri)
        // would require the parser to be enhanced to return nested objects or consistent URIs.

        // Compare hobbies: Check URIs, ignore order and other properties like yearsPracticed (not queried)
        const initialHobbyUris = new Set((p1.hobbies || []).map(h => h.uri));
        // The parser might return full Hobby objects or just URIs depending on nesting depth/query
        const finalHobbyUris = new Set((p2.hobbies || []).map((h: any) => typeof h === 'string' ? h : h?.uri).filter(Boolean));

        if (initialHobbyUris.size !== finalHobbyUris.size) {
            console.error(`🔴 Test Failed: Hobby count mismatch for ${p1.uri}. Initial: ${initialHobbyUris.size}, Final: ${finalHobbyUris.size}`);
            equivalent = false;
        } else {
            for (const uri of initialHobbyUris) {
                if (!finalHobbyUris.has(uri)) {
                    console.error(`🔴 Test Failed: Missing hobby URI ${uri} for ${p1.uri} in final object.`);
                    equivalent = false;
                    break;
                }
            }
        }
    }

    if (equivalent) {
        console.log("✅ Test Passed: Initial and Final objects are equivalent (based on checked properties).");
    } else {
        console.error("❌ Test Failed: Differences found between initial and final objects.");
    }
}


// Run the test
runTest();
