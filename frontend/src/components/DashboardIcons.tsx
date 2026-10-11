// Shared by the Dashboard and Email Domains pages, which use the same
// hero and card layout.

export function CheckBadge() {
  return (
    <svg className="dashboard-check" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.9295 5.64928C20.2224 5.35644 20.6972 5.35654 20.9901 5.64928C21.283 5.94217 21.283 6.41693 20.9901 6.70983L9.35043 18.3495C9.05754 18.6424 8.58278 18.6424 8.28988 18.3495L2.99985 13.0594C2.70715 12.7665 2.70702 12.2917 2.99985 11.9989C3.29269 11.7063 3.76755 11.7063 4.06039 11.9989L8.82016 16.7587L19.9295 5.64928Z" />
    </svg>
  );
}

export function DomainIcon() {
  return (
    <svg className="action-card-icon" width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16.4603 21.43L14.4603 15.05C14.2503 14.38 14.9403 13.78 15.5803 14.07L21.5303 16.85C22.2403 17.18 22.1203 18.22 21.3603 18.38L18.9103 18.9L18.0003 21.46C17.7403 22.19 16.6903 22.17 16.4603 21.43Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 11H15.83C14.27 11 13 9.73 13 8.17C13 7.42 13.3 6.7 13.83 6.17L16.28 3.72"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.70996 17.44L6.48996 14.78C6.80996 14.3 7.34996 14.01 7.92996 14.01C8.58996 14.01 9.18996 13.64 9.47996 13.05L9.60996 12.78C9.84996 12.29 9.84996 11.72 9.60996 11.23L8.47996 8.96999C8.18996 8.37999 7.58996 8.00999 6.92996 8.00999"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 2C6.02 2 2 6.02 2 11C2 15.98 6.02 20 11 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M20 11C20 6.02 15.98 2 11 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
