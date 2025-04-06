// Import necessary types, avoiding duplicates and using main exported types
import type { ISparqlExecutor } from '../server/ISparqlExecutor';
import { EntityRegister } from './entity-register';
import { SparqlQueryParser } from './parser';
import { transformSparqlResultsToArguments, ArgumentSet, SparqlResultsJson, SparqlValue } from './query-chaining';
import { HttpSparqlExecutor } from '../server/HttpSparqlExecutor';
import { OxigraphSparqlExecutor } from '../server/OxigraphSparqlExecutor'; // Assuming this will be implemented
import type {
    Thing, IdReference, Text, URL as SchemaURL, QueryParameter, Backend,
    StoredQuery, QueryNode, QueryEdge, ParameterMapping, QueryParameterGroup,
    QueryGroup as QueryGroupType // Use alias for QueryGroup to avoid conflict if needed later
} from '../types/schema-dts';

// Local definition since SchemaValue is not exported from schema-dts.ts
type LocalSchemaValue<T> = T | readonly T[];

// Helper function to ensure a value is an array (returns mutable copy)
function ensureArray<T>(value: LocalSchemaValue<T> | undefined): T[] {
    if (value === undefined || value === null) {
        return [];
    }
    // Handle readonly arrays and single items
    // Explicitly cast [value] to T[] to satisfy the type checker, assuming T is the intended element type
    return Array.isArray(value) ? [...value] : [value] as T[];
}

// Helper function to safely get the string ID from various potential inputs
// Accepts Thing, IdReference, Text, SchemaURL, or a direct string ID
function getId(ref: LocalSchemaValue<Thing | IdReference | Text | SchemaURL> | string | undefined): string | undefined {
    // Handle direct string ID case first
    if (typeof ref === 'string') return ref;

    const value = ensureArray(ref)[0]; // Take the first element if it's an array
    if (!value) return undefined;
    if (typeof value === 'string') return value; // It's Text or URL string
    // Check for IdReference first
    if (typeof value === 'object' && '@id' in value && typeof value['@id'] === 'string') return value['@id'];
    // Check for Text/URL object with @value
    if (typeof value === 'object' && '@value' in value && typeof value['@value'] === 'string') return value['@value'];
     return undefined;
}

// Helper function to safely get the string value from Text or URL
function getValue(ref: LocalSchemaValue<Text | SchemaURL> | undefined): string | undefined {
     const value = ensureArray(ref)[0]; // Take the first element if it's an array
     if (!value) return undefined;
     if (typeof value === 'string') return value; // It's Text or URL string (common case)
     // Check for Text/URL object with @value
     if (typeof value === 'object' && '@value' in value && typeof value['@value'] === 'string') return value['@value'];
     return undefined;
}


/**
 * Orchestrates the execution of StoredQuery and QueryGroup entities.
 * Handles query chaining, argument transformation/validation, and dynamic executor selection.
 */
export class QueryOrchestrator {
    private entityRegister: EntityRegister;
    private defaultExecutor: ISparqlExecutor;
    private parser: SparqlQueryParser; // Add parser instance
    // TODO: Consider a factory for dynamic executor creation if needed elsewhere

    constructor(entityRegister: EntityRegister, defaultExecutor: ISparqlExecutor, parser: SparqlQueryParser) {
        this.entityRegister = entityRegister;
        this.defaultExecutor = defaultExecutor;
        this.parser = parser; // Store parser instance
    }

