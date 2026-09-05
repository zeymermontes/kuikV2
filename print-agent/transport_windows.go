//go:build windows

package main

import (
	"fmt"
	"strings"
	"syscall"
	"unsafe"
)

// sendSystem writes RAW bytes to a Windows printer through the spooler, the
// way every POS on Windows does it: the printer is installed normally (USB,
// Bluetooth, shared) and we bypass its driver with the RAW datatype so the
// ESC/POS goes through untouched. No cgo: winspool.drv is called directly.

var (
	winspool             = syscall.NewLazyDLL("winspool.drv")
	procOpenPrinter      = winspool.NewProc("OpenPrinterW")
	procClosePrinter     = winspool.NewProc("ClosePrinter")
	procStartDocPrinter  = winspool.NewProc("StartDocPrinterW")
	procEndDocPrinter    = winspool.NewProc("EndDocPrinter")
	procStartPagePrinter = winspool.NewProc("StartPagePrinter")
	procEndPagePrinter   = winspool.NewProc("EndPagePrinter")
	procWritePrinter     = winspool.NewProc("WritePrinter")
)

type docInfo1 struct {
	pDocName    *uint16
	pOutputFile *uint16
	pDatatype   *uint16
}

func sendSystem(name string, data []byte) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("printer has no system name")
	}
	pName, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return err
	}
	var h syscall.Handle
	r, _, e := procOpenPrinter.Call(uintptr(unsafe.Pointer(pName)), uintptr(unsafe.Pointer(&h)), 0)
	if r == 0 {
		return fmt.Errorf("open printer %q: %v (is the name exactly as in Windows?)", name, e)
	}
	defer procClosePrinter.Call(uintptr(h))

	docName, _ := syscall.UTF16PtrFromString("Kuik")
	dataType, _ := syscall.UTF16PtrFromString("RAW")
	di := docInfo1{pDocName: docName, pDatatype: dataType}
	r, _, e = procStartDocPrinter.Call(uintptr(h), 1, uintptr(unsafe.Pointer(&di)))
	if r == 0 {
		return fmt.Errorf("start document on %q: %v", name, e)
	}
	defer procEndDocPrinter.Call(uintptr(h))

	r, _, e = procStartPagePrinter.Call(uintptr(h))
	if r == 0 {
		return fmt.Errorf("start page on %q: %v", name, e)
	}
	defer procEndPagePrinter.Call(uintptr(h))

	var written uint32
	r, _, e = procWritePrinter.Call(uintptr(h), uintptr(unsafe.Pointer(&data[0])), uintptr(len(data)), uintptr(unsafe.Pointer(&written)))
	if r == 0 {
		return fmt.Errorf("write to %q: %v", name, e)
	}
	if int(written) != len(data) {
		return fmt.Errorf("write to %q: %d of %d bytes", name, written, len(data))
	}
	return nil
}
