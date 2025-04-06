import { Thing } from '../types/schema-dts';

/**
 * A registry to manage entities and prevent duplication based on their ID (IRI).
 */
export class EntityRegister {
    private registry: Map<string, Thing> = new Map();

    /**
     * Retrieves an entity by its ID if it exists in the registry,
     * otherwise creates it using the provided factory function, registers it, and returns it.
     * @param id The unique identifier (IRI) of the entity.
     * @param factory A function that creates the entity instance if it's not found.
     * @returns The existing or newly created entity.
     */
    public getOrRegister<T extends Thing>(id: string, factory: () => T): T {
        if (this.registry.has(id)) {
            // Consider adding more robust type checking if necessary,
            // especially if different types could share the same base IRI pattern.
            const existingEntity = this.registry.get(id);
            // Basic check: Ensure the existing entity is not fundamentally different if possible.
            // This might involve checking '@type' or other properties if needed.
            // For now, we assume ID uniqueness implies correct type retrieval.
            return existingEntity as T;
        } else {
            const newEntity = factory();
            // It's crucial that the factory function correctly assigns the '@id'.
            // We could add a check here to ensure newEntity['@id'] === id.
            if (!newEntity['@id'] || newEntity['@id'] !== id) {
                 console.warn(`Entity factory for ID "${id}" produced an entity with a different or missing '@id': ${newEntity['@id'] ?? 'undefined'}. Ensure the factory sets the '@id' property correctly.`);
                 // Force assign the ID? This might mask underlying issues in the factory.
                 // newEntity['@id'] = id;
            }
            this.registry.set(id, newEntity);
            return newEntity;
        }
    }

    /**
     * Retrieves an entity by its ID.
     * @param id The unique identifier (IRI) of the entity.
     * @returns The entity if found, otherwise undefined.
     */
    public get<T extends Thing>(id: string): T | undefined {
        return this.registry.get(id) as T | undefined;
    }

    /**
     * Clears all entities from the registry.
     */
    public clear(): void {
        this.registry.clear();
    }

    /**
     * Gets the current size of the registry.
     * @returns The number of entities currently registered.
     */
    public size(): number {
        return this.registry.size;
    }
}