    /**
     * Executes a QueryGroup, chaining results between queries as defined by QueryEdges.
     *
     * @param queryGroupInput The QueryGroup entity or its ID to execute.
     * @param initialArgs Optional initial arguments for the starting node(s).
     * @param startNodeId Optional ID of the node to start execution from. If not provided, starts from nodes with no incoming edges.
     * @returns A promise resolving to the result of the final query executed in the chain.
     */
    async executeQueryGroup(
        queryGroupInput: QueryGroupType | IdReference | string, // Accept full object, reference, or string ID
        initialArgs?: ArgumentSet, // Allow initial arguments
        startNodeId?: string
    ): Promise<SparqlResultsJson | string | boolean> { // Result can be SELECT JSON, CONSTRUCT/DESCRIBE string, or ASK boolean

        // --- Resolve QueryGroup ---
        const queryGroupId = getId(queryGroupInput); // Use updated getId
        if (!queryGroupId) throw new Error('Invalid QueryGroup input: Missing ID.');
        const queryGroup = this.entityRegister.get<QueryGroupType>(queryGroupId);
        if (!queryGroup || queryGroup['@type'] !== 'QueryGroup') { // Ensure it's the correct type after resolving
            throw new Error(`Could not find or resolve QueryGroup with ID ${queryGroupId}.`);
        }
        console.log(`Executing QueryGroup: ${queryGroup['@id']}`);
        // --- End Resolve QueryGroup ---

        // --- Resolve Nodes ---
        // Use the correct property 'nodes' from the schema and resolve references
        const nodeRefs = ensureArray(queryGroup.nodes); // Use correct property name 'nodes'
        const nodes: QueryNode[] = nodeRefs.map((ref: IdReference | QueryNode): QueryNode => { // Add explicit type to ref
            const nodeId = getId(ref); // Use updated getId helper
            if (!nodeId) throw new Error(`QueryGroup ${queryGroupId} contains an invalid node reference.`);
            const node = this.entityRegister.get<QueryNode>(nodeId);
            // Ensure it's resolved and the correct type
            if (!node || node['@type'] !== 'QueryNode') throw new Error(`Could not resolve node ${nodeId} in QueryGroup ${queryGroupId}.`);
            return node;
        });
        if (nodes.length === 0) {
            throw new Error(`QueryGroup ${queryGroupId} has no valid QueryNode objects.`);
        }
        const nodeMap = new Map<string, QueryNode>(nodes.map((n: QueryNode) => [n['@id']!, n])); // ID is guaranteed by resolution
        // --- End Resolve Nodes ---

         // --- Resolve Edges and Build Graph ---
         // Use the correct property 'edges' from the schema and resolve references
         const edgeRefs = ensureArray(queryGroup.edges); // Use correct property name 'edges'
         const edges: QueryEdge[] = edgeRefs.map((ref: IdReference | QueryEdge): QueryEdge => { // Resolve edges similarly to nodes
              const edgeId = getId(ref); // Use updated getId helper
              if (!edgeId) throw new Error(`QueryGroup ${queryGroupId} contains an invalid edge reference.`);
              const edge = this.entityRegister.get<QueryEdge>(edgeId);
              // Ensure it's resolved and the correct type
              if (!edge || edge['@type'] !== 'QueryEdge') throw new Error(`Could not resolve edge ${edgeId} in QueryGroup ${queryGroupId}.`);
              return edge;
         });


        const incomingEdges = new Map<string, QueryEdge[]>();
        const outgoingEdges = new Map<string, QueryEdge[]>();

        edges.forEach((edge: QueryEdge) => {
            // Use correct property names and getId helper
            const fromId = getId(edge.fromNodeId);
            const toId = getId(edge.toNodeId);

            if (!fromId || !toId) {
                const edgeIdString = edge['@id'] || '(unknown ID)';
                console.warn(`Edge ${edgeIdString} is missing valid fromNodeId or toNodeId. Skipping.`);
                return;
            }

            // Check if referenced nodes exist in the group (using resolved nodeMap)
            if (!nodeMap.has(fromId)) {
                 console.warn(`Edge ${edge['@id'] || '(unknown ID)'} references fromNodeId "${fromId}" which is not found in the group's nodes. Skipping.`);
                 return;
            }
            if (!nodeMap.has(toId)) {
                 console.warn(`Edge ${edge['@id'] || '(unknown ID)'} references toNodeId "${toId}" which is not found in the group's nodes. Skipping.`);
                 return;
            }

            // Add to maps
            if (!outgoingEdges.has(fromId)) outgoingEdges.set(fromId, []);
            outgoingEdges.get(fromId)!.push(edge);

            if (!incomingEdges.has(toId)) incomingEdges.set(toId, []);
            incomingEdges.get(toId)!.push(edge);
        });
         // --- End Resolve Edges ---

        // Determine starting nodes
        let startNodeIds: string[];
        if (startNodeId) {
            if (!nodeMap.has(startNodeId)) {
                throw new Error(`Specified startNodeId "${startNodeId}" not found in QueryGroup ${queryGroupId}.`);
            }
            startNodeIds = [startNodeId];
        } else {
            // Use explicitly defined startNodeIds if available
            const groupStartNodeIds = ensureArray(queryGroup.startNodeIds).map(getId).filter((id): id is string => !!id);
            if (groupStartNodeIds.length > 0) {
                startNodeIds = groupStartNodeIds.filter(id => nodeMap.has(id)); // Ensure they exist in the resolved nodes
                if (startNodeIds.length !== groupStartNodeIds.length) {
                    console.warn(`QueryGroup ${queryGroupId} has startNodeIds defined, but some do not exist in the resolved nodes.`);
                }
                if (startNodeIds.length === 0) {
                     throw new Error(`QueryGroup ${queryGroupId} has startNodeIds defined, but none exist in the resolved nodes.`);
                }
            } else {
                // Fallback: Calculate nodes with no incoming edges
                const allNodeIds = Array.from(nodeMap.keys());
                startNodeIds = allNodeIds.filter((id: string) => !incomingEdges.has(id));

                if (startNodeIds.length === 0 && nodes.length > 0) {
                    // Handle cyclic graphs or single-node graphs
                    if (nodes.length === 1) {
                        startNodeIds = [nodes[0]['@id']!]; // Single node is the start
                    } else {
                         // Attempt to find nodes not targeted by any *resolved* edge
                         const potentialStartNodes = nodes.filter(n => {
                             const nId = n['@id']!;
                             return !edges.some(e => getId(e.toNodeId) === nId);
                         });
                         const potentialStartIds = potentialStartNodes.map(n => n['@id']!);

                         if (potentialStartIds.length > 0) {
                              startNodeIds = potentialStartIds;
                              console.warn(`QueryGroup ${queryGroupId} might be cyclic or disconnected (no explicit startNodeIds, no nodes without incoming edges). Found potential start nodes: ${startNodeIds.join(', ')}. Starting with these.`);
                         } else {
                              throw new Error(`QueryGroup ${queryGroupId} appears cyclic or misconfigured: No explicit startNodeIds, no node without incoming edges found, and no startNodeId was provided.`);
                         }
                    }
                }
            }
             if (startNodeIds.length > 1 && initialArgs) {
                 console.warn(`QueryGroup ${queryGroupId} has multiple starting nodes (${startNodeIds.join(', ')}), but initialArgs were provided. These args will be applied to ALL starting nodes if their parameters match.`);
                 // Refined logic below handles applying initialArgs more carefully
             }
        }

        const executionResults = new Map<string, SparqlResultsJson | string | boolean>(); // Store results per node ID
        const executionQueue = [...startNodeIds]; // Nodes to process
        const executedNodes = new Set<string>(); // Track executed nodes to detect cycles/prevent re-execution
        const nodeArguments = new Map<string, ArgumentSet>(); // Store prepared arguments for each node

        // --- Prepare Initial Arguments ---
        if (initialArgs) {
            // Convert initial ArgumentSet to SparqlResultsJson for consistent transformation handling
            const initialResultsJson: SparqlResultsJson = {
                head: { vars: initialArgs.head.vars },
                results: { bindings: initialArgs.arguments.map((argObj: Record<string, SparqlValue>) => {
                    const binding: Record<string, SparqlValue> = {};
                    initialArgs.head.vars.forEach((varName: string) => {
                        if (argObj[varName]) {
                            binding[varName] = argObj[varName];
                        }
                    });
                    return binding;
                }) }
            };

            // Apply initial args to all designated starting nodes
            for (const nodeId of startNodeIds) {
                 console.log(`Attempting to apply initial arguments to starting node: ${nodeId}`);
                 // We don't have mappings for initial args, so transform with empty mappings
                 try {
                    const transformedInitialArgs = transformSparqlResultsToArguments(initialResultsJson, []);
                    // Validate initial args against the node's parameters
                    const node = nodeMap.get(nodeId); // Guaranteed to exist by startNodeIds logic
                    if (!node) continue; // Should not happen, but safety check

                    // Use correct property 'queryId' and resolve it
                    const queryId = getId(node.queryId);
                    if (!queryId) {
                         console.warn(`Node ${nodeId} does not have a valid queryId reference. Cannot validate initial arguments.`);
                         continue;
                    }

                    // Fetch the full StoredQuery entity
                    const storedQueryEntity = this.entityRegister.get<StoredQuery>(queryId);
                    // Check type and ensure it's not undefined
                    if (storedQueryEntity && storedQueryEntity['@type'] === 'StoredQuery') {
                        this.validateArguments(storedQueryEntity, transformedInitialArgs, `initial arguments`, nodeId);
                        nodeArguments.set(nodeId, transformedInitialArgs);
                        console.log(`Successfully prepared initial arguments for node ${nodeId}.`);
                    } else {
                         console.warn(`Could not find or resolve StoredQuery with ID ${queryId} for starting node ${nodeId} to validate initial arguments.`);
                    }
                 } catch (error) {
                     console.error(`Failed to transform or validate initial arguments for node ${nodeId}: ${error instanceof Error ? error.message : String(error)}. This node might fail if it requires arguments.`);
                     // Continue execution, the node might not actually need args or fail later
                 }
            }
        }
        // --- End Initial Arguments ---


        while (executionQueue.length > 0) {
            const currentNodeId = executionQueue.shift()!; // Guaranteed string by how queue is populated

            // Check if node's prerequisites (incoming edges) have been met
            const incoming = incomingEdges.get(currentNodeId);
            let prerequisitesMet = true;
            if (incoming && incoming.length > 0) {
                for (const edge of incoming) {
                    // Use correct property 'fromNodeId' and resolve it
                    const fromNodeId = getId(edge.fromNodeId);
                    if (!fromNodeId || !executedNodes.has(fromNodeId)) {
                        prerequisitesMet = false;
                        break; // Exit inner loop as soon as one prerequisite is missing
                    }
                }
            }

            if (!prerequisitesMet) {
                // Re-queue the node if prerequisites aren't met yet (potential deadlock in cycles handled by executedNodes check)
                if (!executedNodes.has(currentNodeId)) { // Avoid re-queueing if it was skipped due to cycle detection
                     // Check if the node is already in the queue to avoid duplicates
                     if (!executionQueue.includes(currentNodeId)) {
                        executionQueue.push(currentNodeId);
                     }
                }
                continue;
            }


            if (executedNodes.has(currentNodeId)) {
                // console.warn(`Node ${currentNodeId} already executed. Skipping.`); // Reduce noise, cycle detection is main goal
                continue;
            }

            const node = nodeMap.get(currentNodeId);
            if (!node) {
                // Should not happen if startNodeIds are derived correctly, but check anyway
                throw new Error(`Node definition not found for ID: ${currentNodeId}`);
            }

            // --- Fetch and Validate StoredQuery ---
            // Use correct property 'queryId' and resolve it
            const queryId = getId(node.queryId);
            if (!queryId) {
                 throw new Error(`Node ${currentNodeId} does not have a valid queryId reference.`);
            }
            const storedQueryEntity = this.entityRegister.get<StoredQuery>(queryId);
            // Check type and ensure it's not undefined
            if (!storedQueryEntity || storedQueryEntity['@type'] !== 'StoredQuery') {
                 throw new Error(`Could not find or resolve StoredQuery with ID ${queryId} for node ${currentNodeId}.`);
            }
            // Ensure the query string itself exists and is a string (use getValue helper)
            // Assert type as SchemaValue<Text> because schema guarantees it, despite potential wider inference
            const queryString = getValue(storedQueryEntity.query as LocalSchemaValue<Text>);
            if (typeof queryString !== 'string') {
                 throw new Error(`StoredQuery ${queryId} for node ${currentNodeId} does not contain a valid query string.`);
            }
            // Assert the type after the check to satisfy compiler for property access later
            const storedQuery = storedQueryEntity as StoredQuery;
            // --- End Fetch and Validate StoredQuery ---


            console.log(`Processing node: ${currentNodeId} (Query: ${storedQuery['@id']})`);

            // Parse the original query string first
            let parsedQuery = this.parser.parseQuery(queryString);
            const originalQueryType = parsedQuery.queryType; // Store original type

            let currentArgs: ArgumentSet | undefined = nodeArguments.get(currentNodeId); // Get pre-prepared initial args if any

            // --- Argument Transformation and Validation (if not initial args) ---
            if (!currentArgs && incoming && incoming.length > 0) {
                // Handle multiple incoming edges by merging arguments using a 'union' strategy.
                const incomingNodeIds = incoming.map(e => getId(e.fromNodeId) || '?').join(', ');
                console.log(`Node ${currentNodeId} has multiple incoming edges. Applying 'union' merge for arguments from: ${incomingNodeIds}.`);

                // Initialize with empty head and arguments
                let mergedArgs: ArgumentSet = { head: { vars: [] }, arguments: [] };
                let successfullyMerged = false; // Track if at least one edge provided valid args

                for (const edge of incoming) {
                    // Use correct property 'fromNodeId' and resolve it
                    const fromNodeId = getId(edge.fromNodeId);

                    // Skip if fromNodeId is missing or result is missing
                    if (!fromNodeId || !executionResults.has(fromNodeId)) continue;

                    const prevResultData = executionResults.get(fromNodeId);

                    // Ensure previous result is SparqlResultsJson for transformation
                    if (typeof prevResultData !== 'object' || !('head' in prevResultData) || !('results' in prevResultData)) {
                        const edgeIdString = edge['@id'] || '(unknown ID)';
                        console.warn(`Cannot chain node ${currentNodeId} via edge ${edgeIdString}: Previous node ${fromNodeId} result is not in SPARQL JSON Results format. Skipping edge.`);
                        continue; // Skip this edge
                    }
                    const prevSelectResults = prevResultData as SparqlResultsJson;

                    // Use correct property 'mappings' and resolve ParameterMapping references if needed (assuming they are embedded for now)
                    const mappingsInput = edge.mappings; // Use correct property name
                    const mappings: ParameterMapping[] = ensureArray(mappingsInput)
                        .map(mRef => { // Resolve if it's an IdReference
                            const mId = getId(mRef);
                            if (!mId) return typeof mRef === 'object' ? mRef as ParameterMapping : null; // Assume embedded if not ID
                            const resolvedM = this.entityRegister.get<ParameterMapping>(mId);
                            return (resolvedM && resolvedM['@type'] === 'ParameterMapping') ? resolvedM : null;
                        })
                        .filter((m): m is ParameterMapping => !!m); // Filter out nulls


                    try {
                        const transformedArgs = transformSparqlResultsToArguments(prevSelectResults, mappings);
                        const edgeIdString = edge['@id'] || '(unknown ID)';
                        console.log(`Transformed arguments for node ${currentNodeId} from edge ${edgeIdString}:`, JSON.stringify(transformedArgs, null, 2));

                        // Validate arguments against the target query's parameters (use the resolved storedQuery)
                        this.validateArguments(storedQuery, transformedArgs, `edge ${edgeIdString}`, currentNodeId);

                        // --- Apply 'Union' Merge Strategy ---
                        // Add unique variables to head
                        transformedArgs.head.vars.forEach((v: string) => {
                            if (!mergedArgs.head.vars.includes(v)) {
                                mergedArgs.head.vars.push(v);
                            }
                        });
                        // Append all argument rows
                        mergedArgs.arguments.push(...transformedArgs.arguments);
                        // --- End Merge Strategy ---

                        successfullyMerged = true; // Mark that we got valid args from at least one edge

                    } catch (error) {
                        // Log error and continue processing other edges if possible
                        const edgeIdString = edge['@id'] || '(unknown ID)';
                        console.error(`Failed to transform/validate arguments for node ${currentNodeId} from edge ${edgeIdString}: ${error instanceof Error ? error.message : String(error)}`);
                        // Do not throw here, allow other edges to potentially provide arguments
                    }
                } // End loop over incoming edges

                // Only assign the merged args if at least one edge contributed successfully
                if (successfullyMerged) {
                    currentArgs = mergedArgs;
                } else {
                    console.warn(`Node ${currentNodeId} had multiple incoming edges, but none provided valid arguments after transformation/validation.`);
                    // currentArgs remains undefined
                }
            }
            // --- End Argument Transformation and Validation ---


            // --- Apply Arguments ---
            let queryToExecute = parsedQuery; // Start with the initial parsed query
            if (currentArgs && currentArgs.arguments.length > 0) { // Also check if there are any rows to apply
                try {
                    // applyArguments expects a parsed query object and an array of ArgumentSet
                    queryToExecute = this.parser.applyArguments(parsedQuery, [currentArgs]); // Apply arguments to the parsed query object
                    console.log(`Query for node ${currentNodeId} after applying arguments:\n${JSON.stringify(queryToExecute, null, 2)}`); // Log the parsed object
                } catch (error) {
                    throw new Error(`Failed to apply arguments to query for node ${currentNodeId}: ${error instanceof Error ? error.message : String(error)}`);
                }
            } else {
                 // Check if the query *expected* parameters but none were provided (either initial or chained)
                 const detectedParams = this.parser.detectParameters(queryString); // Use instance method on resolved query string
                 // Check if any parameter arrays/properties have content
                 if (detectedParams.valuesParameters.length > 0 || (detectedParams.limitParameters && detectedParams.limitParameters.length > 0) || (detectedParams.offsetParameters && detectedParams.offsetParameters.length > 0)) {
                     const queryIdString = storedQuery['@id'] || '(unknown ID)';
                     // Construct the warning message more carefully, joining only existing parameters
                     const paramList = [
                         ...detectedParams.valuesParameters,
                         ...(detectedParams.limitParameters || []),
                         ...(detectedParams.offsetParameters || [])
                     ].filter(Boolean).join(', ');
                     console.warn(`Query for node ${currentNodeId} (Query: ${queryIdString}) appears to have parameters (${paramList}), but no arguments were provided or generated through chaining.`);
                 }
                 // Depending on the query structure (e.g., OPTIONAL VALUES), this might be okay or might fail.
            }


            // --- Execute Query ---
            let result: SparqlResultsJson | string | boolean;
            try {
                // Pass the current node to determine the correct executor based on node.targetBackend
                const executorToUse = this.getExecutorForQuery(node);
                // Use the parsed query object directly for execution
                const queryType = queryToExecute.queryType; // Get type from the parsed object
                console.log(`Executing ${queryType} query for node ${currentNodeId} using ${executorToUse.constructor.name}...`);

                switch (queryType) {
                    case 'SELECT':
                        result = await executorToUse.selectQueryParsed(queryToExecute); // Pass parsed object
                        break;
                    case 'CONSTRUCT':
                    case 'DESCRIBE':
                        result = await executorToUse.constructQueryParsed(queryToExecute); // Pass parsed object
                        break;
                    case 'ASK':
                        result = await executorToUse.askQuery(queryToExecute); // Pass parsed object
                        break;
                    case 'UPDATE':
                         throw new Error(`UPDATE queries are not supported within QueryGroup execution (Node: ${currentNodeId}).`);
                    default:
                        throw new Error(`Unsupported query type "${queryType}" for node ${currentNodeId}.`);
                }
                console.log(`Node ${currentNodeId} executed successfully.`);

            } catch (error) {
                const queryIdString = storedQuery['@id'] || '(unknown ID)';
                throw new Error(`Failed to execute query for node ${currentNodeId} (Query ID: ${queryIdString}): ${error instanceof Error ? error.message : String(error)}`);
            }

            executionResults.set(currentNodeId, result);
            executedNodes.add(currentNodeId);

            // Add next nodes to the queue
            const outgoing = outgoingEdges.get(currentNodeId);
            if (outgoing) {
                outgoing.forEach((edge: QueryEdge) => {
                    // Use correct property 'toNodeId' and resolve it
                    const nextNodeId = getId(edge.toNodeId);
                    // Add if it exists, hasn't been executed, and isn't already queued
                    if (nextNodeId && nodeMap.has(nextNodeId) && !executedNodes.has(nextNodeId) && !executionQueue.includes(nextNodeId)) {
                        executionQueue.push(nextNodeId);
                    }
                });
            }
        } // End while loop

        // Determine final result
        const finalResult = this.determineFinalResult(queryGroup, nodes, outgoingEdges, executionResults, executedNodes);

        const groupIdString = queryGroup['@id'] || '(unknown ID)';
        console.log(`QueryGroup ${groupIdString} execution completed.`);
        return finalResult;
    }


