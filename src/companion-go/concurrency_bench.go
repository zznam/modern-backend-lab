package main

import (
	"fmt"
	"runtime"
	"sync"
	"time"
)

func formatBytes(b uint64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := uint64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.2f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

func main() {
	fmt.Println("================================================================")
	fmt.Println("🚀 Modern Backend Lab: Go Goroutines vs OS Threads Benchmark")
	fmt.Println("================================================================")

	var memStatsBefore runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&memStatsBefore)

	const goroutineCount = 100000
	fmt.Printf("Spawning %d concurrent Goroutines...\n", goroutineCount)

	start := time.Now()
	var ready sync.WaitGroup
	var finished sync.WaitGroup
	ready.Add(goroutineCount)
	finished.Add(goroutineCount)
	release := make(chan struct{})
	for i := 0; i < goroutineCount; i++ {
		go func() {
			defer finished.Done()
			ready.Done()
			<-release
		}()
	}
	ready.Wait()
	spawnDuration := time.Since(start)
	var memStatsLive runtime.MemStats
	runtime.ReadMemStats(&memStatsLive)
	stackGrowth := memStatsLive.StackInuse - memStatsBefore.StackInuse
	allocated := memStatsLive.TotalAlloc - memStatsBefore.TotalAlloc
	close(release)
	finished.Wait()

	fmt.Println("\n📊 Results (all goroutines alive at the memory sample):")
	fmt.Printf("• Time to spawn and park %d goroutines: %v\n", goroutineCount, spawnDuration)
	fmt.Printf("• Total time including release and completion: %v\n", time.Since(start))
	fmt.Printf("• Stack memory growth: %s (~%.2f KB per parked goroutine)\n", formatBytes(stackGrowth), float64(stackGrowth)/float64(goroutineCount)/1024)
	fmt.Printf("• Heap bytes allocated during spawning: %s\n", formatBytes(allocated))
	fmt.Println("\n🧠 Architectural Context (estimates, not an OS-thread benchmark):")
	fmt.Println("• Goroutine stacks start small and grow dynamically; runtime and channel overhead also consume memory.")
	fmt.Println("• OS thread stack reservations depend on the platform and are not equal to resident physical memory.")
	fmt.Println("• Context switch costs depend on hardware, workload, and scheduler; this program does not measure them.")

	fmt.Println("================================================================")
}
