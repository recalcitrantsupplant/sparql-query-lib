import type { Thing } from '../types/schema-dts';
import * as jsonld from 'jsonld';
import { EntityRegister } from './entity-register';
import importedContext from './jsonld-context.json';

// Use the '@context' part of the imported JSON
const jsonLdContext = importedContext['@context'];

/**
 * Converts a schema-dts TypeScript object into an RDF N-Quads string using a predefined JSON-LD context.
 *
 * @param entity The schema-dts object (e.g., Person, Product) *without* the '@context'.
 * @returns A promise resolving to the RDF data in N-Quads format.
 */
export async function objectToRdfString(entity: Thing): Promise<string> {
    try {
        // Add the predefined context for JSON-LD processing
        const entityForJsonLd = {
            // Cast context to 'any' to bypass strict type checking if necessary
            "@context": jsonLdContext as any,
            ...entity
        };

        const rdfNQuads = await jsonld.toRDF(entityForJsonLd, { format: 'application/n-quads' });

        // jsonld.toRDF should return a string when format is 'application/n-quads'
        if (typeof rdfNQuads !== 'string') {
            console.error("jsonld.toRDF did not return a string for N-Quads format. Value:", rdfNQuads);
            throw new Error("Failed to convert object to N-Quads string.");
        }
        return rdfNQuads;
    } catch (error) {
        console.error("Error converting object to RDF:", error);
        throw new Error(`Failed to convert object to RDF: ${error instanceof Error ? error.message : String(error)}`);
    }
}


// Type definition for entities within a compacted JSON-LD @graph array
type JsonLdGraphEntity = { '@id': string; '@type'?: string | string[] } & Record<string, any>;

/**
 * Recursively reconstructs a TypeScript object from a map derived from a compacted JSON-LD graph.
 * Uses an EntityRegister to handle object identity and circular references.
 *
 * @param graphMap A Map where keys are entity '@id's and values are the entity data objects.
 * @param targetId The '@id' of the entity to start reconstruction from.
 * @param register The EntityRegister instance managing object instances.
 * @returns The reconstructed entity, potentially referencing other registered entities, or undefined if not found.
 */
function buildObjectFromGraph<T extends Thing>(
    graphMap: Map<string, JsonLdGraphEntity>,
    targetId: string,
    register: EntityRegister
): T | undefined {
    // Use the register to avoid infinite loops and ensure object identity
    return register.getOrRegister(targetId, () => {
        const entityData = graphMap.get(targetId);

        // Handle external IRIs (not present in the graphMap) by returning a simple reference
        if (!entityData) {
            if (targetId.includes(':')) { // Basic IRI check
                return { '@id': targetId } as T;
            } else {
                // This indicates an internal reference that wasn't found in the graph, likely an error.
                console.warn(`Internal reference "${targetId}" not found in graphMap.`);
                 throw new Error(`Internal error: Entity data for ID "${targetId}" unexpectedly missing in graphMap.`);
            }
        }

        // Start building the new entity
        const newEntity: any = { '@id': targetId };
        if (entityData['@type']) {
            // Assume RDF types map correctly to schema-dts types
            newEntity['@type'] = entityData['@type'] as any;
        }

        // Recursively build or link properties
        for (const key in entityData) {
            if (key === '@id' || key === '@type' || key === '@context' || key === '@graph') {
                continue; // Skip JSON-LD structural keys
            }

            const value = entityData[key];

            if (Array.isArray(value)) {
                // Handle arrays of literals or references
                newEntity[key] = value.map(item =>
                    (typeof item === 'object' && item !== null && item['@id'])
                        ? buildObjectFromGraph(graphMap, item['@id'], register) // Recurse for references
                        : item // Keep literal value
                ).filter(item => item !== undefined); // Clean up if any recursive calls failed
            } else if (typeof value === 'object' && value !== null && value['@id']) {
                // Handle single reference represented as {"@id": "..."}
                newEntity[key] = buildObjectFromGraph(graphMap, value['@id'], register);
            } else if (typeof value === 'string') {
                 // Check if the context defines this key's value as an ID reference
                 const contextDefinition = jsonLdContext[key as keyof typeof jsonLdContext];
                 // Safely check if contextDefinition is an object and has the '@type' property set to '@id'
                 if (typeof contextDefinition === 'object' && contextDefinition !== null && '@type' in contextDefinition && contextDefinition['@type'] === '@id') {
                    // Handle single reference represented as a string IRI
                    newEntity[key] = buildObjectFromGraph(graphMap, value, register);
                 } else {
                    // Otherwise, treat as a literal string
                    newEntity[key] = value;
                 }
            } else {
                // Handle literal value
                newEntity[key] = value;
            }
        }
        return newEntity as T;
    });
}


