# Progress Log

This file tracks the development progress, highlighting completed milestones and outlining remaining work.

## Current Status (as of 2025-04-20)

*   **Core Persistence Layer:**
    *   `EntityManager` implemented using `schema-dts.ts` types for RDF persistence.
    *   `rdf-mapper` handles object-to-RDF conversion using `jsonld-context.json`.
    *   Integration tests for `EntityManager` (CRUD) are passing.
    *   Unit tests for `rdf-mapper` cover core functionality and edge cases.
*   **Internal Backend Configuration:**
    *   `src/server/config.ts` updated to support different internal backend types (HTTP, Oxigraph-Memory) via `internalBackend` property.
    *   `HttpSparqlExecutor` constructor updated to accept simpler connection config (`HttpExecutorConfig`).
 *   **API Layer:**
     *   Fastify application setup (`src/index.ts`) initializes `EntityManager` based on configuration.
     *   **COMPLETE:** CRUD API routes for managing `Backend` entities implemented in `src/routes/backends.ts` and registered under `/api/backends`.
     *   **COMPLETE:** CRUD API routes for `StoredQuery` entities implemented (`src/routes/queries.ts`).
     *   **COMPLETE:** CRUD API routes for `Library` entities implemented (`src/routes/libraries.ts`).
     *   **COMPLETE:** CRUD API routes for `QueryGroup` entities implemented (`src/routes/queryGroups.ts`).
      *   **COMPLETE:** Initial `/api/execute` route implemented (`src/routes/execute.ts`) for `StoredQuery` execution.
      *   **COMPLETE:** Refactored argument handling in `/api/execute` to use `SparqlQueryParser.applyArguments` for safe injection via `VALUES ... { UNDEF }` pattern.
      *   **COMPLETE:** Enhanced `/api/execute` to dynamically instantiate `ISparqlExecutor` based on the target `Backend` entity's `backendType` property (e.g., 'HTTP'). Ontology updated (`sparql-query-lib.nt`), types regenerated (`schema-dts.ts`).
      *   **COMPLETE:** Refactored Fastify schemas: Extracted from individual route files (`src/routes/*.ts`) into a central file (`src/schemas.ts`). Updated routes and `src/index.ts` to import and register schemas globally.
     *   **COMPLETE:** Implemented Factory Pattern for entity creation (`StoredQuery`, `Library`, `Backend`) in `src/lib/factories.ts`. Refactored POST routes in `src/routes/*.ts` and creation schemas in `src/schemas.ts` accordingly.
 *   **Ontology:**
     *   **COMPLETE:** Added `backendType` property to `Backend` class in `src/ontology/sparql-query-lib.nt` to support different executor types.
 *   **Testing:**
     *   **COMPLETE:** Refactored `test/lib/parser.test.ts` into separate files per method (`parseQuery`, `detectVariables`, `detectQueryOutputs`, `applyArguments`). Updated `applyArguments` tests for new structure.
 *   **Cleanup:**
     *   Old file-based storage (`libraryStorage`, `backendStorage`) and related managers/routes removed or renamed (`.unused`).
    *   Obsolete test files related to the old system renamed (`.unused`).

*   **Query Chaining (Initial Steps):**
    *   **COMPLETE:** Created `src/lib/query-chaining.ts` with the `transformSparqlResultsToArguments` function. This function converts SPARQL JSON results (`{ head: { vars: [...] }, results: { bindings: [...] } }`) into the `ArgumentSet` format (`{ head: { vars: [...] }, arguments: [...] }`) expected by `parser.applyArguments`.
    *   **COMPLETE:** The `transformSparqlResultsToArguments` function correctly applies parameter name mappings (`fromParam` -> `toParam`) as defined in `QueryEdge` objects.
    *   **COMPLETE:** Added validation within `transformSparqlResultsToArguments` to ensure mappings reference existing source variables, target variable names are unique, and `fromParam`/`toParam` are simple strings.
    *   **COMPLETE:** Defined necessary TypeScript types (`SparqlValue`, `SparqlBinding`, `ArgumentSet`, `SparqlResultsJson`) within `src/lib/query-chaining.ts`, aligning with `src/schemas.ts` where applicable.
        *   *Note:* Initially attempted to derive types using TypeBox `Static`, but schemas in `src/schemas.ts` are plain objects (`as const`), requiring manual type definitions.
    *   **COMPLETE:** Created unit tests (`test/lib/query-chaining.test.ts`) for `transformSparqlResultsToArguments`, covering core functionality, mapping logic, and error handling. Tests are passing.

## What Works

*   Saving, retrieving, updating, and deleting `Backend` entity definitions via the `/api/backends` REST endpoint.
*   Core `EntityManager` functionality for persisting `schema-dts.ts` objects to a configured SPARQL endpoint (tested with HTTP).
*   Basic application startup, including CORS and Swagger setup.
*   Transformation of SPARQL results for query chaining (`transformSparqlResultsToArguments`).

## What's Left to Build / Next Steps

1.  **Query Execution Endpoint Enhancements:**
    *   **COMPLETE:** Implement dynamic instantiation of `ISparqlExecutor` based on `Backend.backendType` in `/api/execute`.
    *   **IN PROGRESS:** Implement execution orchestration logic for `QueryGroup` entities (e.g., `executeQueryGroup` method in `EntityManager`).
    *   Implement argument type validation within the execution orchestration logic (comparing transformed argument types against `StoredQuery.parameters[].allowedTypes`).
    *   Add support for `ASK` queries in `ISparqlExecutor` and `/api/execute`.
    *   Consider if `UPDATE` queries should be supported (potentially via a different endpoint).
2.  **Query Chaining (Continued):**
    *   Implement the `executeQueryGroup` method in `EntityManager` (or a dedicated executor class).
    *   Add integration tests for the full query chaining execution flow.
3.  **Data Model Refinement:**
    *   Refactor `StoredQuery` parameters: Rename properties within the parameter definition to `paramName` (for the variable name like `?user`) and `allowedTypes` (for the constraint, e.g., `uri`, `literal`), reflecting their nesting within `queryParameter`. *(Note: This seems partially done based on `src/schemas.ts`, but needs verification across types/factories)*.
4.  **Oxigraph Executor Implementation:**
    *   Fully implement `OxigraphSparqlExecutor.ts` to support `backendType: 'OxigraphMemory'`.
    *   Update `src/index.ts` to correctly instantiate it based on config.
5.  **Refinement & Error Handling:**
    *   Improve validation in API routes.
    *   Enhance error handling and logging, particularly for chaining failures.
    *   Add more comprehensive integration tests for the API routes, including chaining scenarios.
6.  **Documentation:**
    *   Expand API documentation (Swagger) to cover query group execution.
    *   Add usage examples for query chaining.

## Known Issues / TODOs

*   `OxigraphSparqlExecutor` is currently a placeholder.
*   `HttpSparqlExecutor` constructor in `src/index.ts` doesn't handle potential username/password from config yet.
*   `rdf-mapper` doesn't consistently preserve empty arrays during round-tripping (see TODO in `rdf-mapper.test.ts`).
*   Need a robust way to pass `EntityManager` to route plugins (currently passed via options, consider Fastify decorators).
