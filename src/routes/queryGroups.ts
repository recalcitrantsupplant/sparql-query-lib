import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { EntityManager } from '../lib/EntityManager';
import { EntityRegister } from '../lib/entity-register';
import { QueryGroup, Thing, Library, IdReference, QueryNode, QueryEdge, SchemaValue } from '../types/schema-dts'; // Added Library, IdReference, QueryNode, QueryEdge, SchemaValue
import { FromSchema } from 'json-schema-to-ts';
import { createQueryGroup, CreateQueryGroupInput } from '../lib/factories'; // Import factory and input type
import { logger, SeverityNumber } from '../lib/logger'; // Import logger
import { randomUUID } from 'crypto'; // For generating unique IDs
import {
  // Nested schemas used by queryGroupSchema
  // idReferenceSchema,
  // nodeParameterMappingSchema,
  // queryNodeSchema,
  // parameterMappingSchema,
  // queryEdgeSchema,
  // Main schema (used by update)
  queryGroupSchema,
  paramsSchema, // Re-using common params schema
  // Route schemas
  getQueryGroupsSchema,
  getQueryGroupSchema,
  createQueryGroupSchema, // References createQueryGroupBodySchema
  updateQueryGroupSchema,
  deleteQueryGroupSchema,
  // errorMessageSchema is added globally
  createQueryGroupBodySchema, // Import the specific body schema for POST
  updateQueryGroupBodySchema, // Import the specific body schema for PUT <--- ADDED IMPORT
  // Node/Edge Schemas
  createQueryNodeBodySchema,
  updateQueryNodeBodySchema,
  createQueryEdgeBodySchema,
  updateQueryEdgeBodySchema,
  // Node/Edge Route Schemas
  addQueryGroupNodeSchema,
  updateQueryGroupNodeSchema,
  deleteQueryGroupNodeSchema,
  addQueryGroupEdgeSchema,
  updateQueryGroupEdgeSchema,
  deleteQueryGroupEdgeSchema
} from '../schemas'; // Import schemas


// Helper function to ensure a value is a mutable array, returning an empty array if input is undefined/null
// Explicitly handles the case where the input might be ReadonlyArray<T> or just T.
function ensureArray<T>(value: ReadonlyArray<T> | T | undefined | null): T[] {
	if (!value) {
		return [];
	}
	if (Array.isArray(value)) {
		// Create a mutable copy from a readonly or mutable array
		return [...value];
	}
	// If it's a single item, wrap it in a new array
	// Explicitly cast to T to resolve TS error
	return [value as T];
}

// Type guard to check if an item is a full QueryNode (not just IdReference)
function isQueryNode(item: QueryNode | IdReference | undefined): item is QueryNode {
    return !!item && typeof item === 'object' && '@type' in item && item['@type'] === 'QueryNode';
}

// Type guard to check if an item is a full QueryEdge (not just IdReference)
function isQueryEdge(item: QueryEdge | IdReference | undefined): item is QueryEdge {
    return !!item && typeof item === 'object' && '@type' in item && item['@type'] === 'QueryEdge';
}

// Helper to construct full node/edge ID
function constructId(baseId: string, type: 'nodes' | 'edges', suffix: string): string {
  // Ensure baseId doesn't end with a slash if it's not just the base path
  const cleanedBaseId = baseId.endsWith('/') ? baseId.slice(0, -1) : baseId;
  return `${cleanedBaseId}/${type}/${suffix}`;
}


