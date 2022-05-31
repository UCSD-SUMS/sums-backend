import { readFile, writeFile } from "fs/promises";

async function readLines(path: string): Promise<string[]> {
  return (await readFile(path, "utf-8")).split("\n");
}

class Person {
  constructor(public email: string, public times: number[]) {}

  public slot = undefined as undefined | number;
}

async function main() {
  const emails = await readLines("tmp/ems.txt");
  const string_times = await readLines("tmp/prefs.txt");
  const allTimes = string_times.map((s) =>
    s.split(", ").map((s) =>
      parseInt(
        s
          .match(/([0-9])\).+?([0-9]):([0-9])/)
          ?.splice(1)
          .join("") as string
      )
    )
  );

  const people = emails.map((e, i) => new Person(e, allTimes[i]));
  const slots: { [slot: number]: Person[] } = {};

  const possible = [
    220, // M
    224, // M
    232, // M
    320, // Tu
    324, // Tu
    332, // Tu
    420, // W
    424, // W
    432, // W
    520, // Th
    524, // Th
    620, // F
    624, // F
    632, // F
  ];
  possible.forEach((t) => (slots[t] = []));

  function pushPerson(p: Person): boolean {
    while (p.times.length) {
      const nextSlot = p.times.shift() as number;
      const sl = slots[nextSlot];
      if (sl.length < 3) {
        sl.unshift(p);
        p.slot = nextSlot;
        return true;
      } else {
        for (let i = 0; i < sl.length; i++) {
          if (pushPerson(sl[i])) {
            sl[i] = p;
            p.slot = nextSlot;
            return true;
          }
        }
      }
    }
    return false;
  }

  people.forEach(pushPerson);

  function fTime(slot: number): string {
    return (
      `(5/${Math.floor(slot / 100)}) ` +
      `@ ${Math.floor((slot % 100) / 10)}:${slot % 10}0`
    );
  }

  for (const p of people.sort(
    (a, b) => (a.slot as number) - (b.slot as number)
  )) {
    const t = p.slot ? fTime(p.slot) : "NONE";
    console.error(`${t} -- APM 7218 -- ${p.email}`);
  }

  console.error();

  for (const slot of possible) {
    console.error(`${fTime(slot)} -- ${slots[slot].length}`);
  }

  await writeFile(
    "tmp/quals.json",
    JSON.stringify(
      people.reduce(
        (o, p) => ({ ...o, [p.email]: fTime(p.slot as number) }),
        {}
      ),
      null,
      2
    )
  );
}

main();
