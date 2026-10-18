/**
 * POSIX File Systems & Permissions Lab
 * Demonstrates:
 * 1. Inodes, Hard Links vs Soft Links (Symlinks)
 * 2. File Descriptors (0=stdin, 1=stdout, 2=stderr, sockets, pipes)
 * 3. POSIX Permission Bitmasks (rwxr-xr-x / octal representation & umask)
 * 4. File Locking mechanisms (Advisory vs Mandatory, flock, shared vs exclusive)
 */
import fs from 'node:fs';
import path from 'node:path';

export interface PosixPermissionAnalysis {
  octal: string;
  symbolic: string;
  user: { read: boolean; write: boolean; execute: boolean };
  group: { read: boolean; write: boolean; execute: boolean };
  others: { read: boolean; write: boolean; execute: boolean };
  securityEvaluation: string;
}

export function parsePosixMode(mode: number): PosixPermissionAnalysis {
  const octal = (mode & 0o777).toString(8).padStart(3, '0');

  const u = (mode >> 6) & 7;
  const g = (mode >> 3) & 7;
  const o = mode & 7;

  const toTri = (n: number) => ({
    read: (n & 4) !== 0,
    write: (n & 2) !== 0,
    execute: (n & 1) !== 0,
  });

  const toSym = (t: { read: boolean; write: boolean; execute: boolean }) =>
    `${t.read ? 'r' : '-'}${t.write ? 'w' : '-'}${t.execute ? 'x' : '-'}`;

  const user = toTri(u);
  const group = toTri(g);
  const others = toTri(o);

  const symbolic = `${toSym(user)}${toSym(group)}${toSym(others)}`;

  let securityEvaluation = 'Standard secure permissions';
  if (others.write) {
    securityEvaluation = 'DANGEROUS: World-writable (CWE-732 / OWASP Insecure Permissions)! Any local user can overwrite.';
  } else if (user.execute && !user.write) {
    securityEvaluation = 'Read-only executable binary or script.';
  } else if (octal === '600') {
    securityEvaluation = 'Highly secure private secret (e.g., SSH private key ~/.ssh/id_rsa or TLS private key).';
  } else if (octal === '755') {
    securityEvaluation = 'Standard web executable/directory (Owner read/write/exec, others read/exec).';
  }

  return {
    octal,
    symbolic,
    user,
    group,
    others,
    securityEvaluation,
  };
}

export function calculateUmask(createdMode: number = 0o666, umask: number = 0o022): {
  defaultModeOctal: string;
  umaskOctal: string;
  resultModeOctal: string;
  symbolicResult: string;
} {
  const result = createdMode & ~umask;
  const parsed = parsePosixMode(result);
  return {
    defaultModeOctal: createdMode.toString(8).padStart(3, '0'),
    umaskOctal: umask.toString(8).padStart(3, '0'),
    resultModeOctal: result.toString(8).padStart(3, '0'),
    symbolicResult: parsed.symbolic,
  };
}

// In-Memory Advisory File Lock Simulator
export class AdvisoryFileLockManager {
  private locks = new Map<string, { type: 'SHARED' | 'EXCLUSIVE'; holders: Set<string> }>();

  public acquireLock(filePath: string, clientId: string, type: 'SHARED' | 'EXCLUSIVE'): boolean {
    const lock = this.locks.get(filePath);

    if (!lock) {
      this.locks.set(filePath, { type, holders: new Set([clientId]) });
      return true;
    }

    if (type === 'SHARED') {
      if (lock.type === 'SHARED') {
        lock.holders.add(clientId);
        return true;
      }
      return false; // Exclusive lock exists, cannot acquire shared
    } else {
      // EXCLUSIVE
      return false; // Any existing lock prevents exclusive acquisition
    }
  }

  public releaseLock(filePath: string, clientId: string): void {
    const lock = this.locks.get(filePath);
    if (!lock) return;

    lock.holders.delete(clientId);
    if (lock.holders.size === 0) {
      this.locks.delete(filePath);
    }
  }

  public isLocked(filePath: string): boolean {
    return this.locks.has(filePath);
  }
}