export default async function (
  fastify: FastifyInstance,
  options: FastifyPluginOptions & { entityManager: EntityManager }
) {
  // Schemas are expected to be added globally in index.ts or similar
  // No need to add errorMessageSchema or other schemas here

  const em = options.entityManager;

  if (!em) {
    throw new Error('EntityManager instance is required');
  }

  // Helper function to check if an object is a QueryGroup
  // (Consider moving to a shared type guard location)
  function isQueryGroup(thing: Thing | undefined): thing is QueryGroup {
    return !!thing && thing['@type'] === 'QueryGroup';
  }

  // GET /api/queryGroups - List all QueryGroups, optionally filtered by libraryId
  fastify.get<{ Querystring: { libraryId?: string }; Reply: QueryGroup[] | { error: string } }>( // Add Querystring type, allow error reply
    '/',
    { schema: getQueryGroupsSchema }, // Schema now includes querystring definition
    async (request, reply) => {
      try {
        const libraryId = request.query.libraryId; // Get optional libraryId
        const register = new EntityRegister();
        const allEntitiesMap = await em.loadAll(register);
        const groups: QueryGroup[] = [];

        allEntitiesMap.forEach(entity => {
          if (isQueryGroup(entity)) {
            if (libraryId) {
              // Filter by libraryId if provided
              const isPartOfRaw = entity['http://schema.org/isPartOf'];
              // Normalize isPartOf to always be an array or empty array
              const isPartOfArray: readonly IdReference[] = isPartOfRaw
                ? (Array.isArray(isPartOfRaw) ? isPartOfRaw : [isPartOfRaw])
                : [];

              // Check if any IdReference in the array matches the libraryId
              const belongsToLibrary = isPartOfArray.some(ref => ref['@id'] === libraryId);

              if (belongsToLibrary) {
                groups.push(entity);
              }
            } else {
              // No libraryId filter, include all query groups
              groups.push(entity);
            }
          }
        });
        return reply.send(groups);
      } catch (error: any) {
        request.log.error(error, 'Error loading QueryGroups'); // More generic error message
        return reply.code(500).send({ error: 'Internal Server Error: Could not fetch QueryGroups' });
      }
    }
  );

  // GET /api/queryGroups/:id - Get a single QueryGroup
  // Note: FromSchema needs the actual schema object, not the FastifySchema wrapper
  fastify.get<{ Params: FromSchema<typeof paramsSchema>; Reply: QueryGroup | { error: string } }>(
    '/:id',
    { schema: getQueryGroupSchema }, // Attach imported route schema
    async (request, reply) => {
      try {
        const id = decodeURIComponent(request.params.id);
        const register = new EntityRegister(); // Need register for get
        const group = await em.get<QueryGroup>(id, register); // Use generic type argument
        if (!group || !isQueryGroup(group)) { // Check type guard
          return reply.code(404).send({ error: 'QueryGroup not found' });
        }
        return reply.send(group);
      } catch (error: any) {
        request.log.error(error, `Error retrieving QueryGroup ${request.params.id}`);
        return reply.code(500).send({ error: 'Internal Server Error' });
      }
    }
  );

  // POST /api/queryGroups - Create a new QueryGroup
  // Use the specific body schema for type safety
  fastify.post<{ Body: FromSchema<typeof createQueryGroupBodySchema>; Reply: QueryGroup | { error: string } }>(
    '/',
    { schema: createQueryGroupSchema }, // Attach route schema (references body schema)
    async (request, reply) => {
      let groupToSave: QueryGroup | null = null; // For logging in catch block
      try {
        const userInput = request.body; // Type is CreateQueryGroupInput based on schema

        // Schema validation handles required fields (name, libraryId) and types.
        // Factory handles ID generation, timestamps, type.

        // --- Library Validation ---
        // Assert type after schema validation
        const typedInput = userInput as CreateQueryGroupInput;
        if (!typedInput.libraryId) {
            // Should be caught by schema, but defensive check
            logger.emit({ severityNumber: SeverityNumber.WARN, body: 'libraryId missing from QueryGroup input despite schema validation.' });
            return reply.status(400).send({ error: 'Bad Request: libraryId is required.' });
        }

        const libraryRegister = new EntityRegister();
        const libraryExists = await em.get<Library>(typedInput.libraryId, libraryRegister);

        if (!libraryExists || libraryExists['@type'] !== 'Library') {
            logger.emit({ severityNumber: SeverityNumber.WARN, body: `Attempt to create QueryGroup with non-existent or invalid libraryId: ${typedInput.libraryId}` });
            return reply.status(400).send({ error: `Bad Request: Library with id ${typedInput.libraryId} not found.` });
        }
        // --- End Library Validation ---

        // 1. Use the factory to create the complete entity object
        groupToSave = createQueryGroup(typedInput); // Use the factory

        // DEBUG: Log object before saving
        logger.emit({ severityNumber: SeverityNumber.INFO, body: 'QueryGroup object BEFORE saveOrUpdate', attributes: { queryGroupToSave: JSON.stringify(groupToSave) } });

        // 2. Save the entity using EntityManager
        await em.saveOrUpdate(groupToSave);

        // 3. Fetch the created query group to confirm and return
        if (!groupToSave || !groupToSave['@id']) {
            logger.emit({ severityNumber: SeverityNumber.ERROR, body: 'Internal error: groupToSave object or its ID is missing after save attempt.' });
            return reply.status(500).send({ error: 'Internal server error after creating QueryGroup.' });
        }
        const registerGet = new EntityRegister();
        const createdGroup = await em.get<QueryGroup>(groupToSave['@id'], registerGet);

        // DEBUG: Log object after retrieval
        logger.emit({ severityNumber: SeverityNumber.INFO, body: 'QueryGroup object AFTER get', attributes: { createdGroup: JSON.stringify(createdGroup) } });

        if (!createdGroup || !isQueryGroup(createdGroup)) {
            logger.emit({ severityNumber: SeverityNumber.ERROR, body: `Failed to retrieve QueryGroup after creation`, attributes: { queryGroupId: groupToSave['@id'] } });
            return reply.status(500).send({ error: 'Failed to verify QueryGroup creation' });
        }
        return reply.status(201).send(createdGroup);

      } catch (err: unknown) {
        const errorForLog = err instanceof Error ? err : new Error(String(err));
        const groupIdForLog = groupToSave?.['@id'] ?? 'unknown (factory or save failed)';
        logger.emit({
            severityNumber: SeverityNumber.ERROR,
            body: 'Failed to create QueryGroup',
            attributes: {
                'error.message': errorForLog.message,
                'error.stack': errorForLog.stack,
                queryGroupId: groupIdForLog
            }
        });
        return reply.status(500).send({ error: 'Internal Server Error: Could not create QueryGroup.' });
      }
    }
  );


  // PUT /api/queryGroups/:id - Update an existing QueryGroup
  // Define explicit types for Params and Body based on schemas
  type UpdateQueryGroupParams = { id: string };
  // Correctly reference the body schema constant - Third time's the charm!
  type UpdateQueryGroupBody = FromSchema<typeof updateQueryGroupBodySchema>;

  fastify.put<{ Params: UpdateQueryGroupParams; Body: UpdateQueryGroupBody; Reply: QueryGroup | { error: string } }>(
    '/:id',
    { schema: updateQueryGroupSchema }, // Attach imported route schema
    async (request, reply) => {
       try {
         const id = decodeURIComponent(request.params.id);
         const updateData = request.body; // Contains fields to update

         // 1. Fetch the existing QueryGroup
         const register = new EntityRegister();
         const existingGroup = await em.get<QueryGroup>(id, register);

         if (!existingGroup || !isQueryGroup(existingGroup)) {
           return reply.code(404).send({ error: 'QueryGroup not found' });
         }

         // 2. Merge the update data with the existing group
         //    Only update fields present in the request body.
         //    Preserve existing @id, @type, isPartOf, dates.
         //    Explicitly handle nodes/edges if they are in updateData, otherwise keep existing.
         //    Need to cast updateData to the correct type after schema validation
         const typedUpdateData = updateData as UpdateQueryGroupBody;
         const groupToUpdate: QueryGroup = {
           ...existingGroup,
           name: typedUpdateData.name ?? existingGroup.name,
           description: typedUpdateData.description ?? existingGroup.description,
           nodes: typedUpdateData.nodes ?? existingGroup.nodes, // Keep existing if not provided
           edges: typedUpdateData.edges ?? existingGroup.edges, // Keep existing if not provided
           startNodeIds: typedUpdateData.startNodeIds ?? existingGroup.startNodeIds,
           endNodeIds: typedUpdateData.endNodeIds ?? existingGroup.endNodeIds,
           // Ensure read-only fields are preserved from existingGroup
           '@id': existingGroup['@id'],
           '@type': 'QueryGroup',
           'http://schema.org/isPartOf': existingGroup['http://schema.org/isPartOf'],
           'http://schema.org/dateCreated': existingGroup['http://schema.org/dateCreated'],
           // dateModified will be updated by saveOrUpdate
         };


         // 3. Save the merged group (saveOrUpdate handles dateModified)
         await em.saveOrUpdate(groupToUpdate);

         // 4. Fetch the *actually* updated group to return it (optional but good practice)
         //    This ensures we return the state as it is in storage after save.
         const finalRegister = new EntityRegister();
         const updatedGroup = await em.get<QueryGroup>(id, finalRegister);
         if (!updatedGroup || !isQueryGroup(updatedGroup)) {
             // This shouldn't happen if saveOrUpdate succeeded
             request.log.error(`Failed to retrieve QueryGroup ${id} after update`);
             return reply.code(500).send({ error: 'Failed to verify QueryGroup update' });
         }
         return reply.send(updatedGroup);
       } catch (error: any) {
         request.log.error(error, `Error updating QueryGroup ${request.params.id}`);
         // saveOrUpdate doesn't throw specific 'not found' error, it just creates if missing.
         // Rely on the get check above if strict update-only is needed.
         // if (error.message.includes('not found')) { // saveOrUpdate doesn't throw this
         //    return reply.code(404).send({ error: 'QueryGroup not found' });
         // }
         return reply.code(500).send({ error: error.message || 'Failed to update QueryGroup' }); // Use 500 for general update errors
       }
    }
  );


  // DELETE /api/queryGroups/:id - Delete a QueryGroup
  type DeleteQueryGroupParams = { id: string };
  fastify.delete<{ Params: DeleteQueryGroupParams; Reply: { error: string } | null }>(
    '/:id',
    { schema: deleteQueryGroupSchema }, // Attach imported route schema
     async (request, reply) => {
       try {
         const id = decodeURIComponent(request.params.id);
         // Optional: Check if exists before deleting
         const registerCheck = new EntityRegister();
         const existing = await em.get(id, registerCheck);
         if (!existing) {
            // Send 204 even if not found, as the end state (not present) is achieved.
            // Or send 404 if you want to explicitly signal it wasn't there. Let's stick to 204 for idempotency.
            // return reply.code(404).send({ error: 'QueryGroup not found' });
         }

         await em.delete(id); // Delete is correct
         return reply.code(204).send();
       } catch (error: any) {
         request.log.error(error, `Error deleting QueryGroup ${request.params.id}`);
         // Delete might fail for other reasons, but 'not found' isn't typically thrown by the current impl.
         // if (error.message.includes('not found')) { // delete doesn't throw this
         //    return reply.code(404).send({ error: 'QueryGroup not found' });
         // }
         return reply.code(500).send({ error: 'Internal Server Error' });
      }
    }
  );


  // --- Node Routes ---

  // Define explicit types for Params and Body based on schemas
  // Combined params type for PUT/DELETE routes requiring both IDs
  type NodeRouteParams = { id: string; nodeId: string };
  // Params type for POST route requiring only the group ID
  type AddNodeParams = { id: string };
  // Body types derived from schemas
  type AddNodeBody = FromSchema<typeof createQueryNodeBodySchema>;
  type UpdateNodeBody = FromSchema<typeof updateQueryNodeBodySchema>;

  // POST /api/queryGroups/{id}/nodes - Add a node
  fastify.post<{ Params: AddNodeParams; Body: AddNodeBody; Reply: QueryNode | { error: string } }>(
    '/:id/nodes',
    { schema: addQueryGroupNodeSchema },
    async (request, reply) => {
      const groupId = decodeURIComponent(request.params.id);
      const nodeData = request.body; // Type is AddNodeBody
      let group: QueryGroup | undefined; // Use undefined initially

      try {
        const register = new EntityRegister();
        group = await em.get<QueryGroup>(groupId, register);

        if (!group || !isQueryGroup(group)) {
          return reply.code(404).send({ error: `QueryGroup with id ${groupId} not found` });
        }

        // Generate ID and create node object
        const newNodeSuffix = randomUUID();
        // After the isQueryGroup check, group['@id'] is guaranteed to be a string
        const newNodeId = constructId(group['@id']!, 'nodes', newNodeSuffix);
        const newNode: QueryNode = {
          ...nodeData, // nodeData is already typed as AddNodeBody
          '@id': newNodeId,
          '@type': 'QueryNode',
        };

        // Ensure nodes array exists and add the new node
        const nodesArray = ensureArray(group.nodes); // ensureArray now returns QueryNode[]
        nodesArray.push(newNode);

        const groupToUpdate: QueryGroup = {
          ...group,
          nodes: nodesArray,
        };

        await em.saveOrUpdate(groupToUpdate);

        // Fetch the created node to return (optional but good practice)
        // No need to fetch the whole group again, just return the newNode object
        // as saveOrUpdate doesn't modify the object structure itself here.
        // const finalRegister = new EntityRegister();
        // const updatedGroup = await em.get<QueryGroup>(groupId, finalRegister);
        // const createdNode = ensureArray(updatedGroup?.nodes as QueryNode[] | undefined).find(n => n['@id'] === newNodeId);
        // if (!createdNode) {
        //     request.log.error(`Failed to retrieve node ${newNodeId} after creation in group ${groupId}`);
        //     return reply.code(500).send({ error: 'Failed to verify node creation' });
        // }
        // return reply.code(201).send(createdNode);

        // Return the node object we created and added
        return reply.code(201).send(newNode);

      } catch (error: any) {
        request.log.error(error, `Error adding node to QueryGroup ${groupId}`);
        return reply.code(500).send({ error: 'Internal Server Error: Could not add node.' });
      }
    }
  );

  // PUT /api/queryGroups/{id}/nodes/{nodeId} - Update a node
  fastify.put<{ Params: NodeRouteParams; Body: UpdateNodeBody; Reply: QueryNode | { error: string } }>( // Use NodeRouteParams
    '/:id/nodes/:nodeId',
    { schema: updateQueryGroupNodeSchema },
    async (request, reply) => {
      const groupId = decodeURIComponent(request.params.id);
      const nodeIdSuffix = decodeURIComponent(request.params.nodeId);
      const updateData = request.body; // Type is UpdateNodeBody
      let group: QueryGroup | undefined;

      try {
        const register = new EntityRegister();
        group = await em.get<QueryGroup>(groupId, register);

        if (!group || !isQueryGroup(group)) {
          return reply.code(404).send({ error: `QueryGroup with id ${groupId} not found` });
        }

        // ensureArray now returns (QueryNode | IdReference)[] based on SchemaValue
        const nodesArray = ensureArray(group.nodes);
        // Find index ensuring it's a full QueryNode with a matching ID suffix
        const nodeIndex = nodesArray.findIndex(n =>
            isQueryNode(n) && typeof n['@id'] === 'string' && n['@id'].endsWith(`/${nodeIdSuffix}`)
        );

        if (nodeIndex === -1) {
          return reply.code(404).send({ error: `Node with id suffix ${nodeIdSuffix} not found in QueryGroup ${groupId}` });
        }

        // We know nodesArray[nodeIndex] is a QueryNode because of findIndex condition
        const existingNode = nodesArray[nodeIndex] as QueryNode;

        const updatedNode: QueryNode = {
          ...existingNode, // Spread existing node
          ...updateData,   // Spread validated update data (UpdateNodeBody)
          '@id': existingNode['@id'], // Preserve original ID
          '@type': 'QueryNode',      // Preserve type
        };

        nodesArray[nodeIndex] = updatedNode;

        const groupToUpdate: QueryGroup = {
          ...group,
          nodes: nodesArray,
        };

        await em.saveOrUpdate(groupToUpdate);

        // Return the updated node object directly
        // const finalRegister = new EntityRegister();
        // const finalGroup = await em.get<QueryGroup>(groupId, finalRegister);
        // const returnedNode = ensureArray(finalGroup?.nodes as QueryNode[] | undefined).find(n => n['@id'] === existingNode['@id']);
        // if (!returnedNode) {
        //     request.log.error(`Failed to retrieve node ${existingNode['@id']} after update in group ${groupId}`);
        //     return reply.code(500).send({ error: 'Failed to verify node update' });
        // }
        // return reply.send(returnedNode);

        return reply.send(updatedNode); // Return the merged node

      } catch (error: any) {
        request.log.error(error, `Error updating node ${nodeIdSuffix} in QueryGroup ${groupId}`);
        return reply.code(500).send({ error: 'Internal Server Error: Could not update node.' });
      }
    }
  );

  // DELETE /api/queryGroups/{id}/nodes/{nodeId} - Delete a node
  fastify.delete<{ Params: NodeRouteParams; Reply: { error: string } | null }>( // Use NodeRouteParams
    '/:id/nodes/:nodeId',
    { schema: deleteQueryGroupNodeSchema },
    async (request, reply) => {
      const groupId = decodeURIComponent(request.params.id);
      const nodeIdSuffix = decodeURIComponent(request.params.nodeId);
      let group: QueryGroup | undefined;

      try {
        const register = new EntityRegister();
        group = await em.get<QueryGroup>(groupId, register);

        if (!group || !isQueryGroup(group)) {
          // Idempotency: If group not found, consider it deleted.
          return reply.code(204).send();
        }

        const nodesArray = ensureArray(group.nodes); // (QueryNode | IdReference)[]
        // Find index ensuring it's a full QueryNode with a matching ID suffix
        const nodeIndex = nodesArray.findIndex(n =>
            isQueryNode(n) && typeof n['@id'] === 'string' && n['@id'].endsWith(`/${nodeIdSuffix}`)
        );

        if (nodeIndex === -1) {
          // Idempotency: If node not found, consider it deleted.
          return reply.code(204).send();
        }

        // We know it's a QueryNode and has an @id
        const deletedNodeId = (nodesArray[nodeIndex] as QueryNode)['@id']!;

        // Remove the node
        const updatedNodes = nodesArray.filter((_, index) => index !== nodeIndex);

        // Remove connected edges - ensure we only check actual QueryEdge objects
        const edgesArray = ensureArray(group.edges); // (QueryEdge | IdReference)[]
        const updatedEdges = edgesArray.filter(edge =>
            isQueryEdge(edge) && edge.fromNodeId !== deletedNodeId && edge.toNodeId !== deletedNodeId
        );

        const groupToUpdate: QueryGroup = {
          ...group,
          // Assign updated arrays or undefined if empty
          nodes: updatedNodes.length > 0 ? updatedNodes : undefined,
          edges: updatedEdges.length > 0 ? updatedEdges : undefined,
        };

        await em.saveOrUpdate(groupToUpdate); // Save the modified group

        return reply.code(204).send();

      } catch (error: any) {
        request.log.error(error, `Error deleting node ${nodeIdSuffix} from QueryGroup ${groupId}`);
        return reply.code(500).send({ error: 'Internal Server Error: Could not delete node.' });
      }
    }
  );


  // --- Edge Routes ---

  // Define explicit types for Params and Body based on schemas
  // Combined params type for PUT/DELETE routes requiring both IDs
  type EdgeRouteParams = { id: string; edgeId: string };
  // Params type for POST route requiring only the group ID
  type AddEdgeParams = { id: string };
  // Body types derived from schemas
  type AddEdgeBody = FromSchema<typeof createQueryEdgeBodySchema>;
  type UpdateEdgeBody = FromSchema<typeof updateQueryEdgeBodySchema>;

  // POST /api/queryGroups/{id}/edges - Add an edge
  fastify.post<{ Params: AddEdgeParams; Body: AddEdgeBody; Reply: QueryEdge | { error: string } }>(
    '/:id/edges',
    { schema: addQueryGroupEdgeSchema },
    async (request, reply) => {
      const groupId = decodeURIComponent(request.params.id);
      const edgeData = request.body; // Type is AddEdgeBody
      let group: QueryGroup | undefined;

      try {
        const register = new EntityRegister();
        group = await em.get<QueryGroup>(groupId, register);

        if (!group || !isQueryGroup(group)) {
          return reply.code(404).send({ error: `QueryGroup with id ${groupId} not found` });
        }

        const nodesArray = ensureArray(group.nodes); // (QueryNode | IdReference)[]
        // Get IDs only from full QueryNode objects
        const nodeIds = new Set(nodesArray.filter(isQueryNode).map(n => n['@id']));

        // Validate referenced nodes exist
        if (!nodeIds.has(edgeData.fromNodeId) || !nodeIds.has(edgeData.toNodeId)) {
           return reply.code(400).send({ error: `Bad Request: fromNodeId (${edgeData.fromNodeId}) or toNodeId (${edgeData.toNodeId}) does not exist in QueryGroup ${groupId}` });
        }

        // Generate ID and create edge object
        const newEdgeSuffix = randomUUID();
        // group['@id'] is guaranteed string after isQueryGroup check
        const newEdgeId = constructId(group['@id']!, 'edges', newEdgeSuffix);
        const newEdge: QueryEdge = {
          ...edgeData, // edgeData is AddEdgeBody
          '@id': newEdgeId,
          '@type': 'QueryEdge',
        };

        // Ensure edges array exists and add the new edge
        const edgesArray = ensureArray(group.edges); // (QueryEdge | IdReference)[]
        edgesArray.push(newEdge); // Add the new QueryEdge

        const groupToUpdate: QueryGroup = {
          ...group,
          edges: edgesArray, // Assign the updated array which now contains QueryEdge | IdReference
        };

        await em.saveOrUpdate(groupToUpdate);

        // Return the edge object we created and added
        // const finalRegister = new EntityRegister();
        // const updatedGroup = await em.get<QueryGroup>(groupId, finalRegister);
        // const createdEdge = ensureArray(updatedGroup?.edges as QueryEdge[] | undefined).find(e => e['@id'] === newEdgeId);
        // if (!createdEdge) {
        //     request.log.error(`Failed to retrieve edge ${newEdgeId} after creation in group ${groupId}`);
        //     return reply.code(500).send({ error: 'Failed to verify edge creation' });
        // }
        // return reply.code(201).send(createdEdge);

        return reply.code(201).send(newEdge);

      } catch (error: any) {
        request.log.error(error, `Error adding edge to QueryGroup ${groupId}`);
        return reply.code(500).send({ error: 'Internal Server Error: Could not add edge.' });
      }
    }
  );

  // PUT /api/queryGroups/{id}/edges/{edgeId} - Update an edge
  fastify.put<{ Params: EdgeRouteParams; Body: UpdateEdgeBody; Reply: QueryEdge | { error: string } }>( // Use EdgeRouteParams
    '/:id/edges/:edgeId',
    { schema: updateQueryGroupEdgeSchema },
    async (request, reply) => {
      const groupId = decodeURIComponent(request.params.id);
      const edgeIdSuffix = decodeURIComponent(request.params.edgeId);
      const updateData = request.body; // Type is UpdateEdgeBody
      let group: QueryGroup | undefined;

      try {
        const register = new EntityRegister();
        group = await em.get<QueryGroup>(groupId, register);

        if (!group || !isQueryGroup(group)) {
          return reply.code(404).send({ error: `QueryGroup with id ${groupId} not found` });
        }

        const edgesArray = ensureArray(group.edges); // (QueryEdge | IdReference)[]
        // Find index ensuring it's a full QueryEdge with a matching ID suffix
        const edgeIndex = edgesArray.findIndex(e =>
            isQueryEdge(e) && typeof e['@id'] === 'string' && e['@id'].endsWith(`/${edgeIdSuffix}`)
        );

        if (edgeIndex === -1) {
          return reply.code(404).send({ error: `Edge with id suffix ${edgeIdSuffix} not found in QueryGroup ${groupId}` });
        }

        // We know edgesArray[edgeIndex] is a QueryEdge because of findIndex condition
        const existingEdge = edgesArray[edgeIndex] as QueryEdge;

        // Validate node references if they are being updated
        if (updateData.fromNodeId || updateData.toNodeId) {
            const nodesArray = ensureArray(group.nodes); // (QueryNode | IdReference)[]
            // Get IDs only from full QueryNode objects
            const nodeIds = new Set(nodesArray.filter(isQueryNode).map(n => n['@id']));

            // Ensure the potential new IDs are strings before checking the Set
            const newFromNodeIdValue = updateData.fromNodeId ?? existingEdge.fromNodeId;
            const newToNodeIdValue = updateData.toNodeId ?? existingEdge.toNodeId;

            // These IDs *must* be strings in our context. Add checks or assertions.
            const newFromNodeId = typeof newFromNodeIdValue === 'string' ? newFromNodeIdValue : undefined;
            const newToNodeId = typeof newToNodeIdValue === 'string' ? newToNodeIdValue : undefined;

            if (!newFromNodeId || !newToNodeId) {
                 // This case should ideally be caught by schema validation if format: uri is strict enough,
                 // but adding a runtime check for safety.
                 return reply.code(400).send({ error: `Bad Request: fromNodeId and toNodeId must be valid string URIs.` });
            }

            // Check if new IDs exist in the group's nodes
            if (!nodeIds.has(newFromNodeId) || !nodeIds.has(newToNodeId)) {
                return reply.code(400).send({ error: `Bad Request: Updated fromNodeId (${newFromNodeId}) or toNodeId (${newToNodeId}) does not exist as a node in QueryGroup ${groupId}` });
            }
        }

        const updatedEdge: QueryEdge = {
          ...existingEdge, // Spread existing QueryEdge
          ...updateData,   // Spread validated update data (UpdateEdgeBody)
          '@id': existingEdge['@id'], // Preserve original ID
          '@type': 'QueryEdge',      // Preserve type
        };

        edgesArray[edgeIndex] = updatedEdge; // Update the array

        const groupToUpdate: QueryGroup = {
          ...group,
          edges: edgesArray, // Assign the updated array (still QueryEdge | IdReference)
        };

        await em.saveOrUpdate(groupToUpdate);

        // Return the updated edge object directly
        // const finalRegister = new EntityRegister();
        // const finalGroup = await em.get<QueryGroup>(groupId, finalRegister);
        // const returnedEdge = ensureArray(finalGroup?.edges as QueryEdge[] | undefined).find(e => e['@id'] === existingEdge['@id']);
        // if (!returnedEdge) {
        //     request.log.error(`Failed to retrieve edge ${existingEdge['@id']} after update in group ${groupId}`);
        //     return reply.code(500).send({ error: 'Failed to verify edge update' });
        // }
        // return reply.send(returnedEdge);

        return reply.send(updatedEdge); // Return the merged edge

      } catch (error: any) {
        request.log.error(error, `Error updating edge ${edgeIdSuffix} in QueryGroup ${groupId}`);
        return reply.code(500).send({ error: 'Internal Server Error: Could not update edge.' });
      }
    }
  );

  // DELETE /api/queryGroups/{id}/edges/{edgeId} - Delete an edge
  fastify.delete<{ Params: EdgeRouteParams; Reply: { error: string } | null }>( // Use EdgeRouteParams
    '/:id/edges/:edgeId',
    { schema: deleteQueryGroupEdgeSchema },
    async (request, reply) => {
      const groupId = decodeURIComponent(request.params.id);
      const edgeIdSuffix = decodeURIComponent(request.params.edgeId);
      let group: QueryGroup | undefined;

      try {
        const register = new EntityRegister();
        group = await em.get<QueryGroup>(groupId, register);

        if (!group || !isQueryGroup(group)) {
          // Idempotency: If group not found, consider it deleted.
          return reply.code(204).send();
        }

        const edgesArray = ensureArray(group.edges); // (QueryEdge | IdReference)[]
        // Find index ensuring it's a full QueryEdge with a matching ID suffix
        const edgeIndex = edgesArray.findIndex(e =>
            isQueryEdge(e) && typeof e['@id'] === 'string' && e['@id'].endsWith(`/${edgeIdSuffix}`)
        );

        if (edgeIndex === -1) {
          // Idempotency: If edge not found, consider it deleted.
          return reply.code(204).send();
        }

        // Remove the edge (works correctly on the (QueryEdge | IdReference)[])
        const updatedEdges = edgesArray.filter((_, index) => index !== edgeIndex);

        const groupToUpdate: QueryGroup = {
          ...group,
          // Assign updated array or undefined if empty
          edges: updatedEdges.length > 0 ? updatedEdges : undefined,
        };

        await em.saveOrUpdate(groupToUpdate); // Save the modified group

        return reply.code(204).send();

      } catch (error: any) {
        request.log.error(error, `Error deleting edge ${edgeIdSuffix} from QueryGroup ${groupId}`);
        return reply.code(500).send({ error: 'Internal Server Error: Could not delete edge.' });
      }
    }
  );

}
