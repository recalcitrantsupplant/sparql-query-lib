# System Patterns

This document describes the high-level architecture, key technical decisions, and design patterns used in the `sparql-query-lib`.

## Core Architecture

The library has two distinct concepts related to SPARQL backends:

1.  **Internal Persistence Backend:**
    *   This is a single SPARQL endpoint (e.g., a dedicated Fuseki, Oxigraph, or GraphDB instance) used by the library itself to store its own configuration and data.
    *   Entities like `StoredQuery`, `Library`, `Backend` definitions, `QueryGroup`, etc. (defined in `src/types/schema-dts.ts`) are persisted here as RDF data.
    *   The `EntityManager` (`src/lib/EntityManager.ts`) handles saving, loading, and deleting these internal entities to/from this specific backend via an `ISparqlExecutor` instance configured for it.
    *   This backend acts as the library's internal database.

## StoredQuery Entity and API

The `StoredQuery` entity represents a SPARQL query saved within the library. It allows users to store, manage, and execute predefined queries.

### Entity Schema (`StoredQuery`)

The core fields of a `StoredQuery` entity stored in the Internal Persistence Backend are:

*   **`id`**: (Server-Generated) A unique identifier for the query (e.g., namespaced UUID).
*   **`type`**: (Server-Generated) The RDF type, typically `StoredQuery`.
*   **`name`**: (User-Provided, Required) A human-readable name for the query.
*   **`description`**: (User-Provided, Optional) A longer description of the query's purpose.
*   **`query`**: (User-Provided, Required) The raw SPARQL query string.
*   **`parameters`**: (User-Provided, Optional / Server-Generated) Defines the expected input variables for parameterized queries. If provided by the user during creation/update, it must follow the structure below. If *not* provided, the server attempts to automatically detect parameters from `VALUES ... { UNDEF }` clauses in the `query` string.
*   **`outputVars`**: (Server-Generated) An array of variable names expected in the query results (e.g., extracted from the `SELECT` clause).
*   **`queryType`**: (Server-Generated) The type of SPARQL query (e.g., `SELECT`, `CONSTRUCT`, `UPDATE`, `ASK`). Determined by parsing the `query` string.
*   **`createdAt`**: (Server-Generated) Timestamp of when the query was first created.
*   **`updatedAt`**: (Server-Generated) Timestamp of the last modification.

### API Interaction (POST/PUT `/api/queries`)

Users create or update `StoredQuery` entities via `POST` or `PUT` requests to the `/api/queries` endpoint.

**Request Body Schema:**

When submitting a query, the user provides a JSON object containing:

*   `name`: (Required) String.
*   `query`: (Required) String containing the SPARQL query.
*   `description`: (Optional) String.
*   `parameters`: (Optional) An array defining input variables. If omitted, the server will attempt auto-detection. The structure for each element in the array follows this pattern:

    ```json
    {
      "vars": {
        "variableName1": { // The actual variable name used in the SPARQL query (without '?')
          "type": ["uri" | "literal"] // Allowed RDF term types
        },
        "variableName2": {
          "type": ["uri" | "literal"]
        }
        // ... more variables in this group
      }
    }
    // ... more groups if the query uses multiple VALUES clauses for parameters
    ```

    *Example Structure:*

    ```json
    "parameters": [
      {
        "vars": {
          "pred": { "type": ["uri", "literal"] }
        }
      },
      {
        "vars": {
          "sub": { "type": ["uri", "literal"] },
          "obj": { "type": ["uri", "literal"] }
        }
      }
    ]
    ```

**Server Handling:**

*   Upon receiving a `POST` or `PUT` request, the server validates the input.
*   It generates the `id` (for `POST`), `type`, `outputVars`, `queryType`, `createdAt`, and `updatedAt` fields.
*   If `parameters` are not provided in the request, the server parses the `query` string to detect them based on the `VALUES ... { UNDEF }` pattern.
*   The complete `StoredQuery` entity is then saved to the Internal Persistence Backend using the `EntityManager`.

