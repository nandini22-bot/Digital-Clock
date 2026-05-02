// -------------------------------
// Digital Clock + Alarm App Logic
// -------------------------------

const clockEl = document.querySelector("#clock");
const dateEl = document.querySelector("#date");
const formatToggleBtn = document.querySelector("#formatToggle");
const themeToggleBtn = document.querySelector("#themeToggle");
const alarmTimeInput = document.querySelector("#alarmTimeInput");
const alarmPeriodSelect = document.querySelector("#alarmPeriod");
const addAlarmBtn = document.querySelector("#addAlarmBtn");
const alarmMessageEl = document.querySelector("#alarmMessage");
const stopAlarmBtn = document.querySelector("#stopAlarmBtn");
const snoozeBtn = document.querySelector("#snoozeBtn");
const alarmAudio = document.querySelector("#alarmAudio");

const ALARMS_KEY = "digital-clock-alarms";
const THEME_KEY = "digital-clock-theme";
const FORMAT_KEY = "digital-clock-is-24h";
const API_URL = new URL("save_alarm.php", window.location.href).toString();
const BACKEND_ENABLED = window.location.protocol === "http:" || window.location.protocol === "https:";

let alarms = normalizeAlarms(loadAlarms());
let use24Hour = loadFormatPreference();
let activeRingingAlarm = null;
let isAlarmPlaying = false;

applySavedTheme();
updateFormatToggleText();
notifyAlarmState();
tick();
setInterval(tick, 1000);
if (BACKEND_ENABLED) {
  fetchAlarmsFromServer();
}

formatToggleBtn.addEventListener("click", () => {
  use24Hour = !use24Hour;
  localStorage.setItem(FORMAT_KEY, String(use24Hour));
  updateFormatToggleText();
  notifyAlarmState();
  tick();
});

themeToggleBtn.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  themeToggleBtn.innerText = isDark ? "Light mode" : "Dark mode";
});

addAlarmBtn.addEventListener("click", addAlarm);
stopAlarmBtn.addEventListener("click", stopAlarm);
snoozeBtn.addEventListener("click", snoozeAlarm);

function tick() {
  const now = new Date();
  clockEl.innerText = formatClockTime(now);
  dateEl.innerText = formatDate(now);
  checkAlarms(now);
}

