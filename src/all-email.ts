import { readFile, writeFile } from "fs/promises";

async function readLines(path: string): Promise<string[]> {
  return (await readFile(path, "utf-8")).split("\n").map((s) => s.trim());
}

function strCmp(a: string, b: string): number {
  if (a < b) {
    return -1;
  } else if (a == b) {
    return 0;
  } else {
    return +1;
  }
}

function strSort<T>(f: (x: T) => string) {
  return (a: T, b: T) => strCmp(f(a), f(b));
}

async function main() {
  const email2time = JSON.parse(
    await readFile("tmp/all-quals.json", "utf-8")
  ) as { [email: string]: string };
  const ems = await readLines("tmp/all-ems.txt");
  const first = await readLines("tmp/all-first.txt");
  const last = await readLines("tmp/all-last.txt");

  let people = ems.map((e, i) => ({
    email: e,
    first: first[i],
    last: last[i],
    time: email2time[e],
  }));
  const dedup = people.reduce((o, p) => ({ ...o, [p.email]: p }), {});
  people = Object.values(dedup);

  console.error("\nBy Scheduled Time");
  people.sort(strSort((p) => `${p.time}\0${p.first}\0${p.last}`));
  let currentTime = "";
  for (const p of people) {
    if (p.time !== currentTime) {
      currentTime = p.time;
      console.error(`\n${currentTime}`);
    }
    console.error(`  ${p.first} ${p.last} -- ${p.email}`);
  }
  console.error();

  console.error("\nBy Last Name, First Name");
  people.sort(strSort((p) => `${p.last}\0${p.first}`));
  for (const p of people) {
    console.error(`  ${p.time} -- ${p.last}, ${p.first} -- ${p.email}`);
  }
  console.error();
}

main();
