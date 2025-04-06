import Fastify, { FastifyInstance } from 'fastify';
import { EntityManager } from '../../src/lib/EntityManager';
import { EntityRegister } from '../../src/lib/entity-register';
// Import relevant types - ADDED QueryNode, QueryEdge
import type { QueryGroup, Thing, Library, IdReference, QueryNode, QueryEdge } from '../../src/types/schema-dts';
import { createQueryGroup, CreateQueryGroupInput } from '../../src/lib/factories'; // Import factory and input type
import { mockEntityManager, resetMocks } from '../test-utils/mocks'; // Import shared mocks
import { buildTestApp } from '../test-utils/app-builder'; // Import shared app builder

// --- Test Suite for GET /api/query-groups ---
describe('GET /api/query-groups - Unit Tests', () => {
  let app: FastifyInstance;

  // Define some library IDs for testing
  const libraryId1 = 'urn:test-library:lib1';
  const libraryId2 = 'urn:test-library:lib2';
  const libraryIdUnused = 'urn:test-library:unused';

  // Create mock query groups using the factory
  const groupInput1: CreateQueryGroupInput = { name: 'Group One', libraryId: libraryId1, nodes: [], edges: [] };
  const groupInput2: CreateQueryGroupInput = { name: 'Group Two', libraryId: libraryId2, nodes: [], edges: [] };
  const groupInput3: CreateQueryGroupInput = { name: 'Group Three (Lib 1)', libraryId: libraryId1, nodes: [], edges: [] };

  const group1 = createQueryGroup(groupInput1);
  const group2 = createQueryGroup(groupInput2);
  const group3 = createQueryGroup(groupInput3);

  // Mock data for loadAll
  const mockMap = new Map<string, Thing>();
  if (group1['@id']) mockMap.set(group1['@id'], group1);
  if (group2['@id']) mockMap.set(group2['@id'], group2);
  if (group3['@id']) mockMap.set(group3['@id'], group3);
  // Add a non-query-group entity to ensure filtering works
  const otherThing: Thing = { '@id': 'other-group-thing', '@type': 'StoredQuery', name: 'Not a Group' } as Thing;
  if (otherThing['@id']) mockMap.set(otherThing['@id'], otherThing);


  beforeAll(async () => {
    // Build the app once for all tests in this suite
    app = await buildTestApp();
  });

  beforeEach(() => {
    // Reset mocks using the shared utility function
    resetMocks();
    // Mock loadAll to return the predefined map for each test
    (mockEntityManager.loadAll as jest.Mock).mockResolvedValue(mockMap);
  });

  afterAll(async () => {
    // Close the Fastify instance after all tests are done
    await app.close();
  });

  // --- Test cases for GET / ---
  it('should retrieve all query groups when no libraryId filter is applied', async () => {
    const response = await app.inject({
        method: 'GET',
        url: '/api/query-groups',
    });

    expect(response.statusCode).toBe(200);
    // Should return only the QueryGroup entities
    expect(response.json()).toEqual([group1, group2, group3]);
    // Check that loadAll was called
    expect(mockEntityManager.loadAll).toHaveBeenCalledWith(expect.any(EntityRegister));
    expect(mockEntityManager.loadAll).toHaveBeenCalledTimes(1);
  });

  it('should retrieve only query groups belonging to the specified libraryId', async () => {
    const response = await app.inject({
        method: 'GET',
        url: `/api/query-groups?libraryId=${encodeURIComponent(libraryId1)}`, // Filter for lib1
    });

    expect(response.statusCode).toBe(200);
    // Should return only groups 1 and 3 which belong to libraryId1
    expect(response.json()).toEqual([group1, group3]);
    // Check that loadAll was called
    expect(mockEntityManager.loadAll).toHaveBeenCalledWith(expect.any(EntityRegister));
    expect(mockEntityManager.loadAll).toHaveBeenCalledTimes(1);
  });

  it('should retrieve only query groups belonging to another specified libraryId', async () => {
    const response = await app.inject({
        method: 'GET',
        url: `/api/query-groups?libraryId=${encodeURIComponent(libraryId2)}`, // Filter for lib2
    });

    expect(response.statusCode).toBe(200);
    // Should return only group 2 which belongs to libraryId2
    expect(response.json()).toEqual([group2]);
    // Check that loadAll was called
    expect(mockEntityManager.loadAll).toHaveBeenCalledWith(expect.any(EntityRegister));
    expect(mockEntityManager.loadAll).toHaveBeenCalledTimes(1);
  });

  it('should return an empty array if no query groups belong to the specified libraryId', async () => {
    const response = await app.inject({
        method: 'GET',
        url: `/api/query-groups?libraryId=${encodeURIComponent(libraryIdUnused)}`, // Filter for unused lib
    });

    expect(response.statusCode).toBe(200);
    // Should return an empty array as no groups belong to libraryIdUnused
    expect(response.json()).toEqual([]);
    // Check that loadAll was called
    expect(mockEntityManager.loadAll).toHaveBeenCalledWith(expect.any(EntityRegister));
    expect(mockEntityManager.loadAll).toHaveBeenCalledTimes(1);
  });


  it('should return 500 if EntityManager.loadAll throws an error', async () => {
      // Override the default mock for this specific test
      (mockEntityManager.loadAll as jest.Mock).mockReset(); // Clear previous mock setup for this test
      (mockEntityManager.loadAll as jest.Mock).mockRejectedValue(new Error('DB LoadAll Groups Error'));

      const response = await app.inject({
          method: 'GET',
          url: '/api/query-groups',
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: 'Internal Server Error: Could not fetch QueryGroups' });
      expect(mockEntityManager.loadAll).toHaveBeenCalledTimes(1);
  });
});


