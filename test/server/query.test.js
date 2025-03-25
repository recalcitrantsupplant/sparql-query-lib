"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../../src/index");
const fastify_1 = __importDefault(require("fastify"));
const API_URL = 'http://localhost:3000';
let app;
describe('Query Routes Tests', () => {
    beforeAll(async () => {
        app = (0, fastify_1.default)({ logger: false });
        await app.register(index_1.start);
    });
    afterAll(async () => {
        await app.close();
        // Clear queries.json after all tests
        const QUERIES_PATH = require('path').join(__dirname, '../../src/server/queries.json');
        const fs = require('fs/promises');
        await fs.writeFile(QUERIES_PATH, '[]', 'utf8');
    });
    it('should create a query', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/query/queries',
            payload: JSON.stringify({
                name: 'testQuery',
                query: 'SELECT * WHERE { ?s ?p ?o } LIMIT 10',
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });
        expect(response.statusCode).toBe(201);
        const data = JSON.parse(response.payload);
        expect(data).toHaveProperty('id');
        expect(data.name).toBe('testQuery');
        expect(data.query).toBe('SELECT * WHERE { ?s ?p ?o } LIMIT 10');
    });
    it('should list queries', async () => {
        // First, create a query
        await app.inject({
            method: 'POST',
            url: '/query/queries',
            payload: JSON.stringify({
                name: 'testQuery',
                query: 'SELECT * WHERE { ?s ?p ?o }',
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });
        // Then, list the queries
        const listResponse = await app.inject({
            method: 'GET',
            url: '/query/queries',
        });
        expect(listResponse.statusCode).toBe(200);
        const data = JSON.parse(listResponse.payload);
        expect(data).toHaveProperty('data');
        expect(data.data).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: 'testQuery',
                query: 'SELECT * WHERE { ?s ?p ?o }',
            }),
        ]));
    });
    it('should get a query', async () => {
        // First, create a query
        const createResponse = await app.inject({
            method: 'POST',
            url: '/query/queries',
            payload: JSON.stringify({
                name: 'testQuery',
                query: 'SELECT * WHERE { ?s ?p ?o }',
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });
        const createData = JSON.parse(createResponse.payload);
        const { id } = createData;
        // Then, get the query
        const getResponse = await app.inject({
            method: 'GET',
            url: `/queries/${id}`,
        });
        expect(getResponse.statusCode).toBe(200);
        const getData = JSON.parse(getResponse.payload);
        expect(getData).toEqual(expect.objectContaining({
            name: 'testQuery',
            query: 'SELECT * WHERE { ?s ?p ?o }',
        }));
    });
    it('should update a query', async () => {
        // First, create a query
        const createResponse = await app.inject({
            method: 'POST',
            url: '/query/queries',
            payload: JSON.stringify({
                name: 'testQuery',
                query: 'SELECT * WHERE { ?s ?p ?o }',
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });
        const createData = JSON.parse(createResponse.payload);
        const { id } = createData;
        // Then, update the query
        const updateResponse = await app.inject({
            method: 'PUT',
            url: `/queries/${id}`,
            payload: JSON.stringify({
                name: 'updatedQuery',
                query: 'SELECT * WHERE { ?s ?p ?o . FILTER (?s = <http://example.org>)}',
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });
        expect(updateResponse.statusCode).toBe(200);
        const updateData = JSON.parse(updateResponse.payload);
        expect(updateData).toEqual(expect.objectContaining({
            id: id,
            name: 'updatedQuery',
            query: 'SELECT * WHERE { ?s ?p ?o . FILTER (?s = <http://example.org>)}',
        }));
    });
    it('should delete a query', async () => {
        // First, create a query
        const createResponse = await app.inject({
            method: 'POST',
            url: '/queries',
            payload: JSON.stringify({
                name: 'testQuery',
                query: 'SELECT * WHERE { ?s ?p ?o }',
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });
        const createData = JSON.parse(createResponse.payload);
        const { id } = createData;
        // Then, delete the query
        const deleteResponse = await app.inject({
            method: 'DELETE',
            url: `/queries/${id}`,
        });
        expect(deleteResponse.statusCode).toBe(204);
        // Verify that the query is no longer in the list
        const listResponse = await app.inject({
            method: 'GET',
            url: '/queries',
        });
        const listData = JSON.parse(listResponse.payload);
        expect(listData.data).not.toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: 'testQuery',
                query: 'SELECT * WHERE { ?s ?p ?o }',
            }),
        ]));
    });
    it('should list variables in a query', async () => {
        // First, create a query
        const createResponse = await app.inject({
            method: 'POST',
            url: '/queries',
            payload: JSON.stringify({
                name: 'testQuery',
                query: 'SELECT ?name ?age WHERE { ?person rdf:type schema:Person . ?person schema:name ?name . ?person schema:age ?age }',
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });
        const createData = JSON.parse(createResponse.payload);
        const { id } = createData;
        // Then, list the variables
        const variablesResponse = await app.inject({
            method: 'GET',
            url: `/queries/${id}/variables`,
        });
        expect(variablesResponse.statusCode).toBe(200);
        const variablesData = JSON.parse(variablesResponse.payload);
        expect(variablesData).toEqual(expect.arrayContaining(['variable1', 'variable2'])); // Placeholder
    });
    it('should execute a query with variables', async () => {
        // First, create a query
        const createResponse = await app.inject({
            method: 'POST',
            url: '/queries',
            payload: JSON.stringify({
                name: 'testQuery',
                query: 'SELECT * WHERE { ?s ?p ?o } LIMIT 10',
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });
        const createData = JSON.parse(createResponse.payload);
        const { id } = createData;
        // Then, execute the query with variables
        const executeResponse = await app.inject({
            method: 'POST',
            url: `/queries/${id}/execute`,
            payload: JSON.stringify({
                variable1: 'value1',
                variable2: 'value2',
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });
        expect(executeResponse.statusCode).toBe(200);
        const executeData = JSON.parse(executeResponse.payload);
        expect(executeData).toEqual(expect.objectContaining({ result: 'Query executed with variables' })); // Placeholder
    });
});
