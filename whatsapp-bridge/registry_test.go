package main

import (
	"context"
	"database/sql"
	"os"
	"testing"

	_ "github.com/lib/pq"
	"go.mau.fi/whatsmeow/types"
)

// The bug this guards: the tenant→account mapping used to live in the device's
// PushName, which WhatsApp overwrites on connect — so every restaurant silently
// lost its session on restart.
func TestRegistryRoundTrip(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	db, err := sql.Open("postgres", url)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	r, err := NewRegistry(db)
	if err != nil {
		t.Fatalf("registry: %v", err)
	}
	ctx := context.Background()
	tenant := "test-tenant-roundtrip"
	defer func() { _ = r.Unlink(ctx, tenant) }()

	if _, ok := r.JIDFor(ctx, tenant); ok {
		t.Fatal("unpaired tenant should have no JID")
	}

	jid, _ := types.ParseJID("5215512345678:12@s.whatsapp.net")
	if err := r.Link(ctx, tenant, jid); err != nil {
		t.Fatalf("link: %v", err)
	}

	got, ok := r.JIDFor(ctx, tenant)
	if !ok {
		t.Fatal("paired tenant should resolve")
	}
	// Stored without the device suffix, so it matches the account rather than
	// one particular linked device.
	if got.String() != "5215512345678@s.whatsapp.net" {
		t.Fatalf("expected the account JID, got %q", got.String())
	}

	if _, found := r.All(ctx)[tenant]; !found {
		t.Fatal("All() must include a paired tenant, or RestoreAll reconnects nothing")
	}

	// Re-pairing the same tenant replaces rather than duplicating.
	other, _ := types.ParseJID("5215599999999@s.whatsapp.net")
	if err := r.Link(ctx, tenant, other); err != nil {
		t.Fatalf("relink: %v", err)
	}
	got, _ = r.JIDFor(ctx, tenant)
	if got.User != "5215599999999" {
		t.Fatalf("re-pairing should replace, got %q", got.String())
	}

	if err := r.Unlink(ctx, tenant); err != nil {
		t.Fatalf("unlink: %v", err)
	}
	if _, ok := r.JIDFor(ctx, tenant); ok {
		t.Fatal("unlinked tenant must not resolve")
	}
}