## Parameterized Queries (`StoredQuery` with Runtime Arguments)

To execute a `StoredQuery` with runtime arguments supplied via the `/api/execute` endpoint, the query string *must* use the `VALUES` clause with an `UNDEF` row for each group of parameters.

**Example:**

A query expecting a `?name` and `?age` argument should include:

```sparql
SELECT ?person WHERE {
  VALUES (?name ?age) { (UNDEF UNDEF) } # Arguments injected here
  ?person foaf:name ?name ;
          foaf:age ?age .
}
```

The `/api/execute` endpoint uses `SparqlQueryParser.applyArguments` (which leverages `sparqljs`) to find these `VALUES ... { UNDEF }` clauses and safely replace the `UNDEF` row with the provided runtime arguments. The arguments must be supplied in the request body in an array format matching the structure expected by `applyArguments` (an array of objects, each with `head.vars` and `arguments` properties).

**Multiple Parameter Sets:** If a query requires multiple sets of arguments (e.g., for different parts of the query), multiple `VALUES ... { UNDEF }` clauses should be used, and the `arguments` array in the request body must contain corresponding argument sets in the same order.

**Example:**

```sparql
SELECT ?s ?o WHERE {
  VALUES ?p1 { UNDEF } # First argument set
  VALUES ?p2 { UNDEF } # Second argument set

  { ?s ?p1 ?o . }
  UNION
  { ?s ?p2 ?o . }
}
```

The corresponding `arguments` array in the request would be:

```json
[
  { "head": { "vars": ["p1"] }, "arguments": [{ "p1": { "type": "uri", "value": "http://example.org/prop1" } }] },
  { "head": { "vars": ["p2"] }, "arguments": [{ "p2": { "type": "uri", "value": "http://example.org/prop2" } }] }
]
```

This pattern ensures that argument injection is handled robustly by parsing the query structure, rather than relying on potentially unsafe string manipulation.

2.  **External Query Execution Backends:**
    *   These are the SPARQL endpoints against which the user wants to execute the queries stored within the library.
    *   The definitions of these external backends are stored *in* the Internal Persistence Backend (as `Backend` entities).
    *   When a user requests query execution via the library's API, they specify which *External* Backend definition to use.
    *   The library then uses the details from the specified `Backend` entity (e.g., endpoint URL, authentication) to create an appropriate `ISparqlExecutor` instance on-the-fly and execute the `StoredQuery` against that target external endpoint.

## Key Components

*   **`schema-dts.ts`:** Defines the TypeScript types for the library's internal entities (Queries, Libraries, Backend definitions, etc.) based on the project's ontology.
*   **`EntityManager.ts`:** Responsible for CRUD operations of internal entities against the Internal Persistence Backend. Uses `rdf-mapper.ts` for object-to-RDF conversion.
*   **`ISparqlExecutor.ts`:** Interface defining methods for interacting with *any* SPARQL endpoint (query, update, construct). Implementations exist for HTTP (`HttpSparqlExecutor.ts`) and potentially others (e.g., `OxigraphSparqlExecutor.ts`).
*   **API Routes (e.g., `src/routes/backends.ts`):** Expose functionality via a REST API (Fastify). Routes interact with `EntityManager` to manage internal entities and use `ISparqlExecutor` instances to execute queries against External Backends.

## Data Flow Example (Query Execution)

1.  User sends API request: `POST /execute/my-query-id?backend=external-backend-id`
2.  API route retrieves `StoredQuery` (`my-query-id`) using `EntityManager` (from Internal Backend).
3.  API route retrieves `Backend` definition (`external-backend-id`) using `EntityManager` (from Internal Backend).
4.  API route uses details from the `Backend` definition to instantiate an `ISparqlExecutor` (e.g., `HttpSparqlExecutor`) configured for the *External* Backend.
5.  API route uses the instantiated executor to run the `StoredQuery`'s SPARQL string against the *External* Backend.
6.  Results from the *External* Backend are returned to the user via the API response.
