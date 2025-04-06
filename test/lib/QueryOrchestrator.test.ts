import { QueryOrchestrator } from '../../src/lib/QueryOrchestrator';
import { SparqlQueryParser } from '../../src/lib/parser'; // Import SparqlQueryParser
import { ParameterMapping } from '../../src/types/schema-dts'; // Import ParameterMapping from schema-dts
// Import necessary types from query-chaining
import { transformSparqlResultsToArguments, SparqlBinding, ArgumentSet, SparqlValue } from '../../src/lib/query-chaining'; // Add SparqlValue
import { HttpSparqlExecutor } from '../../src/server/HttpSparqlExecutor'; // Import for mocking

// Mock HttpSparqlExecutor *before* describe block
jest.mock('../../src/server/HttpSparqlExecutor');

// Mock the query-chaining module where transformSparqlResultsToArguments is defined
// Keep this mock simple for most tests, override in specific tests if needed
jest.mock('../../src/lib/query-chaining', () => {
    const originalModule = jest.requireActual('../../src/lib/query-chaining');
    return {
        ...originalModule,
        transformSparqlResultsToArguments: jest.fn((results, mappings) => {
            // Default simple mock: assumes first mapping maps first var to first var
            const sourceVarName = mappings?.[0]?.fromParam?.replace('?', '') || results.head.vars[0];
            const targetVarName = mappings?.[0]?.toParam?.replace('?', '') || sourceVarName;
            console.log(`Processing mapping (default mock): ${sourceVarName} -> ${targetVarName}`);

            const transformedArgs: ArgumentSet = {
                head: { vars: [targetVarName] },
                arguments: results.results.bindings.map((binding: any) => {
                    console.log('Processing binding (default mock):', binding);
                    const newBinding: Record<string, any> = {};
                    if (binding[sourceVarName]) {
                        console.log(`Found source variable "${sourceVarName}" in binding. Value:`, binding[sourceVarName]);
                        newBinding[targetVarName] = binding[sourceVarName];
                    }
                    console.log('Transformed binding (default mock):', newBinding);
                    return newBinding;
                }).filter((b: any) => Object.keys(b).length > 0)
            };
            return transformedArgs;
        }),
    };
});


