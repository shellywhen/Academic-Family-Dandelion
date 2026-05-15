/** Careers that render as pink faculty nodes in the visualization. */
const FACULTY_CAREERS = new Set([
  "faculty",
  "rap",
  "postdoc",
]);

export function isFacultyCareer(career?: string | null): boolean {
  if (!career) return false;
  return FACULTY_CAREERS.has(career.trim().toLowerCase());
}
