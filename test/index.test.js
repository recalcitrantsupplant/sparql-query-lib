"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
describe('index.ts', () => {
    it('should start the server without errors', async () => {
        const server = (0, fastify_1.default)({ logger: false });
        await server.close();
    });
});
