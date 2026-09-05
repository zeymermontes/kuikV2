package main

// PrintDoc mirrors lib/pos/print-doc.ts. The POS builds one of these per
// ticket, receipt or report; this agent turns it into ESC/POS. Keep the two in
// step: a new line type there is a new case in escpos.go here.

type Line struct {
	T     string `json:"t"`
	V     string `json:"v,omitempty"`
	L     string `json:"l,omitempty"`
	R     string `json:"r,omitempty"`
	Align string `json:"align,omitempty"`
	Bold  bool   `json:"bold,omitempty"`
	Size  int    `json:"size,omitempty"`
	N     int    `json:"n,omitempty"`
}

type Doc struct {
	Title  string `json:"title"`
	Lines  []Line `json:"lines"`
	Cut    *bool  `json:"cut,omitempty"`
	Drawer bool   `json:"drawer,omitempty"`
}

// Printer is the row from the `printers` table, as the poll route returns it.
type Printer struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Kind      string   `json:"kind"`
	Address   string   `json:"address"`
	Width     int      `json:"width"`
	Roles     []string `json:"roles"`
	Stations  []string `json:"stations"`
	HasDrawer bool     `json:"has_drawer"`
	Cut       bool     `json:"cut"`
	Copies    int      `json:"copies"`
	Enabled   bool     `json:"enabled"`
}

type Job struct {
	ID        string `json:"id"`
	PrinterID string `json:"printer_id"`
	Kind      string `json:"kind"`
	Doc       Doc    `json:"doc"`
	Attempts  int    `json:"attempts"`
}

type PollResponse struct {
	Agent struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		TenantID string `json:"tenantId"`
	} `json:"agent"`
	Printers []Printer `json:"printers"`
	Jobs     []Job     `json:"jobs"`
}
