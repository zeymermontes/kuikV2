package main

import (
	"context"
	"database/sql"

	"go.mau.fi/whatsmeow/types"
)

// Registry maps a Kuik tenant to the WhatsApp account it paired.
//
// This exists because there is nowhere on whatsmeow's own device record to hang
// a tenant id. The obvious candidate, PushName, is a real WhatsApp field: the
// server overwrites it with the account's display name as soon as the session
// connects (appstate.go), so a tag stored there silently disappears and every
// restaurant is left unpaired after a restart.
//
// One tiny table alongside whatsmeow's own, in the same database, so a single
// DATABASE_URL still holds everything.
type Registry struct {
	db *sql.DB
}

func NewRegistry(db *sql.DB) (*Registry, error) {
	_, err := db.Exec(`
		create table if not exists kuik_sessions (
			tenant_id  text primary key,
			jid        text not null,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)
	`)
	if err != nil {
		return nil, err
	}
	return &Registry{db: db}, nil
}

// Link records which WhatsApp account a tenant paired. Called once pairing
// succeeds, because the JID does not exist before then.
func (r *Registry) Link(ctx context.Context, tenantID string, jid types.JID) error {
	_, err := r.db.ExecContext(ctx, `
		insert into kuik_sessions (tenant_id, jid) values ($1, $2)
		on conflict (tenant_id) do update
		  set jid = excluded.jid, updated_at = now()
	`, tenantID, jid.ToNonAD().String())
	return err
}

func (r *Registry) Unlink(ctx context.Context, tenantID string) error {
	_, err := r.db.ExecContext(ctx, `delete from kuik_sessions where tenant_id = $1`, tenantID)
	return err
}

// JIDFor returns the account this tenant paired, if any.
func (r *Registry) JIDFor(ctx context.Context, tenantID string) (types.JID, bool) {
	var raw string
	err := r.db.QueryRowContext(ctx,
		`select jid from kuik_sessions where tenant_id = $1`, tenantID).Scan(&raw)
	if err != nil {
		return types.JID{}, false
	}
	jid, err := types.ParseJID(raw)
	if err != nil {
		return types.JID{}, false
	}
	return jid, true
}

// All returns every tenant that has a paired account, for reconnecting on boot.
func (r *Registry) All(ctx context.Context) map[string]types.JID {
	out := map[string]types.JID{}
	rows, err := r.db.QueryContext(ctx, `select tenant_id, jid from kuik_sessions`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var tenantID, raw string
		if err := rows.Scan(&tenantID, &raw); err != nil {
			continue
		}
		if jid, err := types.ParseJID(raw); err == nil {
			out[tenantID] = jid
		}
	}
	return out
}
