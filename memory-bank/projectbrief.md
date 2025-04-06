# Project Brief: SPARQL Query Library

## Overview

This project aims to create a high-performance, scalable SPARQL query library in TypeScript. It leverages `sparqljs` for parsing SPARQL queries and introduces novel mechanisms for query chaining and modularity. The library is designed to handle concurrent requests efficiently and provide a simple interface for complex data federation tasks.

## Core Features

1.  **SPARQL Parsing:** Utilizes `sparqljs` to parse SPARQL query strings into abstract syntax trees (ASTs).
2.  **Input Parameter Detection:** Identifies `VALUES` clauses containing at least one binding group (row) where *all* variables in that specific group are bound to `UNDEF`. This specific group acts as a placeholder for input parameters, allowing dynamic data injection at execution time while preserving other binding groups within the same `VALUES` clause. (e.g., `VALUES (?x ?y) { ("value1" "value2") (UNDEF UNDEF) }` would identify `?x` and `?y` as inputs based on the second group).
3.  **Output Variable Detection:** Automatically detects the output variables specified in a SPARQL query.
4.  **Query Chaining:** Enables linking multiple SPARQL queries together. The detected output variables of one query can serve as the detected input parameters for subsequent queries in the chain.
5.  **Backend Agnosticism:** Allows chained queries to be executed against different SPARQL endpoints (backends), facilitating data merging and federation across diverse triple stores.
6.  **Modularity:** Promotes breaking down complex data retrieval tasks into smaller, reusable query components.
7.  **REST API:** Provides a simple REST API using `undici` for executing stored queries and query chains.
8.  **RDF/JSON-LD Integration:** Uses `schema-dts` to generate TypeScript classes based on the custom ontology defined in `src/ontology/sparql-query-lib.nt`. These classes represent core library concepts (Queries, Libraries, Nodes, Edges, Backends). The `StoredQuery` class, for example, includes properties like `name`, `description`, and `query` (user-provided), alongside server-managed fields such as `id`, `type`, `parameters` (input variables, optionally user-provided or server-detected), `outputVars` (output variables, server-detected), `queryType`, `createdAt`, and `updatedAt`. The generated objects can be serialized to JSON-LD, enabling persistence in RDF triple stores and potential future querying of the library's structure itself.

## High-Level Goals & Principles

*   **Simplicity:** Strive for a clear and intuitive API for defining, chaining, and executing queries.
*   **Performance:** Optimize query execution and data handling for speed.
*   **Concurrency:** Design the library and its underlying architecture (e.g., the REST API) to handle thousands of user requests in parallel efficiently.
*   **Non-Blocking Operations:** Employ asynchronous patterns throughout the library to ensure non-blocking I/O and maximize throughput.

## Future Considerations

*   A separate UI project will be built to interact with this library's API.
*   The RDF representation of library components might enable querying the library's structure using SPARQL in the future, although this concept requires further exploration.
