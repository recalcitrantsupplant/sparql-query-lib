import type { Person, Product, WithContext } from 'schema-dts';
import * as jsonld from 'jsonld';
// Correct imports: Store and Parser as values, Quad as type. Remove unused ones.
import { Store, type Quad } from 'oxigraph';


// 1. Create TypeScript object instance using schema-dts types
const personData: WithContext<Person> = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  '@id': 'http://example.org/person/1',
  name: 'John Doe',
  knowsAbout: {
    '@type': 'Product', // Changed Food to Product for the pizza itself
    '@id': 'http://example.org/food/pizza',
    name: 'Pizza',
    description: 'John\'s favorite cheesy delight',
    itemOffered: [
      {
        '@type': 'Product', // Ingredients are Products
        '@id': 'http://example.org/ingredient/cheese',
        name: 'Cheese',
        description: 'Mozzarella'
      },
      {
        '@type': 'Product',
        '@id': 'http://example.org/ingredient/tomato',
        name: 'Tomato Sauce',
        description: 'Classic red sauce'
      }
    ]
  } as any // Cast to 'any' to bypass strict type checking for itemOffered
};

console.log('Original TS Object:');
console.log(JSON.stringify(personData, null, 2));

async function roundTripWithOxigraph() {
  try {
    // 2. Convert TS object to JSON-LD
    const jsonLdData = personData;
    console.log('\nJSON-LD Representation:');
    console.log(JSON.stringify(jsonLdData, null, 2));

    // 3. Convert JSON-LD to RDF triples (N-Quads format)
    const rdfNQuads = await jsonld.toRDF(jsonLdData, { format: 'application/n-quads' });
    console.log('\nRDF N-Quads:');
    console.log(rdfNQuads);

    // --- Oxigraph Interaction ---
    const store = new Store();

    // 4. Store RDF in Oxigraph
    console.log('\n--- Storing RDF in Oxigraph ---');
    try {
      store.load(rdfNQuads as string, { format: 'application/n-quads' });
      console.log(`Loaded ${store.size} quads into Oxigraph.`);
    } catch (error) {
      console.error("Failed to load N-Quads directly into store.", error);
      throw error; // Re-throw to stop execution
    }

    // 5. Query triple store using SPARQL CONSTRUCT
    console.log('\n--- Querying Oxigraph with SPARQL CONSTRUCT ---');

    // Simpler alternative for this specific case:
    const simplerConstructQuery = `
      CONSTRUCT WHERE { ?s ?p ?o . }
    `;

    console.log('SPARQL CONSTRUCT Query:');
    console.log(simplerConstructQuery.trim());

    // Execute query
    const queryResults = store.query(simplerConstructQuery);

    // Collect Quads from the result iterator
    let retrievedRdfNQuads = "";
    if (queryResults && Array.isArray(queryResults)) {
        for (const item of queryResults) {
            retrievedRdfNQuads += item.toString() + ". \n";
        }
    } else {
        console.error("Query result is not iterable or is invalid:", queryResults);
        throw new Error("Failed to retrieve quads from Oxigraph query.");
    }

    console.log('\nRetrieved RDF N-Quads (from Oxigraph):');
    console.log(retrievedRdfNQuads);

    // 6. Convert RDF quads back to JSON-LD
    const jsonldFromRdf = await jsonld.fromRDF(retrievedRdfNQuads, {
      format: 'application/n-quads'
    });

    // 7. Compact the JSON-LD with context
    const compacted = await jsonld.compact(jsonldFromRdf, {
      '@context': 'https://schema.org'
    });

    // 8. Cast back to your TypeScript type
    const retrievedPerson = compacted as any;

    console.log('\nRetrieved TS Object:');
    console.log(JSON.stringify(retrievedPerson, null, 2));

    // 9. Now you can work with the TypeScript object again
    const person = retrievedPerson['@graph']?.find((item: any) => item.id === 'http://example.org/person/1');
    console.log(`Person name: ${person?.name ?? "Unknown"}`);

  } catch (error) {
    console.error('\nAn error occurred during the round trip:', error);
  }
}

roundTripWithOxigraph();
