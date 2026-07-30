import { useTheme, type ThemeChoice } from "../context/ThemeContext";

const options: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function AccountAppearancePage() {
  const { theme, setTheme, resolved } = useTheme();

  return (
    <div className="settings-form">
      <h1>Appearance</h1>

      <p>Choose how Amelu looks. System follows your device setting and switches along with it.</p>

      <div className="segmented-control" role="radiogroup" aria-label="Theme">
        {options.map((option) => (
          <label
            key={option.value}
            className={`segmented-option${theme === option.value ? " segmented-option-active" : ""}`}
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={theme === option.value}
              onChange={() => setTheme(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>

      <p className="light">
        {theme === "system"
          ? `Your device is currently set to ${resolved}.`
          : "Applies right away, and only on this device."}
      </p>
    </div>
  );
}