// Placeholder for the new tests to be added
describe('Nested Node and Edge Routes (/api/query-groups/:id/...)', () => {
  let app: FastifyInstance;
  let testLibrary: Library;
  let testGroup: QueryGroup;
  let initialNode1: QueryNode;
  let initialNode2: QueryNode;
  let initialEdge1: QueryEdge;

  beforeAll(async () => {
    app = await buildTestApp(); // Reuse the app builder
  });

  beforeEach(() => {
    resetMocks(); // Reset mocks before each test

    // --- Setup Test Data ---
    // Define final IDs first
    const groupId = 'urn:test:group:nodes-edges';
    const node1Id = `${groupId}/nodes/node-abc`;
    const node2Id = `${groupId}/nodes/node-def`;
    const edge1Id = `${groupId}/edges/edge-xyz`;

    testLibrary = {
      '@id': 'urn:test:library:nodes-edges',
      '@type': 'Library',
      name: 'Node/Edge Test Library',
    };

    // Create nodes/edges using the final IDs
    initialNode1 = {
      '@id': node1Id,
      '@type': 'QueryNode',
      'http://schema.org/name': 'Initial Node 1',
      queryId: 'urn:test:query:q1',
    };

    initialNode2 = {
      '@id': node2Id,
      '@type': 'QueryNode',
      'http://schema.org/name': 'Initial Node 2',
      queryId: 'urn:test:query:q2',
    };

    initialEdge1 = {
      '@id': edge1Id,
      '@type': 'QueryEdge',
      'http://schema.org/name': 'Initial Edge 1',
      fromNodeId: node1Id, // Use final ID
      toNodeId: node2Id,   // Use final ID
    };

    // Create group using nodes/edges with final IDs
    // Explicitly type the input object
    const inputForFactory: CreateQueryGroupInput = {
      name: 'Node/Edge Test Group',
      libraryId: testLibrary['@id']!, // Use non-null assertion
      nodes: [initialNode1, initialNode2],
      edges: [initialEdge1],
      startNodeIds: [node1Id], // Use final ID
    };
    const groupFromFactory = createQueryGroup(inputForFactory);

    // Create the final group object with the overridden ID
    const finalGroupObject = {
        ...groupFromFactory,
        '@id': groupId // Set the predictable ID
    };
    // Assign to testGroup with the explicit type assertion
    testGroup = finalGroupObject as QueryGroup & Required<IdReference>;


    // --- Mock EntityManager ---
    // Mock 'get' to return the test group or library when requested
    (mockEntityManager.get as jest.Mock).mockImplementation(async (id: string, register: EntityRegister) => {
      if (id === testGroup['@id']) {
        // Return a deep copy to prevent modifications bleeding between tests/steps
        return JSON.parse(JSON.stringify(testGroup));
      }
      if (id === testLibrary['@id']) {
        return JSON.parse(JSON.stringify(testLibrary));
      }
      return undefined; // Simulate not found
    });

    // Mock 'saveOrUpdate' - we'll check its arguments
    (mockEntityManager.saveOrUpdate as jest.Mock).mockResolvedValue(undefined);

    // Mock 'delete'
    (mockEntityManager.delete as jest.Mock).mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  // --- Node Tests ---
  describe('POST /api/query-groups/:id/nodes', () => {
    it('should add a new node to the query group and return 201', async () => {
      const newNodeData = {
        name: 'New Node 3',
        queryId: 'urn:test:query:q3',
        // other optional fields like description, parameters can be added
      };

      const response = await app.inject({
        method: 'POST',
        url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/nodes`,
        payload: newNodeData,
      });

      expect(response.statusCode).toBe(201);
      const createdNode = response.json<QueryNode>();

      // Check the structure of the returned node
      expect(createdNode).toEqual(expect.objectContaining({
        ...newNodeData,
        '@type': 'QueryNode',
        '@id': expect.stringContaining(`${testGroup['@id']}/nodes/`), // ID should be generated
      }));

      // Verify saveOrUpdate was called with the updated group
      expect(mockEntityManager.saveOrUpdate).toHaveBeenCalledTimes(1);
      const savedGroup = (mockEntityManager.saveOrUpdate as jest.Mock).mock.calls[0][0] as QueryGroup;
      // Ensure nodes is an array before checking length and finding
      expect(Array.isArray(savedGroup.nodes)).toBe(true);
      const nodesArray = savedGroup.nodes as QueryNode[]; // Cast after check
      expect(nodesArray).toHaveLength(3); // Initial 2 + new 1
      // Find the newly added node in the saved group data using the correct property
      const addedNodeInSave = nodesArray.find(n => n['http://schema.org/name'] === newNodeData.name);
      expect(addedNodeInSave).toBeDefined();
      expect(addedNodeInSave).toEqual(createdNode); // The saved node should match the returned one
    });

    it('should return 404 if the query group does not exist', async () => {
       const newNodeData = { name: 'Test Node', queryId: 'q1' };
       const nonExistentGroupId = 'urn:test:group:does-not-exist';
       const response = await app.inject({
         method: 'POST',
         url: `/api/query-groups/${encodeURIComponent(nonExistentGroupId)}/nodes`,
         payload: newNodeData,
       });
       expect(response.statusCode).toBe(404);
       expect(response.json()).toEqual({ error: `QueryGroup with id ${nonExistentGroupId} not found` });
       expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled();
    });

    it('should return 400 if the request body is invalid (e.g., missing required field)', async () => {
      const invalidNodeData = { name: 'Missing Query ID' }; // Missing queryId
      const response = await app.inject({
        method: 'POST',
        url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/nodes`,
        payload: invalidNodeData,
      });
      expect(response.statusCode).toBe(400); // Schema validation should catch this
      // The exact error message depends on Fastify's schema validation reporting
      expect(response.json()).toHaveProperty('message');
      expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/query-groups/:id/nodes/:nodeId', () => {
    it('should update an existing node and return 200', async () => {
        const nodeIdToUpdate = initialNode1['@id']!.split('/').pop()!; // Get the suffix 'node-abc'
        const updatePayload = {
            name: 'Updated Node 1 Name',
            description: 'Updated description',
            // queryId could also be updated
        };

        const response = await app.inject({
            method: 'PUT',
            url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/nodes/${encodeURIComponent(nodeIdToUpdate)}`,
            payload: updatePayload,
        });

        expect(response.statusCode).toBe(200);
        const updatedNode = response.json<QueryNode>();

        // Check the returned node has the updates merged with original data
        expect(updatedNode).toEqual({
            ...initialNode1, // Start with original
            ...updatePayload, // Apply updates
            '@id': initialNode1['@id'], // ID should not change
            '@type': 'QueryNode', // Type should not change
        });

        // Verify saveOrUpdate was called with the group containing the updated node
        expect(mockEntityManager.saveOrUpdate).toHaveBeenCalledTimes(1);
        const savedGroup = (mockEntityManager.saveOrUpdate as jest.Mock).mock.calls[0][0] as QueryGroup;
        // Ensure nodes is an array before checking length and finding
        expect(Array.isArray(savedGroup.nodes)).toBe(true);
        const nodesArray = savedGroup.nodes as QueryNode[]; // Cast after check
        expect(nodesArray).toHaveLength(2);
        const nodeInSave = nodesArray.find(n => n['@id'] === initialNode1['@id']);
        expect(nodeInSave).toEqual(updatedNode); // Check the node within the saved group
    });

    it('should return 404 if the query group does not exist', async () => {
        const nodeIdToUpdate = 'node-abc';
        const nonExistentGroupId = 'urn:test:group:does-not-exist';
        const updatePayload = { name: 'Update Attempt' };
        const response = await app.inject({
            method: 'PUT',
            url: `/api/query-groups/${encodeURIComponent(nonExistentGroupId)}/nodes/${encodeURIComponent(nodeIdToUpdate)}`,
            payload: updatePayload,
        });
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ error: `QueryGroup with id ${nonExistentGroupId} not found` });
        expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled();
    });

    it('should return 404 if the node does not exist within the group', async () => {
        const nonExistentNodeIdSuffix = 'node-xyz-does-not-exist';
        const updatePayload = { name: 'Update Attempt' };
        const response = await app.inject({
            method: 'PUT',
            url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/nodes/${encodeURIComponent(nonExistentNodeIdSuffix)}`,
            payload: updatePayload,
        });
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ error: `Node with id suffix ${nonExistentNodeIdSuffix} not found in QueryGroup ${testGroup['@id']}` });
        expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled();
    });

     it('should return 400 if the request body is invalid (e.g., wrong type)', async () => {
        const nodeIdToUpdate = initialNode1['@id']!.split('/').pop()!;
        const invalidPayload = { name: 123 }; // Name should be string
        const response = await app.inject({
            method: 'PUT',
            url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/nodes/${encodeURIComponent(nodeIdToUpdate)}`,
            payload: invalidPayload,
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toHaveProperty('message'); // Schema validation error
        expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/query-groups/:id/nodes/:nodeId', () => {
    it('should delete an existing node and its connected edges, returning 204', async () => {
        const nodeIdToDelete = initialNode1['@id']!.split('/').pop()!; // 'node-abc'

        // Pre-check: Ensure the edge exists and connects to the node being deleted
        expect(testGroup.edges).toHaveLength(1);
        expect(testGroup.edges![0].fromNodeId).toBe(initialNode1['@id']);

        const response = await app.inject({
            method: 'DELETE',
            url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/nodes/${encodeURIComponent(nodeIdToDelete)}`,
        });

        expect(response.statusCode).toBe(204);
        expect(response.body).toBe(''); // No body for 204

        // Verify saveOrUpdate was called with the node and edge removed
        expect(mockEntityManager.saveOrUpdate).toHaveBeenCalledTimes(1);
        const savedGroup = (mockEntityManager.saveOrUpdate as jest.Mock).mock.calls[0][0] as QueryGroup;

        // Check node was removed
        expect(Array.isArray(savedGroup.nodes)).toBe(true); // Should still be an array (with one item)
        const nodesArray = savedGroup.nodes as QueryNode[]; // Cast after check
        expect(nodesArray).toHaveLength(1);
        expect(nodesArray.find(n => n['@id'] === initialNode1['@id'])).toBeUndefined();
        expect(nodesArray[0]['@id']).toBe(initialNode2['@id']); // Only node 2 should remain

        // Check connected edge was removed
        expect(savedGroup.edges).toBeUndefined(); // Edges array should be empty or undefined
    });

     it('should delete a node without edges, returning 204', async () => {
        // Modify the test group to remove the edge first for this test case
        testGroup.edges = undefined;
        // Re-mock 'get' to return this modified group
        (mockEntityManager.get as jest.Mock).mockImplementation(async (id: string) => {
            if (id === testGroup['@id']) return JSON.parse(JSON.stringify(testGroup));
            return undefined;
        });

        const nodeIdToDelete = initialNode2['@id']!.split('/').pop()!; // 'node-def'

        const response = await app.inject({
            method: 'DELETE',
            url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/nodes/${encodeURIComponent(nodeIdToDelete)}`,
        });

        expect(response.statusCode).toBe(204);

        // Verify saveOrUpdate was called
        expect(mockEntityManager.saveOrUpdate).toHaveBeenCalledTimes(1);
        const savedGroup = (mockEntityManager.saveOrUpdate as jest.Mock).mock.calls[0][0] as QueryGroup;

        // Check node was removed
        expect(savedGroup.nodes).toBeDefined();
        expect(savedGroup.nodes).toHaveLength(1);
        expect(savedGroup.nodes![0]['@id']).toBe(initialNode1['@id']); // Only node 1 should remain

        // Check edges remain undefined/empty
        expect(savedGroup.edges).toBeUndefined();
    });


    it('should return 204 (idempotency) if the query group does not exist', async () => {
        const nodeIdToDelete = 'node-abc';
        const nonExistentGroupId = 'urn:test:group:does-not-exist';
        const response = await app.inject({
            method: 'DELETE',
            url: `/api/query-groups/${encodeURIComponent(nonExistentGroupId)}/nodes/${encodeURIComponent(nodeIdToDelete)}`,
        });
        expect(response.statusCode).toBe(204);
        expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled(); // Should not attempt save if group not found
    });

    it('should return 204 (idempotency) if the node does not exist within the group', async () => {
        const nonExistentNodeIdSuffix = 'node-xyz-does-not-exist';
        const response = await app.inject({
            method: 'DELETE',
            url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/nodes/${encodeURIComponent(nonExistentNodeIdSuffix)}`,
        });
        expect(response.statusCode).toBe(204);
        expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled(); // Should not attempt save if node not found
    });
  });

  // --- Edge Tests ---
  describe('POST /api/query-groups/:id/edges', () => {
    it('should add a new edge between existing nodes and return 201', async () => {
      const newEdgeData = {
        name: 'New Edge 2',
        fromNodeId: initialNode1['@id'], // Connect existing nodes
        toNodeId: initialNode2['@id'],
        // other optional fields like description, mappings can be added
      };

      const response = await app.inject({
        method: 'POST',
        url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/edges`,
        payload: newEdgeData,
      });

      expect(response.statusCode).toBe(201);
      const createdEdge = response.json<QueryEdge>();

      // Check the structure of the returned edge
      expect(createdEdge).toEqual(expect.objectContaining({
        ...newEdgeData,
        '@type': 'QueryEdge',
        '@id': expect.stringContaining(`${testGroup['@id']}/edges/`), // ID should be generated
      }));

      // Verify saveOrUpdate was called with the updated group
      expect(mockEntityManager.saveOrUpdate).toHaveBeenCalledTimes(1);
      const savedGroup = (mockEntityManager.saveOrUpdate as jest.Mock).mock.calls[0][0] as QueryGroup;
      expect(Array.isArray(savedGroup.edges)).toBe(true);
      const edgesArray = savedGroup.edges as QueryEdge[];
      expect(edgesArray).toHaveLength(2); // Initial 1 + new 1
      // Find the newly added edge in the saved group data
      const addedEdgeInSave = edgesArray.find(e => e['http://schema.org/name'] === newEdgeData.name);
      expect(addedEdgeInSave).toBeDefined();
      expect(addedEdgeInSave).toEqual(createdEdge); // The saved edge should match the returned one
    });

    it('should return 404 if the query group does not exist', async () => {
       const newEdgeData = { name: 'Test Edge', fromNodeId: 'n1', toNodeId: 'n2' };
       const nonExistentGroupId = 'urn:test:group:does-not-exist';
       const response = await app.inject({
         method: 'POST',
         url: `/api/query-groups/${encodeURIComponent(nonExistentGroupId)}/edges`,
         payload: newEdgeData,
       });
       expect(response.statusCode).toBe(404);
       expect(response.json()).toEqual({ error: `QueryGroup with id ${nonExistentGroupId} not found` });
       expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled();
    });

    it('should return 400 if fromNodeId does not exist in the group', async () => {
      const newEdgeData = {
        name: 'Bad From Node Edge',
        fromNodeId: 'urn:test:node:does-not-exist',
        toNodeId: initialNode2['@id'],
      };
      const response = await app.inject({
        method: 'POST',
        url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/edges`,
        payload: newEdgeData,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: `Bad Request: fromNodeId (${newEdgeData.fromNodeId}) or toNodeId (${newEdgeData.toNodeId}) does not exist in QueryGroup ${testGroup['@id']}` });
      expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled();
    });

    it('should return 400 if toNodeId does not exist in the group', async () => {
      const newEdgeData = {
        name: 'Bad To Node Edge',
        fromNodeId: initialNode1['@id'],
        toNodeId: 'urn:test:node:does-not-exist',
      };
      const response = await app.inject({
        method: 'POST',
        url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/edges`,
        payload: newEdgeData,
      });
      expect(response.statusCode).toBe(400);
       expect(response.json()).toEqual({ error: `Bad Request: fromNodeId (${newEdgeData.fromNodeId}) or toNodeId (${newEdgeData.toNodeId}) does not exist in QueryGroup ${testGroup['@id']}` });
      expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled();
    });

    it('should return 400 if the request body is invalid (e.g., missing required field)', async () => {
      const invalidEdgeData = { name: 'Missing Nodes' }; // Missing fromNodeId, toNodeId
      const response = await app.inject({
        method: 'POST',
        url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/edges`,
        payload: invalidEdgeData,
      });
      expect(response.statusCode).toBe(400); // Schema validation should catch this
      expect(response.json()).toHaveProperty('message');
      expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/query-groups/:id/edges/:edgeId', () => {
     it('should update an existing edge and return 200', async () => {
        const edgeIdToUpdate = initialEdge1['@id']!.split('/').pop()!; // Get the suffix 'edge-xyz'
        const updatePayload = {
            name: 'Updated Edge 1 Name',
            description: 'Updated edge description',
            // Could also update fromNodeId/toNodeId if they exist
        };

        const response = await app.inject({
            method: 'PUT',
            url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/edges/${encodeURIComponent(edgeIdToUpdate)}`,
            payload: updatePayload,
        });

        expect(response.statusCode).toBe(200);
        const updatedEdge = response.json<QueryEdge>();

        // Check the returned edge has the updates merged with original data
        expect(updatedEdge).toEqual({
            ...initialEdge1, // Start with original
            ...updatePayload, // Apply updates
            '@id': initialEdge1['@id'], // ID should not change
            '@type': 'QueryEdge', // Type should not change
        });

        // Verify saveOrUpdate was called with the group containing the updated edge
        expect(mockEntityManager.saveOrUpdate).toHaveBeenCalledTimes(1);
        const savedGroup = (mockEntityManager.saveOrUpdate as jest.Mock).mock.calls[0][0] as QueryGroup;
        expect(Array.isArray(savedGroup.edges)).toBe(true);
        const edgesArray = savedGroup.edges as QueryEdge[];
        expect(edgesArray).toHaveLength(1);
        const edgeInSave = edgesArray.find(e => e['@id'] === initialEdge1['@id']);
        expect(edgeInSave).toEqual(updatedEdge); // Check the edge within the saved group
    });

     it('should update an existing edge node references and return 200', async () => {
        // Add a third node to test changing references
        const initialNode3: QueryNode = {
            '@id': `${testGroup['@id']}/nodes/node-ghi`,
            '@type': 'QueryNode',
            'http://schema.org/name': 'Initial Node 3',
            queryId: 'urn:test:query:q3',
        };
        // Safely add the third node to the testGroup's nodes array
        let currentNodes = testGroup.nodes;
        let updatedNodes: (QueryNode | IdReference)[];
        if (!currentNodes) {
            updatedNodes = [initialNode3];
        } else if (Array.isArray(currentNodes)) {
            updatedNodes = [...currentNodes, initialNode3]; // Create new mutable array
        } else {
            updatedNodes = [currentNodes, initialNode3]; // Create array from single item + new item
        }
        testGroup.nodes = updatedNodes; // Assign the new mutable array

         // Re-mock 'get' to return this modified group
        (mockEntityManager.get as jest.Mock).mockImplementation(async (id: string) => {
            if (id === testGroup['@id']) return JSON.parse(JSON.stringify(testGroup));
            return undefined;
        });


        const edgeIdToUpdate = initialEdge1['@id']!.split('/').pop()!; // 'edge-xyz'
        const updatePayload = {
            fromNodeId: initialNode2['@id'], // Change from node 1 to node 2
            toNodeId: initialNode3['@id'],   // Change from node 2 to node 3
        };

        const response = await app.inject({
            method: 'PUT',
            url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/edges/${encodeURIComponent(edgeIdToUpdate)}`,
            payload: updatePayload,
        });

        expect(response.statusCode).toBe(200);
        const updatedEdge = response.json<QueryEdge>();

        expect(updatedEdge.fromNodeId).toBe(initialNode2['@id']);
        expect(updatedEdge.toNodeId).toBe(initialNode3['@id']);

        // Verify saveOrUpdate was called with the updated edge references
        expect(mockEntityManager.saveOrUpdate).toHaveBeenCalledTimes(1);
        const savedGroup = (mockEntityManager.saveOrUpdate as jest.Mock).mock.calls[0][0] as QueryGroup;
        const edgeInSave = (savedGroup.edges as QueryEdge[])?.find(e => e['@id'] === initialEdge1['@id']);
        expect(edgeInSave?.fromNodeId).toBe(initialNode2['@id']);
        expect(edgeInSave?.toNodeId).toBe(initialNode3['@id']);
    });


    it('should return 404 if the query group does not exist', async () => {
        const edgeIdToUpdate = 'edge-xyz';
        const nonExistentGroupId = 'urn:test:group:does-not-exist';
        const updatePayload = { name: 'Update Attempt' };
        const response = await app.inject({
            method: 'PUT',
            url: `/api/query-groups/${encodeURIComponent(nonExistentGroupId)}/edges/${encodeURIComponent(edgeIdToUpdate)}`,
            payload: updatePayload,
        });
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ error: `QueryGroup with id ${nonExistentGroupId} not found` });
        expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled();
    });

    it('should return 404 if the edge does not exist within the group', async () => {
        const nonExistentEdgeIdSuffix = 'edge-abc-does-not-exist';
        const updatePayload = { name: 'Update Attempt' };
        const response = await app.inject({
            method: 'PUT',
            url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/edges/${encodeURIComponent(nonExistentEdgeIdSuffix)}`,
            payload: updatePayload,
        });
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ error: `Edge with id suffix ${nonExistentEdgeIdSuffix} not found in QueryGroup ${testGroup['@id']}` });
        expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled();
    });

     it('should return 400 if updated fromNodeId does not exist', async () => {
        const edgeIdToUpdate = initialEdge1['@id']!.split('/').pop()!;
        const updatePayload = { fromNodeId: 'urn:test:node:does-not-exist' };
        const response = await app.inject({
            method: 'PUT',
            url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/edges/${encodeURIComponent(edgeIdToUpdate)}`,
            payload: updatePayload,
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ error: `Bad Request: Updated fromNodeId (${updatePayload.fromNodeId}) or toNodeId (${initialEdge1.toNodeId}) does not exist as a node in QueryGroup ${testGroup['@id']}` });
        expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled();
    });

     it('should return 400 if updated toNodeId does not exist', async () => {
        const edgeIdToUpdate = initialEdge1['@id']!.split('/').pop()!;
        const updatePayload = { toNodeId: 'urn:test:node:does-not-exist' };
        const response = await app.inject({
            method: 'PUT',
            url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/edges/${encodeURIComponent(edgeIdToUpdate)}`,
            payload: updatePayload,
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ error: `Bad Request: Updated fromNodeId (${initialEdge1.fromNodeId}) or toNodeId (${updatePayload.toNodeId}) does not exist as a node in QueryGroup ${testGroup['@id']}` });
        expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled();
    });

     it('should return 400 if the request body is invalid (e.g., wrong type)', async () => {
        const edgeIdToUpdate = initialEdge1['@id']!.split('/').pop()!;
        const invalidPayload = { name: 123 }; // Name should be string
        const response = await app.inject({
            method: 'PUT',
            url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/edges/${encodeURIComponent(edgeIdToUpdate)}`,
            payload: invalidPayload,
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toHaveProperty('message'); // Schema validation error
        expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/query-groups/:id/edges/:edgeId', () => {
     it('should delete an existing edge, returning 204', async () => {
        const edgeIdToDelete = initialEdge1['@id']!.split('/').pop()!; // 'edge-xyz'

        // Pre-check: Ensure the edge exists
        expect(testGroup.edges).toHaveLength(1);

        const response = await app.inject({
            method: 'DELETE',
            url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/edges/${encodeURIComponent(edgeIdToDelete)}`,
        });

        expect(response.statusCode).toBe(204);
        expect(response.body).toBe(''); // No body for 204

        // Verify saveOrUpdate was called with the edge removed
        expect(mockEntityManager.saveOrUpdate).toHaveBeenCalledTimes(1);
        const savedGroup = (mockEntityManager.saveOrUpdate as jest.Mock).mock.calls[0][0] as QueryGroup;

        // Check edge was removed
        expect(savedGroup.edges).toBeUndefined(); // Edges array should be empty or undefined
        expect(savedGroup.nodes).toHaveLength(2); // Nodes should be unaffected
    });

    it('should return 204 (idempotency) if the query group does not exist', async () => {
        const edgeIdToDelete = 'edge-xyz';
        const nonExistentGroupId = 'urn:test:group:does-not-exist';
        const response = await app.inject({
            method: 'DELETE',
            url: `/api/query-groups/${encodeURIComponent(nonExistentGroupId)}/edges/${encodeURIComponent(edgeIdToDelete)}`,
        });
        expect(response.statusCode).toBe(204);
        expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled(); // Should not attempt save if group not found
    });

    it('should return 204 (idempotency) if the edge does not exist within the group', async () => {
        const nonExistentEdgeIdSuffix = 'edge-abc-does-not-exist';
        const response = await app.inject({
            method: 'DELETE',
            url: `/api/query-groups/${encodeURIComponent(testGroup['@id']!)}/edges/${encodeURIComponent(nonExistentEdgeIdSuffix)}`,
        });
        expect(response.statusCode).toBe(204);
        expect(mockEntityManager.saveOrUpdate).not.toHaveBeenCalled(); // Should not attempt save if edge not found
    });
  });

}); // End of Nested Node and Edge Routes describe
