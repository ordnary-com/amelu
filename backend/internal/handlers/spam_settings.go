package handlers

import (
	"net/http"
	"strings"
)

// --- overview ---

type spamOverviewResponse struct {
	SubjectRewrite         bool `json:"subjectRewrite"`
	JunkIfSubjectSpam      bool `json:"junkIfSubjectSpam"`
	SenderDenylistCount    int  `json:"senderDenylistCount"`
	SenderJunklistCount    int  `json:"senderJunklistCount"`
	RecipientDenylistCount int  `json:"recipientDenylistCount"`
}

func (a *App) GetSpamOverview(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.ID, r.PathValue("id"))
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, spamOverviewResponse{
		SubjectRewrite:         domain.SpamSubjectRewrite,
		JunkIfSubjectSpam:      domain.SpamJunkIfSubjectSpam,
		SenderDenylistCount:    len(parseListField(domain.SpamSenderDenylist)),
		SenderJunklistCount:    len(parseListField(domain.SpamSenderJunklist)),
		RecipientDenylistCount: len(parseListField(domain.SpamRecipientDenylist)),
	})
}

// --- subject handling (part of Migadu's "Aggressiveness" page - the
// aggressiveness threshold itself isn't included since it isn't
// achievable, see GenerateSubjectHandlingScript) ---

type subjectSettingsResponse struct {
	SubjectRewrite    bool `json:"subjectRewrite"`
	JunkIfSubjectSpam bool `json:"junkIfSubjectSpam"`
}

func (a *App) GetSpamSubjectSettings(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.ID, r.PathValue("id"))
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, subjectSettingsResponse{
		SubjectRewrite:    domain.SpamSubjectRewrite,
		JunkIfSubjectSpam: domain.SpamJunkIfSubjectSpam,
	})
}

func (a *App) UpdateSpamSubjectSettings(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.ID, r.PathValue("id"))
	if !ok {
		return
	}

	var req subjectSettingsResponse
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := a.Store.UpdateSpamSubjectSettings(r.Context(), domain.ID, req.SubjectRewrite, req.JunkIfSubjectSpam); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save settings")
		return
	}
	domain.SpamSubjectRewrite = req.SubjectRewrite
	domain.SpamJunkIfSubjectSpam = req.JunkIfSubjectSpam

	if err := a.redeployToAllMailboxes(r.Context(), domain); err != nil {
		writeError(w, http.StatusBadGateway, "settings saved but could not update mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "spam.subject_settings_updated", "Updated spam subject handling settings")
	writeJSON(w, http.StatusOK, req)
}

// --- sender denylist / junklist ---

type senderListsResponse struct {
	Denylist string `json:"denylist"`
	Junklist string `json:"junklist"`
}

func (a *App) GetSpamSenderLists(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.ID, r.PathValue("id"))
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, senderListsResponse{
		Denylist: domain.SpamSenderDenylist,
		Junklist: domain.SpamSenderJunklist,
	})
}

func (a *App) UpdateSpamSenderLists(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.ID, r.PathValue("id"))
	if !ok {
		return
	}

	var req senderListsResponse
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := a.Store.UpdateSpamSenderLists(r.Context(), domain.ID, req.Denylist, req.Junklist); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save sender lists")
		return
	}
	domain.SpamSenderDenylist = req.Denylist
	domain.SpamSenderJunklist = req.Junklist

	if err := a.redeployToAllMailboxes(r.Context(), domain); err != nil {
		writeError(w, http.StatusBadGateway, "lists saved but could not update mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "spam.sender_lists_updated", "Updated sender denylist/junklist")
	writeJSON(w, http.StatusOK, req)
}

// --- recipient denylist ---

type recipientDenylistResponse struct {
	Denylist string `json:"denylist"`
}

func (a *App) GetSpamRecipientDenylist(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.ID, r.PathValue("id"))
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, recipientDenylistResponse{Denylist: domain.SpamRecipientDenylist})
}

func (a *App) UpdateSpamRecipientDenylist(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.ID, r.PathValue("id"))
	if !ok {
		return
	}

	var req recipientDenylistResponse
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	// Migadu enforces "complete addresses only" here - no wildcards - since
	// this is a hard rejection with no possibility of reaching Junk.
	for _, addr := range parseListField(req.Denylist) {
		if strings.Contains(addr, "*") {
			writeError(w, http.StatusBadRequest, "recipient denylist entries must be complete addresses, not wildcard patterns: "+addr)
			return
		}
	}

	if err := a.Store.UpdateSpamRecipientDenylist(r.Context(), domain.ID, req.Denylist); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save recipient denylist")
		return
	}
	domain.SpamRecipientDenylist = req.Denylist

	if err := a.redeployToAllMailboxes(r.Context(), domain); err != nil {
		writeError(w, http.StatusBadGateway, "denylist saved but could not update mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "spam.recipient_denylist_updated", "Updated recipient denylist")
	writeJSON(w, http.StatusOK, req)
}
