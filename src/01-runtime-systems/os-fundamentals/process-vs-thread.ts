/**
 * Operating Systems Fundamentals:
 * 1. Process vs Thread vs Coroutine (Goroutine)
 * 2. Context Switching Overhead
 * 3. I/O Multiplexing Evolution: select -> poll -> epoll (Linux) / kqueue (macOS/BSD)
 */
import os from 'node:os';

export interface ConcurrencyModelComparison {
  model: string;
  memoryPerUnit: string;
  creationTimeUs: number;
  contextSwitchCost: string;
  scheduler: string;
  faultIsolation: string;
}

export function getConcurrencyModelMatrix(): ConcurrencyModelComparison[] {
  return [
    {
      model: 'OS Process (fork / spawn)',
      memoryPerUnit: '4 MB - 64 MB (Virtual memory page table, independent heap & stack)',
      creationTimeUs: 1500,
      contextSwitchCost: 'Expensive (~1000 - 3000 ns). Requires TLB (Translation Lookaside Buffer) flush and CPU cache invalidation.',
      scheduler: 'OS Kernel Preemptive Scheduler',
      faultIsolation: 'Complete. If one process segfaults, other processes remain untouched.',
    },
    {
      model: 'OS Thread (pthread / worker)',
      memoryPerUnit: '1 MB - 8 MB (Fixed pre-allocated stack, shared heap)',
      creationTimeUs: 120,
      contextSwitchCost: 'Moderate (~500 - 1000 ns). Registers & stack pointer saved; no MMU / TLB flush needed.',
      scheduler: 'OS Kernel Preemptive Scheduler',
      faultIsolation: 'Shared. Uncaught exception or memory corruption can crash entire process.',
    },
    {
      model: 'Green Threads / Goroutines / Fibers',
      memoryPerUnit: '2 KB (Contiguous dynamic stack that grows/shrinks on demand; copied to new contiguous allocation)',
      creationTimeUs: 2,
      contextSwitchCost: 'Ultra Cheap (~10 - 50 ns). Userspace context switch saves only ~14 CPU registers, zero kernel traps.',
      scheduler: 'Userspace M:N Runtime Scheduler (Go runtime, Erlang BEAM, Java Virtual Threads)',
      faultIsolation: 'Controlled by runtime panic/recover semantics.',
    },
    {
      model: 'Event Loop (Single-Threaded Cooperative)',
      memoryPerUnit: '~0.5 KB per pending callback closure',
      creationTimeUs: 0.1,
      contextSwitchCost: 'Zero kernel switch. Function call return in userspace.',
      scheduler: 'Libuv / Event Demultiplexer',
      faultIsolation: 'Zero. Synchronous CPU block or uncaught error freezes/crashes entire loop.',
    },
  ];
}

export interface MultiplexingEvolution {
  mechanism: string;
  complexity: string;
  maxDescriptors: string;
  kernelToUserCopy: string;
  triggerMode: string;
  supportedOS: string;
  verdict: string;
}

export function getIoMultiplexingEvolution(): MultiplexingEvolution[] {
  return [
    {
      mechanism: 'select()',
      complexity: 'O(N) - Must iterate through entire bitmap of file descriptors on every wake',
      maxDescriptors: 'FD_SETSIZE (Strictly hardcoded to 1024 on most Unix kernels)',
      kernelToUserCopy: 'Heavy - Entire fd_set bitmask copied into kernel and back every call',
      triggerMode: 'Level-Triggered',
      supportedOS: 'POSIX Universal',
      verdict: 'Historical baseline, completely unsuitable for modern C10K+ concurrency',
    },
    {
      mechanism: 'poll()',
      complexity: 'O(N) - Linear scan over array of struct pollfd',
      maxDescriptors: 'Unlimited (Limited only by process file descriptor rlimit)',
      kernelToUserCopy: 'Heavy - Array of descriptors copied on every call',
      triggerMode: 'Level-Triggered',
      supportedOS: 'POSIX Universal',
      verdict: 'Removed 1024 limit of select, but still suffers from O(N) linear scanning',
    },
    {
      mechanism: 'epoll (epoll_create, epoll_ctl, epoll_wait)',
      complexity: 'Returns ready descriptors rather than scanning the full interest set; work scales with ready events',
      maxDescriptors: 'Unlimited (Millions of concurrent sockets)',
      kernelToUserCopy: 'Maintains kernel interest and ready lists; epoll_wait copies ready event records to a user-provided buffer',
      triggerMode: 'Level-Triggered (LT) and Edge-Triggered (ET)',
      supportedOS: 'Linux only (Powers Nginx, Envoy, Node.js libuv, Redis)',
      verdict: 'The gold standard for high-performance Linux networking (solves C10K and C1000K)',
    },
    {
      mechanism: 'kqueue (kqueue, kevent)',
      complexity: 'Event-filter notification; work scales with the events returned',
      maxDescriptors: 'Unlimited',
      kernelToUserCopy: 'Batches changelists and returned events across the kernel/userspace boundary',
      triggerMode: 'Edge-Triggered and Level-Triggered (Supports Sockets, Files, Signals, Timers)',
      supportedOS: 'macOS, FreeBSD, OpenBSD (Powers macOS Node.js libuv, Nginx on BSD)',
      verdict: 'More expressive and versatile than epoll, natively handles file system vnodes & signals',
    },
    {
      mechanism: 'io_uring (io_uring_setup, io_uring_enter, io_uring_register)',
      complexity: 'Asynchronous completion-queue architecture via kernel/userspace shared memory ring buffers',
      maxDescriptors: 'Unlimited (Registered files and fixed buffers)',
      kernelToUserCopy: 'Zero-copy: Dual ring buffers (Submission Queue & Completion Queue) allow zero-syscall event submission in SQPOLL mode',
      triggerMode: 'Completion-based asynchronous model (Proactor pattern)',
      supportedOS: 'Linux 5.1+ (Powers modern high-IOPS storage, databases, and network runtimes)',
      verdict: 'The state-of-the-art async I/O interface on Linux; eliminates syscall overhead and handles both disk and network I/O',
    },
  ];
}

export function getHostOsSystemReport(): {
  platform: string;
  arch: string;
  cpuCount: number;
  totalMemoryGb: number;
  freeMemoryGb: number;
  uptimeHours: number | null;
  loadAverage: number[];
  ioMultiplexerUsed: string;
} {
  const isDarwin = process.platform === 'darwin';
  let uptimeHours: number | null = null;
  try { uptimeHours = Math.round((os.uptime() / 3600) * 10) / 10; } catch { /* Restricted hosts may deny host uptime. */ }
  return {
    platform: process.platform,
    arch: process.arch,
    cpuCount: os.cpus().length,
    totalMemoryGb: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 100) / 100,
    freeMemoryGb: Math.round((os.freemem() / 1024 / 1024 / 1024) * 100) / 100,
    uptimeHours,
    loadAverage: os.loadavg().map((l) => Math.round(l * 100) / 100),
    ioMultiplexerUsed: isDarwin ? 'kqueue (Darwin Kernel Event Queue)' : process.platform === 'linux' ? 'epoll (Linux Event Poll)' : 'Platform-dependent libuv backend',
  };
}
