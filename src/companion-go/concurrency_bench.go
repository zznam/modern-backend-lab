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
	var wg sync.WaitGroup
	wg.Add(goroutineCount)

	channel := make(chan int, goroutineCount)

	for i := 0; i < goroutineCount; i++ {
		go func(id int) {
			defer wg.Done()
			channel <- id * 2
		}(i)
	}

	wg.Wait()
	duration := time.Since(start)

	var memStatsAfter runtime.MemStats
	runtime.ReadMemStats(&memStatsAfter)

	heapUsed := memStatsAfter.HeapAlloc - memStatsBefore.HeapAlloc
	bytesPerGoroutine := float64(heapUsed) / float64(goroutineCount)

	fmt.Println("\n📊 Results:")
	fmt.Printf("• Total time to spawn, execute & sync %d goroutines: %v\n", goroutineCount, duration)
	fmt.Printf("• Average time per goroutine: %v\n", duration/goroutineCount)
	fmt.Printf("• Total Memory Allocated: %s\n", formatBytes(heapUsed))
	fmt.Printf("• Memory per Goroutine: ~%.2f KB\n", bytesPerGoroutine/1024.0)

	fmt.Println("\n🧠 Architectural Comparison:")
	fmt.Println("----------------------------------------------------------------")
	fmt.Println("• Goroutine Stack: Starts at ~2 KB. Dynamically expands & shrinks.")
	fmt.Printf("• OS Thread Stack: Fixed at 2 MB - 8 MB. 100k OS threads would consume ~%d GB RAM!\n", (goroutineCount*8)/(1024))
	fmt.Println("• Context Switch: Goroutines switch in userspace (~15ns, ~14 registers).")
	fmt.Println("                  OS Threads switch in kernel (~1500ns, TLB cache flush).")
	fmt.Println("================================================================")
}
