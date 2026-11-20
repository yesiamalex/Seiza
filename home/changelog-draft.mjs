// Lists the commits since the newest month in public/changelog.json, to
// write that month's entries from. The changelog is written by hand, in
// plain words for visitors: commit messages are for contributors.
//
//   node home/changelog-draft.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const log = JSON.parse(readFileSync(new URL("./public/changelog.json", import.meta.url), "utf8"));
const newest = log.months[0]?.month ?? "1970-01";
const since = `${newest}-01`;
const out = execFileSync("git", ["log", `--since=${since}`, "--date=short", "--pretty=%ad  %s", "--no-merges"], { encoding: "utf8" });
console.log(`Commits since ${since} (the changelog's newest month is ${newest}):\n`);
console.log(out.trim() || "(none)");
console.log("\nAdd plain-language items to public/changelog.json: tag each one new, world, or better.");
