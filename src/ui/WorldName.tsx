/**
 * A world's name, with the project's pun spelled out when the name begins
 * with "Seiza": 正座 (seiza, formal kneeling) and 星座 (seiza, a
 * constellation) are pronounced the same, which is why the app is a
 * kneeling figure under a starry sky. A deployment that names its world
 * something else gets its name as written.
 */
export function WorldName({ name }: { name: string }) {
  const match = /^Seiza\b(.*)$/s.exec(name);
  if (!match) return <>{name}</>;
  return (
    <>
      Seiza
      <span
        title="正座 (seiza): kneeling formally. 星座 (seiza): a constellation. Same sound, hence a kneeling figure under the stars."
        style={{ fontWeight: 500, fontSize: "0.86em", margin: "0 0.35em", letterSpacing: "0.03em" }}
      >
        <span style={{ color: "#e8c37a" }}>正座</span>
        <span style={{ opacity: 0.45, margin: "0 0.2em" }}>·</span>
        <span style={{ color: "#a9c4ff" }}>星座</span>
      </span>
      {match[1]}
    </>
  );
}

/**
 * A world's name as a title over a subtitle, split at its first dash:
 * "Seiza — Default World" reads as "Seiza 正座 · 星座" over a smaller
 * "Default World", which fits a top-bar pill without crowding it. A name
 * with no dash is just the title.
 */
export function WorldTitle({ name }: { name: string }) {
  const [, title, subtitle] = /^(.*?)\s+[—–-]\s+(.+)$/s.exec(name) ?? [name, name, ""];
  const clip = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 } as const;
  return (
    <span style={{ display: "grid", minWidth: 0, lineHeight: 1.2, textAlign: "left" }}>
      <strong style={clip}>
        <WorldName name={title} />
      </strong>
      {subtitle && <span style={{ ...clip, fontSize: 11, opacity: 0.6 }}>{subtitle}</span>}
    </span>
  );
}
