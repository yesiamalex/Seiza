/** Where Seiza comes from: one small line, on the join screen and in the
 *  controls guide, so it's findable without the world looking like a
 *  developer page. Every world built on Seiza shows the same line. */
export const REPO_URL = "https://github.com/yesiamalex/Seiza";
export const DEVELOPER_URL = "https://github.com/yesiamalex";

export function Credit() {
  const link = { color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 } as const;
  return (
    <small style={{ opacity: 0.5, textAlign: "center", fontSize: 11 }}>
      Open source on{" "}
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" style={link}>
        GitHub
      </a>{" "}
      · by{" "}
      <a href={DEVELOPER_URL} target="_blank" rel="noopener noreferrer" style={link}>
        yesiamalex
      </a>
    </small>
  );
}
