import { z } from "zod";

export const SKILLS = [
  "first-aid",
  "food-safety",
  "driving",
  "translation",
  "technical",
  "physical-labor",
] as const;

export const SkillEnum = z.enum(SKILLS);
export type Skill = z.infer<typeof SkillEnum>;
