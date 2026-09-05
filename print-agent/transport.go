package main

import (
	"fmt"
	"net"
	"strings"
	"time"
)

// Send delivers rendered bytes to a printer over whichever path it has.
func Send(p Printer, data []byte) error {
	switch p.Kind {
	case "network":
		return sendNetwork(p.Address, data)
	case "system":
		return sendSystem(p.Address, data)
	}
	return fmt.Errorf("unknown printer kind %q", p.Kind)
}

// sendNetwork writes to the raw JetDirect port most receipt printers expose.
// A printer that is off or unplugged fails the dial in a few seconds, which
// becomes the job's error message in the dashboard.
func sendNetwork(address string, data []byte) error {
	addr := strings.TrimSpace(address)
	if addr == "" {
		return fmt.Errorf("printer has no address")
	}
	if !strings.Contains(addr, ":") {
		addr += ":9100"
	}
	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return fmt.Errorf("cannot reach %s: %w", addr, err)
	}
	defer conn.Close()
	_ = conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
	if _, err := conn.Write(data); err != nil {
		return fmt.Errorf("write to %s: %w", addr, err)
	}
	// Give the printer a moment to drain before the socket closes under it;
	// some cheap models drop the tail of the buffer otherwise.
	time.Sleep(150 * time.Millisecond)
	return nil
}
