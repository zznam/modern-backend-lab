/**
 * Low-level Networking Lab: TCP, UDP, Handshakes & Socket Mechanics
 */
import net from 'node:net';
import dgram from 'node:dgram';
import { once } from 'node:events';

export interface HandshakeStep {
  step: number;
  from: string;
  to: string;
  packet: string;
  flags: string[];
  seq: number;
  ack: number;
  description: string;
}

export function simulateTcp3WayHandshake(initialClientSeq = 1000, initialServerSeq = 5000): HandshakeStep[] {
  return [
    {
      step: 1,
      from: 'Client',
      to: 'Server',
      packet: 'SYN',
      flags: ['SYN'],
      seq: initialClientSeq,
      ack: 0,
      description: 'Client initiates connection: SYN packet with initial sequence number (ISN). Socket state moves to SYN_SENT.',
    },
    {
      step: 2,
      from: 'Server',
      to: 'Client',
      packet: 'SYN-ACK',
      flags: ['SYN', 'ACK'],
      seq: initialServerSeq,
      ack: initialClientSeq + 1,
      description: 'Server accepts connection: Sends SYN with its own ISN and ACKs Client ISN + 1. Socket state moves to SYN_RECEIVED.',
    },
    {
      step: 3,
      from: 'Client',
      to: 'Server',
      packet: 'ACK',
      flags: ['ACK'],
      seq: initialClientSeq + 1,
      ack: initialServerSeq + 1,
      description: 'Client acknowledges Server SYN. Socket state moves to ESTABLISHED on both sides. Data transmission can begin.',
    },
  ];
}

export function simulateTcp4WayTeardown(): HandshakeStep[] {
  return [
    {
      step: 1,
      from: 'Client',
      to: 'Server',
      packet: 'FIN',
      flags: ['FIN', 'ACK'],
      seq: 2000,
      ack: 6000,
      description: 'Client has finished sending data: Sends FIN. Moves to FIN_WAIT_1 state.',
    },
    {
      step: 2,
      from: 'Server',
      to: 'Client',
      packet: 'ACK',
      flags: ['ACK'],
      seq: 6000,
      ack: 2001,
      description: 'Server acknowledges Client FIN. Moves to CLOSE_WAIT. Client enters FIN_WAIT_2.',
    },
    {
      step: 3,
      from: 'Server',
      to: 'Client',
      packet: 'FIN',
      flags: ['FIN', 'ACK'],
      seq: 6001,
      ack: 2001,
      description: 'Server finishes remaining data transmission and sends its own FIN. Moves to LAST_ACK.',
    },
    {
      step: 4,
      from: 'Client',
      to: 'Server',
      packet: 'ACK',
      flags: ['ACK'],
      seq: 2001,
      ack: 6002,
      description: 'Client acknowledges Server FIN and enters TIME_WAIT (2MSL: 60-120s) to absorb duplicate packets. Server closes socket.',
    },
  ];
}

// Live raw TCP socket echo test
export async function runRawTcpUdpDemo(): Promise<{
  tcpResult: { roundtripMs: number; received: string };
  udpResult: { roundtripMs: number; received: string };
  nagleExplanation: string;
}> {
  // Ephemeral loopback ports let concurrent experiments run without colliding.
  const tcpServer = net.createServer(socket => {
    socket.setNoDelay(true);
    socket.on('error', () => socket.destroy());
    socket.on('data', data => socket.end(`TCP_ECHO:${data.toString()}`));
  });
  let tcpReceived: string;
  let tcpDuration: number;
  const listening = once(tcpServer, 'listening');
  tcpServer.listen(0, '127.0.0.1');
  await listening;
  const address = tcpServer.address() as net.AddressInfo;
  const client = net.createConnection({ port: address.port, host: '127.0.0.1' });
  client.setNoDelay(true);
  client.setTimeout(3000, () => client.destroy(new Error('TCP roundtrip timed out')));
  try {
    const tcpStart = performance.now();
    const data = once(client, 'data');
    client.write('PING_TCP');
    tcpReceived = String((await data)[0]);
    tcpDuration = performance.now() - tcpStart;
  } finally {
    client.destroy();
    await new Promise<void>(resolve => tcpServer.close(() => resolve()));
  }

  const udpServer = dgram.createSocket('udp4');
  const udpClient = dgram.createSocket('udp4');
  let udpReceived: string;
  let udpDuration: number;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const bound = once(udpServer, 'listening');
    udpServer.bind(0, '127.0.0.1');
    await bound;
    udpServer.on('message', (msg, remote) => {
      udpServer.send(`UDP_ECHO:${msg.toString()}`, remote.port, remote.address);
    });
    const udpStart = performance.now();
    const message = once(udpClient, 'message');
    timeout = setTimeout(() => udpClient.emit('error', new Error('UDP roundtrip timed out')), 3000);
    udpClient.send('PING_UDP', udpServer.address().port, '127.0.0.1');
    udpReceived = String((await message)[0]);
    udpDuration = performance.now() - udpStart;
  } finally {
    clearTimeout(timeout);
    udpClient.close();
    udpServer.close();
  }

  return {
    tcpResult: { roundtripMs: Math.round(tcpDuration * 100) / 100, received: tcpReceived },
    udpResult: { roundtripMs: Math.round(udpDuration * 100) / 100, received: udpReceived },
    nagleExplanation:
      "Nagle's Algorithm buffers small outgoing packets until an entire MSS (Maximum Segment Size, typically 1460 bytes) is accumulated or an ACK arrives. For real-time APIs, games, and RPCs, enabling TCP_NODELAY disables Nagle and eliminates 40-200ms latency spikes.",
  };
}
