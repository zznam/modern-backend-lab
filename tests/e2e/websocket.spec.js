import { test, expect } from './fixtures.js';

test('WebSocket accepts an upgrade, welcomes the browser, and acknowledges JSON', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => new Promise((resolve, reject) => {
    const url = new URL('/ws', location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    const messages = [];
    let acknowledged = false;
    const timeout = setTimeout(() => finish(new Error('WebSocket welcome/acknowledgement timed out after 10 seconds.')), 10_000);
    function finish(error) {
      clearTimeout(timeout);
      socket.onmessage = socket.onerror = socket.onclose = null;
      socket.close();
      if (error) reject(error);
      else resolve(messages);
    }
    socket.onerror = () => finish(new Error('WebSocket connection failed. The deployment must forward /ws upgrade requests.'));
    socket.onclose = () => {
      if (!acknowledged) finish(new Error('WebSocket closed before acknowledging the browser message.'));
      else finish();
    };
    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        messages.push(message);
        if (message.type === 'WELCOME') socket.send(JSON.stringify({ probe: 'browser-e2e' }));
        if (message.type === 'ACK') {
          acknowledged = true;
          socket.close(1000, 'E2E verification finished');
        }
      } catch (error) { finish(error); }
    };
  }));
  expect(result).toEqual([
    { type: 'WELCOME', message: expect.any(String) },
    { type: 'ACK', echo: { probe: 'browser-e2e' }, timestamp: expect.any(Number) },
  ]);
});
