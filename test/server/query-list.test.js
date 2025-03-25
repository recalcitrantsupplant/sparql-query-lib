"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const undici_1 = require("undici");
const fastify_1 = __importDefault(require("fastify"));
const query_1 = require("../../src/server/query");
const backend_1 = require("../../src/server/backend");
const swagger_1 = __importDefault(require("@fastify/swagger"));
const swagger_ui_1 = __importDefault(require("@fastify/swagger-ui"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const QUERIES_PATH = path.join(__dirname, '../../src/server/queries.json');
describe('Query List Endpoint Test with Undici', () => {
    let fastify;
    let client;
    let serverPort;
    beforeAll(async () => {
        // Create a fastify instance with our application
        fastify = (0, fastify_1.default)({ logger: false });
        // Register the same plugins and routes as in the start function
        // but without calling app.listen() on port 3000
        await fastify.register(swagger_1.default, {
            routePrefix: '/docs',
            openapi: {
                info: {
                    title: 'SPARQL Query Library API',
                    description: 'API for managing and running SPARQL queries',
                    version: '1.0.0'
                },
                externalDocs: {
                    url: 'https://swagger.io',
                    description: 'Find more info here'
                },
                tags: [
                    { name: 'Backend', description: 'Routes for managing SPARQL backends' },
                    { name: 'Query', description: 'Routes for managing SPARQL queries' }
                ]
            },
            hideUntagged: true,
            stripBasePath: true,
        });
        await fastify.register(swagger_ui_1.default, {
            routePrefix: '/docs',
            staticCSP: false
        });
        await fastify.register(backend_1.registerBackendRoutes, { prefix: 'backend' });
        await fastify.register(query_1.registerQueryRoutes);
        // Start the server on a random port
        await fastify.listen({ port: 0 });
        // Get the server address
        const address = fastify.server.address();
        if (!address) {
            throw new Error('Server address is null');
        }
        // Determine the port
        serverPort = typeof address === 'string'
            ? parseInt(address.split(':').pop() || '0', 10)
            : address.port;
        // Create an undici client to make requests to our server
        client = new undici_1.Client(`http://localhost:${serverPort}`, {
            keepAliveTimeout: 10,
            keepAliveMaxTimeout: 10
        });
    });
    afterAll(async () => {
        // Clean up after the tests
        await fastify.close();
        await client.close();
    });
    it('should get a list of queries from /queries endpoint', async () => {
        // Make a request to the /queries endpoint
        const response = await client.request({
            method: 'GET',
            path: '/queries'
        });
        // Parse the body for assertions
        const bodyText = await response.body.text();
        const body = JSON.parse(bodyText);
        // Verify the response
        expect(response.statusCode).toBe(200);
        // Check that the response is an object with a data property that is an array
        expect(typeof body).toBe('object');
        expect(Array.isArray(body.data)).toBe(true);
    });
    it('should return an empty array when queries.json is empty', async () => {
        // Ensure queries.json starts empty before this test
        await fs.writeFile(QUERIES_PATH, '[]', 'utf8');
        const response = await client.request({
            method: 'GET',
            path: '/queries'
        });
        const bodyText = await response.body.text();
        const body = JSON.parse(bodyText);
        expect(response.statusCode).toBe(200);
        expect(body.data).toEqual([]);
    });
});
