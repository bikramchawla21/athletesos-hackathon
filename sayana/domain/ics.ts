function fold(line: string): string {
  return line.replace(/\n/g, "\\n");
}

export function stepsToIcs(
  steps: Array<{ title: string; day: string }>,
  calendarName = "Sayana",
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Sayana//EN`,
    `X-WR-CALNAME:${fold(calendarName)}`,
  ];
  for (const step of steps) {
    const day = step.day.replace(/-/g, "");
    const uid = `${day}-${hash(step.title)}@sayana.app`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${day}`,
      `SUMMARY:${fold(step.title)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
