import crypto from 'node:crypto';
export function getTls13HandshakeFlow() {
    return [
        {
            rtt: '0.5 RTT',
            sender: 'Client',
            message: 'ClientHello',
            payload: [
                'Supported TLS Versions: [TLS 1.3]',
                'Cipher Suites: [TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256]',
                'Key Share: Client Public ECDH Key (x25519)',
                'Server Name Indication (SNI): api.example.com',
                'ALPN: [h2, http/1.1]',
            ],
            securityRole: 'Client offers cipher suites and immediately sends its ephemeral key share (saving 1 RTT).',
        },
        {
            rtt: '1.0 RTT',
            sender: 'Server',
            message: 'ServerHello + EncryptedExtensions + Certificate + CertVerify + Finished',
            payload: [
                'Selected Cipher: TLS_AES_256_GCM_SHA384',
                'Key Share: Server Public ECDH Key (x25519)',
                'Server Certificate (X.509 chain)',
                'CertificateVerify (RSA/ECDSA signature over handshake transcript)',
                'Finished (HMAC verification of transcript)',
            ],
            securityRole: 'Both parties now derive Shared Symmetric Master Secret via ECDH. Server payload is encrypted.',
        },
        {
            rtt: '1.0 RTT',
            sender: 'Client',
            message: 'Finished (Encrypted Application Data can flow)',
            payload: ['Finished (HMAC verification)', 'HTTP GET /api/v1/orders (Encrypted with AES-256-GCM)'],
            securityRole: 'Handshake complete in exactly 1 RTT! Application data sent immediately.',
        },
    ];
}
export function getTls12HandshakeFlow() {
    return [
        {
            rtt: '0.5 RTT',
            sender: 'Client',
            message: 'ClientHello',
            payload: ['Supported Versions: [TLS 1.2]', 'Cipher Suites', 'Random bytes'],
            securityRole: 'Negotiates capability, no key share sent yet.',
        },
        {
            rtt: '1.0 RTT',
            sender: 'Server',
            message: 'ServerHello + Certificate + ServerKeyExchange + ServerHelloDone',
            payload: ['Server Random', 'X.509 Certificate', 'ECDHE Server Parameters + Signature'],
            securityRole: 'Server provides public cert and Diffie-Hellman parameters.',
        },
        {
            rtt: '1.5 RTT',
            sender: 'Client',
            message: 'ClientKeyExchange + ChangeCipherSpec + Finished',
            payload: ['Client ECDHE Public Key', 'Verification HMAC'],
            securityRole: 'Client sends key share and transitions cipher.',
        },
        {
            rtt: '2.0 RTT',
            sender: 'Server',
            message: 'ChangeCipherSpec + Finished',
            payload: ['Verification HMAC', 'Ready for application data'],
            securityRole: 'Takes 2 full Round Trips (2 RTT) before first application byte can be sent.',
        },
    ];
}
export function simulateECDHEKeyExchange() {
    // Generate ECDH key pairs using Curve25519 or prime256v1
    const clientEcdh = crypto.createECDH('prime256v1');
    clientEcdh.generateKeys();
    const serverEcdh = crypto.createECDH('prime256v1');
    serverEcdh.generateKeys();
    // Exchange public keys over untrusted network
    const clientSecret = clientEcdh.computeSecret(serverEcdh.getPublicKey()).toString('hex');
    const serverSecret = serverEcdh.computeSecret(clientEcdh.getPublicKey()).toString('hex');
    return {
        clientKeyPair: { publicKey: clientEcdh.getPublicKey('hex').slice(0, 32) + '...' },
        serverKeyPair: { publicKey: serverEcdh.getPublicKey('hex').slice(0, 32) + '...' },
        clientDerivedSecret: clientSecret.slice(0, 32) + '...',
        serverDerivedSecret: serverSecret.slice(0, 32) + '...',
        secretsMatch: clientSecret === serverSecret,
    };
}
