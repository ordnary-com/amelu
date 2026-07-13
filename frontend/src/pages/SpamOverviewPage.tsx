import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type SpamOverview } from "../api/client";
import { ListSkeleton } from "../components/ListSkeleton";

export function SpamOverviewPage() {
  const navigate = useNavigate();
  const { domainId } = useParams<{ domainId: string }>();
  const [overview, setOverview] = useState<SpamOverview | null>(null);

  useEffect(() => {
    if (!domainId) return;
    api.getSpamOverview(domainId).then(setOverview);
  }, [domainId]);

  if (!domainId) return null;

  const goTo = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    navigate(path);
  };

  const subjectHref = `/domains/${domainId}/spam/subject`;
  const senderListsHref = `/domains/${domainId}/spam/sender-lists`;
  const recipientDenylistHref = `/domains/${domainId}/spam/recipient-denylist`;

  return (
    <div>
      <h1>Spam Filter Overview</h1>

      <div className="material-card">
        {overview === null ? (
          <ListSkeleton rows={5} />
        ) : (
          <md-list>
            <md-list-item type="link" href={subjectHref} onClick={(e: React.MouseEvent) => goTo(e, subjectHref)}>
              <div slot="headline">Subject rewriting</div>
              <div slot="end">
                <span className={overview.subjectRewrite ? "tag green" : "tag"}>
                  {overview.subjectRewrite ? "Enabled" : "Disabled"}
                </span>
              </div>
            </md-list-item>
            <md-list-item type="link" href={subjectHref} onClick={(e: React.MouseEvent) => goTo(e, subjectHref)}>
              <div slot="headline">Junk if subject contains "SPAM"</div>
              <div slot="end">
                <span className={overview.junkIfSubjectSpam ? "tag green" : "tag"}>
                  {overview.junkIfSubjectSpam ? "Enabled" : "Disabled"}
                </span>
              </div>
            </md-list-item>
            <md-list-item
              type="link"
              href={senderListsHref}
              onClick={(e: React.MouseEvent) => goTo(e, senderListsHref)}
            >
              <div slot="headline">Sender denylist</div>
              <div slot="end" className="light">
                {overview.senderDenylistCount} entries
              </div>
            </md-list-item>
            <md-list-item
              type="link"
              href={senderListsHref}
              onClick={(e: React.MouseEvent) => goTo(e, senderListsHref)}
            >
              <div slot="headline">Sender junklist</div>
              <div slot="end" className="light">
                {overview.senderJunklistCount} entries
              </div>
            </md-list-item>
            <md-list-item
              type="link"
              href={recipientDenylistHref}
              onClick={(e: React.MouseEvent) => goTo(e, recipientDenylistHref)}
            >
              <div slot="headline">Recipient denylist</div>
              <div slot="end" className="light">
                {overview.recipientDenylistCount} entries
              </div>
            </md-list-item>
          </md-list>
        )}
      </div>

      <p className="light" style={{ marginTop: "1.5rem" }}>
        Detection sensitivity (aggressiveness) and a sender allowlist that bypasses spam scoring aren't available -
        both would require changing settings shared across every domain on this mail cluster, which isn't safe to
        expose per-domain.
      </p>
    </div>
  );
}
