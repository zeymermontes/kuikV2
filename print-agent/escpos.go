package main

import (
	"bytes"
	"strings"
	"unicode/utf8"
)

// ESC/POS is the near-universal command set of receipt printers (Epson TM,
// Star, Bixolon, the no-name 58 mm ones). What follows is the small subset
// every one of them honours: init, alignment, bold, double size, feed, cut,
// drawer pulse, and a Western code page so accents come out as accents.

const (
	esc = 0x1B
	gs  = 0x1D
)

// Render lays the document out for `width` characters per line (32 for 58 mm
// paper, 48 for 80 mm) and returns the bytes to send. `cut` is the printer's
// setting; a document may still opt out (a drawer kick prints nothing).
func Render(doc Doc, width int, cut bool) []byte {
	if width <= 0 {
		width = 48
	}
	var b bytes.Buffer
	b.Write([]byte{esc, '@'})     // initialise
	b.Write([]byte{esc, 't', 16}) // code page WPC1252
	b.Write([]byte{esc, 'a', 0})  // left

	for _, ln := range doc.Lines {
		switch ln.T {
		case "hr":
			b.Write([]byte{esc, 'a', 0})
			b.WriteString(strings.Repeat("-", width))
			b.WriteByte('\n')
		case "feed":
			n := ln.N
			if n <= 0 {
				n = 1
			}
			b.Write([]byte{esc, 'd', byte(n)})
		case "text":
			w := width
			if ln.Size == 2 {
				w = width / 2
			}
			setStyle(&b, ln.Bold, ln.Size == 2)
			b.Write([]byte{esc, 'a', alignCode(ln.Align)})
			for _, s := range wrap(ln.V, w) {
				b.Write(encode(s))
				b.WriteByte('\n')
			}
			setStyle(&b, false, false)
		case "row":
			w := width
			if ln.Size == 2 {
				w = width / 2
			}
			setStyle(&b, ln.Bold, ln.Size == 2)
			b.Write([]byte{esc, 'a', 0})
			b.Write(encode(row(ln.L, ln.R, w)))
			b.WriteByte('\n')
			setStyle(&b, false, false)
		}
	}

	b.Write([]byte{esc, 'a', 0})
	if doc.Drawer {
		// Pin 2, 50 ms on / 500 ms off: the pulse every drawer understands.
		b.Write([]byte{esc, 'p', 0, 25, 250})
	}
	if cut && (doc.Cut == nil || *doc.Cut) {
		b.Write([]byte{esc, 'd', 3})    // clear the tear bar
		b.Write([]byte{gs, 'V', 66, 0}) // partial cut
	}
	return b.Bytes()
}

func setStyle(b *bytes.Buffer, bold, double bool) {
	if bold {
		b.Write([]byte{esc, 'E', 1})
	} else {
		b.Write([]byte{esc, 'E', 0})
	}
	if double {
		b.Write([]byte{gs, '!', 0x11})
	} else {
		b.Write([]byte{gs, '!', 0x00})
	}
}

func alignCode(a string) byte {
	switch a {
	case "center":
		return 1
	case "right":
		return 2
	}
	return 0
}

// row mirrors renderText's 'row' case in lib/pos/print-doc.ts: right column
// flush right, left column trimmed to leave at least one space.
func row(l, r string, w int) string {
	rr := []rune(r)
	if len(rr) > w {
		rr = rr[:w]
	}
	room := w - len(rr) - 1
	if room < 0 {
		room = 0
	}
	ll := []rune(l)
	if len(ll) > room {
		ll = ll[:room]
	}
	pad := w - len(ll) - len(rr)
	if pad < 1 {
		pad = 1
	}
	return string(ll) + strings.Repeat(" ", pad) + string(rr)
}

// wrap breaks on words, and hard-breaks a single word longer than the line.
func wrap(text string, w int) []string {
	var out []string
	for _, para := range strings.Split(text, "\n") {
		words := strings.Fields(para)
		if len(words) == 0 {
			out = append(out, "")
			continue
		}
		cur := ""
		for _, word := range words {
			switch {
			case cur == "":
				cur = word
			case utf8.RuneCountInString(cur)+1+utf8.RuneCountInString(word) <= w:
				cur += " " + word
			default:
				out = append(out, cur)
				cur = word
			}
			for utf8.RuneCountInString(cur) > w {
				rs := []rune(cur)
				out = append(out, string(rs[:w]))
				cur = string(rs[w:])
			}
		}
		out = append(out, cur)
	}
	return out
}

// encode converts UTF-8 to Windows-1252, the code page selected above. Latin-1
// maps 1:1; the handful of 1252-only symbols are listed; anything else is '?'
// rather than a stray byte that would shift the rest of the line.
func encode(s string) []byte {
	out := make([]byte, 0, len(s))
	for _, r := range s {
		switch {
		case r < 0x80:
			out = append(out, byte(r))
		case r >= 0xA0 && r <= 0xFF:
			out = append(out, byte(r))
		default:
			if b, ok := cp1252[r]; ok {
				out = append(out, b)
			} else {
				out = append(out, '?')
			}
		}
	}
	return out
}

var cp1252 = map[rune]byte{
	'€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
	'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
	'–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F,
	'×': 0xD7, '·': 0xB7,
}