    /**
     * Validates the types of provided arguments against the parameter definitions of a StoredQuery.
     * Throws an error if a mismatch is found.
     *
     * @param storedQuery The fully resolved StoredQuery entity containing parameter definitions.
     * @param args The ArgumentSet to validate.
     * @param sourceDescription A description of where the arguments came from (e.g., 'initial arguments', 'edge <edge_id>').
     * @param targetNodeId The ID of the node receiving the arguments.
     */
    private validateArguments(storedQuery: StoredQuery, args: ArgumentSet, sourceDescription: string, targetNodeId: string): void {
        // Use correct property 'parameters' and resolve QueryParameterGroup/QueryParameter references if needed
        const paramGroupsInput = storedQuery.parameters; // Use correct property name 'parameters'
        const paramGroups: QueryParameterGroup[] = ensureArray(paramGroupsInput)
            .map(pgRef => { // Resolve if it's an IdReference
                const pgId = getId(pgRef);
                if (!pgId) return typeof pgRef === 'object' ? pgRef as QueryParameterGroup : null; // Assume embedded if not ID
                const resolvedPg = this.entityRegister.get<QueryParameterGroup>(pgId);
                return (resolvedPg && resolvedPg['@type'] === 'QueryParameterGroup') ? resolvedPg : null;
            })
            .filter((pg): pg is QueryParameterGroup => !!pg); // Filter out nulls

        if (paramGroups.length === 0 || args.arguments.length === 0) {
            // No parameters defined or no arguments provided, nothing to validate
            return;
        }

        // Create a map for faster lookup of parameter definitions
        const paramDefMap = new Map<string, { allowedTypes: string[] }>();
        paramGroups.forEach(pg => {
            const paramsInput = pg.vars; // Use correct property name 'vars' inside group
            const targetParams: QueryParameter[] = ensureArray(paramsInput)
                .map(pRef => { // Resolve if it's an IdReference
                    const pId = getId(pRef);
                    // Handle case where var might just be Text (string) - treat as no definition
                    if (typeof pRef === 'string' || (typeof pRef === 'object' && !('@id' in pRef) && '@value' in pRef)) return null;
                    if (!pId) return typeof pRef === 'object' ? pRef as QueryParameter : null; // Assume embedded if not ID
                    const resolvedP = this.entityRegister.get<QueryParameter>(pId);
                    return (resolvedP && resolvedP['@type'] === 'QueryParameter') ? resolvedP : null;
                })
                .filter((p): p is QueryParameter => !!p); // Filter out nulls and simple strings

            targetParams.forEach(p => { // p is guaranteed to be a QueryParameter object here
                // Use correct property 'paramName' and resolve it
                // Assert type as SchemaValue<Text> because schema guarantees it
                const paramName = getValue(p.paramName as LocalSchemaValue<Text>); // Use getValue for Text
                if (paramName && typeof paramName === 'string') {
                     const nameWithoutQ = paramName.startsWith('?') ? paramName.substring(1) : paramName;
                     // Use correct property 'allowedTypes' and resolve Text/URL values safely
                     const allowedTypeInput = p.allowedTypes;
                     const allowedTypes = ensureArray(allowedTypeInput)
                                         // Check if 't' is Text or URL before calling getValue
                                         .map(t => (typeof t === 'string' || (typeof t === 'object' && '@value' in t)) ? getValue(t) : null)
                                         .filter((t): t is string => typeof t === 'string'); // Filter out nulls and ensure string type

                     paramDefMap.set(nameWithoutQ, { allowedTypes });
                } else {
                     const queryIdString = storedQuery['@id'] || '(unknown ID)';
                     console.warn(`Parameter definition in StoredQuery ${queryIdString} is missing a valid 'paramName'. Skipping validation for this parameter.`);
                }
            });
        });


        // Check each binding (row) in the arguments
        args.arguments.forEach((argBinding: Record<string, SparqlValue>, rowIndex: number) => {
            // Check each variable in the binding matches a parameter definition
            Object.entries(argBinding).forEach(([varName, sparqlValue]: [string, SparqlValue]) => {
                const paramDef = paramDefMap.get(varName);

                if (paramDef) {
                    // Parameter definition exists, check type
                    if (paramDef.allowedTypes.length > 0 && !paramDef.allowedTypes.includes(sparqlValue.type)) {
                        throw new Error(`Type mismatch for parameter "?${varName}" (from ${sourceDescription}) at argument row ${rowIndex} for node ${targetNodeId}. Expected type(s) [${paramDef.allowedTypes.join(', ')}] but received type "${sparqlValue.type}" with value "${sparqlValue.value}".`);
                    }
                } else {
                    // Argument provided for a variable that isn't a defined parameter
                    // This might be okay if the query handles it (e.g., unused variable), but log a warning.
                    const queryIdString = storedQuery['@id'] || '(unknown ID)';
                    console.warn(`Argument variable "${varName}" (from ${sourceDescription}) provided for node ${targetNodeId} at row ${rowIndex} has no corresponding parameter definition in StoredQuery ${queryIdString}. It might be ignored.`);
                }
            });
        });
        console.log(`Argument types validated successfully for node ${targetNodeId} from ${sourceDescription}.`);
    }


