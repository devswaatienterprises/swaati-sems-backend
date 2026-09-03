// Timezone Utilities for Swaati Enterprises (Default: Asia/Kolkata / IST)

export const TIMEZONE = 'Asia/Kolkata';

export function getNowInIST(): Date {
  return new Date();
}

export function formatTimeIST(date: Date = new Date()): string {
  return date.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateIST(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // YYYY-MM-DD
}

export function getISTDateMidnight(date: Date = new Date()): Date {
  const dateStr = formatDateIST(date);
  return new Date(`${dateStr}T00:00:00.000Z`);
}
