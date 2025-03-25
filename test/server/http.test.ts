import Fastify, { FastifyInstance } from 'fastify';
import axios from 'axios';
import { start } from '../../src/index';

const API_URL = 'http://localhost:3050';

describe('HTTP Server Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(start);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should add a backend', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/add',
      payload: {
        name: 'wikidata',
        endpoint: 'https://query.wikidata.org/sparql'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toHaveProperty('name');
  });

  it('should list backends', async () => {
    // First, add a backend
    const addResponse = await app.inject({
      method: 'POST',
      url: '/add',
      payload: {
        name: 'wikidata',
        endpoint: 'https://query.wikidata.org/sparql'
      }
    });

    expect(addResponse.statusCode).toBe(200);
    const { name } = JSON.parse(addResponse.payload) as { name: string };

    // Then, list the backends
    const listResponse = await app.inject({
      method: 'GET',
      url: '/list',
    });

    expect(listResponse.statusCode).toBe(200);
    const backends = JSON.parse(listResponse.payload) as any[];
    expect(backends).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'wikidata',
          endpoint: 'https://query.wikidata.org/sparql'
        })
      ])
    );
  });

  it('should set a backend', async () => {
    // First, add a backend
    const addResponse = await app.inject({
      method: 'POST',
      url: '/add',
      payload: {
        name: 'wikidata',
        endpoint: 'https://query.wikidata.org/sparql'
      }
    });

    expect(addResponse.statusCode).toBe(200);
    const { name } = JSON.parse(addResponse.payload) as { name: string };

    // Then, set the backend
    const setResponse = await app.inject({
      method: 'POST',
      url: '/set',
      payload: {
        name: 'wikidata'
      }
    });

    expect(setResponse.statusCode).toBe(200);
    expect(JSON.parse(setResponse.payload)).toEqual({ success: true });
  });

  it('should delete a backend', async () => {
    // First, add a backend
    const addResponse = await app.inject({
      method: 'POST',
      url: '/add',
      payload: {
        name: 'wikidata',
        endpoint: 'https://query.wikidata.org/sparql'
      }
    });

    expect(addResponse.statusCode).toBe(200);
    const { name } = JSON.parse(addResponse.payload) as { name: string };

    // Then, delete the backend
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/delete?name=wikidata`,
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(JSON.parse(deleteResponse.payload)).toEqual({ success: true });

    // Verify that the backend is no longer in the list
    const listResponse = await app.inject({
      method: 'GET',
      url: '/list',
    });

    expect(listResponse.statusCode).toBe(200);
    const backends = JSON.parse(listResponse.payload) as any[];
    expect(backends).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'wikidata',
          endpoint: 'https://query.wikidata.org/sparql'
        })
      ])
    );
  });
});
