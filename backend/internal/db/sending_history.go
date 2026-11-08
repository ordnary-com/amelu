package db

import (
	"context"
	"strings"
	"time"
)

// SendingDay is one domain's results on one UTC day.
type SendingDay struct {
	Day                                  time.Time
	Sent, Delivered, Deferred, Rejected int
}

// SendingReason is a rejection reason and how often it came back.
type SendingReason struct {
	Text  string
	Count int
}

// SendingHistory is what a report says about the days it covers.
type SendingHistory struct {
	Days    []string
	Domains map[string]DomainHistory
	Senders map[string][]int
}

type DomainHistory struct {
	Sent, Delivered, Deferred, Rejected []int
	Reasons                             []SendingReason
}

// ReplaceSendingHistory stores a report's days, replacing what was there for
// them, and drops anything older than 30 days. Rows go in through unnest,
// one statement per table, since a report covers thousands of them. The
// script sends names in lower case, so a key can't repeat within a report;
// ON CONFLICT DO NOTHING only keeps a stray duplicate from failing it all.
func (s *Store) ReplaceSendingHistory(ctx context.Context, h SendingHistory) error {
	if len(h.Days) == 0 {
		return nil
	}
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	first, last := h.Days[0], h.Days[len(h.Days)-1]
	for _, q := range []string{
		`DELETE FROM sending_history WHERE day BETWEEN $1::date AND $2::date OR day < now() - interval '30 days'`,
		`DELETE FROM sending_history_senders WHERE day BETWEEN $1::date AND $2::date OR day < now() - interval '30 days'`,
	} {
		if _, err := tx.ExecContext(ctx, q, first, last); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM sending_reasons`); err != nil {
		return err
	}

	var names, days []string
	var sent, delivered, deferred, rejected []int64
	var rNames, rTexts []string
	var rPos, rCounts []int64
	at := func(v []int, i int) int64 {
		if i < len(v) {
			return int64(v[i])
		}
		return 0
	}
	for domain, d := range h.Domains {
		domain = strings.ToLower(domain)
		for i, day := range h.Days {
			if at(d.Sent, i)+at(d.Delivered, i)+at(d.Deferred, i)+at(d.Rejected, i) == 0 {
				continue
			}
			names, days = append(names, domain), append(days, day)
			sent, delivered = append(sent, at(d.Sent, i)), append(delivered, at(d.Delivered, i))
			deferred, rejected = append(deferred, at(d.Deferred, i)), append(rejected, at(d.Rejected, i))
		}
		for i, r := range d.Reasons {
			rNames, rTexts = append(rNames, domain), append(rTexts, r.Text)
			rPos, rCounts = append(rPos, int64(i)), append(rCounts, int64(r.Count))
		}
	}
	if len(names) > 0 {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO sending_history (domain_name, day, sent, delivered, deferred, rejected)
			SELECT * FROM unnest($1::text[], $2::date[], $3::int[], $4::int[], $5::int[], $6::int[])
			ON CONFLICT DO NOTHING`,
			names, days, sent, delivered, deferred, rejected); err != nil {
			return err
		}
	}
	if len(rNames) > 0 {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO sending_reasons (domain_name, position, reason, count)
			SELECT * FROM unnest($1::text[], $2::int[], $3::text[], $4::int[]) ON CONFLICT DO NOTHING`,
			rNames, rPos, rTexts, rCounts); err != nil {
			return err
		}
	}

	var addrs, aDays []string
	var aSent []int64
	for addr, counts := range h.Senders {
		addr = strings.ToLower(addr)
		for i, day := range h.Days {
			if n := at(counts, i); n > 0 {
				addrs, aDays, aSent = append(addrs, addr), append(aDays, day), append(aSent, n)
			}
		}
	}
	if len(addrs) > 0 {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO sending_history_senders (address, day, sent)
			SELECT * FROM unnest($1::text[], $2::date[], $3::int[])
			ON CONFLICT DO NOTHING`,
			addrs, aDays, aSent); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// DomainSendingHistory returns the domain's stored days since since, its
// rejection reasons, and per sender address on the domain the days it sent.
func (s *Store) DomainSendingHistory(ctx context.Context, domainName string, since time.Time) ([]SendingDay, []SendingReason, map[string]map[string]int, error) {
	domainName = strings.ToLower(domainName)
	rows, err := s.conn.QueryContext(ctx, `
		SELECT day, sent, delivered, deferred, rejected FROM sending_history
		WHERE domain_name = $1 AND day >= $2::date ORDER BY day`, domainName, since)
	if err != nil {
		return nil, nil, nil, err
	}
	var days []SendingDay
	for rows.Next() {
		var d SendingDay
		if err := rows.Scan(&d.Day, &d.Sent, &d.Delivered, &d.Deferred, &d.Rejected); err != nil {
			rows.Close()
			return nil, nil, nil, err
		}
		days = append(days, d)
	}
	rows.Close()

	rows, err = s.conn.QueryContext(ctx, `SELECT reason, count FROM sending_reasons WHERE domain_name = $1 ORDER BY position`, domainName)
	if err != nil {
		return nil, nil, nil, err
	}
	var reasons []SendingReason
	for rows.Next() {
		var r SendingReason
		if err := rows.Scan(&r.Text, &r.Count); err != nil {
			rows.Close()
			return nil, nil, nil, err
		}
		reasons = append(reasons, r)
	}
	rows.Close()

	rows, err = s.conn.QueryContext(ctx, `
		SELECT address, day, sent FROM sending_history_senders
		WHERE address LIKE '%@' || $1 AND day >= $2::date`, domainName, since)
	if err != nil {
		return nil, nil, nil, err
	}
	defer rows.Close()
	senders := map[string]map[string]int{}
	for rows.Next() {
		var addr string
		var day time.Time
		var n int
		if err := rows.Scan(&addr, &day, &n); err != nil {
			return nil, nil, nil, err
		}
		if senders[addr] == nil {
			senders[addr] = map[string]int{}
		}
		senders[addr][day.Format(time.DateOnly)] = n
	}
	return days, reasons, senders, rows.Err()
}
