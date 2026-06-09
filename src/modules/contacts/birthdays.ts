/** Days until the next occurrence of a birthday (0 = today). */
export function daysUntilBirthday(birthday: Date, from = new Date()): number {
  const today = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  let next = Date.UTC(
    from.getFullYear(),
    birthday.getUTCMonth(),
    birthday.getUTCDate()
  );
  if (next < today) {
    next = Date.UTC(
      from.getFullYear() + 1,
      birthday.getUTCMonth(),
      birthday.getUTCDate()
    );
  }
  return Math.round((next - today) / 86_400_000);
}

export function formatBirthday(birthday: Date): string {
  return birthday.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
