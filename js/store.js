// YADMON — store.js
// Firestore reads/writes + data model. (PLAN.md §7)
//
//   days/{YYYY-MM-DD}  rest, m1..m10, care1..care10, missed1..missed10,
//                      m11_calls, m12_attended, m13_signups, callLog[]
//   state/companion    (minimal for now; traits/neglect land in Phase 3)
//   config/app         (Settings mirror; later)

import {
  getFirestore, doc, getDoc, setDoc, deleteDoc,
  collection, getDocs, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let db = null;

export function initStore(app) {
  db = getFirestore(app);
}

function dayRef(date) {
  return doc(db, "days", date);
}

// Create a day row if missing. Rest-day rows are flagged and carry no metrics.
export async function ensureDayRow(date, rest = false) {
  const ref = dayRef(date);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const base = { date, rest: !!rest, createdAt: serverTimestamp() };
  if (!rest) {
    for (let i = 1; i <= 10; i++) {
      base["m" + i] = null;      // null = not yet confirmed (distinct from 0)
      base["care" + i] = false;
      base["missed" + i] = false;
    }
    base.m11_calls = 0;
    base.m12_attended = 0;
    base.m13_signups = 0;
    base.callLog = [];
  }
  await setDoc(ref, base);
  return base;
}

export async function getDay(date) {
  const snap = await getDoc(dayRef(date));
  return snap.exists() ? snap.data() : null;
}

// Confirm a metric value for a block. missed=true writes 0 as a miss.
export async function writeMetric(date, blockId, value, care, missed = false) {
  await ensureDayRow(date, false);
  await setDoc(
    dayRef(date),
    {
      ["m" + blockId]: missed ? 0 : value,
      ["care" + blockId]: !!care,
      ["missed" + blockId]: !!missed,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// Call generated today (metric 11) + append to the call log. Read-modify-write
// so callLog stays an ordered array of full records.
export async function logCall(date, call) {
  const data = (await getDay(date)) || (await ensureDayRow(date, false));
  const callLog = Array.isArray(data.callLog) ? data.callLog.slice() : [];
  callLog.push({
    id: call.id,
    title: call.title,
    start: call.start,
    end: call.end,
    attended: null,
    signedUp: null,
  });
  await setDoc(
    dayRef(date),
    { m11_calls: (data.m11_calls || 0) + 1, callLog, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// Record the attended/signup follow-up for a logged call.
export async function updateCallFollowup(date, callId, { attended, signedUp }) {
  const data = await getDay(date);
  if (!data) return;
  const callLog = (data.callLog || []).map((c) =>
    c.id === callId ? { ...c, attended, signedUp } : c
  );
  const m12 = callLog.filter((c) => c.attended === true).length;
  const m13 = callLog.filter((c) => c.signedUp === true).length;
  await setDoc(
    dayRef(date),
    { callLog, m12_attended: m12, m13_signups: m13, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// Fix-a-number: overwrite any of today's fields before close. (§3)
export async function fixField(date, field, value) {
  await setDoc(dayRef(date), { [field]: value, updatedAt: serverTimestamp() }, { merge: true });
}

// --- companion state (minimal placeholder; Phase 3 fills traits/neglect) ----
export async function getCompanion() {
  const snap = await getDoc(doc(db, "state", "companion"));
  return snap.exists() ? snap.data() : null;
}
export async function setCompanion(patch) {
  await setDoc(doc(db, "state", "companion"), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

// --- debug / maintenance ----------------------------------------------------
export async function wipeDate(date) {
  await deleteDoc(dayRef(date));
}

// Seed a full day row at once (time machine "inject history"). `metrics` is a
// map of m1..m10 values; care flags default to value>=1, missed=false.
export async function seedDay(date, metrics = {}, rest = false) {
  const row = { date, rest: !!rest, seeded: true, createdAt: serverTimestamp() };
  if (!rest) {
    for (let i = 1; i <= 10; i++) {
      const v = metrics["m" + i] ?? 0;
      row["m" + i] = v;
      row["care" + i] = v >= 1;
      row["missed" + i] = false;
    }
    row.m11_calls = metrics.m11_calls ?? 0;
    row.m12_attended = metrics.m12_attended ?? 0;
    row.m13_signups = metrics.m13_signups ?? 0;
    row.callLog = metrics.callLog ?? [];
  }
  await setDoc(dayRef(date), row);
}

export async function allDays() {
  const rows = [];
  const snap = await getDocs(collection(db, "days"));
  snap.forEach((d) => rows.push(d.data()));
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return rows;
}

// Export all day rows as CSV (dates × 13 metrics). (§7 standing backup)
export async function exportCSV() {
  const rows = await allDays();
  const cols = [
    "date", "rest",
    "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10",
    "m11_calls", "m12_attended", "m13_signups",
  ];
  const header = cols.join(",");
  const lines = rows.map((r) =>
    cols.map((c) => (r[c] == null ? "" : String(r[c]))).join(",")
  );
  return [header, ...lines].join("\n");
}
