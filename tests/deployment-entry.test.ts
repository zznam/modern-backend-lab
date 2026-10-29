import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, Server, type RequestListener } from 'node:http';
import { WebSocket } from 'ws';
import deploymentEntry from '../src/server.js';

// Exercise the public deployment entry, rather than the named local server.
// Function hosts wrap exported request handlers in their own HTTP server.
const hostedServer = deploymentEntry instanceof Server
  ? deploymentEntry
  : createServer(deploymentEntry as unknown as RequestListener);
let origin: string;

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    hostedServer.once('error', reject);
    hostedServer.listen(0, '127.0.0.1', () => {
      hostedServer.off('error', reject);
      resolve();
    });
  });
  const address = hostedServer.address();
  if (!address || typeof address === 'string') throw new Error('Missing deployment server address');
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    hostedServer.close(error => error ? reject(error) : resolve());
    hostedServer.closeAllConnections();
  });
});

it('serves HTTP and WebSocket upgrades through the exported deployment entry', async () => {
  const health = await fetch(`${origin}/api/v1/health`);
  expect(health.status).toBe(200);
  expect(await health.json()).toMatchObject({ status: 'HEALTHY' });

  const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/ws`, { handshakeTimeout: 3000 });
  try {
    const messages = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const received: Record<string, unknown>[] = [];
      const timeout = setTimeout(() => reject(new Error('Deployment WebSocket did not return WELCOME and ACK')), 4000);
      const fail = (error: Error) => { clearTimeout(timeout); reject(error); };
      socket.on('error', fail);
      socket.on('unexpected-response', (_request, response) => fail(new Error(`WebSocket upgrade returned HTTP ${response.statusCode}`)));
      socket.on('open', () => socket.send(JSON.stringify({ ping: 'deployment-entry' })));
      socket.on('message', data => {
        received.push(JSON.parse(String(data)));
        if (received.some(item => item.type === 'WELCOME') && received.some(item => item.type === 'ACK')) {
          clearTimeout(timeout);
          resolve(received);
        }
      });
    });
    expect(messages).toContainEqual(expect.objectContaining({ type: 'WELCOME' }));
    expect(messages).toContainEqual(expect.objectContaining({ type: 'ACK', echo: { ping: 'deployment-entry' } }));
  } finally {
    socket.terminate();
  }
});
