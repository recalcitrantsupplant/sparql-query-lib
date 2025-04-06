import type {
    StoredQuery,
    Library,
    IdReference,
    // VariableRestrictions, // Removed
    SparqlBindingValue,
    QueryGroup,
    QueryNode,
    QueryEdge,
    ParameterMapping,
    // VariableMapping, // Removed
    NodeParameterMapping, // Import new types
    QueryParameterGroup, // Added for StoredQuery.parameters
    QueryParameter // Added for StoredQuery.parameters
} from '../../src/types/schema-dts';
import { objectToRdfString, rdfStringToObject } from '../../src/lib/rdf-mapper'; // Import the functions
import { EntityRegister } from '../../src/lib/entity-register'; // Import EntityRegister

// Define storedQuery using the StoredQuery type without @context
const storedQuery: StoredQuery = {
    "@id": "https://sparql-query-lib/query/query1", // Add @id
    "@type": "StoredQuery",
    // "id": "query1", // Removed simple id property
    "name": "My Query",
    "query": "SELECT * WHERE { ?s ?p ?o }",
};

describe('rdf-mapper', () => {
    it('should round trip a StoredQuery object', async () => {
        // Convert object to N-Quads
        const rdfNQuads = await objectToRdfString(storedQuery);
        expect(typeof rdfNQuads).toBe('string');
        if (typeof rdfNQuads === 'string') {
            expect(rdfNQuads.length).toBeGreaterThan(0);

            // Convert N-Quads back to object
            const register = new EntityRegister();
            // Use the @id as the targetId
            const reconstructedQuery = await rdfStringToObject<StoredQuery>(rdfNQuads, "https://sparql-query-lib/query/query1", register);

            // Assertions for the reconstructed object
            expect(reconstructedQuery).toBeDefined();
            if (reconstructedQuery) {
                // Check properties match the original object
                // Note: The reconstructed object might have slightly different structure
                // (e.g., properties might be arrays even if single value in original)
                // We need to compare the essential data.
                expect(reconstructedQuery['@type']).toEqual(storedQuery['@type']);
                expect(reconstructedQuery['@id']).toEqual(storedQuery['@id']); // Check @id
                // expect(reconstructedQuery.id).toEqual(storedQuery.id); // Removed check for simple id
                expect(reconstructedQuery.name).toEqual(storedQuery.name);
                expect(reconstructedQuery.query).toEqual(storedQuery.query);
            }

        } else {
            fail('rdfNQuads is not a string');
        }
    });

    it('should round trip linked Library and StoredQuery objects', async () => {
        // Define a Library
        const myLibrary: Library = {
            "@id": "ex:myLibrary",
            "@type": "Library",
            name: "My Test Library",
        };

        // Define two StoredQuery objects that are part of the Library
        const queryA: StoredQuery = {
            "@id": "ex:queryA",
            "@type": "StoredQuery",
            name: "Query A",
            query: "SELECT ?a WHERE { ?a ?b ?c }",
            "http://schema.org/isPartOf": { "@id": myLibrary["@id"]! } // Link to library
        };

        const queryB: StoredQuery = {
            "@id": "ex:queryB",
            "@type": "StoredQuery",
            name: "Query B",
            query: "SELECT ?x WHERE { ?x ?y ?z }",
            "http://schema.org/isPartOf": { "@id": myLibrary["@id"]! } // Link to library
        };

        // Create a graph structure for JSON-LD processing
        const graphObject = { "@graph": [myLibrary, queryA, queryB] };

        // Convert the graph object to N-Quads
        const rdfNQuads = await objectToRdfString(graphObject as any);
        expect(typeof rdfNQuads).toBe('string');
        expect(rdfNQuads.length).toBeGreaterThan(0);
        // console.log("RDF:\n", rdfNQuads); // Optional: log RDF for debugging

        // Convert N-Quads back, targeting one of the queries
        const register = new EntityRegister();
        const reconstructedQueryA = await rdfStringToObject<StoredQuery>(rdfNQuads, queryA["@id"]!, register); // Assert non-null

        // Assertions for the reconstructed Query A
        expect(reconstructedQueryA).toBeDefined();
        expect(reconstructedQueryA?.['@id']).toEqual(queryA['@id']);
        expect(reconstructedQueryA?.['@type']).toEqual(queryA['@type']);
        expect(reconstructedQueryA?.name).toEqual(queryA.name);
        expect(reconstructedQueryA?.query).toEqual(queryA.query);

        // Check the 'isPartOf' link
        expect(reconstructedQueryA?.['http://schema.org/isPartOf']).toBeDefined();
        // isPartOf might be an object or an array of objects after reconstruction
        const isPartOfRef = Array.isArray(reconstructedQueryA?.['http://schema.org/isPartOf'])
            ? reconstructedQueryA['http://schema.org/isPartOf'][0]
            : reconstructedQueryA?.['http://schema.org/isPartOf'];
        expect(isPartOfRef?.['@id']).toEqual(myLibrary['@id']);

        // Retrieve the Library from the register via the link
        const linkedLibrary = register.get<Library>(isPartOfRef?.['@id']!);
        expect(linkedLibrary).toBeDefined();
        expect(linkedLibrary?.['@id']).toEqual(myLibrary['@id']);
        expect(linkedLibrary?.name).toEqual(myLibrary.name);

        // Also deserialize Query B and check its link
        const reconstructedQueryB = await rdfStringToObject<StoredQuery>(rdfNQuads, queryB["@id"]!, register);
        expect(reconstructedQueryB).toBeDefined();
        const isPartOfRefB = Array.isArray(reconstructedQueryB?.['http://schema.org/isPartOf'])
            ? reconstructedQueryB['http://schema.org/isPartOf'][0]
            : reconstructedQueryB?.['http://schema.org/isPartOf'];
        expect(isPartOfRefB?.['@id']).toEqual(myLibrary['@id']);

        // Assertions for the reconstructed Query A
        expect(reconstructedQueryA).toBeDefined();
        expect(reconstructedQueryA?.['@id']).toEqual(queryA['@id']);
        expect(reconstructedQueryA?.['@type']).toEqual(queryA['@type']);
        expect(reconstructedQueryA?.name).toEqual(queryA.name);
        expect(reconstructedQueryA?.query).toEqual(queryA.query);

        // Assertions for the reconstructed Query B
        expect(reconstructedQueryB).toBeDefined();
        expect(reconstructedQueryB?.['@id']).toEqual(queryB['@id']);
        expect(reconstructedQueryB?.['@type']).toEqual(queryB['@type']);
        expect(reconstructedQueryB?.name).toEqual(queryB.name);
        expect(reconstructedQueryB?.query).toEqual(queryB.query);
    });

    it('should reuse the same Library instance when referenced by multiple StoredQuery objects', async () => {
        // Define one Library
        const sharedLibrary: Library = {
            "@id": "ex:sharedLibrary",
            "@type": "Library",
            name: "Shared Library",
        };

        // Define Query 1 referencing the shared library
        const query1: StoredQuery = {
            "@id": "ex:query1",
            "@type": "StoredQuery",
            name: "Query One",
            query: "SELECT ?one WHERE { ?one a <urn:type1> }",
            "http://schema.org/isPartOf": { "@id": sharedLibrary["@id"]! } // Reference shared library
        };

        // Define Query 2 also referencing the same shared library
        const query2: StoredQuery = {
            "@id": "ex:query2",
            "@type": "StoredQuery",
            name: "Query Two",
            query: "SELECT ?two WHERE { ?two a <urn:type2> }",
            "http://schema.org/isPartOf": { "@id": sharedLibrary["@id"]! } // Reference shared library
        };

        // Create the graph containing all entities
        const graphObject = { "@graph": [query1, query2, sharedLibrary] };

        // Convert the graph to N-Quads
        const rdfNQuads = await objectToRdfString(graphObject as any);
        expect(typeof rdfNQuads).toBe('string');
        expect(rdfNQuads.length).toBeGreaterThan(0);

        // Create ONE EntityRegister instance
        const register = new EntityRegister();

        // Deserialize Query 1
        const reconstructedQuery1 = await rdfStringToObject<StoredQuery>(rdfNQuads, query1["@id"]!, register);
        expect(reconstructedQuery1).toBeDefined();
        const libRef1 = Array.isArray(reconstructedQuery1?.['http://schema.org/isPartOf'])
            ? reconstructedQuery1['http://schema.org/isPartOf'][0]
            : reconstructedQuery1?.['http://schema.org/isPartOf'];
        expect(libRef1?.['@id']).toEqual(sharedLibrary['@id']);

        // Deserialize Query 2 using the SAME register
        const reconstructedQuery2 = await rdfStringToObject<StoredQuery>(rdfNQuads, query2["@id"]!, register);
        expect(reconstructedQuery2).toBeDefined();
        const libRef2 = Array.isArray(reconstructedQuery2?.['http://schema.org/isPartOf'])
            ? reconstructedQuery2['http://schema.org/isPartOf'][0]
            : reconstructedQuery2?.['http://schema.org/isPartOf'];
        expect(libRef2?.['@id']).toEqual(sharedLibrary['@id']);

        // Retrieve the referenced library object from the register using the ID from both queries
        const libraryFromQuery1Ref = register.get<Library>(libRef1?.['@id']!);
        const libraryFromQuery2Ref = register.get<Library>(libRef2?.['@id']!);

        // Assert that both queries point to the exact same library instance in memory
        expect(libraryFromQuery1Ref).toBeDefined();
        expect(libraryFromQuery2Ref).toBeDefined();
        expect(libraryFromQuery1Ref).toBe(libraryFromQuery2Ref); // Strict equality check (===)

        // Optional: Verify the content of the shared library instance
        expect(libraryFromQuery1Ref?.name).toEqual(sharedLibrary.name);
    });

    // --- Tests for specific data types ---

    it('should round trip SparqlBindingValue with datatype', async () => {
        // Use property names from regenerated schema-dts type
        const bindingValue: SparqlBindingValue = {
            "@id": "ex:binding1",
            "@type": "SparqlBindingValue",
            bindingType: 'literal', // Use the new property name
            value: '123',
            datatype: 'http://www.w3.org/2001/XMLSchema#integer'
        };

        const rdfNQuads = await objectToRdfString(bindingValue);
        const register = new EntityRegister();
        const reconstructed = await rdfStringToObject<SparqlBindingValue>(rdfNQuads, bindingValue["@id"]!, register);

        expect(reconstructed).toBeDefined();
        expect(reconstructed?.['@id']).toEqual(bindingValue['@id']);
        expect(reconstructed?.['@type']).toEqual(bindingValue['@type']);
        expect(reconstructed?.bindingType).toEqual(bindingValue.bindingType); // Use new property name
        expect(reconstructed?.value).toEqual(bindingValue.value);
        // Handle potential array due to @container and compare compacted value
        const actualDtSingle = Array.isArray(reconstructed?.datatype) ? reconstructed?.datatype[0] : reconstructed?.datatype;
        expect(actualDtSingle).toEqual('xsd:integer');
        expect(reconstructed?.xmlLang).toBeUndefined(); // Expect no language tag
    });

     it('should round trip SparqlBindingValue with language tag', async () => {
         // Test with xmlLang property from schema-dts
         const bindingValueLang: SparqlBindingValue = {
            "@id": "ex:bindingLang",
            "@type": "SparqlBindingValue",
            bindingType: 'literal', // Use the new property name
            value: 'hello',
            xmlLang: 'en' // Use the property name from schema-dts
         };

         const rdfNQuads = await objectToRdfString(bindingValueLang);
         const register = new EntityRegister();
         const reconstructed = await rdfStringToObject<SparqlBindingValue>(rdfNQuads, bindingValueLang["@id"]!, register);

         expect(reconstructed).toBeDefined();
        expect(reconstructed?.['@id']).toEqual(bindingValueLang['@id']);
        expect(reconstructed?.['@type']).toEqual(bindingValueLang['@type']);
        expect(reconstructed?.bindingType).toEqual(bindingValueLang.bindingType); // Use new property name
        expect(reconstructed?.value).toEqual(bindingValueLang.value);
        // Check if the language tag was preserved via the xmlLang property from schema-dts
         expect(reconstructed?.xmlLang).toEqual(bindingValueLang.xmlLang);
         expect(reconstructed?.datatype).toBeUndefined(); // Expect no datatype
     });


    it('should round trip a QueryGroup object with new mapping structures', async () => {
        // Helper functions to reconstruct dictionaries from mappings
        const reconstructParams = (mappings: NodeParameterMapping[] | undefined): Record<string, string> => {
            const params: Record<string, string> = {};
            if (!mappings) return params;
            mappings.forEach(m => {
                // Ensure parameterName and parameterValue are treated as strings for key/value
                const key = typeof m.parameterName === 'string' ? m.parameterName : undefined;
                const value = typeof m.parameterValue === 'string' ? m.parameterValue : undefined;
                if (key && value !== undefined) {
                    params[key] = value;
                }
            });
            return params;
        };

        // Define test data using QueryParameterGroup and QueryParameter
        const paramType: QueryParameter = {
            "@id": "ex:paramType",
            "@type": "QueryParameter",
            paramName: "type",
            allowedTypes: ["http://schema.org/URL"] // Example allowed type
        };
        const paramLabel: QueryParameter = {
            "@id": "ex:paramLabel",
            "@type": "QueryParameter",
            paramName: "label",
            allowedTypes: ["http://schema.org/Text"] // Example allowed type
        };
        const paramGroup: QueryParameterGroup = {
            "@id": "ex:paramGroup1",
            "@type": "QueryParameterGroup",
            vars: [ // Use 'vars' property
                { "@id": paramType["@id"]! },
                { "@id": paramLabel["@id"]! }
            ]
        };

        const storedQueryWithParams: StoredQuery = {
            "@id": "ex:queryWithParams",
            "@type": "StoredQuery",
            name: "Query With Parameters",
            query: "SELECT ?s WHERE { ?s a ?type }",
            parameters: { "@id": paramGroup["@id"]! } // Link to the parameter group
        };

        const nodeA: QueryNode = {
            "@id": "ex:nodeA",
            "@type": "QueryNode",
            queryId: storedQueryWithParams["@id"]!, // Link to the query with parameters
            parameterMappings: [ // Use the new property
                { "@id": "ex:npm1", "@type": "NodeParameterMapping", parameterName: "limit", parameterValue: "10" },
                { "@id": "ex:npm2", "@type": "NodeParameterMapping", parameterName: "offset", parameterValue: "0" }
            ]
        };

        const nodeB: QueryNode = { "@id": "ex:nodeB", "@type": "QueryNode", "queryId": "ex:querySimple" }; // Added quote

        const edge1: QueryEdge = { // Added const
            "@id": "ex:edge1",
            "@type": "QueryEdge",
            "fromNodeId": nodeA["@id"]!, // Added quote
            "toNodeId": nodeB["@id"]!, // Added quote
            "mappings": [ // Added quote
                { "@id": "ex:pm1", "@type": "ParameterMapping", fromParam: "s", toParam: "inputSubject" }
            ]
        };

        const queryGroup: QueryGroup = { // Added const
            "@id": "ex:queryGroup1",
            "@type": "QueryGroup",
            "name": "My Mapped Workflow", // Added quote
            "startNodeIds": [nodeA["@id"]!], // Added quote
            "endNodeIds": [nodeB["@id"]!], // Added quote
            "nodes": [{ "@id": nodeA["@id"]! }, { "@id": nodeB["@id"]! }], // Added quote, Reference nodes
            "edges": [{ "@id": edge1["@id"]! }] // Added quote, Reference edge
        };

        // Include all entities in the graph for serialization
        const graph = {
            "@graph": [
                queryGroup, nodeA, nodeB, edge1,
                storedQueryWithParams, paramGroup, paramType, paramLabel, // Include query, group, and params
                // Include mapping instances if they have IDs and need to be separate nodes
                ...(nodeA.parameterMappings as NodeParameterMapping[]), // Cast for safety
                ...(edge1.mappings as ParameterMapping[]) // Cast for safety
            ].filter(item => item && item['@id']) // Filter out potential undefined/nulls and ensure items have IDs
        };

        const rdfNQuads = await objectToRdfString(graph as any);
        expect(typeof rdfNQuads).toBe('string'); // Add check
        expect(rdfNQuads.length).toBeGreaterThan(0); // Add check

        const register = new EntityRegister();
        const reconstructed = await rdfStringToObject<QueryGroup>(rdfNQuads, queryGroup["@id"]!, register);

        expect(reconstructed).toBeDefined();
        expect(reconstructed?.['@id']).toEqual(queryGroup['@id']);
        expect(reconstructed?.['@type']).toEqual(queryGroup['@type']);
        expect(reconstructed?.name).toEqual(queryGroup.name);
        const expectedStart = Array.isArray(queryGroup.startNodeIds) ? queryGroup.startNodeIds : [queryGroup.startNodeIds];
        const actualStart = Array.isArray(reconstructed?.startNodeIds) ? reconstructed.startNodeIds : [reconstructed?.startNodeIds].filter(t => t !== undefined);
        expect(actualStart).toEqual(expect.arrayContaining(expectedStart!));

        const expectedEnd = Array.isArray(queryGroup.endNodeIds) ? queryGroup.endNodeIds : [queryGroup.endNodeIds];
        const actualEnd = Array.isArray(reconstructed?.endNodeIds) ? reconstructed.endNodeIds : [reconstructed?.endNodeIds].filter(t => t !== undefined);
        expect(actualEnd).toEqual(expect.arrayContaining(expectedEnd!));

        // Check nodes array (references)
        const actualNodes = Array.isArray(reconstructed?.nodes) ? reconstructed.nodes : [reconstructed?.nodes].filter(n => n !== undefined);
        expect(actualNodes).toHaveLength(Array.isArray(queryGroup.nodes) ? queryGroup.nodes.length : 1); // Check length after ensuring array
        const reconNodeA = register.get<QueryNode>(nodeA["@id"]!);
        expect(reconNodeA).toBeDefined();
        expect(reconNodeA?.queryId).toEqual(nodeA.queryId);

        // Check reconstructed parameters for Node A
        const reconParamsA = reconstructParams(reconNodeA?.parameterMappings as NodeParameterMapping[]);
        expect(reconParamsA).toEqual({ limit: "10", offset: "0" });

        // Check edges array (references)
        const actualEdges = Array.isArray(reconstructed?.edges) ? reconstructed.edges : [reconstructed?.edges].filter(e => e !== undefined);
        expect(actualEdges).toHaveLength(Array.isArray(queryGroup.edges) ? queryGroup.edges.length : 1); // Check length after ensuring array
        const reconEdge1 = register.get<QueryEdge>(edge1["@id"]!);
        expect(reconEdge1).toBeDefined();
        expect(reconEdge1?.fromNodeId).toEqual(edge1.fromNodeId);
        expect(reconEdge1?.toNodeId).toEqual(edge1.toNodeId);

        // Check mappings array within the edge
        const actualMappings = Array.isArray(reconEdge1?.mappings) ? reconEdge1.mappings : [reconEdge1?.mappings].filter(m => m !== undefined);
        const expectedMappingsLength = Array.isArray(edge1.mappings) ? edge1.mappings.length : (edge1.mappings ? 1 : 0);
        expect(actualMappings).toHaveLength(expectedMappingsLength); // Check length after ensuring array

        // Ensure mappings is an array before indexing
        const firstMappingRef = Array.isArray(edge1.mappings) ? edge1.mappings[0] : edge1.mappings;
        const reconMapping1 = register.get<ParameterMapping>((firstMappingRef as IdReference)['@id']!);
        expect(reconMapping1).toBeDefined();
        expect(reconMapping1?.fromParam).toEqual('s');
        expect(reconMapping1?.toParam).toEqual('inputSubject');

        // Check the StoredQuery with parameters
        const reconStoredQuery = register.get<StoredQuery>(storedQueryWithParams["@id"]!);
        expect(reconStoredQuery).toBeDefined(); // Add assertion before use
        expect(reconStoredQuery?.name).toEqual(storedQueryWithParams.name);

        // Check the reconstructed parameters link
        expect(reconStoredQuery?.parameters).toBeDefined();
        const paramGroupRef = Array.isArray(reconStoredQuery!.parameters) // Use non-null assertion after check
            ? reconStoredQuery!.parameters[0]
            : reconStoredQuery!.parameters;
        expect(paramGroupRef?.['@id']).toEqual(paramGroup['@id']);

        // Retrieve the parameter group and check its contents
        const reconParamGroup = register.get<QueryParameterGroup>(paramGroupRef?.['@id']!);
        expect(reconParamGroup).toBeDefined();
        expect(reconParamGroup?.vars).toBeDefined();
        const paramRefs = Array.isArray(reconParamGroup?.vars) ? reconParamGroup.vars : [reconParamGroup?.vars].filter(Boolean);
        expect(paramRefs).toHaveLength(2);

        // Retrieve and check individual parameters
        const reconParamType = register.get<QueryParameter>(paramType['@id']!);
        const reconParamLabel = register.get<QueryParameter>(paramLabel['@id']!);
        expect(reconParamType).toBeDefined();
        expect(reconParamType?.paramName).toEqual(paramType.paramName);
        expect(reconParamLabel).toBeDefined();
        expect(reconParamLabel?.paramName).toEqual(paramLabel.paramName);

        // Verify the vars array in the group contains the correct parameter IDs
        const paramIds = paramRefs.map(p => (p as IdReference)['@id']).sort();
        expect(paramIds).toEqual([paramType['@id'], paramLabel['@id']].sort());
    });

    it('should round trip objects with empty arrays or missing optional properties', async () => {
        // 1. Library with empty queries array
        // 1. Library with no specific properties other than required ones
        const emptyLibrary: Library = {
            "@id": "ex:emptyLib",
            "@type": "Library",
            name: "Empty Library",
            // No 'description' or other optional fields
        };

        // 2. StoredQuery with only required fields
        const minimalQuery: StoredQuery = {
            "@id": "ex:minimalQuery",
            "@type": "StoredQuery",
            name: "Minimal Query",
            query: "SELECT ?minimal WHERE { ?minimal a <urn:type> }"
            // No 'description' or other optional fields
        };

        const graphObject = { "@graph": [emptyLibrary, minimalQuery] };
        const rdfNQuads = await objectToRdfString(graphObject as any);
        expect(typeof rdfNQuads).toBe('string');
        expect(rdfNQuads.length).toBeGreaterThan(0);

        const register = new EntityRegister();

        // Test deserialization of empty library
        const reconstructedEmptyLib = await rdfStringToObject<Library>(rdfNQuads, emptyLibrary["@id"]!, register);
        expect(reconstructedEmptyLib).toBeDefined();
        expect(reconstructedEmptyLib?.['@id']).toEqual(emptyLibrary['@id']);
        expect(reconstructedEmptyLib?.name).toEqual(emptyLibrary.name);
        // Check that optional properties are undefined
        expect(reconstructedEmptyLib?.description).toBeUndefined();
        expect(reconstructedEmptyLib?.['http://schema.org/dateCreated']).toBeUndefined();

        // Test deserialization of minimal query
        const reconstructedMinimalQuery = await rdfStringToObject<StoredQuery>(rdfNQuads, minimalQuery["@id"]!, register);
        expect(reconstructedMinimalQuery).toBeDefined();
        expect(reconstructedMinimalQuery?.['@id']).toEqual(minimalQuery['@id']);
        expect(reconstructedMinimalQuery?.name).toEqual(minimalQuery.name);
        expect(reconstructedMinimalQuery?.query).toEqual(minimalQuery.query);
        // Check that optional properties are undefined or absent
        expect(reconstructedMinimalQuery?.description).toBeUndefined();
        // Add checks for other optional properties if they exist in StoredQuery type
    });
});
