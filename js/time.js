// YADMON — time.js
// Small wall-clock helpers for the configured timezone. All boundaries in the
// app are wall-clock (DST-safe) because event times come from the calendar and
// we compare in the same zone. (PLAN.md §4, §15)

import { config } from "./config.js";

const TZ = config.timezone; // "America/New_York"

// Return {year,month,day,hour,minute,second} as numbers, in TZ, for a Date.
export function zoneParts(date = new Date(), tz = TZ) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const p = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  // Intl can emit hour "24" at midnight in some engines — normalize.
  if (p.hour === 24) p.hour = 0;
  return p;
}

// Minutes since local midnight (TZ wall-clock) for a Date.
export function zoneMinutes(date = new Date(), tz = TZ) {
  const p = zoneParts(date, tz);
  return p.hour * 60 + p.minute + p.second / 60;
}

// Offset of TZ from UTC, in minutes, at the given instant (e.g. -240 for EDT).
export function zoneOffsetMinutes(date = new Date(), tz = TZ) {
  const p = zoneParts(date, tz);
  const asIfUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asIfUTC - date.getTime()) / 60000);
}

// RFC3339 offset string for TZ at an instant, e.g. "-04:00".
export function zoneOffsetString(date = new Date(), tz = TZ) {
  const off = zoneOffsetMinutes(date, tz);
  const sign = off <= 0 ? "-" : "+";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

// Start/end of "today" in TZ, as RFC3339 strings with the correct offset.
export function dayBoundsRFC3339(date = new Date(), tz = TZ) {
  const p = zoneParts(date, tz);
  const ymd = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const off = zoneOffsetString(date, tz);
  return {
    ymd,
    timeMin: `${ymd}T00:00:00${off}`,
    timeMax: `${ymd}T23:59:59${off}`,
  };
}

// "HH:MM" (config) -> minutes since midnight.
export function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// minutes -> "h:MM AM/PM"
export function minutesToLabel(mins) {
  let h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Is `date` on a configured workday (Sun–Thu by default)?
export function isWorkday(date = new Date(), tz = TZ) {
  // getDay() convention needs the weekday in TZ, not local machine.
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" })
    .format(date);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return config.workdays.includes(map[wd]);
}
