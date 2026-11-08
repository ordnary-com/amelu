package handlers

import (
	"errors"
	"net/http"

	"amelu/backend/internal/db"
)

type mailboxStorageResponse struct {
	MailboxID string `json:"mailboxId"`
	Address   string `json:"address"`
	UsedBytes int64  `json:"usedBytes"`
	// 0 when the mailbox has no storage limit of its own.
	LimitBytes int64 `json:"limitBytes"`
}

// GetDomainStorage -> GET /api/domains/{id}/mailboxes/storage: how much
// mail each mailbox on the domain holds, from the mail cluster, for the
// storage overview.
func (a *App) GetDomainStorage(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, err := a.Store.GetDomainForOrganization(r.Context(), customer.OrganizationID.String, r.PathValue("id"))
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "domain not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return
	}
	mailboxes, err := a.Store.ListMailboxes(r.Context(), domain.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list mailboxes")
		return
	}
	accounts, err := a.Stalwart.DomainStorage(r.Context(), domain.Name)
	if err != nil {
		writeUpstreamError(w, "could not load storage from the mail cluster", err)
		return
	}
	byName := make(map[string]int, len(accounts))
	for i, acc := range accounts {
		byName[acc.Name] = i
	}
	out := make([]mailboxStorageResponse, 0, len(mailboxes))
	for _, m := range mailboxes {
		resp := mailboxStorageResponse{MailboxID: m.ID, Address: m.LocalPart + "@" + domain.Name, LimitBytes: m.MaxDiskQuotaBytes}
		if i, ok := byName[m.LocalPart]; ok {
			resp.UsedBytes = accounts[i].UsedBytes
			if accounts[i].MaxBytes > 0 {
				resp.LimitBytes = accounts[i].MaxBytes
			}
		}
		out = append(out, resp)
	}
	writeJSON(w, http.StatusOK, out)
}
