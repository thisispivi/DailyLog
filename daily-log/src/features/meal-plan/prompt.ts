import { z } from "zod";

import { dietSchema } from "@/features/meal-plan/schemas";

/**
 * The instructions a user pastes into any LLM together with their diet. It is
 * LLM input, not UI copy, so it stays in English; the JSON Schema comes from
 * the same Zod schema that validates the upload, so the two never drift.
 */
export function dietPrompt(): string {
    const schema = JSON.stringify(z.toJSONSchema(dietSchema), null, 2);
    return `Convert the diet plan I paste below into JSON for the DailyLog app.

Rules:
- Reply with the JSON only: no explanation, no Markdown fences.
- "meals" uses these keys: breakfast, snack1 (morning snack), lunch, snack2 (afternoon snack), dinner. Leave out meals the diet does not mention.
- Put every food choice in "options" once, with a short slug "id". Each option lists its foods with the amount for ONE meal; when the diet gives a daily quantity split across meals (for example "half of the daily protein at lunch"), divide it.
- A meal is built from "slots": each "pick one of …" in the diet becomes a slot listing the allowed option ids. Use "optional": true when the diet says that part may be skipped.
- When the diet offers complete alternatives for a meal (for example "or porridge"), add one "variant" per alternative, each with its own slots. A free meal is a variant with no slots.
- "max N times a week" becomes "maxPerWeek" on the option or variant. "maxPerDay" limits an option across all meals of a day and is 1 when left out, so an option that may appear in two meals of the same day (such as fruit allowed twice a day) needs "maxPerDay": 2.
- When lunch and dinner must use different proteins, list the proteins in both meals; the default "maxPerDay" of 1 keeps them different.
- "Preferably" becomes "weight": 2 and "less often" becomes "weight": 0.3.
- Rules that apply to every meal (water, vegetables, oil, …) go in "notes" as short sentences.
- Keep food and meal names in the language of the diet. Units are "g", "ml", or "pcs".
- Use "version": 1.

JSON Schema:
${schema}

Diet plan:
`;
}
