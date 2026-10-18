import { describe, it, expect } from 'vitest';
import { AuthService } from '../src/02-api-security-db/auth-security/auth-service.js';
import { RbacEvaluator, AbacPolicyEngine } from '../src/02-api-security-db/auth-security/access-control.js';
import { OwaspSecurityLab } from '../src/02-api-security-db/owasp-security/owasp-lab.js';
import { IdempotencyStore } from '../src/02-api-security-db/rest-standards/idempotency.js';
describe('Pillar 2: Security & Authentication', () => {
    describe('Authentication & Token Rotation', () => {
        it('Creates and validates stateful sessions', () => {
            const auth = new AuthService();
            const { sessionId, cookieHeader } = auth.createSession('usr_123', 'test@example.com');
            expect(cookieHeader).toContain('HttpOnly');
            expect(cookieHeader).toContain('SameSite=Strict');
            const session = auth.validateSession(sessionId);
            expect(session?.userId).toBe('usr_123');
            auth.revokeSession(sessionId);
            expect(auth.validateSession(sessionId)).toBeNull();
        });
        it('Rotates Refresh Tokens and triggers Replay Attack Detection upon token reuse', () => {
            const auth = new AuthService();
            const initial = auth.issueTokenPair('usr_1', 'user@example.com');
            // Valid rotation 1
            const rot1 = auth.rotateRefreshToken(initial.refreshToken, 'user@example.com');
            expect(rot1.success).toBe(true);
            expect(rot1.refreshToken).toBeDefined();
            // Attacker replays old invalidated refresh token!
            const replayAttempt = auth.rotateRefreshToken(initial.refreshToken, 'user@example.com');
            expect(replayAttempt.success).toBe(false);
            expect(replayAttempt.error).toContain('Refresh token reuse detected');
            // Legitimate user's new token should ALSO now be revoked to protect the account!
            const legitimateNextTry = auth.rotateRefreshToken(rot1.refreshToken, 'user@example.com');
            expect(legitimateNextTry.success).toBe(false);
        });
        it('Generates and verifies OAuth 2.0 PKCE challenge/verifier', () => {
            const auth = new AuthService();
            const { codeVerifier, codeChallenge } = auth.generatePkceChallenge();
            expect(codeVerifier.length).toBeGreaterThan(20);
            expect(codeChallenge.length).toBeGreaterThan(20);
            expect(auth.verifyPkce(codeVerifier, codeChallenge)).toBe(true);
            expect(auth.verifyPkce('wrong_verifier', codeChallenge)).toBe(false);
        });
    });
    describe('Authorization: RBAC & ABAC', () => {
        it('RBAC grants permissions based on hierarchical roles', () => {
            expect(RbacEvaluator.hasPermission('ADMIN', 'orders:delete')).toBe(true);
            expect(RbacEvaluator.hasPermission('VIEWER', 'orders:delete')).toBe(false);
            expect(RbacEvaluator.hasPermission('VIEWER', 'orders:read')).toBe(true);
        });
        it('ABAC evaluates dynamic attributes, clearance, department, and VPN environment', () => {
            const engine = new AbacPolicyEngine();
            const subject = { id: 'u1', department: 'FINANCE', clearanceLevel: 4, isContractor: false };
            const resource = { id: 'd1', ownerId: 'u1', department: 'FINANCE', classificationLevel: 3, status: 'ACTIVE' };
            const env = { currentHourUtc: 14, isCorporateVpn: true, clientIp: '10.0.1.20' };
            // Normal read
            expect(engine.authorize(subject, resource, 'READ', env).decision).toBe('ALLOW');
            // Contractor trying to delete
            const contractor = { ...subject, isContractor: true };
            expect(engine.authorize(contractor, resource, 'DELETE', env).decision).toBe('DENY');
            // Insufficient clearance
            const lowClearance = { ...subject, clearanceLevel: 1 };
            expect(engine.authorize(lowClearance, resource, 'READ', env).decision).toBe('DENY');
            // Export outside VPN
            const noVpn = { ...env, isCorporateVpn: false };
            expect(engine.authorize(subject, resource, 'EXPORT_PII', noVpn).decision).toBe('DENY');
        });
    });
    describe('OWASP Top 10 Mitigations', () => {
        it('Detects SQL injection vulnerability and provides parameterized query', () => {
            const attack = OwaspSecurityLab.testSqlInjection("admin@test.com' OR '1'='1");
            expect(attack.isExploited).toBe(true);
            expect(attack.safeQuery).toBe('SELECT * FROM accounts WHERE email = $1 AND status = $2');
            expect(attack.safeParams).toEqual(["admin@test.com' OR '1'='1", 'ACTIVE']);
        });
        it('Blocks MongoDB NoSQL operator injection', () => {
            const attack = OwaspSecurityLab.testNoSqlInjection({ $gt: '' });
            expect(attack.isBypassed).toBe(true);
            expect(attack.sanitizedValue).toBe('');
        });
        it('Blocks SSRF attempts to AWS metadata and RFC1918 private subnets', () => {
            expect(OwaspSecurityLab.validateSsrfUrl('http://169.254.169.254/latest/meta-data/').allowed).toBe(false);
            expect(OwaspSecurityLab.validateSsrfUrl('http://192.168.1.1/admin').allowed).toBe(false);
            expect(OwaspSecurityLab.validateSsrfUrl('http://10.0.0.1/status').allowed).toBe(false);
            expect(OwaspSecurityLab.validateSsrfUrl('https://api.github.com/users').allowed).toBe(true);
        });
        it('Prevents IDOR violations', () => {
            const check = OwaspSecurityLab.checkIdorAccess('attacker_user', 'doc_123', 'victim_user', 'USER');
            expect(check.accessGranted).toBe(false);
            const ownerCheck = OwaspSecurityLab.checkIdorAccess('victim_user', 'doc_123', 'victim_user', 'USER');
            expect(ownerCheck.accessGranted).toBe(true);
        });
        it('Hashes passwords with bcrypt and encrypts data with AES-256-GCM', async () => {
            const hashRes = await OwaspSecurityLab.demonstratePasswordHash('SecretPassword123!');
            expect(hashRes.verifyCorrect).toBe(true);
            expect(hashRes.verifyWrong).toBe(false);
            const enc = OwaspSecurityLab.demonstrateAes256GcmEncryption('CreditCardNumber:4111222233334444');
            expect(enc.ciphertextHex).toBeDefined();
            expect(enc.authTagHex).toBeDefined();
            expect(enc.decryptedText).toBe('CreditCardNumber:4111222233334444');
        });
    });
    describe('Idempotency Engine', () => {
        it('Prevents duplicate payment execution and replays cached response', () => {
            const store = new IdempotencyStore();
            const payload = { amount: 500, customerId: 'c1' };
            const key = 'idem_key_unique_1';
            const first = store.acquireOrCheck(key, payload);
            expect(first.action).toBe('PROCEED');
            // Second simultaneous request with same key while processing
            const second = store.acquireOrCheck(key, payload);
            expect(second.action).toBe('CONFLICT_IN_FLIGHT');
            // Save result
            store.saveResult(key, 201, { orderId: 'ord_1', status: 'SUCCESS' });
            // Third request arrives after completion: Returns cached response
            const third = store.acquireOrCheck(key, payload);
            expect(third.action).toBe('RETURN_CACHED');
            if (third.action === 'RETURN_CACHED') {
                expect(third.record.responseBody.orderId).toBe('ord_1');
            }
        });
    });
});
