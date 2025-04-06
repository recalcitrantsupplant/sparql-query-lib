import { EntityManager } from '../../src/lib/EntityManager';
import { HttpSparqlExecutor } from '../../src/server/HttpSparqlExecutor';
import { EntityRegister } from '../../src/lib/entity-register';
import type { StoredQuery } from '../../src/types/schema-dts'; // Using StoredQuery type

// Define schema.org constants locally
const SCHEMA_DATE_CREATED = 'http://schema.org/dateCreated';
const SCHEMA_DATE_MODIFIED = 'http://schema.org/dateModified';

// Define the SPARQL endpoint for the test triplestore
// Assuming a single endpoint handles both query (GET) and update (POST)
const SPARQL_ENDPOINT = 'http://localhost:3031/testing123/sparql'; 

describe('EntityManager Integration Test with schema-dts types', () => {
  let entityManager: EntityManager;
  let register: EntityRegister; // Renamed for consistency within tests
  let testQuery: StoredQuery;
  // Base object for creating test entities - omit @id and timestamps, but keep @type
  let testEntityBase: Omit<StoredQuery, '@id' | typeof SCHEMA_DATE_CREATED | typeof SCHEMA_DATE_MODIFIED>;
  const baseIdNamespace = 'http://example.org/test-query'; // Namespace for test IDs

  beforeAll(() => {
    // Create a simple configuration object matching HttpExecutorConfig
    // Use the single endpoint for both query and update URLs
    const executorConfig = {
        queryUrl: SPARQL_ENDPOINT, 
        updateUrl: SPARQL_ENDPOINT 
        // Add username/password here if your test endpoint requires them
    };

    // Configure the executor with the simple config object
    const executor = new HttpSparqlExecutor(executorConfig);
    entityManager = new EntityManager(executor);
    register = new EntityRegister(); // Create a fresh register for each test suite run

    // Define the base structure for test entities
    testEntityBase = {
      '@type': 'StoredQuery', // Explicitly set the type
      name: 'Base Test Query Name',
      description: 'A base query for integration testing.',
      query: 'SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 1',
      queryType: 'SELECT',
    };

    // Create a specific test StoredQuery instance for some tests
    const testQueryId = `${baseIdNamespace}/${Date.now()}`; // Unique ID for this specific query
    testQuery = {
      ...testEntityBase,
      '@id': testQueryId,
      '@type': 'StoredQuery', // Explicitly set the type
      name: 'Test Query Name',
      description: 'A query for integration testing.',
      query: 'SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10',
      queryType: 'SELECT',
      [SCHEMA_DATE_CREATED]: new Date().toISOString(), // Use local constant
    };
  });

  // Use beforeEach to ensure a clean register for each test
  beforeEach(() => {
    register = new EntityRegister();
  });

  // Re-enabled cleanup - Note: This only cleans up the specific 'testQuery' created in beforeAll.
  // Tests creating their own IDs might leave data behind if they fail before cleanup.
  // Consider a more robust cleanup strategy if needed (e.g., deleting by type or pattern).
  afterAll(async () => {
    // Clean up the specific test data created in beforeAll
    if (testQuery && testQuery['@id']) {
      try {
        await entityManager.delete(testQuery['@id']);
        console.log(`Cleaned up main test data for ID: ${testQuery['@id']}`);
      } catch (error) {
        console.error(`Failed to clean up main test data for ID: ${testQuery['@id']}`, error);
        // Don't fail the test suite if cleanup fails, but log it
      }
    } else {
       console.warn("Could not clean up main test data: testQuery or its ID is missing.");
    }
  });

    it('should delete an existing StoredQuery entity', async () => {
        const testId = `${baseIdNamespace}/${Date.now()}`; // Use base namespace
        const entityToSave: StoredQuery = {
            ...testEntityBase,
            '@id': testId,
            '@type': 'StoredQuery', // Ensure @type is present
            [SCHEMA_DATE_CREATED]: new Date().toISOString(), // Use local constant
        };

        // Save the entity first
        await entityManager.saveOrUpdate(entityToSave);
        console.log(`Saved entity for deletion test: ${testId}`);

        // Verify it exists (using the 'register' from beforeEach)
        let retrievedBeforeDelete = await entityManager.get<StoredQuery>(testId, register);
        expect(retrievedBeforeDelete).toBeDefined();
        expect(retrievedBeforeDelete?.['@id']).toBe(testId);

        // Delete the entity
        await entityManager.delete(testId);
        console.log(`Deleted entity: ${testId}`);

        // Verify it's gone (use a fresh register or clear the existing one)
        register.clear(); // Clear register to ensure fresh fetch from DB
        let retrievedAfterDelete = await entityManager.get<StoredQuery>(testId, register);
        expect(retrievedAfterDelete).toBeUndefined();

        // Optional: Clean up this specific test's data immediately
        // await entityManager.delete(testId); // Already deleted, but good practice if test failed before delete step
    });

    it('should not throw an error when deleting a non-existent entity', async () => {
        const nonExistentId = `${baseIdNamespace}/non-existent-${Date.now()}`; // Use base namespace

        // Attempt to delete
        await expect(entityManager.delete(nonExistentId)).resolves.not.toThrow();

        // Verify it still doesn't exist (optional sanity check, use fresh register)
        register.clear();
        let retrieved = await entityManager.get<StoredQuery>(nonExistentId, register);
        expect(retrieved).toBeUndefined();
    });

  // --- Existing Tests (adjusted to use 'register' and potentially 'baseIdNamespace') ---

  it('should save and retrieve a StoredQuery entity', async () => {
    // Use the 'testQuery' defined in beforeAll for this specific test
    const currentTestQueryId = testQuery['@id']; // Get the ID from the pre-defined query
    if (!currentTestQueryId) throw new Error("Test query ID is missing in 'should save and retrieve'");

    // Save the entity
    await entityManager.saveOrUpdate(testQuery);
    console.log(`Saved entity with ID: ${currentTestQueryId}`);

    // Retrieve the entity by ID using the 'register' from beforeEach
    const retrievedQuery = await entityManager.get<StoredQuery>(currentTestQueryId, register);
    console.log(`Retrieved entity:`, retrievedQuery);

    // Assertions
    expect(retrievedQuery).not.toBeNull();
    expect(retrievedQuery).toBeDefined();
    expect(retrievedQuery?.['@id']).toBe(currentTestQueryId);
    expect(retrievedQuery?.['@type']).toBe(testQuery['@type']);
    expect(retrievedQuery?.name).toBe(testQuery.name);
    expect(retrievedQuery?.description).toBe(testQuery.description);
    expect(retrievedQuery?.query).toBe(testQuery.query);
    expect(retrievedQuery?.queryType).toBe(testQuery.queryType);
    expect(retrievedQuery?.[SCHEMA_DATE_CREATED]).toBeDefined(); // Check local constant
    // Optionally compare dates more robustly
    // expect(new Date(retrievedQuery?.[SCHEMA_DATE_CREATED] ?? '')).toEqual(new Date(testQuery[SCHEMA_DATE_CREATED] ?? ''));
  });

  it('should return undefined when getting a non-existent entity', async () => {
    const nonExistentId = `${baseIdNamespace}/nonexistent-${Date.now()}`; // Use base namespace
    // Uses the 'register' from beforeEach
    const retrievedQuery = await entityManager.get<StoredQuery>(nonExistentId, register);
    expect(retrievedQuery).toBeUndefined();
  });

  it('should update an existing StoredQuery entity', async () => {
    // Use the 'testQuery' defined in beforeAll for this specific test
    const currentTestQueryId = testQuery['@id'];
    if (!currentTestQueryId) throw new Error("Test query ID is missing in 'should update'");

    // 1. Ensure the initial entity exists (or save it if this test runs independently)
    // For safety, we save it here again, saveOrUpdate handles existing entities.
    await entityManager.saveOrUpdate(testQuery);

    // 2. Create modified version
    const modifiedQuery: StoredQuery = {
      ...testQuery, // Copy existing data from the one defined in beforeAll
      name: 'Updated Test Query Name', // Change name
      description: 'Updated description.', // Change description
      // saveOrUpdate will add/update the updatedAt timestamp automatically
    };

    // 3. Call saveOrUpdate again with the modified object (same @id)
    await entityManager.saveOrUpdate(modifiedQuery);
    console.log(`Updated entity with ID: ${currentTestQueryId}`);

    // 4. Retrieve the entity again using the 'register' from beforeEach
    const retrievedAfterUpdate = await entityManager.get<StoredQuery>(currentTestQueryId, register);
    console.log(`Retrieved entity after update:`, retrievedAfterUpdate);

    // 5. Assertions - should match the modified version
    expect(retrievedAfterUpdate).not.toBeNull();
    expect(retrievedAfterUpdate).toBeDefined();
    expect(retrievedAfterUpdate?.['@id']).toBe(currentTestQueryId);
    expect(retrievedAfterUpdate?.['@type']).toBe(testQuery['@type']);
    expect(retrievedAfterUpdate?.name).toBe(modifiedQuery.name); // Check updated name
    expect(retrievedAfterUpdate?.description).toBe(modifiedQuery.description); // Check updated description
    expect(retrievedAfterUpdate?.query).toBe(testQuery.query); // Query text should be unchanged
    expect(retrievedAfterUpdate?.queryType).toBe(testQuery.queryType); // Type should be unchanged
    expect(retrievedAfterUpdate?.[SCHEMA_DATE_CREATED]).toBeDefined(); // Original creation date should still exist
    expect(retrievedAfterUpdate?.[SCHEMA_DATE_MODIFIED]).toBeDefined(); // Update date should exist
    // Check that updatedAt is different from createdAt (or more recent)
    // Ensure the values are strings before passing to new Date()
    const updatedAtString = String(retrievedAfterUpdate?.[SCHEMA_DATE_MODIFIED] ?? ''); // Use local constant
    const createdAtString = String(retrievedAfterUpdate?.[SCHEMA_DATE_CREATED] ?? ''); // Use local constant
    expect(new Date(updatedAtString).getTime()).toBeGreaterThan(new Date(createdAtString).getTime());
  });

  it('should correctly round-trip a StoredQuery entity', async () => {
    const roundTripId = `${baseIdNamespace}/roundtrip-${Date.now()}`;
    const originalQuery: StoredQuery = {
        '@id': roundTripId,
        '@type': 'StoredQuery',
        name: 'Round Trip Test Query',
        description: 'A query specifically for testing persistence and retrieval accuracy, including special chars like < > & " \' \n and maybe some unicode 😊.',
        query: `PREFIX schema: <http://schema.org/>
SELECT ?name ?created
WHERE {
  ?query a schema:StoredQuery ;
         schema:name ?name ;
         schema:dateCreated ?created .
  FILTER(CONTAINS(?name, "Test"))
}
ORDER BY DESC(?created)
LIMIT 5`,
        queryType: 'SELECT',
        // We don't set dateCreated here; saveOrUpdate should handle it.
    };

    // 1. Save the entity
    await entityManager.saveOrUpdate(originalQuery);
    console.log(`Saved entity for round-trip test: ${roundTripId}`);

    // 2. Retrieve the entity (use a fresh register to ensure DB fetch)
    register.clear();
    const retrievedQuery = await entityManager.get<StoredQuery>(roundTripId, register);
    console.log(`Retrieved entity for round-trip test:`, retrievedQuery);

    // 3. Assertions
    expect(retrievedQuery).toBeDefined();
    expect(retrievedQuery).not.toBeNull();

    // Check core properties match exactly
    expect(retrievedQuery?.['@id']).toBe(originalQuery['@id']);
    expect(retrievedQuery?.['@type']).toBe(originalQuery['@type']);
    expect(retrievedQuery?.name).toBe(originalQuery.name);
    expect(retrievedQuery?.description).toBe(originalQuery.description);
    // Normalize whitespace in query strings for comparison, as RDF serialization might alter it slightly
    const normalize = (str: string | undefined) => str?.replace(/\s+/g, ' ').trim();
    // Ensure both original and retrieved queries are treated as strings for normalization
    expect(normalize(retrievedQuery?.query as string)).toBe(normalize(originalQuery.query as string));
    expect(retrievedQuery?.queryType).toBe(originalQuery.queryType);

    // Check timestamps - dateCreated should exist
    expect(retrievedQuery?.[SCHEMA_DATE_CREATED]).toBeDefined();
    expect(typeof retrievedQuery?.[SCHEMA_DATE_CREATED]).toBe('string'); // Should be ISO string

    // dateModified might or might not be set on initial creation depending on implementation details
    // If it is set, it should be a string. If not, this check is skipped.
    if (retrievedQuery?.[SCHEMA_DATE_MODIFIED]) {
        expect(typeof retrievedQuery?.[SCHEMA_DATE_MODIFIED]).toBe('string');
    }

    // 4. Cleanup
    await entityManager.delete(roundTripId);
    console.log(`Cleaned up entity for round-trip test: ${roundTripId}`);
  });


  // --- Tests for loadAll ---

  it('should load all StoredQuery entities from the store', async () => {
    // 1. Create and save multiple entities
    const entity1Id = `${baseIdNamespace}/loadAll-1-${Date.now()}`;
    const entity1: StoredQuery = {
      ...testEntityBase,
      '@id': entity1Id,
      '@type': 'StoredQuery', // Ensure @type is present
      name: 'LoadAll Test Query 1',
      [SCHEMA_DATE_CREATED]: new Date().toISOString(), // Use local constant
    };
    await entityManager.saveOrUpdate(entity1);

    const entity2Id = `${baseIdNamespace}/loadAll-2-${Date.now()}`;
    const entity2: StoredQuery = {
      ...testEntityBase,
      '@id': entity2Id,
      '@type': 'StoredQuery', // Ensure @type is present
      name: 'LoadAll Test Query 2',
      query: 'SELECT * WHERE { ?s ?p ?o } LIMIT 5',
      [SCHEMA_DATE_CREATED]: new Date().toISOString(), // Use local constant
    };
    await entityManager.saveOrUpdate(entity2);

    console.log(`Saved entities for loadAll test: ${entity1Id}, ${entity2Id}`);

    // 2. Call loadAll (use a fresh register)
    register.clear();
    const loadedEntitiesMap = await entityManager.loadAll(register);

    // 3. Assertions
    expect(loadedEntitiesMap).toBeInstanceOf(Map);
    // Check if the map contains at least the two entities we added.
    // It might contain more if other tests ran or if there's pre-existing data.
    expect(loadedEntitiesMap.size).toBeGreaterThanOrEqual(2);

    // Verify our specific entities are present and have correct data (basic check)
    const loadedEntity1 = loadedEntitiesMap.get(entity1Id) as StoredQuery | undefined;
    expect(loadedEntity1).toBeDefined();
    expect(loadedEntity1?.['@id']).toBe(entity1Id);
    expect(loadedEntity1?.name).toBe(entity1.name);

    const loadedEntity2 = loadedEntitiesMap.get(entity2Id) as StoredQuery | undefined;
    expect(loadedEntity2).toBeDefined();
    expect(loadedEntity2?.['@id']).toBe(entity2Id);
    expect(loadedEntity2?.name).toBe(entity2.name);
    expect(loadedEntity2?.query).toBe(entity2.query);

    // 4. Cleanup the entities created in this test
    await entityManager.delete(entity1Id);
    await entityManager.delete(entity2Id);
    console.log(`Cleaned up entities for loadAll test: ${entity1Id}, ${entity2Id}`);
  });

  it('should return an empty map when loadAll is called on an empty store', async () => {
    // 1. Ensure the store is empty (or as empty as possible for this test)
    // This is tricky in integration tests. We'll assume delete works and try to delete
    // any potential leftovers from the base namespace that might interfere.
    // A more robust approach might involve clearing the entire graph if the backend supports it.
    // For now, we rely on previous cleanup and delete the main test query if it exists.
    if (testQuery && testQuery['@id']) {
       try { await entityManager.delete(testQuery['@id']); } catch (e) { /* ignore */ }
    }
    // Ideally, delete all entities matching a pattern, e.g., DELETE WHERE { ?s a <StoredQueryTypeIRI> ; <somePropertyIdentifier> <baseIdNamespace> ... }
    // But let's proceed assuming reasonable isolation or previous cleanup.

    // 2. Call loadAll (use a fresh register)
    register.clear();
    const loadedEntitiesMap = await entityManager.loadAll(register);

    // 3. Assertions
    expect(loadedEntitiesMap).toBeInstanceOf(Map);
    // Check that the map size is reasonable (e.g., not excessively large, indicating a potential issue).
    // We cannot reliably assert size === 0 in a shared environment.
    // Instead, we'll create/delete a specific entity and ensure it's NOT loaded.

    // 1. Create a unique entity just for this test
    const uniqueIdForEmptyTest = `${baseIdNamespace}/loadAll-empty-${Date.now()}`;
    const uniqueEntity: StoredQuery = {
      ...testEntityBase,
      '@id': uniqueIdForEmptyTest,
      '@type': 'StoredQuery', // Ensure @type is present
      name: 'LoadAll Empty Test Query',
      [SCHEMA_DATE_CREATED]: new Date().toISOString(), // Use local constant
    };
    await entityManager.saveOrUpdate(uniqueEntity);

    // 2. Delete it immediately
    await entityManager.delete(uniqueIdForEmptyTest);
    console.log(`Created and deleted entity for empty loadAll test: ${uniqueIdForEmptyTest}`);

    // 3. Call loadAll again (use a fresh register)
    register.clear();
    const loadedMapAfterDelete = await entityManager.loadAll(register);

    // 4. Assert that the specifically deleted entity is NOT in the map
    expect(loadedMapAfterDelete.has(uniqueIdForEmptyTest)).toBe(false);
  });

}); // End of describe block