/**
 * Converts an RDF N-Quads string into a schema-dts TypeScript object using a predefined JSON-LD context.
 * Manages object identity using an EntityRegister.
 *
 * @param rdfString The RDF data in N-Quads format.
 * @param targetId The '@id' of the root entity to reconstruct.
 * @param register The EntityRegister instance.
 * @returns A promise resolving to the reconstructed root entity or undefined if not found.
 */
export async function rdfStringToObject<T extends Thing>(
    rdfString: string,
    targetId: string,
    register: EntityRegister
): Promise<T | undefined> {
    try {
        const context = jsonLdContext as any; // Use the predefined context

        // 1. Parse N-Quads string to JSON-LD object array
        const jsonldFromRdf = await jsonld.fromRDF(rdfString, { format: 'application/n-quads' });

        // 2. Compact the JSON-LD using the context to simplify structure and apply aliases
        // Force @graph output for consistent structure handling.
        const compacted: any = await jsonld.compact(jsonldFromRdf, context, { graph: true });

        // 3. Extract the @graph array (or handle single object results)
        let graph: JsonLdGraphEntity[] = [];
        if (compacted['@graph']) {
            graph = compacted['@graph'] as JsonLdGraphEntity[];
        } else if (compacted['@id']) {
            // Handle cases where compaction results in a single root object instead of a graph
            graph = [compacted as JsonLdGraphEntity];
        } else {
             // Fallback for unexpected compaction results
             console.warn("Compacted JSON-LD structure unexpected. Result:", compacted);
             const potentialGraph = Array.isArray(jsonldFromRdf) ? jsonldFromRdf : [];
             const targetInData = potentialGraph.find(item => item['@id'] === targetId);
             if (targetInData) {
                 graph = [targetInData as JsonLdGraphEntity];
                 console.warn("Falling back to using uncompacted data structure.");
             } else {
                return undefined; // Cannot proceed
             }
        }

        // Create a Map for efficient entity lookup by ID
        const graphMap = new Map<string, JsonLdGraphEntity>();
        graph.forEach(entity => {
            if (entity['@id']) {
                graphMap.set(entity['@id'], entity);
                // --- Logging removed ---
            }
        });

        // Pre-process all entities in the graphMap to populate the register.
        // This ensures that even disconnected nodes or nodes only reachable via
        // reverse properties are registered before the target object is built.
        graphMap.forEach((_entityData, entityId) => {
            // The call itself ensures registration via getOrRegister's callback
            buildObjectFromGraph(graphMap, entityId, register);
        });

        // Check if the target entity was actually present in the input RDF *after* processing
        if (!graphMap.has(targetId)) {
            console.warn(`Target entity ID "${targetId}" not found in the processed graph.`);
            return undefined;
        }

        // 4. Retrieve the fully constructed target object from the register
        // It should now contain resolved references to other registered objects.
        return register.get<T>(targetId);

    } catch (error) {
        console.error("Error converting RDF string to object:", error);
        throw new Error(`Failed to convert RDF string to object: ${error instanceof Error ? error.message : String(error)}`);
    }
}