    /**
 * Determines the appropriate ISparqlExecutor for a given QueryNode based on its backendId.
 * Falls back to the default executor if no specific backend is defined or supported.
 *
 * @param node The fully resolved QueryNode entity.
 * @returns The ISparqlExecutor instance to use.
 */
private getExecutorForQuery(node: QueryNode): ISparqlExecutor {
    const nodeIdString = node['@id'] || '(unknown ID)'; // Safe ID for logging

    // Use correct property 'backendId' from the node and resolve it
    const backendRef = node.backendId; // Correct property name from schema
    const backendId = getId(backendRef);

        if (backendId) {
            const backendEntity = this.entityRegister.get<Backend>(backendId);
            // Ensure it's a fully resolved Backend entity
            if (!backendEntity || backendEntity['@type'] !== 'Backend') {
                console.warn(`Target backend "${backendId}" for node ${nodeIdString} not found or not resolved in entity register. Using default executor.`);
                return this.defaultExecutor;
            }
            const backendIdString = backendEntity['@id'] || '(unknown ID)'; // Safe ID for logging

            try {
                // Use correct property 'backendType' and resolve Text value safely
                const backendTypeRef = backendEntity.backendType;
                const backendType = (typeof backendTypeRef === 'string' || (typeof backendTypeRef === 'object' && '@value' in backendTypeRef))
                                    ? getValue(backendTypeRef)
                                    : undefined; // Don't call getValue if it might be IdReference

                if (backendType === 'HTTP') {
                    // Use correct property 'endpoint' and resolve URL value safely
                    const endpointRef = backendEntity.endpoint;
                    const endpointUrl = (typeof endpointRef === 'string' || (typeof endpointRef === 'object' && '@value' in endpointRef))
                                        ? getValue(endpointRef)
                                        : undefined; // Don't call getValue if it might be IdReference
                    if (!endpointUrl) throw new Error(`HTTP Backend ${backendIdString} for node ${nodeIdString} is missing a valid string endpoint.`);

                    // TODO: Handle credentials if needed from backendEntity properties (ensure they are strings/Text)
                    const httpConfig = { queryUrl: endpointUrl }; // Use queryUrl for the config
                    // console.log(`Using dynamically instantiated HttpSparqlExecutor for node ${nodeIdString} (Backend: ${backendIdString})`);
                    return new HttpSparqlExecutor(httpConfig);

                } else if (backendType === 'OxigraphMemory') {
                    // TODO: How to get the Oxigraph store instance here?
                    // This requires the orchestrator to have access to the shared Oxigraph instance,
                    // potentially passed during construction or via a service locator.
                    console.warn(`OxigraphMemory backend type specified for node ${nodeIdString} (Backend: ${backendIdString}), but dynamic instantiation requires access to the store instance. Using default executor as fallback.`);
                    // Example placeholder:
                    // if (this.oxigraphInstance) { // Assuming oxigraphInstance is available on 'this'
                    //     return new OxigraphSparqlExecutor(this.oxigraphInstance);
                    // }
                    return this.defaultExecutor; // Fallback
                } else {
                    console.warn(`Unsupported backendType "${backendType || 'undefined'}" for backend ${backendIdString} (Node: ${nodeIdString}). Using default executor.`);
                    return this.defaultExecutor;
                }
            } catch (error) {
                 console.error(`Error instantiating executor for backend ${backendIdString} (Node: ${nodeIdString}): ${error instanceof Error ? error.message : String(error)}. Using default executor.`);
                 return this.defaultExecutor;
            }
        } else {
            // console.log(`No specific targetBackend defined for node ${nodeIdString}. Using default executor.`);
            return this.defaultExecutor;
        }
    }

