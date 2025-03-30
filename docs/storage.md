# Storage Mechanism

This document outlines the storage mechanism used for managing SPARQL query libraries and backend endpoint configurations within the application.

## Overview

The application utilizes a file-system-based persistence strategy for both libraries/queries and backend endpoints. Data is stored in JSON format within the `src/server/` directory.

Two main storage classes handle the persistence:

1.  `FileSystemLibraryStorage` (manages `libraries.json`)
2.  `FileSystemBackendStorage` (manages `backends.json`)

Both implementations adhere to specific interfaces (`ILibraryStorage` and `IBackendStorage`) defining standard CRUD-like operations.

## Common Characteristics

-   **JSON Files:** Data is stored in human-readable JSON files (`libraries.json` for libraries and queries, `backends.json` for backend endpoints).
-   **Load/Save Strategy:** Both storage classes load the *entire* dataset from their respective JSON file into memory upon initialization and for most operations. When changes are made (add, update, delete), the *entire* modified dataset is written back to the file.
    -   *Note:* This approach is simple but can become inefficient for very large datasets.
-   **Backup Mechanism:** Before writing changes to the primary JSON file, a backup copy (e.g., `libraries.json.backup`) is created. If the write operation fails, an attempt is made to restore the data from the backup file to prevent data loss. The backup is deleted after a successful write.
-   **Error Handling:** Basic error handling is implemented for cases like the JSON file not being found (a default empty state is used) or encountering invalid JSON during parsing.
-   **ID Generation:** New libraries, queries, and backends are assigned a unique 8-character ID generated using `randomUUID()`.

## Library & Query Storage (`FileSystemLibraryStorage`)

-   **File:** `src/server/libraries.json`
-   **Structure:** Stores an array of `Library` objects. Each `Library` object contains metadata (name, description) and an array of `StoredQuery` objects.
-   **Query Details:** Each `StoredQuery` includes:
    -   `id`: Unique identifier.
    -   `name`: Human-readable name.
    -   `description`: Optional description.
    -   `query`: The raw SPARQL query string.
    -   `variables`: An array representing detected variables and their potential restrictions (used for UI generation). This is automatically detected using `SparqlQueryParser` if not present during loading or if the query text is updated.
    -   `createdAt`, `updatedAt`: Timestamps (stored as ISO strings in JSON).
-   **Operations:** Provides methods to get, add, update, and delete libraries and queries. Ensures library names are unique.

## Backend Endpoint Storage (`FileSystemBackendStorage`)

-   **File:** `src/server/backends.json`
-   **Structure:** Stores a JSON object with two keys:
    -   `currentBackend`: The `id` (string) of the currently active backend, or `null` if none is selected.
    -   `backends`: An array of `Backend` objects.
-   **Backend Details:** Each `Backend` object typically includes:
    -   `id`: Unique identifier.
    -   `name`: Human-readable name.
    -   `endpoint`: The URL of the SPARQL endpoint.
    -   (Other configuration details as needed, e.g., authentication type).
-   **Current Backend:** The concept of a "current" backend is managed both in memory (`currentBackendId` property) and persisted in the JSON file. Methods exist to get and set the current backend ID. Checks ensure the persisted `currentBackend` ID refers to an existing backend in the list.
-   **Operations:** Provides methods to get, add, update, and delete backend configurations.

## Interfaces

The storage logic is abstracted behind interfaces:

-   `ILibraryStorage`: Defines the contract for library and query persistence.
-   `IBackendStorage`: Defines the contract for backend endpoint persistence.

This allows for potential future replacement of the file-system storage with other implementations (e.g., a database) without changing the core application logic that interacts with these interfaces.

## Extensibility

The use of the `ILibraryStorage` and `IBackendStorage` interfaces is key to the system's extensibility. To add support for a different storage backend (e.g., a relational database, a NoSQL database, cloud storage), you would:

1.  Create a new class that implements the relevant interface (e.g., `CosmosDbLibraryStorage implements ILibraryStorage`).
2.  Implement all the methods defined in the interface using the specific API or SDK of the target storage system.
3.  Update the application's configuration or dependency injection mechanism to instantiate and use the new storage class instead of `FileSystemLibraryStorage` or `FileSystemBackendStorage`.

As long as the new class correctly fulfills the contract defined by the interface, the rest of the application that depends on these interfaces will function without modification.

## Limitations of Current JSON Storage

While the file-system JSON storage is simple to implement initially, it has significant drawbacks, particularly as the application scales or requires more robust data management:

-   **Performance:** Loading and rewriting the entire JSON file for every modification becomes inefficient with larger datasets, leading to performance degradation.
-   **Concurrency:** Safely handling simultaneous writes from multiple users or processes is difficult and prone to race conditions, potentially leading to data loss or corruption despite the backup mechanism.
-   **Querying:** Finding specific items requires loading the entire dataset into memory and performing searches manually (e.g., using array methods). Databases offer indexing for much faster lookups.
-   **Data Integrity:** JSON provides no built-in mechanisms for enforcing data types, relationships (e.g., ensuring a query belongs to an existing library), or constraints, increasing the risk of inconsistent data.

## Future Storage Considerations: Relational vs. RDF

Given these limitations, moving to a more robust storage backend is recommended for production or scaled use. The interface-based design facilitates this. Two primary directions include:

1.  **Relational Databases (e.g., SQLite, PostgreSQL):**
    -   **Pros:** Mature technology, strong data integrity through schemas and constraints, powerful querying with SQL, good performance and concurrency. SQLite offers a simple file-based option suitable as a direct replacement.
    -   **Cons:** Requires mapping the object model to relational tables.

2.  **RDF Stores (e.g., Oxigraph, Apache Jena, RDF4J):**
    -   **Pros:**
        -   **Conceptual Alignment:** Storing metadata about SPARQL libraries and queries *as* RDF triples aligns naturally with the application's domain.
        -   **Native SPARQL Querying:** The metadata itself could be queried using SPARQL, potentially unifying query mechanisms.
        -   **Flexibility:** RDF's graph model is highly flexible.
        -   **Embedded Options:** Stores like Oxigraph can run embedded (similar to SQLite), storing data in a local file or in memory.
    -   **Cons:**
        -   **Mapping Overhead:** Requires defining vocabularies/ontologies and implementing logic to map TypeScript objects to RDF triples and back (an Object-RDF Mapping layer).
        -   **Learning Curve:** May require familiarity with RDF data modeling and SPARQL update queries if not already possessed.

Choosing an RDF store like Oxigraph is a particularly compelling option for this application, allowing metadata management using the same core technologies (RDF/SPARQL) used for the primary data querying. This would involve implementing the `ILibraryStorage` and `IBackendStorage` interfaces using an RDF library and SPARQL queries against a dedicated metadata graph or dataset within the RDF store.
