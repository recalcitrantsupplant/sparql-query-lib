import type { Thing } from '../types/schema-dts';
import type { ISparqlExecutor } from '../server/ISparqlExecutor';
import { objectToRdfString, rdfStringToObject } from './rdf-mapper';
import { EntityRegister } from './entity-register';
import * as jsonld from 'jsonld'; // Import jsonld for loadAll
import importedContext from './jsonld-context.json'; // Import context for loadAll

// Define schema.org constants locally
const SCHEMA_DATE_CREATED = 'http://schema.org/dateCreated';
const SCHEMA_DATE_MODIFIED = 'http://schema.org/dateModified';

// Use the '@context' part of the imported JSON
const jsonLdContext = importedContext['@context'];

// Type definition for entities within a compacted JSON-LD @graph array
// Duplicated from rdf-mapper for now, consider exporting from there
type JsonLdGraphEntity = { '@id': string; '@type'?: string | string[] } & Record<string, any>;


// --- Helper Function: buildObjectFromGraph ---
// Extracted and adapted from rdf-mapper.ts's internal logic.
// Consider moving this to a shared utility or exporting from rdf-mapper.
function buildObjectFromGraph<T extends Thing>(
    graphMap: Map<string, JsonLdGraphEntity>,
    targetId: string,
    register: EntityRegister
): T | undefined { // Keep outer return type as T | undefined for callers
    // Use the register to avoid infinite loops and ensure object identity
    // Factory must return T or throw, matching getOrRegister's expectation
    return register.getOrRegister(targetId, (): T => {
        const entityData = graphMap.get(targetId);

        // Handle external IRIs (not present in the graphMap) by returning a simple reference
        if (!entityData) {
            if (targetId.includes(':')) { // Basic IRI check
                // Return a minimal object representing the external IRI reference
                return { '@id': targetId } as T;
            } else {
                 // Cannot build object for an internal ID that's not in the map. Throw error.
                 // This satisfies the () => T requirement for the factory.
                throw new Error(`Internal reference "${targetId}" not found in graphMap during build. Cannot create entity.`);
            }
        }

        // Start building the new entity
        const newEntity: any = { '@id': targetId };
        if (entityData['@type']) {
            newEntity['@type'] = entityData['@type'] as any;
        }

        // Recursively build or link properties
        for (const key in entityData) {
            if (key === '@id' || key === '@type' || key === '@context' || key === '@graph') {
                continue; // Skip JSON-LD structural keys
            }

            const value = entityData[key];

            if (Array.isArray(value)) {
                newEntity[key] = value.map(item =>
                    (typeof item === 'object' && item !== null && item['@id'])
                        ? buildObjectFromGraph(graphMap, item['@id'], register) // Returns T | undefined
                        : item
                // Filter out undefined results from recursive calls
                ).filter((builtItem): builtItem is T => builtItem !== undefined);
            } else if (typeof value === 'object' && value !== null && value['@id']) {
                const builtRef = buildObjectFromGraph(graphMap, value['@id'], register); // Returns T | undefined
                // Only assign property if the referenced object was successfully built/found
                if (builtRef !== undefined) {
                    newEntity[key] = builtRef;
                } // else: property remains unset if ref couldn't be resolved
            } else {
                newEntity[key] = value;
            }
        }
        // Filter out undefined properties that might result from missing refs
        Object.keys(newEntity).forEach(key => {
            if (newEntity[key] === undefined) {
                delete newEntity[key];
            } else if (Array.isArray(newEntity[key])) {
                 newEntity[key] = newEntity[key].filter((item: any) => item !== undefined);
                 if(newEntity[key].length === 0) {
                    delete newEntity[key];
                 }
            }
        });

        return newEntity as T;
    });
}
// --- End Helper Function ---


/**
 * Provides methods to save/update and load schema-dts objects
 * from a SPARQL endpoint using an ISparqlExecutor.
 * Tailored for loading all data on startup and performing create/update operations.
 */
export class EntityManager {
    private executor: ISparqlExecutor;

    constructor(executor: ISparqlExecutor) {
        this.executor = executor;
    }

