import { start } from '../src/index';
import Fastify from 'fastify';

describe('index.ts', () => {
  it('should start the server without errors', async () => {
    const server = Fastify({ logger: false });
    await server.close();
  });
});
