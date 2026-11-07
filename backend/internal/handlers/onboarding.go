package handlers

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"amelu/backend/internal/db"
)

// Fixed choices so the answers can be counted; the dashboard shows the same lists.
var (
	onboardingUseCases  = map[string]bool{"personal": true, "business": true, "agency": true, "nonprofit": true, "other": true}
	onboardingTeamSizes = map[string]bool{"1": true, "2-10": true, "11-50": true, "51+": true}
	onboardingSources   = map[string]bool{
		"search": true, "social": true, "reddit": true, "friend": true, "review": true,
		"directory": true, "ai": true, "ordnary": true, "other": true,
	}
)

type onboardingRequest struct {
	OrganizationName string `json:"organizationName"`
	UseCase          string `json:"useCase"`
	TeamSize         string `json:"teamSize"`
	Source           string `json:"source"`
	SourceDetail     string `json:"sourceDetail"`
}

// CompleteOnboarding -> POST /api/onboarding
//
// Saves the first-login answers and marks the account onboarded. Every field
// is optional: "Skip" sends an empty body. The organization name is only
// changed by its owner.
func (a *App) CompleteOnboarding(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	var req onboardingRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	answers := db.OnboardingAnswers{
		UseCase:      pick(req.UseCase, onboardingUseCases),
		TeamSize:     pick(req.TeamSize, onboardingTeamSizes),
		Source:       pick(req.Source, onboardingSources),
		SourceDetail: strings.TrimSpace(req.SourceDetail),
	}
	if utf8.RuneCountInString(answers.SourceDetail) > 200 {
		writeError(w, http.StatusBadRequest, "keep the answer under 200 characters")
		return
	}
	profile, ok := a.loadProfile(w, r, customer.ID)
	if !ok {
		return
	}
	if name := strings.TrimSpace(req.OrganizationName); name != "" && name != profile.OrganizationName {
		if profile.Role != "owner" {
			writeError(w, http.StatusForbidden, "only the owner can rename the organization")
			return
		}
		if utf8.RuneCountInString(name) > 100 {
			writeError(w, http.StatusBadRequest, "organization name is too long")
			return
		}
		if err := a.Store.UpdateOrganizationName(r.Context(), profile.OrganizationID, name); err != nil {
			writeError(w, http.StatusInternalServerError, "could not rename organization")
			return
		}
	}
	if err := a.Store.CompleteOnboarding(r.Context(), customer.ID, profile.OrganizationID, answers); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save onboarding")
		return
	}
	if profile, ok = a.loadProfile(w, r, customer.ID); !ok {
		return
	}
	writeJSON(w, http.StatusOK, toProfileResponse(profile))
}

// pick keeps a value only if it is one of the known choices.
func pick(value string, allowed map[string]bool) string {
	if allowed[value] {
		return value
	}
	return ""
}
