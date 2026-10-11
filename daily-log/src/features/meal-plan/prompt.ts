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
- A meal is built from "slots": each "pick one of …" in the diet becomes a slot listing the allowed option ids. A "pick one of" list in a main meal is required even when worded softly ("you can use …"). Use "optional": true only when the diet explicitly says that part may be skipped or is "if desired".
- When the diet offers complete alternatives for a meal (for example "or porridge"), add one "variant" per alternative, each with its own slots. A free meal is a variant with no slots.
- "max N times a week" becomes "maxPerWeek" on the option or variant. "maxPerDay" limits an option across all meals of a day and is 1 when left out, so an option that may appear in two meals of the same day (such as fruit allowed twice a day) needs "maxPerDay": 2.
- When lunch and dinner must use different proteins, list the proteins in both meals; the default "maxPerDay" of 1 keeps them different.
- When the diet asks for variety between meals of the same day, use "group": options or variants sharing a group appear at most once a day. Give every food of one type the same group (for example all white meats, all fish, all cold cuts, each row of a protein table), and give the matching variants of two snacks the same group (the fruit snack in both snack1 and snack2) when the snacks must differ.
- "Preferably" becomes "weight": 2 and "less often" becomes "weight": 0.3.
- The standard version of a meal gets "weight": 4. Alternatives the diet offers only "for more variety" and free meals (pizza, sushi, …) get "weight": 0.3, so the standard version stays the most common.
- Rules that apply to every meal (water, vegetables, oil, …) go in "notes" as short sentences. "notes" holds only the diet's own rules, never comments about how you converted it.
- Use one canonical name and one unit per food across all options (for example always "Albumi" in "g", never "Albumi" in "pcs" elsewhere; "Uovo intero", not also "Uova intere" or "Uovo medio"). Convert when needed (1 egg white ≈ 33 g).
- Numbers go in "amount", never in "food": "Mandorle (8-10)" becomes { "food": "Mandorle", "amount": 8, "unit": "pcs" }. For ranges use the lower bound. Convert household measures: 1 teaspoon ≈ 5 g, 1 tablespoon of oil ≈ 10 ml, 1 slice of cold cuts ≈ 10 g, 1 glass ≈ 200 ml; a jar of yogurt or a pack is 1 "pcs". Leave "amount" out only when the diet gives no quantity ("un velo", "a piacere").
- Keep food and meal names in the language of the diet, with correct grammar. Units are "g", "ml", or "pcs".
- Use "version": 1.

JSON Schema:
${schema}

Diet plan:
`;
}