function formatClockTime(dateObj) {
  const hours24 = dateObj.getHours();
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");
  const seconds = String(dateObj.getSeconds()).padStart(2, "0");
  const period = hours24 >= 12 ? "PM" : "AM";

  if (use24Hour) {
    return `${String(hours24).padStart(2, "0")}:${minutes}:${seconds} ${period}`;
  }

  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, "0")}:${minutes}:${seconds} ${period}`;
}

function formatDate(dateObj) {
  return dateObj.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function updateFormatToggleText() {
  formatToggleBtn.innerText = use24Hour ? "Switch to 12-hour" : "Switch to 24-hour";
}

async function addAlarm() {
  const rawValue = alarmTimeInput.value;
  const period = alarmPeriodSelect.value;
  const value = convertTo24HourFromPicker(rawValue, period); // Stored as HH:MM (24-hour)

  if (!value) {
    alarmMessageEl.innerText = "Please choose a valid alarm time.";
    return;
  }

  if (alarms.includes(value)) {
    alarmMessageEl.innerText = "This alarm already exists.";
    return;
  }

  alarms = normalizeAlarms([...alarms, value]);
  saveAlarms();
  notifyAlarmState();
  alarmMessageEl.innerText = `Alarm set for ${displayAlarmTime(value)}.`;
  alarmTimeInput.value = "";
  alarmPeriodSelect.value = "AM";

  const saveResult = await saveAllAlarmsToServer();
  if (BACKEND_ENABLED && !saveResult.ok) {
    alarmMessageEl.innerText += " (Saved locally. Server sync failed.)";
  }
}

function convertTo24HourFromPicker(rawValue, period) {
  if (!rawValue || !/^\d{2}:\d{2}$/.test(rawValue)) {
    return "";
  }

  let [hour, minute] = rawValue.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return "";
  }

  // Convert the selected hour to 12-hour base first (0/12 -> 12, 13 -> 1).
  const hour12 = hour % 12 || 12;
  let hour24 = hour12;

  if (period === "AM") {
    hour24 = hour12 === 12 ? 0 : hour12;
  } else {
    hour24 = hour12 === 12 ? 12 : hour12 + 12;
  }

  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function checkAlarms(now) {
  if (isAlarmPlaying) {
    return;
  }

  const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;

  if (!alarms.includes(nowHHMM)) {
    return;
  }

  activeRingingAlarm = nowHHMM;
  startAlarm();
}

function startAlarm() {
  isAlarmPlaying = true;
  alarmMessageEl.innerText = `Alarm Ringing! (${displayAlarmTime(activeRingingAlarm)})`;

  alarmAudio.currentTime = 0;
  alarmAudio.loop = true;

  const playPromise = alarmAudio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      alarmMessageEl.innerText += " - Click Stop/Snooze after interacting with page.";
    });
  }
}

function stopAlarm() {
  if (!isAlarmPlaying) {
    alarmMessageEl.innerText = "No active alarm.";
    return;
  }

  alarmAudio.pause();
  alarmAudio.currentTime = 0;
  alarmAudio.loop = false;
  isAlarmPlaying = false;
  alarmMessageEl.innerText = "Alarm stopped.";
  activeRingingAlarm = null;
}

async function snoozeAlarm() {
  if (!isAlarmPlaying || !activeRingingAlarm) {
    alarmMessageEl.innerText = "No active alarm to snooze.";
    return;
  }

  const snoozedTime = computeSnoozeTime(activeRingingAlarm, 5);
  alarms = normalizeAlarms([...alarms, snoozedTime]);
  saveAlarms();
  notifyAlarmState();

  stopAlarm();
  alarmMessageEl.innerText = `Snoozed for 5 minutes (${displayAlarmTime(snoozedTime)}).`;

  const saveResult = await saveAllAlarmsToServer();
  if (BACKEND_ENABLED && !saveResult.ok) {
    alarmMessageEl.innerText += " (Saved locally. Server sync failed.)";
  }
}

function computeSnoozeTime(hhmm, minutesToAdd) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const dateObj = new Date();
  dateObj.setHours(hours, minutes, 0, 0);
  dateObj.setMinutes(dateObj.getMinutes() + minutesToAdd);
  return `${String(dateObj.getHours()).padStart(2, "0")}:${String(
    dateObj.getMinutes()
  ).padStart(2, "0")}`;
}

async function removeAlarm(alarmTime) {
  alarms = alarms.filter((time) => time !== alarmTime);
  saveAlarms();
  notifyAlarmState();
  alarmMessageEl.innerText = `Removed alarm ${displayAlarmTime(alarmTime)}.`;

  const deleteResult = await deleteAlarmFromServer(alarmTime);
  if (BACKEND_ENABLED && !deleteResult.ok) {
    const saveResult = await saveAllAlarmsToServer();
    if (!saveResult.ok) {
      alarmMessageEl.innerText += " (Removed locally. Server sync failed.)";
    }
  }
}

function displayAlarmTime(hhmm) {
  const [hour24String, minute] = hhmm.split(":");
  const hour24 = Number(hour24String);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  const twelveHourText = `${String(hour12).padStart(2, "0")}:${minute} ${period}`;

  if (use24Hour) {
    return `${hour24String}:${minute} (${twelveHourText})`;
  }

  return `${twelveHourText} (${hour24String}:${minute})`;
}

function saveAlarms() {
  localStorage.setItem(ALARMS_KEY, JSON.stringify(alarms));
}

async function fetchAlarmsFromServer() {
  if (!BACKEND_ENABLED) {
    return;
  }

  try {
    const response = await fetch(API_URL, { method: "GET" });
    if (!response.ok) {
      alarmMessageEl.innerText = "Server fetch failed. Using local alarms.";
      return;
    }

    const data = await response.json();
    if (!Array.isArray(data.alarms)) {
      alarmMessageEl.innerText = "Invalid server response. Using local alarms.";
      return;
    }

    alarms = normalizeAlarms(data.alarms);
    saveAlarms();
    notifyAlarmState();
    alarmMessageEl.innerText = "Alarms synced from server.";
  } catch (error) {
    alarmMessageEl.innerText = "Server unreachable. Using local alarms.";
  }
}

async function saveAllAlarmsToServer() {
  if (!BACKEND_ENABLED) {
    return { ok: true, skipped: true };
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alarms }),
    });

    if (!response.ok) {
      return { ok: false };
    }

    const data = await response.json();
    if (!Array.isArray(data.alarms)) {
      return { ok: false };
    }

    alarms = normalizeAlarms(data.alarms);
    saveAlarms();
    notifyAlarmState();
    return { ok: true };
  } catch (error) {
    return { ok: false };
  }
}

async function deleteAlarmFromServer(alarm) {
  if (!BACKEND_ENABLED) {
    return { ok: true, skipped: true };
  }

  try {
    const response = await fetch(API_URL, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alarm }),
    });

    if (!response.ok) {
      return { ok: false };
    }

    const data = await response.json();
    if (!Array.isArray(data.alarms)) {
      return { ok: false };
    }

    alarms = normalizeAlarms(data.alarms);
    saveAlarms();
    notifyAlarmState();
    return { ok: true };
  } catch (error) {
    return { ok: false };
  }
}

function normalizeAlarms(source) {
  if (!Array.isArray(source)) {
    return [];
  }

  return [...new Set(source.filter((item) => /^\d{2}:\d{2}$/.test(item)))].sort();
}

function notifyAlarmState() {
  window.dispatchEvent(
    new CustomEvent("alarms-updated", {
      detail: {
        alarms: [...alarms],
        use24Hour,
      },
    })
  );
}

function loadAlarms() {
  try {
    return JSON.parse(localStorage.getItem(ALARMS_KEY));
  } catch (error) {
    return [];
  }
}

function loadFormatPreference() {
  const stored = localStorage.getItem(FORMAT_KEY);
  // Default to 12-hour mode so AM/PM is visible for users by default.
  return stored === null ? false : stored === "true";
}

function applySavedTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const useDark = savedTheme === "dark";
  document.body.classList.toggle("dark", useDark);
  themeToggleBtn.innerText = useDark ? "Light mode" : "Dark mode";
}

// Bridge used by React. Vanilla JS remains source-of-truth for clock/alarm logic.
window.AlarmAppBridge = {
  getAlarms: () => [...alarms],
  is24Hour: () => use24Hour,
  formatAlarm: (time) => displayAlarmTime(time),
  removeAlarm: (time) => removeAlarm(time),
};
