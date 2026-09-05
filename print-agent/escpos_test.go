package main

import (
	"bytes"
	"testing"
)

func TestRowFlushRight(t *testing.T) {
	got := row("2x Latte", "$260.00", 32)
	if len([]rune(got)) != 32 {
		t.Fatalf("width %d, want 32: %q", len([]rune(got)), got)
	}
	if got[:8] != "2x Latte" || got[len(got)-7:] != "$260.00" {
		t.Fatalf("layout %q", got)
	}
}

func TestRowTrimsLongLeft(t *testing.T) {
	got := row("Matcha latte + foam + nieve de matcha extra grande", "$180.00", 32)
	if len([]rune(got)) != 32 || got[len(got)-8:] != " $180.00" {
		t.Fatalf("layout %q", got)
	}
}

func TestWrapKeepsWords(t *testing.T) {
	lines := wrap("Si esto se lee completo, la impresora está lista.", 20)
	for _, l := range lines {
		if len([]rune(l)) > 20 {
			t.Fatalf("line too long: %q", l)
		}
	}
	if len(lines) < 3 {
		t.Fatalf("expected wrapping, got %v", lines)
	}
}

func TestEncodeAccents(t *testing.T) {
	got := encode("ñ€x☃")
	want := []byte{0xF1, 0x80, 'x', '?'}
	if !bytes.Equal(got, want) {
		t.Fatalf("got % x want % x", got, want)
	}
}

func TestRenderCommands(t *testing.T) {
	doc := Doc{Lines: []Line{
		{T: "text", V: "Cocina", Align: "center", Bold: true, Size: 2},
		{T: "row", L: "Mesa 4", R: "18:30"},
		{T: "hr"},
	}, Drawer: true}
	out := Render(doc, 32, true)
	for name, seq := range map[string][]byte{
		"init":        {esc, '@'},
		"codepage":    {esc, 't', 16},
		"center":      {esc, 'a', 1},
		"bold on":     {esc, 'E', 1},
		"double size": {gs, '!', 0x11},
		"drawer":      {esc, 'p', 0, 25, 250},
		"cut":         {gs, 'V', 66, 0},
	} {
		if !bytes.Contains(out, seq) {
			t.Errorf("missing %s sequence % x", name, seq)
		}
	}
	if !bytes.Contains(out, []byte("Cocina\n")) {
		t.Errorf("text missing")
	}
	f := false
	if bytes.Contains(Render(Doc{Cut: &f}, 32, true), []byte{gs, 'V', 66, 0}) {
		t.Errorf("document opting out of cut was cut")
	}
	if bytes.Contains(Render(Doc{}, 32, false), []byte{gs, 'V', 66, 0}) {
		t.Errorf("printer without cutter was sent a cut")
	}
}

func TestAllowedOrigin(t *testing.T) {
	for origin, want := range map[string]bool{
		"https://app.kuik.mx":       true,
		"https://kuik.mx":           true,
		"http://localhost:3000":     true,
		"http://app.localhost:3000": true,
		"https://evil.example":      false,
		"https://kuik.mx.evil.com":  false,
		"":                          false,
	} {
		if got := allowedOrigin(origin); got != want {
			t.Errorf("%q: got %v want %v", origin, got, want)
		}
	}
}
