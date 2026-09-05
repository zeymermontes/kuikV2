//go:build !windows

package main

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
)

// sendSystem hands raw bytes to a CUPS printer (macOS, Linux). `-o raw` skips
// every filter so the ESC/POS reaches the printer untouched.
func sendSystem(name string, data []byte) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("printer has no system name")
	}
	cmd := exec.Command("lp", "-d", name, "-o", "raw", "-s")
	cmd.Stdin = bytes.NewReader(data)
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("lp %s: %s", name, msg)
	}
	return nil
}
