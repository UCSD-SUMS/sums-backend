import { readFile } from "fs/promises";

import Fastify from "fastify";
import { DateTime } from "luxon";

import { GoogleClient } from "./google.js";

interface APIError {
  error: string;
}

const google = new GoogleClient();

const app = Fastify();

app.get("/", async (req, reply) => {
  await reply.send("The SUMS Web Server is Running");
});

// GOOGLE AUTHENTICATION

app.get("/google-auth", async (_, reply) => {
  reply.redirect(307, google.authorizeURL());
});

app.get<{
  Querystring: {
    code: string;
  };
  Reply: APIError;
}>("/google-redirect", async (req, reply) => {
  if (typeof req.query.code === "string") {
    await google.exchangeCode(req.query.code);
    reply.redirect(307, "https://www.joinsums.org");
  } else {
    reply.status(400);
    reply.send({ error: "code parameter is missing" });
  }
});

// ATTENDANCE INFORMATION

interface Attendance {
  events: number;
  meetings: number;
}

interface EveryAttendance {
  [email: string]: Attendance;
}

let attendanceData = {
  when: DateTime.fromSeconds(0),
  value: {} as EveryAttendance,
};

app.get<{ Params: { email: string }; Reply: Attendance | APIError }>(
  "/attendance/:email",
  async (req, reply) => {
    // refresh old attendance data
    if (attendanceData.when < DateTime.now().minus({ seconds: 60 })) {
      /** Fetch data from spreadsheets and map reduce to tally by email */
      async function fD(i: string, r: string) {
        const raw = await google.fetchJSON<{ values: string[][] }>(
          `https://sheets.googleapis.com/v4/spreadsheets/${i}/values/${r}?dateTimeRenderOption=FORMATTED_STRING`
        );
        const emails = raw.values
          .filter(
            (row) =>
              DateTime.fromFormat(row[0], "M/d/y H:mm:ss") >
              DateTime.now().minus({ days: 90 })
          )
          .map((row) => row[3]);
        const count: { [email: string]: number } = {};
        for (const email of emails) {
          count[email] = (count[email] || 0) + 1;
        }
        return count;
      }

      // pull data from EVENTS and MEETINGS spreadsheets
      const eventId = "1H3KO4Ee9OAJtXGgFFwXoEYYCyfmKqzpVenXUPOvj-c0";
      const meetingId = "1G-osG2mqbmgTdSygtZXg1DzGRgyWMbKvl_ymoW9kRBA";
      const eventRange = "A380:D";
      const meetingRange = "A248:D";
      const eventData = await fD(eventId, eventRange);
      const meetingData = await fD(meetingId, meetingRange);

      // combine EVENTS and MEETINGS data by email
      const everyAttendance: EveryAttendance = {};
      for (const email of new Set(
        Object.keys(eventData).concat(Object.keys(meetingData))
      )) {
        everyAttendance[email] = {
          events: eventData[email] || 0,
          meetings: meetingData[email] || 0,
        };
      }

      // store new attendance data
      attendanceData = {
        when: DateTime.now(),
        value: everyAttendance,
      };
    }

    // send back attendance data
    const a = attendanceData.value[req.params.email] || {
      events: 0,
      meetings: 0,
    };
    reply.send(a);
  }
);

// TEMP VERY TEMP
app.get<{ Params: { email: string } }>("/quals/:email", async (req, reply) => {
  const data: { [email: string]: string } = JSON.parse(
    await readFile("tmp/quals.json", "utf-8")
  );
  reply.send(`${req.params.email} -- ${data[req.params.email]}`);
});

// START SERVER

app.listen(8000).catch((err) => console.error(err));
