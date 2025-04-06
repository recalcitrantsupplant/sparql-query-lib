# Codebase Status: Manual Types vs. Generated Types (schema-dts.ts)

This document outlines the status of key files regarding their usage of the old manual type definitions (previously in `src/types.ts`, now `src/types.manual.ts.unused`) versus the new generated types based on the ontology (`src/types/schema-dts.ts`).

**Goal:** Transition fully to the generated types (`schema-dts.ts`) for entities managed via JSON-LD and `EntityManager`.

**Key Type Files:**

*   `src/types.manual.ts.unused`: **OLD** - Contains the previous manual TypeScript interfaces. Renamed to avoid conflicts. Should eventually be removed.
*   `src/types/schema-dts.ts`: **NEW** - Contains the TypeScript interfaces generated from the ontology (`src/ontology/sparql-query-lib.nt`). This is the target type system for RDF/JSON-LD entities.

**File Status:**

*   **Core RDF/JSON-LD Handling:**
    *   `src/lib/jsonld-context.json`: **NEW** - Defines the JSON-LD context used for mapping. Updated to align with ontology.
    *   `src/lib/rdf-mapper.ts`: **NEW** - Uses `schema-dts.ts` types (`Thing`) and `jsonld-context.json` for conversion.
    *   `src/lib/EntityManager.ts`: **NEW** - Uses `schema-dts.ts` types (`Thing`), `rdf-mapper.ts`, and `ISparqlExecutor`. Core component for the new persistence approach. Tested successfully for create/read/update/delete.
    *   `src/lib/entity-register.ts`: **NEW** - Used by `rdf-mapper.ts` for object reconstruction. Seems compatible with the new types.
    *   `src/lib/factories.ts`: **NEW/UPDATED** - Implements factory functions (`createStoredQuery`, `createLibrary`, `createBackend`) for generating entities with server-side fields (`@id`, `@type`, timestamps, derived fields). Uses `schema-dts.ts` types for return values and plain string types for inputs.

*   **SPARQL Execution:**
    *   `src/server/ISparqlExecutor.ts`: **NEUTRAL** - Defines the executor interface.
    *   `src/server/HttpSparqlExecutor.ts`: **UPDATED** - Constructor now accepts a simpler `HttpExecutorConfig` (URLs, optional credentials) instead of a full `Backend` object. Used for internal persistence connection.
    *   `src/server/OxigraphSparqlExecutor.ts`: **NEUTRAL/INCOMPLETE** - Implements `ISparqlExecutor` but is largely placeholder code. Needs proper implementation and constructor for in-memory store.

*   **Configuration:**
    *   `src/server/config.ts`: **UPDATED** - Configuration now defines `internalBackend` with a type (`http` or `oxigraph-memory`) and corresponding connection details (URLs or dbPath). Obsolete file paths removed.

*   **Storage / Management (Old System - Renamed):**
    *   `src/server/libraryStorage.ts`: **OLD/REMOVED** - Implemented file-based storage for libraries/queries using the *old* manual types. Has been deleted.
    *   `src/server/backendStorage.ts.unused`: **OLD/RENAMED** - Previously updated to use `Backend` from `schema-dts.ts` but retained old file-based storage logic. Renamed as it's superseded by `EntityManager`.
    *   `src/server/libraryManager.ts.unused`: **OLD/RENAMED** - Previously depended on `libraryStorage`. Renamed as it needs complete refactoring for `EntityManager`.

*   **API Routes:**
    *   `src/routes/backends.ts`: **UPDATED** - Implements CRUD operations for `Backend` entities using `EntityManager`. POST route now uses `createBackend` factory.
    *   `src/routes/libraries.ts`: **UPDATED** - Implements CRUD operations for `Library` entities using `EntityManager`. POST route now uses `createLibrary` factory.
    *   `src/routes/queries.ts`: **UPDATED** - Implements CRUD operations for `StoredQuery` entities using `EntityManager`. POST route now uses `createStoredQuery` factory. PUT route retains parser logic for updates.
    *   `src/routes/queryGroups.ts`: **NEW** - Implements CRUD operations for `QueryGroup` entities using `EntityManager`. (Note: Factory pattern not yet applied here).
    *   `src/routes/execute.ts`: **UPDATED** - Implements query execution. Uses `EntityManager` to fetch entities.
    *   `src/server/libraries.ts.unused`: **OLD/RENAMED** - Depended on `libraryManager`. Renamed.
    *   `src/server/query.ts.unused`: **OLD/RENAMED** - Depended on `libraryManager` and `backendStorage`. Renamed.
    *   `src/server/backend.ts.unused`: **OLD/RENAMED** - Depended on `backendStorage`. Renamed.

*   **Application Entry Point:**
    *   `src/index.ts`: **UPDATED** - Instantiates the internal `ISparqlExecutor` and `EntityManager` based on `config.internalBackend`. Registers the new `/api/backends` routes. Old dependencies removed.

*   **Tests:**
    *   `test/lib/EntityManager.integration.test.ts`: **NEW/PASSING** - Successfully tests `EntityManager` using `schema-dts.ts` types against a live triplestore.
    *   `test/lib/rdf-mapper.test.ts`: **NEW/PASSING** - Tests the `objectToRdfString` and `rdfStringToObject` functions with `schema-dts.ts` types, including linked objects and edge cases.
    *   **Obsolete Tests (Renamed):** Tests related to the old file-based storage system and manual types (`types.ts`) have been renamed with a `.unused` suffix to avoid compilation errors and indicate they are no longer relevant (`test/server/sparqlClient.test.ts.unused`, `test/lib/parser.test.ts.unused`, `test/index.test.ts.unused`, `test/server/backend.test.ts.unused`, `test/server/library.test.ts.unused`, `test/server/query.test.ts.unused`).

**Summary & Next Steps:**

1.  The core `EntityManager` persistence mechanism using generated types is **functional and tested**.
2.  The old file-based storage system (`libraryStorage`, `backendStorage`) and the managers/routes relying on it (`libraryManager`, `libraries`, `query`, `backend`) have been **renamed (`.unused`) or removed**.
3.  `index.ts` has been updated to instantiate the `EntityManager` with the configured internal backend executor and register the new backend API routes.
4.  The API routes for managing `Backend` entities (`/api/backends`) are **implemented and functional**.
5.  The API routes for `StoredQuery`, `Library`, and `Backend` now use the factory pattern for creation.
6.  The next logical step could be applying the factory pattern to `QueryGroup` creation or focusing on other areas like `OxigraphSparqlExecutor` implementation or `/api/execute` enhancements.

**Files Renamed (.unused):**

*   `src/types.manual.ts.unused`
*   `src/server/libraryManager.ts.unused`
*   `src/server/libraries.ts.unused`
*   `src/server/query.ts.unused`
*   `src/server/backendStorage.ts.unused`
*   `src/server/backend.ts.unused`
*   `test/server/sparqlClient.test.ts.unused`
*   `test/lib/parser.test.ts.unused`
*   `test/index.test.ts.unused`
*   `test/server/backend.test.ts.unused`
*   `test/server/library.test.ts.unused`
*   `test/server/query.test.ts.unused`
