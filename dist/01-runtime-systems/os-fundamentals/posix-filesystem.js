export function parsePosixMode(mode) {
    const octal = (mode & 0o777).toString(8).padStart(3, '0');
    const u = (mode >> 6) & 7;
    const g = (mode >> 3) & 7;
    const o = mode & 7;
    const toTri = (n) => ({
        read: (n & 4) !== 0,
        write: (n & 2) !== 0,
        execute: (n & 1) !== 0,
    });
    const toSym = (t) => `${t.read ? 'r' : '-'}${t.write ? 'w' : '-'}${t.execute ? 'x' : '-'}`;
    const user = toTri(u);
    const group = toTri(g);
    const others = toTri(o);
    const symbolic = `${toSym(user)}${toSym(group)}${toSym(others)}`;
    let securityEvaluation = 'Standard secure permissions';
    if (others.write) {
        securityEvaluation = 'DANGEROUS: World-writable (CWE-732 / OWASP Insecure Permissions)! Any local user can overwrite.';
    }
    else if (user.execute && !user.write) {
        securityEvaluation = 'Read-only executable binary or script.';
    }
    else if (octal === '600') {
        securityEvaluation = 'Highly secure private secret (e.g., SSH private key ~/.ssh/id_rsa or TLS private key).';
    }
    else if (octal === '755') {
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
export function calculateUmask(createdMode = 0o666, umask = 0o022) {
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
    locks = new Map();
    acquireLock(filePath, clientId, type) {
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
        }
        else {
            // EXCLUSIVE
            return false; // Any existing lock prevents exclusive acquisition
        }
    }
    releaseLock(filePath, clientId) {
        const lock = this.locks.get(filePath);
        if (!lock)
            return;
        lock.holders.delete(clientId);
        if (lock.holders.size === 0) {
            this.locks.delete(filePath);
        }
    }
    isLocked(filePath) {
        return this.locks.has(filePath);
    }
}
