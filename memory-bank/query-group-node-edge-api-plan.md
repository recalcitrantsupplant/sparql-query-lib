# Plan for Adding Query Group Node/Edge API Endpoints

This plan outlines the steps required to add API endpoints for managing nodes and edges within Query Groups.

**Schema Confirmation:**

The existing schema definition in `src/types/schema-dts.ts` supports the concept of nodes and edges within a `QueryGroup`.
*   The `QueryGroup` type has optional `nodes` and `edges` properties (`SchemaValue<QueryNode | IdReference>` and `SchemaValue<QueryEdge | IdReference>`).
*   `SchemaValue<T>` allows for single objects or arrays (`readonly T[]`).
*   `QueryNode` and `QueryEdge` types define the structure for individual nodes and edges.

**Implementation Steps:**

1.  **Define API Routes (`src/routes/queryGroups.ts`):**
    *   Add route handlers for:
        *   `POST /api/queryGroups/{id}/nodes` (Add Node)
        *   `PUT /api/queryGroups/{id}/nodes/{nodeId}` (Update Node)
        *   `DELETE /api/queryGroups/{id}/nodes/{nodeId}` (Remove Node)
        *   `POST /api/queryGroups/{id}/edges` (Add Edge)
        *   `PUT /api/queryGroups/{id}/edges/{edgeId}` (Update Edge)
        *   `DELETE /api/queryGroups/{id}/edges/{edgeId}` (Remove Edge)
    *   Use Fastify's route definition syntax, specifying method, URL pattern, and handler functions.

2.  **Define Request/Response Schemas (`src/schemas.ts`):**
    *   Create Zod schemas for request bodies (POST/PUT) for nodes and edges, aligning with `QueryNode` and `QueryEdge` types.
    *   Define Zod schemas for URL parameters (`id`, `nodeId`, `edgeId`).
    *   Define response schemas for successful operations (created/updated objects, success status).

3.  **Implement Handler Logic (`src/routes/queryGroups.ts`):**
    *   **Common:**
        *   Fetch the `QueryGroup` using `EntityManager` based on `:id`.
        *   Handle group not found (404).
    *   **POST (Add Node/Edge):**
        *   Validate request body.
        *   Generate a unique `@id` for the new node/edge (e.g., `queryGroups/{groupId}/nodes/{newNodeId}`).
        *   Append the new object to the `nodes`/`edges` array (create array if needed).
        *   Save the modified `QueryGroup` via `entityManager.update`.
        *   Return the created object (status 201).
    *   **PUT (Update Node/Edge):**
        *   Validate request body.
        *   Find the node/edge by `:nodeId`/`:edgeId`. Handle not found (404).
        *   Merge request data into the found object, preserving `@id`.
        *   Save the modified `QueryGroup`.
        *   Return the updated object (status 200).
    *   **DELETE (Remove Node/Edge):**
        *   Find the node/edge index by `:nodeId`/`:edgeId`. Handle not found (404).
        *   Remove the object from the `nodes`/`edges` array.
        *   **Crucial:** If deleting a node, also remove any edges connected to it (`fromNodeId` or `toNodeId`).
        *   Save the modified `QueryGroup`.
        *   Return success (status 204 No Content).

4.  **Testing (`test/routes/queryGroups.test.ts`):**
    *   Add tests covering:
        *   Successful add, update, delete for nodes and edges.
        *   Verification that deleting a node removes associated edges.
        *   Error handling (group not found, node/edge not found, invalid data).
