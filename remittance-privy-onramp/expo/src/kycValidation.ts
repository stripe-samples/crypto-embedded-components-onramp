export type DateOfBirthParts = {
  day: number;
  month: number;
  year: number;
};

export function parseDateOfBirth(
  monthInput: string,
  dayInput: string,
  yearInput: string,
): DateOfBirthParts | null {
  if (!/^\d{1,2}$/.test(monthInput) || !/^\d{1,2}$/.test(dayInput) || !/^\d{4}$/.test(yearInput)) {
    return null;
  }

  const month = parseInt(monthInput, 10);
  const day = parseInt(dayInput, 10);
  const year = parseInt(yearInput, 10);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { day, month, year };
}
