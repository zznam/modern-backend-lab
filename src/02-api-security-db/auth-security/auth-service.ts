/**
 * Authentication Lab: Stateful Sessions vs Stateless JWTs, Refresh Token Rotation, OAuth2/OIDC PKCE
 */
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

export interface UserSession {
  sessionId: string;
  userId: string;
  email: string;
  createdAt: number;
  expiresAt: number;
}

export interface RefreshTokenRecord {
  token: string;
  familyId: string;
  email: string;
  userId: string;
  isRevoked: boolean;
  expiresAt: number;
}

export class AuthService {
  // Stateful Session Store (In-Memory / Redis)
  private sessions = new Map<string, UserSession>();
  // Refresh Token Families (Enables Replay Detection)
  private refreshTokens = new Map<string, RefreshTokenRecord>();

  // ====================================================
  // 1. STATEFUL SESSIONS (Cookie-Based)
  // ====================================================
  public createSession(userId: string, email: string, ttlMs = 3600 * 1000): { sessionId: string; cookieHeader: string } {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    this.sessions.set(sessionId, {
      sessionId,
      userId,
      email,
      createdAt: now,
      expiresAt: now + ttlMs,
    });

    const cookieHeader = `sessionId=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ttlMs / 1000}`;
    return { sessionId, cookieHeader };
  }

  public validateSession(sessionId: string): UserSession | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.expiresAt <= Date.now()) {
      if (session) this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  public revokeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  // ====================================================
  // 2. STATELESS JWT WITH REFRESH TOKEN ROTATION
  // ====================================================
  public issueTokenPair(userId: string, email: string, familyId?: string): {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  } {
    const activeFamily = familyId || crypto.randomUUID();

    // 15-minute Access Token
    const accessToken = jwt.sign(
      { sub: userId, email, family: activeFamily },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    // 7-day Refresh Token
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    this.refreshTokens.set(rawRefreshToken, {
      token: rawRefreshToken,
      email,
      familyId: activeFamily,
      userId,
      isRevoked: false,
      expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900,
    };
  }

  /**
   * Refresh Token Rotation with Replay Attack Detection:
   * If a stolen refresh token is used a second time, the ENTIRE token family is immediately revoked,
   * cutting off the attacker!
   */
  public rotateRefreshToken(incomingRefreshToken: string, _email?: string): {
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    error?: string;
  } {
    const record = this.refreshTokens.get(incomingRefreshToken);

    if (!record) {
      return { success: false, error: 'Invalid or unknown refresh token' };
    }

    if (record.expiresAt <= Date.now()) {
      this.refreshTokens.delete(incomingRefreshToken);
      return { success: false, error: 'Refresh token expired' };
    }

    // AUTOMATIC COMPROMISE DETECTION:
    // If a token that was already used (revoked) arrives again, someone stole the token!
    if (record.isRevoked) {
      // Revoke all tokens belonging to this family immediately!
      for (const [t, r] of this.refreshTokens.entries()) {
        if (r.familyId === record.familyId) {
          r.isRevoked = true;
        }
      }
      return {
        success: false,
        error: 'CRITICAL SECURITY ALERT: Refresh token reuse detected! All active sessions revoked.',
      };
    }

    // Invalidate the incoming token
    record.isRevoked = true;

    // Issue a brand-new token pair within the same family
    const newTokens = this.issueTokenPair(record.userId, record.email, record.familyId);
    return {
      success: true,
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
    };
  }

  // ====================================================
  // 3. OAUTH 2.0 & OIDC PKCE FLOW SIMULATION
  // ====================================================
  public generatePkceChallenge(): { codeVerifier: string; codeChallenge: string } {
    // 1. Client creates high-entropy cryptographic random code_verifier
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    // 2. Client hashes code_verifier with SHA-256 to create code_challenge
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  public verifyPkce(codeVerifier: string, expectedChallenge: string): boolean {
    const computed = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return computed === expectedChallenge;
  }
}

export const globalAuthService = new AuthService();
