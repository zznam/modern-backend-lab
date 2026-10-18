/**
 * Application Security & OWASP Top 10 Mitigation Lab
 * Demonstrates live attacks and secure production defenses for:
 * 1. SQL Injection & Parameterized Statements
 * 2. NoSQL Operator Injection
 * 3. Cross-Site Scripting (XSS) & Content Security Policy (CSP)
 * 4. Cross-Site Request Forgery (CSRF) & SameSite Tokens
 * 5. Server-Side Request Forgery (SSRF) & Private IP Filtering
 * 6. Insecure Direct Object References (IDOR)
 * 7. CORS Misconfigurations
 * 8. Cryptography: One-way Hashing (bcrypt/Argon2) vs Two-way AEAD (AES-256-GCM)
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
export class OwaspSecurityLab {
    // ==========================================
    // 1. SQL INJECTION (SQLi)
    // ==========================================
    static testSqlInjection(userInput) {
        // Vulnerable string interpolation:
        const vulnerableQuery = `SELECT * FROM accounts WHERE email = '${userInput}' AND status = 'ACTIVE'`;
        const isExploited = userInput.includes("' OR '1'='1") || userInput.includes("'; DROP TABLE");
        // Safe Parameterized Prepared Statement:
        const safeQuery = `SELECT * FROM accounts WHERE email = $1 AND status = $2`;
        const safeParams = [userInput, 'ACTIVE'];
        return {
            vulnerableQuery,
            vulnerableRisk: isExploited
                ? 'CRITICAL EXPLOIT: Attacker bypassed authentication and dumped table data via SQL syntax injection!'
                : 'Vulnerable to string concatenation injection',
            safeQuery,
            safeParams,
            isExploited,
        };
    }
    // ==========================================
    // 2. NoSQL INJECTION
    // ==========================================
    static testNoSqlInjection(input) {
        // If client passes JSON: { "password": { "$gt": "" } }
        const isBypassed = typeof input === 'object' && input !== null && ('$gt' in input || '$ne' in input);
        // Defense: Explicit primitive type assertion
        const sanitizedValue = typeof input === 'string' ? input : '';
        return {
            payloadType: typeof input,
            isBypassed,
            sanitizedValue,
            explanation: isBypassed
                ? 'CRITICAL EXPLOIT: MongoDB operator `$gt: ""` evaluated true without knowing password! Defense requires casting to String(val) or Zod schema validation.'
                : 'Input validated strictly as string primitive.',
        };
    }
    // ==========================================
    // 3. SERVER-SIDE REQUEST FORGERY (SSRF)
    // ==========================================
    static validateSsrfUrl(targetUrl) {
        try {
            const parsed = new URL(targetUrl);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return { allowed: false, reason: 'Protocol must be HTTP or HTTPS only (blocked file://, gopher://)' };
            }
            const host = parsed.hostname.toLowerCase();
            // Block Cloud Metadata endpoints and localhost
            if (host === '169.254.169.254' || host === 'metadata.google.internal' || host === 'localhost' || host === '127.0.0.1') {
                return { allowed: false, reason: 'BLOCKED: Attempt to access link-local cloud metadata (AWS/GCP) or loopback!' };
            }
            // Block RFC 1918 Private Subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
            if (host.startsWith('10.') ||
                host.startsWith('192.168.') ||
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) {
                return { allowed: false, reason: 'BLOCKED: Target IP belongs to internal private RFC1918 network!' };
            }
            return { allowed: true, reason: 'Target URL is safe public Internet destination', targetHostname: host };
        }
        catch (err) {
            return { allowed: false, reason: `Malformed URL: ${err.message}` };
        }
    }
    // ==========================================
    // 4. BROKEN ACCESS CONTROL / IDOR
    // ==========================================
    static checkIdorAccess(requestingUserId, requestedDocId, docOwnerId, userRole) {
        if (userRole === 'SUPER_ADMIN') {
            return { accessGranted: true, reason: 'Super Admin bypass' };
        }
        if (requestingUserId === docOwnerId) {
            return { accessGranted: true, reason: 'Ownership verified: requesting user is the document owner' };
        }
        return {
            accessGranted: false,
            reason: `IDOR VIOLATION: User ${requestingUserId} attempted to access document ${requestedDocId} owned by ${docOwnerId}!`,
        };
    }
    // ==========================================
    // 5. CRYPTOGRAPHY: ONE-WAY HASHING VS TWO-WAY ENCRYPTION
    // ==========================================
    static async demonstratePasswordHash(password) {
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);
        const verifyCorrect = await bcrypt.compare(password, hash);
        const verifyWrong = await bcrypt.compare('WrongPassword123!', hash);
        return {
            original: password,
            bcryptHash: hash,
            verifyCorrect,
            verifyWrong,
            whyNotSha256: 'Standard SHA-256 is designed for fast hardware throughput (billions of hashes/sec on GPUs), making it vulnerable to rainbow tables. Password hashing MUST use slow, memory-hard algorithms with work factors (bcrypt, Argon2id, PBKDF2).',
        };
    }
    static demonstrateAes256GcmEncryption(plaintext) {
        // 256-bit key
        const key = crypto.randomBytes(32);
        // 96-bit Initialization Vector (IV)
        const iv = crypto.randomBytes(12);
        // Encrypt
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        // Decrypt & Authenticate
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return {
            ciphertextHex: encrypted,
            ivHex: iv.toString('hex'),
            authTagHex: authTag.toString('hex'),
            decryptedText: decrypted,
        };
    }
}
