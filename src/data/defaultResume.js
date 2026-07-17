import { mapParsed } from "../lib/parse.js";
import marcStoyerResume from "./marcStoyerResume.json";

export const DEFAULT_PROFILE = marcStoyerResume.profile || "";

export function defaultResume() {
  return mapParsed(marcStoyerResume);
}
