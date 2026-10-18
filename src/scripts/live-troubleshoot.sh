#!/usr/bin/env bash
# ==============================================================================
# 🩺 Live Production Server Troubleshooting Toolkit
# Designed for incident response: CPU starvation, memory leaks, FD exhaustion,
# network socket bottlenecks, zombie processes, and disk I/O latency.
# ==============================================================================

set -e

COLOR_CYAN='\033[0;36m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_RESET='\033[0m'

echo -e "${COLOR_CYAN}================================================================${COLOR_RESET}"
echo -e "${COLOR_GREEN}🩺 LIVE SERVER INCIDENT DIAGNOSTIC REPORT${COLOR_RESET}"
echo -e "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%SZ") | Host: $(hostname)"
echo -e "${COLOR_CYAN}================================================================${COLOR_RESET}"

# 1. System Load & Uptime
echo -e "\n${COLOR_YELLOW}[1] System Load & Uptime (1m, 5m, 15m load average vs CPU Cores):${COLOR_RESET}"
uptime
CORES=$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)
echo "Logical CPU Cores: ${CORES}"
echo "Rule of Thumb: If 1m load average > Cores, CPU is saturated and processes are queued."

# 2. Memory Utilization
echo -e "\n${COLOR_YELLOW}[2] Memory Utilization & Pressure:${COLOR_RESET}"
if command -v vm_stat >/dev/null 2>&1; then
  # macOS
  vm_stat | perl -ne '/page size of (\d+)/ and $size=$1; /(.*?):\s+(\d+)/ and printf("%-30s %10.2f MB\n", $1, ($2*$size)/1024/1024);' | head -n 6
elif command -v free >/dev/null 2>&1; then
  # Linux
  free -h
fi

# 3. Open File Descriptors & Limits
echo -e "\n${COLOR_YELLOW}[3] File Descriptors & Limits (Detecting FD Exhaustion / EMFILE):${COLOR_RESET}"
CURRENT_ULIMIT=$(ulimit -n)
echo "Current Shell FD Limit (ulimit -n): ${CURRENT_ULIMIT}"
if [ -d /proc/sys/fs/file-nr ]; then
  cat /proc/sys/fs/file-nr | awk '{printf "Allocated FDs: %s / Max FDs: %s\n", $1, $3}'
else
  SYS_MAX_FDS=$(sysctl -n kern.maxfiles 2>/dev/null || echo "N/A")
  echo "System Max Files (kern.maxfiles): ${SYS_MAX_FDS}"
fi

# 4. Network Socket States (Detecting TIME_WAIT or CLOSE_WAIT leaks)
echo -e "\n${COLOR_YELLOW}[4] Network Socket Health & Connection States:${COLOR_RESET}"
if command -v netstat >/dev/null 2>&1; then
  echo "Active Socket State Breakdown:"
  netstat -an -p tcp 2>/dev/null | awk '/^tcp/ {print $NF}' | sort | uniq -c | sort -rn | head -n 10 || true
  echo "Note on States:"
  echo " • TIME_WAIT: Normal after closing TCP socket (2MSL). High count requires TCP reuse or Keep-Alive."
  echo " • CLOSE_WAIT: High count indicates APPLICATION LEAK (remote side closed socket, but local app forgot to call close())."
fi

# 5. Process Health & Zombie Check
echo -e "\n${COLOR_YELLOW}[5] Top CPU Consuming Processes:${COLOR_RESET}"
ps -A -o pid,ppid,state,%cpu,%mem,comm | sort -k4 -rn | head -n 6

echo -e "\n${COLOR_YELLOW}[6] Checking for Zombie (Z) or Uninterruptible Disk Sleep (D) processes:${COLOR_RESET}"
ZOMBIES=$(ps -A -o state,pid,comm | grep -E '^[Z|D]' || true)
if [ -z "$ZOMBIES" ]; then
  echo -e "${COLOR_GREEN}✓ No zombie or D-state processes detected.${COLOR_RESET}"
else
  echo -e "${COLOR_RED}⚠️ Warning: Problematic processes found:${COLOR_RESET}"
  echo "$ZOMBIES"
fi

echo -e "\n${COLOR_CYAN}================================================================${COLOR_RESET}"
echo -e "${COLOR_GREEN}✓ Diagnostic scan completed.${COLOR_RESET}"
echo -e "${COLOR_CYAN}================================================================${COLOR_RESET}"