     /**
      * Determines the final result of the QueryGroup execution based on leaf nodes or last executed node.
      *
      * @param queryGroup The resolved QueryGroup entity.
      * @param nodes Array of resolved QueryNode entities.
      * @param outgoingEdges Map of node ID to resolved outgoing QueryEdge entities.
      * @param executionResults Map of node ID to execution result.
      * @param executedNodes Set of executed node IDs.
      * @returns The final result.
      */
     private determineFinalResult(
         queryGroup: QueryGroupType, // Use resolved type
         nodes: QueryNode[],
         outgoingEdges: Map<string, QueryEdge[]>,
         executionResults: Map<string, SparqlResultsJson | string | boolean>,
         executedNodes: Set<string>
     ): SparqlResultsJson | string | boolean {

         // Get IDs of nodes that are valid strings
         const nodeIds = nodes.map(n => n['@id']).filter((id): id is string => typeof id === 'string');
         // Determine leaf node IDs (those without outgoing edges)
         const leafNodeIds = nodeIds.filter((id: string) => !outgoingEdges.has(id));
         const groupIdString = queryGroup['@id'] || '(unknown ID)'; // Safe ID for logging

         let finalResult: SparqlResultsJson | string | boolean | undefined = undefined;
         let resultNodeId: string | undefined = undefined;

         // Check for explicitly defined endNodeIds
         const groupEndNodeIds = ensureArray(queryGroup.endNodeIds).map(getId).filter((id): id is string => !!id);
         const executedEndNodes = groupEndNodeIds.filter(id => executedNodes.has(id));

         if (executedEndNodes.length === 1) {
             // Single specified end node executed
             resultNodeId = executedEndNodes[0];
             finalResult = executionResults.get(resultNodeId);
             console.log(`Determined final result from specified end node: ${resultNodeId}`);
         } else if (executedEndNodes.length > 1) {
             // Multiple specified end nodes executed - return last executed among them
             let lastExecutedTime = -1;
             let lastExecutedEndId: string | undefined;
             const executionOrder = Array.from(executedNodes);
             executedEndNodes.forEach((endId: string) => {
                 const index = executionOrder.indexOf(endId);
                 if (index > lastExecutedTime) {
                     lastExecutedTime = index;
                     lastExecutedEndId = endId;
                 }
             });
             if (lastExecutedEndId) {
                 resultNodeId = lastExecutedEndId;
                 finalResult = executionResults.get(resultNodeId);
                 console.warn(`QueryGroup ${groupIdString} has multiple specified end nodes (${groupEndNodeIds.join(', ')}) that executed. Returning result of the last executed one: ${resultNodeId}`);
             } else {
                  console.warn(`Could not determine the last executed end node among multiple specified end nodes for QueryGroup ${groupIdString}.`);
                  // Fallback below
             }
         }

         // Fallback 1: No specified end nodes, or specified ones didn't execute. Use single leaf node if available.
         if (finalResult === undefined && leafNodeIds.length === 1) {
             const leafId = leafNodeIds[0];
             if (executionResults.has(leafId)) { // Check if the single leaf node actually executed
                 resultNodeId = leafId;
                 finalResult = executionResults.get(resultNodeId);
                 console.log(`Determined final result from single leaf node: ${resultNodeId}`);
             } else {
                  console.warn(`Single leaf node ${leafId} did not execute or produce a result.`);
                  // Fallback below
             }
         }
         // Fallback 2: Multiple leaf nodes. Return last executed among them.
         else if (finalResult === undefined && leafNodeIds.length > 1) {
             const executedLeafNodes = leafNodeIds.filter((id: string) => executedNodes.has(id));
             if (executedLeafNodes.length > 0) {
                  let lastExecutedTime = -1;
                  let lastExecutedLeafId: string | undefined;
                  const executionOrder = Array.from(executedNodes);
                  executedLeafNodes.forEach((leafId: string) => {
                      const index = executionOrder.indexOf(leafId);
                      if (index > lastExecutedTime) {
                          lastExecutedTime = index;
                          lastExecutedLeafId = leafId;
                      }
                  });

                  if (lastExecutedLeafId) {
                     resultNodeId = lastExecutedLeafId;
                     finalResult = executionResults.get(resultNodeId);
                     console.warn(`QueryGroup ${groupIdString} has multiple leaf nodes (${leafNodeIds.join(', ')}). No specific end node determined result. Returning result of the last executed leaf node: ${resultNodeId}`);
                  } else {
                      console.warn(`Could not determine the last executed leaf node among multiple leaves for QueryGroup ${groupIdString}.`);
                      // Fallback below
                  }
             } else {
                  console.warn(`QueryGroup ${groupIdString} has multiple leaf nodes, but none seem to have executed successfully.`);
                  // Fallback below
             }
         }

         // Fallback 3: No clear leaf/end node result, return the result of the very last node executed in the sequence.
         if (finalResult === undefined && executedNodes.size > 0) {
             const lastExecuted = Array.from(executedNodes).pop(); // Get the last element added to the Set (insertion order)
             if (lastExecuted) { // lastExecuted is guaranteed string here
                 resultNodeId = lastExecuted;
                 finalResult = executionResults.get(resultNodeId);
                 if (groupEndNodeIds.length === 0 && leafNodeIds.length === 0) {
                     console.log(`QueryGroup ${groupIdString} has no leaf nodes or specified end nodes (cyclic?). Returning result of the last executed node: ${resultNodeId}`);
                 } else {
                      console.warn(`Could not determine result from specified end node(s) or leaf node(s). Returning result of the overall last executed node: ${resultNodeId}`);
                 }
             }
         }


         if (finalResult === undefined) {
             // This should ideally not happen if at least one node executed successfully
             throw new Error(`QueryGroup ${groupIdString} execution finished, but no final result could be determined. No nodes seem to have executed successfully or produced a result.`);
         }

         return finalResult;
     }

} // End class QueryOrchestrator
