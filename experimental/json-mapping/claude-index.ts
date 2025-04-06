import type { Person, Product, Thing, WithContext } from 'schema-dts';
import * as jsonld from 'jsonld';
import { Store, Term, Quad } from 'oxigraph';

// Define a custom type to avoid type casting
type PizzaProduct = Thing & {
  itemOffered?: WithContext<Thing>[];
};

// 1. Create TypeScript object instance using schema-dts types
const personData: WithContext<Person> = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  '@id': 'http://example.org/person/1',
  name: 'John Doe',
  knowsAbout: {
    '@type': 'Product',
    '@id': 'http://example.org/food/pizza',
    name: 'Pizza',
    description: 'John\'s favorite cheesy delight',
    itemOffered: [
      {
        '@type': 'Product',
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
  } as PizzaProduct,
}

console.log('Original TS Object:');
console.log(JSON.stringify(personData, null, 2));

async function roundTripWithSparql() {
  try {
    // 2. Convert TS object to JSON-LD
    const jsonLdData = personData;
    console.log('\nJSON-LD Representation:');
    console.log(JSON.stringify(jsonLdData, null, 2));

    // 3. Convert JSON-LD to RDF triples (N-Quads format)
    // Use a context that explicitly preserves HTTPS
    // Fix: Use a plain object instead of JsonLdOptions type
    const rdfNQuadsOptions = {};
    
    let rdfNQuads = await jsonld.toRDF(jsonLdData, rdfNQuadsOptions);
    
    // 4. Create Oxigraph store
    const store = new Store();

    // 5. Convert N-Quads to a SPARQL INSERT DATA query
    // Build the SPARQL INSERT DATA query
    console.log('\nRDF N-Quads:');
    console.log(rdfNQuads);
    const insertQuery = `
      INSERT DATA {
        ${(Array.isArray(rdfNQuads) ? rdfNQuads : [rdfNQuads])
          .map((quad: any) => {
            let subject = `<${quad.subject.value}>`;
            let predicate = `<${quad.predicate.value}>`;
            let object =
              quad.object.termType === 'Literal'
                ? `"${quad.object.value}"`
                : `<${quad.object.value}>`;
            return `${subject} ${predicate} ${object} .`;
          })
          .join('\n')}
      }
    `;

    console.log('\nSPARQL INSERT DATA Query:');
    console.log(insertQuery);
    
    // 6. Execute the SPARQL UPDATE query to insert data
    try {
      store.update(insertQuery);
      
      // Verify insertion was successful
      const countQuery = `
        SELECT (COUNT(*) as ?count) WHERE { ?s ?p ?o }
      `;
      const countResult = store.query(countQuery);

      if (Array.isArray(countResult) && countResult.length > 0) {
        const firstResult = countResult[0];
        if (firstResult instanceof Map) {
          console.log(`Successfully inserted triples. Store contains ${firstResult.get('count')?.value} triples.`);
        } else {
          console.log('Data insertion completed, but count verification failed.');
        }
      } else {
        console.log('Data insertion completed, but count verification failed.');
      }
    } catch (error) {
      console.error("Failed to execute SPARQL UPDATE:", error);
      throw error;
    }
    console.log("STORE")
    console.log(store.dump({format: 'application/n-quads'}));


    // 7. Query the store using SPARQL CONSTRUCT
    console.log('\n--- Querying with SPARQL CONSTRUCT ---');

    
    const constructQuery = `
      PREFIX schema: <http://schema.org/>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      CONSTRUCT {
        ?person ?personProp ?personObj .
        ?food ?foodProp ?foodObj .
        ?ingredient ?ingredientProp ?ingredientObj .
      }
      WHERE {
        ?person rdf:type schema:Person .
        ?person ?personProp ?personObj .

        OPTIONAL {
          ?person schema:knowsAbout ?food .
          ?food ?foodProp ?foodObj .

          OPTIONAL {
            ?food schema:itemOffered ?ingredient .
            ?ingredient ?ingredientProp ?ingredientObj .
          }
        }
      }
    `;

    console.log('SPARQL CONSTRUCT Query:');
    console.log(constructQuery.trim());

    // 8. Execute the CONSTRUCT query
    const queryResults = store.query(constructQuery);

    // 9. Collect Quads from the result iterator
    let retrievedRdfNQuads = "";
    if (queryResults && Array.isArray(queryResults)) {
      for (const quad of queryResults) {
        retrievedRdfNQuads += quad.toString() + " .\n";
      }
    } else {
      console.error("Query result is not iterable or is invalid:", queryResults);
      throw new Error("Failed to retrieve quads from Oxigraph query.");
    }

    console.log('\nRetrieved RDF N-Quads (from CONSTRUCT query):');
    console.log(retrievedRdfNQuads);

    // 10. Convert RDF quads back to JSON-LD
    const jsonldFromRdf = await jsonld.fromRDF(retrievedRdfNQuads, {
      format: 'application/n-quads'
    });

    // 11. Compact the JSON-LD with context
    const compacted = await jsonld.compact(jsonldFromRdf, {
      '@context': 'https://schema.org'
    });

    // 12. Process the retrieved data
    console.log('\nRetrieved TS Object:');
    console.log(JSON.stringify(compacted, null, 2));

    // Access the data
    const graph = Array.isArray(compacted['@graph']) ? 
      compacted['@graph'] : 
      [compacted];
    
      const person = findEntityById(graph, 'http://example.org/person/1');
      if (person) {
        console.log(`\nAccessing data through TypeScript interface:`);
        console.log(`Person name: ${person.name}`);
        
        // Find the pizza entity
        const pizzaId = (person.knowsAbout && typeof person.knowsAbout === 'object') ? 
          (person.knowsAbout['@id'] || person.knowsAbout.id) : null;
        
        if (pizzaId) {
          const pizza = findEntityById(graph, pizzaId);
          if (pizza) {
            console.log(`Pizza name: ${pizza.name}`);
            
            // Convert itemOffered to array regardless of its form
            const ingredients = Array.isArray(pizza.itemOffered) ? 
              pizza.itemOffered :
              (pizza.itemOffered ? [pizza.itemOffered] : []);
            
            console.log('Ingredients:');
            ingredients.forEach((ing: any) => {
              // If the ingredient has a direct name, use it
              if (ing && typeof ing === 'object' && ing.name) {
                console.log(`- ${ing.name}`);
              } 
              // Otherwise try to find it by ID
              else {
                const ingId = (ing && typeof ing === 'object') ? (ing['@id'] || ing.id) : null;
                if (ingId) {
                  const ingredient = findEntityById(graph, String(ingId));
                  if (ingredient && ingredient.name) {
                    console.log(`- ${ingredient.name}`);
                  }
                }
              }
            });
          }
        }
      }


  } catch (error) {
    console.error('\nAn error occurred during the round trip:', error);
  }
}

// Define a type that includes both id and @id
type EntityWithId = {
  id?: string;
  '@id'?: string;
};

// Helper function to find an entity by ID in a graph
function findEntityById(graph: (EntityWithId & any)[], id: string): any | undefined {
  return graph.find(item => 
    item.id === id || item['@id'] === id
  );
}

roundTripWithSparql();