describe('QueryOrchestrator', () => {
  let MockHttpSparqlExecutorInstance: jest.Mocked<HttpSparqlExecutor>; // Hold the mock instance

  beforeEach(() => {
    // Reset HttpSparqlExecutor mock before each test
    jest.clearAllMocks();

    // Create a mock instance for HttpSparqlExecutor
    MockHttpSparqlExecutorInstance = {
        selectQueryParsed: jest.fn(),
        constructQueryParsed: jest.fn(),
        askQuery: jest.fn(),
        // Add any other methods/properties used by the orchestrator
    } as unknown as jest.Mocked<HttpSparqlExecutor>;

    // Configure the mock constructor to return our instance
    (HttpSparqlExecutor as jest.Mock).mockImplementation(() => MockHttpSparqlExecutorInstance);
  });


  it('should execute a query using the provided executor', async () => {
    const mockExecutor = {
      // The orchestrator calls selectQueryParsed, constructQueryParsed, or askQuery
      selectQueryParsed: jest.fn().mockResolvedValue({ results: { bindings: [] } }),
      constructQueryParsed: jest.fn().mockResolvedValue(''),
      askQuery: jest.fn().mockResolvedValue(true),
    };
    const mockEntityRegister = { // Mock EntityRegister
        get: jest.fn(),
    };
    const mockParser = { // Mock SparqlQueryParser
        parseQuery: jest.fn().mockReturnValue({ queryType: 'SELECT' }), // Mock parseQuery
        applyArguments: jest.fn(query => query), // Mock applyArguments
        detectParameters: jest.fn().mockReturnValue([]), // Mock detectParameters
    };


    const orchestrator = new QueryOrchestrator(mockEntityRegister as any, mockExecutor as any, mockParser as any);

    // To test executeQueryGroup, we need a mock QueryGroup and StoredQuery
    const mockQueryGroupId = 'http://example.com/queryGroup/1';
    const mockNodeId = 'http://example.com/node/1';
    const mockQueryId = 'http://example.com/query/1';
    const mockQueryString = 'SELECT * WHERE { ?s ?p ?o }';

    // Mock the entityRegister to return the mock entities
    mockEntityRegister.get.mockImplementation((id: string) => {
        if (id === mockQueryGroupId) {
            return {
                '@id': mockQueryGroupId,
                '@type': 'QueryGroup',
                nodes: [{ '@id': mockNodeId }],
                edges: [],
            };
        }
        if (id === mockNodeId) {
            return {
                '@id': mockNodeId,
                '@type': 'QueryNode',
                queryId: { '@id': mockQueryId },
            };
        }
        if (id === mockQueryId) {
            return {
                '@id': mockQueryId,
                '@type': 'StoredQuery',
                query: mockQueryString,
                parameters: [], // No parameters for this simple test
            };
        }
        return undefined;
    });

    // Mock the parser to return SELECT type for the mock query string
    mockParser.parseQuery.mockReturnValue({ queryType: 'SELECT' });


    await orchestrator.executeQueryGroup(mockQueryGroupId);

    // Expect the entity register to have been called to get the query group and stored query
    expect(mockEntityRegister.get).toHaveBeenCalledWith(mockQueryGroupId);
    expect(mockEntityRegister.get).toHaveBeenCalledWith(mockNodeId);
    expect(mockEntityRegister.get).toHaveBeenCalledWith(mockQueryId);

    // Expect the parser to have been called to parse the query string
    expect(mockParser.parseQuery).toHaveBeenCalledWith(mockQueryString);

    // Expect the executor's selectQueryParsed method to have been called with the parsed query object
    expect(mockExecutor.selectQueryParsed).toHaveBeenCalledWith(expect.objectContaining({ queryType: 'SELECT' }));
  });

  it('should execute a query group with chained queries', async () => {
    const mockExecutor = {
      selectQueryParsed: jest.fn().mockResolvedValueOnce({ head: { vars: ['s'] }, results: { bindings: [{ s: { value: 'result1' } }] } }).mockResolvedValueOnce({ head: { vars: ['o'] }, results: { bindings: [{ o: { value: 'finalResult' } }] } }),
      constructQueryParsed: jest.fn(),
      askQuery: jest.fn(),
    };
    const mockEntityRegister = {
        get: jest.fn(),
    };
    const mockParser = {
        parseQuery: jest.fn(query => ({ queryType: 'SELECT', where: [{ type: 'bgp', triples: [] }] })),
        applyArguments: jest.fn((parsedQuery, args) => { // applyArguments now expects parsed query object
            // Simulate applying arguments by adding a VALUES clause based on the argument
            if (args && args.length > 0 && args[0].arguments.length > 0) {
                const arg = args[0].arguments[0];
                const variableName = Object.keys(arg)[0]; // Get the variable name (e.g., 's')
                const value = arg[variableName]; // Get the value (e.g., { value: 'result1' })

                return {
                    ...parsedQuery,
                    values: {
                        variables: [`?${variableName}`], // VALUES variables are prefixed with '?'
                        values: [value] // The value to inject
                    },
                    where: parsedQuery.where // Keep existing where clauses
                };
            }
            return parsedQuery; // Return original parsed query if no args applied
        }),
        detectParameters: jest.fn().mockReturnValue([]),
        detectQueryOutputs: jest.fn().mockReturnValue([{ variable: 's' }]), // Simulate detecting output for the first query
    };

    const orchestrator = new QueryOrchestrator(mockEntityRegister as any, mockExecutor as any, mockParser as any);

    const mockQueryGroupId = 'http://example.com/queryGroup/chained';
    const mockNodeId1 = 'http://example.com/node/query1';
    const mockNodeId2 = 'http://example.com/node/query2';
    const mockQueryId1 = 'http://example.com/query/query1';
    const mockQueryId2 = 'http://example.com/query/query2';
    const mockEdgeId = 'http://example.com/edge/1';
    const mockQueryString1 = 'SELECT ?s WHERE { ?s a ?type }';
    const mockQueryString2 = 'SELECT ?o WHERE { VALUES ?s { UNDEF } ?s ?p ?o }';

    // Mock the entityRegister to return the mock entities for the chained query group
    mockEntityRegister.get.mockImplementation((id: string) => {
        if (id === mockQueryGroupId) {
            return {
                '@id': mockQueryGroupId,
                '@type': 'QueryGroup',
                nodes: [{ '@id': mockNodeId1 }, { '@id': mockNodeId2 }],
                edges: [{ '@id': mockEdgeId }],
            };
        }
        if (id === mockNodeId1) {
            return {
                '@id': mockNodeId1,
                '@type': 'QueryNode',
                queryId: { '@id': mockQueryId1 },
            };
        }
        if (id === mockNodeId2) {
            return {
                '@id': mockNodeId2,
                '@type': 'QueryNode',
                queryId: { '@id': mockQueryId2 },
            };
        }
        if (id === mockQueryId1) {
            return {
                '@id': mockQueryId1,
                '@type': 'StoredQuery',
                query: mockQueryString1,
                parameters: [],
            };
        }
        if (id === mockQueryId2) {
            return {
                '@id': mockQueryId2,
                '@type': 'StoredQuery',
                query: mockQueryString2,
                parameters: [{ '@id': 'http://example.com/parameter/s', variableName: 's' }], // Query 2 expects 's' as a parameter
            };
        }
        if (id === mockEdgeId) {
            return {
                '@id': mockEdgeId,
                '@type': 'QueryEdge',
                fromNodeId: { '@id': mockNodeId1 }, // Use fromNodeId
                toNodeId: { '@id': mockNodeId2 }, // Use toNodeId
                mappings: [{ // Correct property name
                    "@type": "ParameterMapping", // Correct type value
                    fromParam: 's',
                    toParam: 's',
                }],
            };
        }
        return undefined;
    });

    await orchestrator.executeQueryGroup(mockQueryGroupId);

    // Expect entity register to have been called for all relevant entities
    expect(mockEntityRegister.get).toHaveBeenCalledWith(mockQueryGroupId);
    expect(mockEntityRegister.get).toHaveBeenCalledWith(mockNodeId1);
    expect(mockEntityRegister.get).toHaveBeenCalledWith(mockNodeId2);
    expect(mockEntityRegister.get).toHaveBeenCalledWith(mockQueryId1);
    expect(mockEntityRegister.get).toHaveBeenCalledWith(mockQueryId2);
    expect(mockEntityRegister.get).toHaveBeenCalledWith(mockEdgeId);


    // Expect executor to have been called for both queries in order
    expect(mockExecutor.selectQueryParsed).toHaveBeenCalledTimes(2);
    expect(mockExecutor.selectQueryParsed).toHaveBeenNthCalledWith(1, expect.objectContaining({ queryType: 'SELECT' })); // First query (parsed object)
    // Expect executor to have been called for both queries in order
    expect(mockExecutor.selectQueryParsed).toHaveBeenCalledTimes(2);
    expect(mockExecutor.selectQueryParsed).toHaveBeenNthCalledWith(1, expect.objectContaining({ queryType: 'SELECT' })); // First query (parsed object)

    // Get the result of the first query
    const firstQueryResult = await mockExecutor.selectQueryParsed.mock.results[0].value;

    // Define the parameter mapping with the correct type
    const parameterMapping: ParameterMapping[] = [{ "@type": "ParameterMapping", fromParam: 's', toParam: 's' }];

    // Transform the results into arguments (returns a single ArgumentSet)
    const transformedArgs: ArgumentSet = transformSparqlResultsToArguments(firstQueryResult, parameterMapping);

    // Get the parsed second query object (assuming parseQuery is called for both queries)
    const secondParsedQuery = mockParser.parseQuery.mock.results[1].value;

    // Apply the transformed arguments to the second parsed query
    const finalParsedQuery = mockParser.applyArguments(secondParsedQuery, transformedArgs);

    console.log('Parsed query after applyArguments:', finalParsedQuery);

    // Assert that the second call to the executor received the query with the VALUES clause applied
    expect(mockExecutor.selectQueryParsed).toHaveBeenNthCalledWith(2, expect.objectContaining({
        queryType: 'SELECT',
        values: {
            variables: ['?s'],
            values: [{ value: 'result1' }]
        }
    }));
  });

  it('should handle multiple outputs with partial mapping', async () => {
    // Scenario: Query 1 outputs ?s and ?p, but only ?s is mapped to Query 2
    const mockExecutor = {
      selectQueryParsed: jest.fn()
        // Query 1 result: has both s and p
        .mockResolvedValueOnce({ head: { vars: ['s', 'p'] }, results: { bindings: [{ s: { value: 'resultS' }, p: { value: 'resultP' } }] } })
        // Query 2 result
        .mockResolvedValueOnce({ head: { vars: ['o'] }, results: { bindings: [{ o: { value: 'finalResult' } }] } }),
      constructQueryParsed: jest.fn(),
      askQuery: jest.fn(),
    };
    const mockEntityRegister = { get: jest.fn() };
    const mockParser = {
        parseQuery: jest.fn(query => ({ queryType: 'SELECT', where: [{ type: 'bgp', triples: [] }] })),
        applyArguments: jest.fn((parsedQuery, args) => {
            // Simulate applying arguments - should only receive 's' based on mapping
            if (args && args.length > 0 && args[0].arguments.length > 0) {
                const arg = args[0].arguments[0]; // Should be { s: { value: 'resultS' } }
                const variableName = Object.keys(arg)[0];
                const value = arg[variableName];
                return { ...parsedQuery, values: { variables: [`?${variableName}`], values: [value] } };
            }
            return parsedQuery;
        }),
        detectParameters: jest.fn().mockReturnValue([]),
        // Query 1 outputs 's' and 'p'
        detectQueryOutputs: jest.fn().mockReturnValueOnce([{ variable: 's' }, { variable: 'p' }]).mockReturnValue([]),
    };

    const orchestrator = new QueryOrchestrator(mockEntityRegister as any, mockExecutor as any, mockParser as any);

    const mockQueryGroupId = 'http://example.com/queryGroup/partialMap';
    const mockNodeId1 = 'http://example.com/node/queryMultiOut';
    const mockNodeId2 = 'http://example.com/node/querySingleIn';
    const mockQueryId1 = 'http://example.com/query/queryMultiOut';
    const mockQueryId2 = 'http://example.com/query/querySingleIn';
    const mockEdgeId = 'http://example.com/edge/partial';
    const mockQueryString1 = 'SELECT ?s ?p WHERE { ?s a ?type ; ?p ?val }';
    const mockQueryString2 = 'SELECT ?o WHERE { VALUES ?s { UNDEF } ?s ?p ?o }';

    mockEntityRegister.get.mockImplementation((id: string) => {
        switch (id) {
            case mockQueryGroupId: return { '@id': mockQueryGroupId, '@type': 'QueryGroup', nodes: [{ '@id': mockNodeId1 }, { '@id': mockNodeId2 }], edges: [{ '@id': mockEdgeId }] };
            case mockNodeId1: return { '@id': mockNodeId1, '@type': 'QueryNode', queryId: { '@id': mockQueryId1 } };
            case mockNodeId2: return { '@id': mockNodeId2, '@type': 'QueryNode', queryId: { '@id': mockQueryId2 } };
            case mockQueryId1: return { '@id': mockQueryId1, '@type': 'StoredQuery', query: mockQueryString1, parameters: [] };
            case mockQueryId2: return { '@id': mockQueryId2, '@type': 'StoredQuery', query: mockQueryString2, parameters: [{ '@id': 'http://example.com/parameter/s', variableName: 's' }] };
            case mockEdgeId: return {
                '@id': mockEdgeId, '@type': 'QueryEdge', fromNodeId: { '@id': mockNodeId1 }, toNodeId: { '@id': mockNodeId2 },
                // Mapping only 's', ignoring 'p' from the source query output
                mappings: [{ "@type": "ParameterMapping", fromParam: 's', toParam: 's' }]
            };
            default: return undefined;
        }
    });

    await orchestrator.executeQueryGroup(mockQueryGroupId);

    expect(mockExecutor.selectQueryParsed).toHaveBeenCalledTimes(2);

    // Verify applyArguments was called correctly for the second query
    const firstQueryResult = await mockExecutor.selectQueryParsed.mock.results[0].value;
    const parameterMapping: ParameterMapping[] = [{ "@type": "ParameterMapping", fromParam: 's', toParam: 's' }];
    // transformSparqlResultsToArguments should filter based on mapping (returns a single ArgumentSet)
    const transformedArgs: ArgumentSet = transformSparqlResultsToArguments(firstQueryResult, parameterMapping);

    // Check that transformedArgs only contains 's'
    // No need for length check as it's a single object now
    expect(transformedArgs.head.vars).toEqual(['s']); // Access directly
    expect(transformedArgs.arguments).toEqual([{ s: { value: 'resultS' } }]); // Access directly

    // Check that applyArguments was called with the filtered args wrapped in an array
    expect(mockParser.applyArguments).toHaveBeenCalledWith(
        expect.anything(), // The parsed second query
        [transformedArgs] // Expect arguments wrapped in an array
    );

    // Assert that the second call to the executor received the query with the VALUES clause applied correctly for 's'
    expect(mockExecutor.selectQueryParsed).toHaveBeenNthCalledWith(2, expect.objectContaining({
        queryType: 'SELECT',
        values: {
            variables: ['?s'],
            values: [{ value: 'resultS' }]
        }
    }));
  });

  it('should handle single output mapped to one of multiple inputs (partial substitution)', async () => {
    // Scenario: Query 1 outputs ?x. Query 2 expects ?x and ?y. Mapping connects ?x -> ?x.
    // The VALUES clause in Query 2 should become VALUES (?x ?y) { ('resultX' UNDEF) }
    const mockExecutor = {
      selectQueryParsed: jest.fn()
        // Query 1 result: has x
        .mockResolvedValueOnce({ head: { vars: ['x'] }, results: { bindings: [{ x: { value: 'resultX' } }] } })
        // Query 2 result
        .mockResolvedValueOnce({ head: { vars: ['z'] }, results: { bindings: [{ z: { value: 'finalResult' } }] } }),
      constructQueryParsed: jest.fn(),
      askQuery: jest.fn(),
    };
    const mockEntityRegister = { get: jest.fn() };

    // More sophisticated applyArguments mock needed for partial substitution
    const mockApplyArguments = jest.fn((parsedQuery, args) => {
        if (args && args.length > 0 && args[0].arguments.length > 0 && parsedQuery.values) {
            const incomingArgs = args[0].arguments; // e.g., [{ x: { value: 'resultX' } }]
            const existingValues = parsedQuery.values; // e.g., { variables: ['?x', '?y'], values: [{ '?x': { termType: 'Literal', value: 'UNDEF' }, '?y': { termType: 'Literal', value: 'UNDEF' } }] }

            // Create a map of incoming arguments for easier lookup
            const incomingMap = new Map<string, SparqlValue>(); // Map variable name (?x) to its value (SparqlValue)
            incomingArgs.forEach((argObj: SparqlBinding) => { // Type is correct
                Object.entries(argObj).forEach(([key, value]) => {
                    incomingMap.set(`?${key}`, value); // Store as ?x -> { type: 'literal', value: 'resultX' } etc.
                });
            });

            // Create new values by substituting incoming args into existing UNDEFs
            const newValues = existingValues.values.map((row: any) => {
                const newRow: any = {};
                existingValues.variables.forEach((varName: string) => {
                    if (incomingMap.has(varName)) {
                        newRow[varName] = incomingMap.get(varName); // Substitute value
                    } else {
                        newRow[varName] = row[varName]; // Keep existing value (e.g., UNDEF)
                    }
                });
                return newRow;
            });

            return {
                ...parsedQuery,
                values: {
                    ...existingValues,
                    values: newValues // The updated values array
                }
            };
        }
        return parsedQuery;
    });


    const mockParser = {
        // Mock parseQuery to return a structure *with* the initial VALUES clause for Query 2
        parseQuery: jest.fn((query) => {
            if (query.includes('VALUES (?x ?y)')) {
                return {
                    queryType: 'SELECT',
                    variables: ['?z'],
                    where: [{ type: 'bgp', triples: [] }], // Simplified BGP
                    values: {
                        variables: ['?x', '?y'],
                        // Represent UNDEF - actual representation might vary based on parser
                        values: [{ '?x': { termType: 'Literal', value: 'UNDEF' }, '?y': { termType: 'Literal', value: 'UNDEF' } }]
                    }
                };
            }
            // Default parsing for Query 1
            return { queryType: 'SELECT', where: [{ type: 'bgp', triples: [] }] };
        }),
        applyArguments: mockApplyArguments, // Use the sophisticated mock
        // Query 2 expects 'x' and 'y'
        detectParameters: jest.fn().mockReturnValueOnce([]).mockReturnValueOnce([{ variableName: 'x' }, { variableName: 'y' }]),
        // Query 1 outputs 'x'
        detectQueryOutputs: jest.fn().mockReturnValueOnce([{ variable: 'x' }]).mockReturnValue([]),
    };


    const orchestrator = new QueryOrchestrator(mockEntityRegister as any, mockExecutor as any, mockParser as any);

    const mockQueryGroupId = 'http://example.com/queryGroup/partialSub';
    const mockNodeId1 = 'http://example.com/node/querySingleOut';
    const mockNodeId2 = 'http://example.com/node/queryMultiIn';
    const mockQueryId1 = 'http://example.com/query/querySingleOut';
    const mockQueryId2 = 'http://example.com/query/queryMultiIn';
    const mockEdgeId = 'http://example.com/edge/partialSub';
    const mockQueryString1 = 'SELECT ?x WHERE { ?x a ?type }';
    // Query 2 expects ?x and ?y, defined in VALUES
    const mockQueryString2 = 'SELECT ?z WHERE { VALUES (?x ?y) { (UNDEF UNDEF) } ?x :p ?z . ?y :q ?z . }';

    mockEntityRegister.get.mockImplementation((id: string) => {
        switch (id) {
            case mockQueryGroupId: return { '@id': mockQueryGroupId, '@type': 'QueryGroup', nodes: [{ '@id': mockNodeId1 }, { '@id': mockNodeId2 }], edges: [{ '@id': mockEdgeId }] };
            case mockNodeId1: return { '@id': mockNodeId1, '@type': 'QueryNode', queryId: { '@id': mockQueryId1 } };
            case mockNodeId2: return { '@id': mockNodeId2, '@type': 'QueryNode', queryId: { '@id': mockQueryId2 } };
            case mockQueryId1: return { '@id': mockQueryId1, '@type': 'StoredQuery', query: mockQueryString1, parameters: [] };
            case mockQueryId2: return {
                '@id': mockQueryId2, '@type': 'StoredQuery', query: mockQueryString2,
                // Parameters detected by parser, but mapping drives substitution
                parameters: [{ '@id': 'http://example.com/parameter/x', variableName: 'x' }, { '@id': 'http://example.com/parameter/y', variableName: 'y' }]
            };
            case mockEdgeId: return {
                '@id': mockEdgeId, '@type': 'QueryEdge', fromNodeId: { '@id': mockNodeId1 }, toNodeId: { '@id': mockNodeId2 },
                // Mapping only 'x'
                mappings: [{ "@type": "ParameterMapping", fromParam: 'x', toParam: 'x' }]
            };
            default: return undefined;
        }
    });

    await orchestrator.executeQueryGroup(mockQueryGroupId);

    expect(mockExecutor.selectQueryParsed).toHaveBeenCalledTimes(2);

    // Verify applyArguments was called correctly
    const firstQueryResult = await mockExecutor.selectQueryParsed.mock.results[0].value;
    const parameterMapping: ParameterMapping[] = [{ "@type": "ParameterMapping", fromParam: 'x', toParam: 'x' }];
    // Transform results (returns a single ArgumentSet)
    const transformedArgs: ArgumentSet = transformSparqlResultsToArguments(firstQueryResult, parameterMapping);

    // Check that transformedArgs only contains 'x'
    // No need for length check
    expect(transformedArgs.head.vars).toEqual(['x']); // Access directly
    expect(transformedArgs.arguments).toEqual([{ x: { value: 'resultX' } }]); // Access directly

    // Get the initially parsed Query 2 object (with UNDEFs)
    const initialParsedQuery2 = mockParser.parseQuery.mock.results[1].value;

    // Check that applyArguments was called with the initial parsed query and the 'x' args wrapped in an array
    expect(mockParser.applyArguments).toHaveBeenCalledWith(
        initialParsedQuery2,
        [transformedArgs] // Expect arguments wrapped in an array
    );

    // Assert that the second call to the executor received the query with the partially substituted VALUES clause
    expect(mockExecutor.selectQueryParsed).toHaveBeenNthCalledWith(2, expect.objectContaining({
        queryType: 'SELECT',
        values: {
            variables: ['?x', '?y'],
            // Expect 'x' to be substituted, 'y' to remain UNDEF (based on mockApplyArguments logic)
            values: [{
                '?x': { value: 'resultX' }, // Substituted
                '?y': { termType: 'Literal', value: 'UNDEF' } // Unchanged from initial parse mock
            }]
        }
    }));
  });

    // --- New Tests Start Here ---

    it('should throw an error if query execution fails', async () => {
        // Arrange
        const mockExecutor = { selectQueryParsed: jest.fn(), constructQueryParsed: jest.fn(), askQuery: jest.fn() };
        const mockEntityRegister = { get: jest.fn() };
        const mockParser = { parseQuery: jest.fn().mockReturnValue({ queryType: 'SELECT' }), applyArguments: jest.fn(q => q), detectParameters: jest.fn().mockReturnValue([]) };
        const orchestrator = new QueryOrchestrator(mockEntityRegister as any, mockExecutor as any, mockParser as any);

        const query: any = { '@id': 'http://example.com/query/fail', '@type': 'StoredQuery', query: 'SELECT ?s WHERE { ?s ?p ?o }' };
        const node: any = { '@id': 'http://example.com/node/fail', '@type': 'QueryNode', queryId: { '@id': 'http://example.com/query/fail' } };
        const queryGroup: any = { '@id': 'http://example.com/queryGroup/fail', '@type': 'QueryGroup', nodes: [{ '@id': 'http://example.com/node/fail' }] };

        mockEntityRegister.get.mockImplementation((id: string) => {
            if (id === queryGroup['@id']) return queryGroup;
            if (id === node['@id']) return node;
            if (id === query['@id']) return query;
            return undefined;
        });

        const executionError = new Error('SPARQL endpoint unavailable');
        mockExecutor.selectQueryParsed.mockRejectedValue(executionError);

        // Act & Assert
        await expect(orchestrator.executeQueryGroup(queryGroup['@id']))
            .rejects
            .toThrow('Failed to execute query for node http://example.com/node/fail (Query ID: http://example.com/query/fail): SPARQL endpoint unavailable');
        expect(mockExecutor.selectQueryParsed).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if argument validation fails (type mismatch)', async () => {
        // Arrange
        const mockExecutor = { selectQueryParsed: jest.fn(), constructQueryParsed: jest.fn(), askQuery: jest.fn() };
        const mockEntityRegister = { get: jest.fn() };
    const mockParser = { parseQuery: jest.fn().mockReturnValue({ queryType: 'SELECT' }), applyArguments: jest.fn(q => q), detectParameters: jest.fn().mockReturnValue([]) }; // Default mock
    const orchestrator = new QueryOrchestrator(mockEntityRegister as any, mockExecutor as any, mockParser as any);

    const query1: any = { '@id': 'http://example.com/query/q1', '@type': 'StoredQuery', query: 'SELECT ?id WHERE { ?id a :Type1 }' };
        // Query 2 expects ?id to be a URI, but query1 provides a literal
        const param: any = { '@id': 'http://example.com/param/id', '@type': 'QueryParameter', paramName: 'id', allowedTypes: ['uri'] };
        const paramGroup: any = { '@id': 'http://example.com/pg/1', '@type': 'QueryParameterGroup', vars: [param] };
        const query2: any = { '@id': 'http://example.com/query/q2', '@type': 'StoredQuery', query: 'SELECT ?label WHERE { ?id rdfs:label ?label }', parameters: [paramGroup] };

        const node1: any = { '@id': 'http://example.com/node/q1', '@type': 'QueryNode', queryId: { '@id': 'http://example.com/query/q1' } };
        const node2: any = { '@id': 'http://example.com/node/q2', '@type': 'QueryNode', queryId: { '@id': 'http://example.com/query/q2' } };
        const mapping: any = { '@id': 'http://example.com/map/id', '@type': 'ParameterMapping', fromParam: 'id', toParam: 'id' };
        const edge: any = { '@id': 'http://example.com/edge/valfail', '@type': 'QueryEdge', fromNodeId: node1['@id'], toNodeId: node2['@id'], mappings: [mapping] };
        const queryGroup: any = { '@id': 'http://example.com/queryGroup/valfail', '@type': 'QueryGroup', nodes: [node1, node2], edges: [edge] };

        mockEntityRegister.get.mockImplementation((id: string) => {
            if (id === queryGroup['@id']) return queryGroup;
            if (id === node1['@id']) return node1;
            if (id === node2['@id']) return node2;
            if (id === query1['@id']) return query1;
            if (id === query2['@id']) return query2;
            if (id === edge['@id']) return edge;
            if (id === param['@id']) return param; // Make sure param is resolvable if needed by ID
            if (id === paramGroup['@id']) return paramGroup; // Make sure group is resolvable if needed by ID
            return undefined;
        });

    // Result from query1 provides a literal, not a URI
    const result1 = { head: { vars: ['id'] }, results: { bindings: [{ id: { type: 'literal', value: 'someLiteral' } }] } };
    mockExecutor.selectQueryParsed.mockResolvedValueOnce(result1);

    // Override the transform mock for this specific test to ensure it passes the literal
    const mockTransform = require('../../src/lib/query-chaining').transformSparqlResultsToArguments as jest.Mock;
    const transformedArgs: ArgumentSet = { head: { vars: ['id'] }, arguments: [{ id: { type: 'literal', value: 'someLiteral' } }] };
    mockTransform.mockReturnValueOnce(transformedArgs); // Use mockReturnValueOnce

    // Ensure detectParameters returns the expected parameter for query2
    mockParser.detectParameters.mockReturnValueOnce([]).mockReturnValueOnce(['id']); // query1 has none, query2 has 'id'


    // Act & Assert
    await expect(orchestrator.executeQueryGroup(queryGroup['@id']))
        .rejects
        .toThrow('Type mismatch for parameter "?id" (from edge http://example.com/edge/valfail) at argument row 0 for node http://example.com/node/q2. Expected type(s) [uri] but received type "literal" with value "someLiteral".');

    expect(mockExecutor.selectQueryParsed).toHaveBeenCalledTimes(1); // Only first query executes
    expect(mockTransform).toHaveBeenCalledWith(result1, [mapping]); // Verify transform was called correctly
    expect(mockParser.applyArguments).not.toHaveBeenCalled(); // Fails before applying args
    });

    it('should use HttpSparqlExecutor when backendType is HTTP', async () => {
        // Arrange
        const mockDefaultExecutor = { selectQueryParsed: jest.fn(), constructQueryParsed: jest.fn(), askQuery: jest.fn() }; // Default executor won't be used
        const mockEntityRegister = { get: jest.fn() };
        const mockParser = { parseQuery: jest.fn().mockReturnValue({ queryType: 'SELECT' }), applyArguments: jest.fn(q => q), detectParameters: jest.fn().mockReturnValue([]) };
        // Orchestrator uses the globally mocked HttpSparqlExecutor constructor from beforeEach
        const orchestrator = new QueryOrchestrator(mockEntityRegister as any, mockDefaultExecutor as any, mockParser as any);

        const backend: any = { '@id': 'http://example.com/backend/http', '@type': 'Backend', backendType: 'HTTP', endpoint: 'http://remote-sparql.com/query' };
        const query: any = { '@id': 'http://example.com/query/http', '@type': 'StoredQuery', query: 'SELECT ?s' };
        const node: any = { '@id': 'http://example.com/node/http', '@type': 'QueryNode', queryId: query['@id'], backendId: backend['@id'] };
        const queryGroup: any = { '@id': 'http://example.com/queryGroup/http', '@type': 'QueryGroup', nodes: [node] };

        mockEntityRegister.get.mockImplementation((id: string) => {
            if (id === queryGroup['@id']) return queryGroup;
            if (id === node['@id']) return node;
            if (id === query['@id']) return query;
            if (id === backend['@id']) return backend;
            return undefined;
            return undefined;
        });

        // Mock the selectQueryParsed method on the instance returned by the mocked constructor
        MockHttpSparqlExecutorInstance.selectQueryParsed.mockResolvedValue({ head: { vars: ['s'] }, results: { bindings: [] } });

        // Act
        await orchestrator.executeQueryGroup(queryGroup['@id']);

        // Assert
        expect(HttpSparqlExecutor).toHaveBeenCalledTimes(1); // Verify constructor was called
        expect(HttpSparqlExecutor).toHaveBeenCalledWith({ queryUrl: 'http://remote-sparql.com/query' }); // Verify constructor args
        expect(MockHttpSparqlExecutorInstance.selectQueryParsed).toHaveBeenCalledTimes(1); // Verify method on instance was called
        expect(MockHttpSparqlExecutorInstance.selectQueryParsed).toHaveBeenCalledWith(expect.objectContaining({ queryType: 'SELECT' }));
        expect(mockDefaultExecutor.selectQueryParsed).not.toHaveBeenCalled(); // Default executor should NOT be called
    });

     it('should use default executor if backendId is invalid', async () => {
         // Arrange
         const mockExecutor = { selectQueryParsed: jest.fn(), constructQueryParsed: jest.fn(), askQuery: jest.fn() };
         const mockEntityRegister = { get: jest.fn() };
         const mockParser = { parseQuery: jest.fn().mockReturnValue({ queryType: 'SELECT' }), applyArguments: jest.fn(q => q), detectParameters: jest.fn().mockReturnValue([]) };
         const orchestrator = new QueryOrchestrator(mockEntityRegister as any, mockExecutor as any, mockParser as any);

         const query: any = { '@id': 'http://example.com/query/invalidBe', '@type': 'StoredQuery', query: 'SELECT ?s' };
         // Node references a backend that doesn't exist
         const node: any = { '@id': 'http://example.com/node/invalidBe', '@type': 'QueryNode', queryId: query['@id'], backendId: 'http://example.com/backend/nonexistent' };
         const queryGroup: any = { '@id': 'http://example.com/queryGroup/invalidBe', '@type': 'QueryGroup', nodes: [node] };

         mockEntityRegister.get.mockImplementation((id: string) => {
             if (id === queryGroup['@id']) return queryGroup;
             if (id === node['@id']) return node;
             if (id === query['@id']) return query;
             // Return undefined for the backend ID
             if (id === 'http://example.com/backend/nonexistent') return undefined;
             return undefined;
         });

         const expectedResult = { head: { vars: ['s'] }, results: { bindings: [{ s: { value: 'defaultResult' } }] } };
         mockExecutor.selectQueryParsed.mockResolvedValue(expectedResult); // Mock default executor

         // Act
         const result = await orchestrator.executeQueryGroup(queryGroup['@id']);

         // Assert
         expect(result).toEqual(expectedResult);
         expect(mockExecutor.selectQueryParsed).toHaveBeenCalledTimes(1); // Default executor called
     });

     it('should return result of the last executed leaf node if multiple leaves exist', async () => {
         // Arrange - Create a diamond shape: start -> nodeA -> leaf1, start -> nodeB -> leaf2
         const mockExecutor = { selectQueryParsed: jest.fn(), constructQueryParsed: jest.fn(), askQuery: jest.fn() };
         const mockEntityRegister = { get: jest.fn() };
         const mockParser = { parseQuery: jest.fn().mockReturnValue({ queryType: 'SELECT' }), applyArguments: jest.fn((pq, args) => ({ ...pq, values: { variables: args[0].head.vars.map((v:string)=>`?${v}`), values: args[0].arguments } })), detectParameters: jest.fn().mockReturnValue([]) };
         const orchestrator = new QueryOrchestrator(mockEntityRegister as any, mockExecutor as any, mockParser as any);

         const queryStart: any = { '@id': 'q:start', '@type': 'StoredQuery', query: 'SELECT ?a ?b' };
         const queryA: any = { '@id': 'q:A', '@type': 'StoredQuery', query: 'SELECT ?leaf1 WHERE { ?a ?p ?leaf1 }' }; // Needs ?a
         const queryB: any = { '@id': 'q:B', '@type': 'StoredQuery', query: 'SELECT ?leaf2 WHERE { ?b ?p ?leaf2 }' }; // Needs ?b
         const queryLeaf1: any = { '@id': 'q:leaf1', '@type': 'StoredQuery', query: 'SELECT ?final1 WHERE { ?leaf1 ?p ?final1 }' }; // Needs ?leaf1
         const queryLeaf2: any = { '@id': 'q:leaf2', '@type': 'StoredQuery', query: 'SELECT ?final2 WHERE { ?leaf2 ?p ?final2 }' }; // Needs ?leaf2

         const nodeStart: any = { '@id': 'n:start', '@type': 'QueryNode', queryId: 'q:start' };
         const nodeA: any = { '@id': 'n:A', '@type': 'QueryNode', queryId: 'q:A' };
         const nodeB: any = { '@id': 'n:B', '@type': 'QueryNode', queryId: 'q:B' };
         const nodeLeaf1: any = { '@id': 'n:leaf1', '@type': 'QueryNode', queryId: 'q:leaf1' };
         const nodeLeaf2: any = { '@id': 'n:leaf2', '@type': 'QueryNode', queryId: 'q:leaf2' };

         const mapA: any = { '@id': 'map:a', '@type': 'ParameterMapping', fromParam: 'a', toParam: 'a' };
         const mapB: any = { '@id': 'map:b', '@type': 'ParameterMapping', fromParam: 'b', toParam: 'b' };
         const mapL1: any = { '@id': 'map:l1', '@type': 'ParameterMapping', fromParam: 'leaf1', toParam: 'leaf1' };
         const mapL2: any = { '@id': 'map:l2', '@type': 'ParameterMapping', fromParam: 'leaf2', toParam: 'leaf2' };

         const edgeStartA: any = { '@id': 'e:sa', '@type': 'QueryEdge', fromNodeId: 'n:start', toNodeId: 'n:A', mappings: [mapA] };
         const edgeStartB: any = { '@id': 'e:sb', '@type': 'QueryEdge', fromNodeId: 'n:start', toNodeId: 'n:B', mappings: [mapB] };
         const edgeAL1: any = { '@id': 'e:al1', '@type': 'QueryEdge', fromNodeId: 'n:A', toNodeId: 'n:leaf1', mappings: [mapL1] };
         const edgeBL2: any = { '@id': 'e:bl2', '@type': 'QueryEdge', fromNodeId: 'n:B', toNodeId: 'n:leaf2', mappings: [mapL2] };

         const queryGroup: any = {
             '@id': 'g:multiLeaf', '@type': 'QueryGroup',
             nodes: [nodeStart, nodeA, nodeB, nodeLeaf1, nodeLeaf2],
             edges: [edgeStartA, edgeStartB, edgeAL1, edgeBL2]
             // No explicit start/end nodes, should deduce start=nodeStart, leaves=nodeLeaf1, nodeLeaf2
         };

         mockEntityRegister.get.mockImplementation((id: string) => {
             const entities: Record<string, any> = {
                 [queryGroup['@id']]: queryGroup, [nodeStart['@id']]: nodeStart, [nodeA['@id']]: nodeA, [nodeB['@id']]: nodeB, [nodeLeaf1['@id']]: nodeLeaf1, [nodeLeaf2['@id']]: nodeLeaf2,
                 [queryStart['@id']]: queryStart, [queryA['@id']]: queryA, [queryB['@id']]: queryB, [queryLeaf1['@id']]: queryLeaf1, [queryLeaf2['@id']]: queryLeaf2,
                 [edgeStartA['@id']]: edgeStartA, [edgeStartB['@id']]: edgeStartB, [edgeAL1['@id']]: edgeAL1, [edgeBL2['@id']]: edgeBL2,
                 [mapA['@id']]: mapA, [mapB['@id']]: mapB, [mapL1['@id']]: mapL1, [mapL2['@id']]: mapL2,
             };
             return entities[id];
         });

         // Mock results - make leaf2 finish last
         const resStart = { head: { vars: ['a', 'b'] }, results: { bindings: [{ a: { value: 'a1' }, b: { value: 'b1' } }] } };
         const resA = { head: { vars: ['leaf1'] }, results: { bindings: [{ leaf1: { value: 'l1' } }] } };
         const resB = { head: { vars: ['leaf2'] }, results: { bindings: [{ leaf2: { value: 'l2' } }] } };
         const resLeaf1 = { head: { vars: ['final1'] }, results: { bindings: [{ final1: { value: 'f1' } }] } };
         const resLeaf2 = { head: { vars: ['final2'] }, results: { bindings: [{ final2: { value: 'f2' } }] } }; // This should be the final result

         mockExecutor.selectQueryParsed
             .mockResolvedValueOnce(resStart) // n:start
             .mockResolvedValueOnce(resA)     // n:A
             .mockResolvedValueOnce(resB)     // n:B
             .mockResolvedValueOnce(resLeaf1) // n:leaf1
             .mockResolvedValueOnce(resLeaf2); // n:leaf2 (last)

         // Act
         const finalResult = await orchestrator.executeQueryGroup(queryGroup['@id']);

         // Assert
         expect(finalResult).toEqual(resLeaf2); // Should be the result of the last executed leaf node
         expect(mockExecutor.selectQueryParsed).toHaveBeenCalledTimes(5);
     });
});
