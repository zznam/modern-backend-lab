/**
 * Low-level Networking Lab: TCP, UDP, Handshakes & Socket Mechanics
 */
import net from 'node:net';
import dgram from 'node:dgram';
export function simulateTcp3WayHandshake(initialClientSeq = 1000, initialServerSeq = 5000) {
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
export function simulateTcp4WayTeardown() {
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
export async function runRawTcpUdpDemo() {
    const tcpPort = 44101;
    const udpPort = 44102;
    // 1. Raw TCP Server & Client
    const tcpServer = net.createServer((socket) => {
        socket.setNoDelay(true); // Disable Nagle's algorithm for low-latency small packet transfer
        socket.on('data', (data) => {
            socket.write(`TCP_ECHO:${data.toString()}`);
        });
    });
    await new Promise((resolve) => tcpServer.listen(tcpPort, '127.0.0.1', () => resolve()));
    const tcpStart = performance.now();
    const tcpReceived = await new Promise((resolve) => {
        const client = net.createConnection({ port: tcpPort, host: '127.0.0.1' }, () => {
            client.setNoDelay(true);
            client.write('PING_TCP');
        });
        client.on('data', (chunk) => {
            client.end();
            resolve(chunk.toString());
        });
    });
    const tcpDuration = performance.now() - tcpStart;
    await new Promise((resolve) => tcpServer.close(() => resolve()));
    // 2. Raw UDP Socket & Client
    const udpServer = dgram.createSocket('udp4');
    await new Promise((resolve) => udpServer.bind(udpPort, '127.0.0.1', () => resolve()));
    udpServer.on('message', (msg, rinfo) => {
        udpServer.send(`UDP_ECHO:${msg.toString()}`, rinfo.port, rinfo.address);
    });
    const udpStart = performance.now();
    const udpClient = dgram.createSocket('udp4');
    const udpReceived = await new Promise((resolve) => {
        udpClient.on('message', (msg) => {
            udpClient.close();
            resolve(msg.toString());
        });
        udpClient.send('PING_UDP', udpPort, '127.0.0.1');
    });
    const udpDuration = performance.now() - udpStart;
    await new Promise((resolve) => udpServer.close(() => resolve()));
    return {
        tcpResult: { roundtripMs: Math.round(tcpDuration * 100) / 100, received: tcpReceived },
        udpResult: { roundtripMs: Math.round(udpDuration * 100) / 100, received: udpReceived },
        nagleExplanation: "Nagle's Algorithm buffers small outgoing packets until an entire MSS (Maximum Segment Size, typically 1460 bytes) is accumulated or an ACK arrives. For real-time APIs, games, and RPCs, enabling TCP_NODELAY disables Nagle and eliminates 40-200ms latency spikes.",
    };
}