    /**
     * Saves or updates a schema-dts object in the SPARQL endpoint.
     * It first deletes all existing triples associated with the entity's @id
     * and then inserts the new state represented by the provided object.
     *
     *
     * @param entity The schema-dts object to save or update. Must have an '@id'.
     */
    async saveOrUpdate<T extends Thing>(entity: T): Promise<void> {
        if (!entity['@id']) {
            throw new Error("Entity must have an '@id' to be saved or updated.");
        }
        // Correctly format the IRI for SPARQL by enclosing in angle brackets
        const entityIRI = `<${entity['@id']}>`;

        // Always set/update the dateModified timestamp before saving
        // Use type assertion to add/modify the property
        (entity as any)[SCHEMA_DATE_MODIFIED] = new Date().toISOString();

        // Ensure dateCreated exists if it's missing (important for initial saves)
        if (!(SCHEMA_DATE_CREATED in entity) || !entity[SCHEMA_DATE_CREATED]) {
             (entity as any)[SCHEMA_DATE_CREATED] = (entity as any)[SCHEMA_DATE_MODIFIED];
             console.warn(`Entity ${entity['@id']} lacked '${SCHEMA_DATE_CREATED}' during saveOrUpdate; setting it to '${SCHEMA_DATE_MODIFIED}'.`);
        }

        try {
            // --- DEBUGGING START ---
            console.log("--- EntityManager.saveOrUpdate ---");
            console.log("Entity object BEFORE objectToRdfString:");
            console.log(JSON.stringify(entity, null, 2)); // Log the object structure
            console.log("------------------------------------");
            // --- DEBUGGING END ---

            const rdfString = await objectToRdfString(entity);

            // SPARQL Update query: Delete existing triples for the subject, then insert new ones.
            // Use the correctly formatted entityIRI
            const sparqlQuery = `
                DELETE {
                ${entityIRI} ?p ?o .
                ?bnode ?bnode_p ?bnode_o .
                }
                WHERE {
                    {
                        ${entityIRI} ?p ?o .
                    }
                    UNION
                    {
                        ${entityIRI} ?p1 ?bnode .
                        FILTER(isBlank(?bnode))
                        ?bnode ?bnode_p ?bnode_o .
                    }
                    UNION
                    {
                        ${entityIRI} ?p1 ?i1 .
                        FILTER(isBlank(?i1))
                        ?i1 ?p2 ?bnode .
                        FILTER(isBlank(?bnode))
                        ?bnode ?bnode_p ?bnode_o .
                    }
                };

                INSERT DATA {
                ${rdfString}
                }
            `;
            console.log("QUERYISHERE")
            console.log(sparqlQuery)
            await this.executor.update(sparqlQuery);
            // Log with the original @id for clarity
            console.log(`Entity ${entity['@id']} saved/updated successfully.`);

        } catch (error) {
             // Log with the original @id for clarity
            console.error(`Error saving/updating entity ${entity['@id']}:`, error);
            throw new Error(`Failed to save/update entity: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Retrieves a specific entity by its ID from the SPARQL endpoint.
     *
     * @param id The '@id' of the entity to retrieve.
     * @param register An EntityRegister instance to manage object identity.
     * @returns A promise resolving to the reconstructed entity or undefined if not found.
     */
    async get<T extends Thing>(id: string, register: EntityRegister): Promise<T | undefined> {
        // Correctly format the IRI for SPARQL
        const entityIRI = `<${id}>`;

        try {
            // DESCRIBE query to get a useful set of triples describing the entity,
            // potentially including related blank nodes.
            // Use the correctly formatted entityIRI
            const sparqlQuery = `DESCRIBE ${entityIRI}`;

            // Assuming the executor's constructQueryParsed method can handle DESCRIBE results
            // (which typically return RDF graphs like CONSTRUCT)
            const rdfResultString = await this.executor.constructQueryParsed(sparqlQuery);

            if (typeof rdfResultString !== 'string' || rdfResultString.trim() === '') {
                // console.log(`No data found for entity ID: ${id}`);
                return undefined;
            }

            // Use the existing rdfStringToObject function for parsing and reconstruction
            // Note: rdfStringToObject expects the full ID string, not the SPARQL-formatted one
            return await rdfStringToObject<T>(rdfResultString, id, register);

        } catch (error) {
            console.error(`Error getting entity ${id}:`, error);
            // Don't throw, just return undefined if retrieval fails
            return undefined;
            // Or re-throw if preferred:
            // throw new Error(`Failed to get entity: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

     /**
     * Deletes an entity and all its associated triples from the SPARQL endpoint.
     *
     * @param id The '@id' (IRI) of the entity to delete.
     */
    async delete(id: string): Promise<void> {
        // Correctly format the IRI for SPARQL
        const entityIRI = `<${id}>`;

        try {
            // SPARQL Update query: Delete all triples where the entity is the subject.
            // Consider also deleting triples where the entity is the object if needed,
            // but that can be complex depending on desired cascading behavior.
            // Use the correctly formatted entityIRI
            const sparqlQuery = `
                DELETE WHERE { ${entityIRI} ?p ?o }
            `;

            await this.executor.update(sparqlQuery);
            console.log(`Entity ${id} deleted successfully.`); // Log original ID

        } catch (error) {
            console.error(`Error deleting entity ${id}:`, error); // Log original ID
            throw new Error(`Failed to delete entity: ${error instanceof Error ? error.message : String(error)}`);
        }
    }


    /**
     * Loads all triples from the SPARQL endpoint using a CONSTRUCT query
     * and reconstructs all objects found in the graph.
     *
     * @param register An EntityRegister instance to manage object identities.
     * @returns A Map where keys are entity '@id's and values are the reconstructed objects.
     */
    async loadAll(register: EntityRegister): Promise<Map<string, Thing>> {
        try {
            const sparqlQuery = `
                CONSTRUCT { ?s ?p ?o }
                 WHERE { ?s ?p ?o }
             `;

            // Use the specific method for CONSTRUCT queries returning parsed string (N-Quads expected by rdf-mapper)
            const rdfResultString = await this.executor.constructQueryParsed(sparqlQuery);

            if (typeof rdfResultString !== 'string' || rdfResultString.trim() === '') {
                console.log("No data found in the store or empty result.");
                return new Map<string, Thing>();
            }

            // 1. Parse N-Quads string to JSON-LD object array
            const jsonldFromRdf = await jsonld.fromRDF(rdfResultString, { format: 'application/n-quads' });

            // 2. Compact the JSON-LD using the context
            const context = jsonLdContext as any;
            // Ensure graph output for consistency, even if only one object results
            const compacted: any = await jsonld.compact(jsonldFromRdf, context, { graph: true });

            // 3. Extract the @graph array
            let graph: JsonLdGraphEntity[] = [];
             if (compacted['@graph']) {
                 graph = compacted['@graph'] as JsonLdGraphEntity[];
             } else if (compacted['@id']) {
                 // Handle cases where compaction results in a single root object
                 graph = [compacted as JsonLdGraphEntity];
             } else if (Array.isArray(compacted) && compacted.length > 0) {
                 // Handle cases where compaction might return an array directly if context is minimal
                 graph = compacted as JsonLdGraphEntity[];
             } else {
                 console.warn("Compacted JSON-LD structure unexpected or empty after compaction. Result:", compacted);
                 // Attempt to use uncompacted data if graph is empty
                 if (Array.isArray(jsonldFromRdf) && jsonldFromRdf.length > 0) {
                    console.warn("Attempting to build map from uncompacted JSON-LD.");
                    // This path is less ideal as it won't have context aliases applied
                    // Need to ensure IDs are present in the uncompacted form
                    graph = jsonldFromRdf.filter(item => item['@id']).map(item => item as JsonLdGraphEntity);
                 } else {
                    return new Map<string, Thing>(); // Cannot proceed
                 }
             }


            // Create a Map for efficient entity lookup by ID
            const graphMap = new Map<string, JsonLdGraphEntity>();
            graph.forEach(entity => {
                // Ensure entity has an ID before adding
                if (entity['@id']) {
                    graphMap.set(entity['@id'], entity);
                } else {
                    console.warn("Found entity in graph without '@id', skipping:", entity);
                }
            });

             if (graphMap.size === 0) {
                console.log("Graph map is empty after processing RDF.");
                return new Map<string, Thing>();
             }

            // 4. Iterate through graphMap keys (all entity IDs) and build objects
            const resultMap = new Map<string, Thing>();
            graphMap.forEach((_, entityId) => {
                // Build object if not already built and added to register by recursive calls.
                // Use get() to check existence instead of the non-existent has().
                if (register.get(entityId) === undefined) {
                    try {
                        // buildObjectFromGraph will register the object via getOrRegister if successful
                        buildObjectFromGraph(graphMap, entityId, register);
                    } catch (error) {
                         console.error(`Failed to build object for ID ${entityId} during loadAll:`, error);
                         // Optionally continue to load other objects or re-throw
                    }
                     // No need to add to resultMap here; we'll pull everything from the register later.
                     // The object is added to the register inside buildObjectFromGraph -> getOrRegister
                     // if (obj) { resultMap.set(entityId, obj); } // Redundant check? register handles it.
                }
            });

            // Retrieve all successfully registered objects from the register
            // This ensures we get the final, potentially completed objects after all recursions
             graphMap.forEach((_, entityId) => {
                const finalObj = register.get<Thing>(entityId);
                if (finalObj) { // Check if it was successfully registered/built
                    resultMap.set(entityId, finalObj);
                }
             });


            console.log(`Loaded ${resultMap.size} entities from the store.`);
            return resultMap;

        } catch (error) {
            console.error("Error loading all entities:", error);
            // Log the RDF string that caused the error if possible
            // if (rdfResultString) console.error("Problematic RDF string:\n", rdfResultString);
            throw new Error(`Failed to load all entities: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
