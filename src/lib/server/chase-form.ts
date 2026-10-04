import type { ChaseRules } from './settings.ts';

/*
 * The chase-rules form (§4.4, §4.3): the same five fields under Settings (the defaults) and
 * on an event's Planning tab (its override), read the same way.
 */

export const CHASE_FIELDS = [
	{ key: 'chaseAfterWorkingDays', label: 'Chase after', unit: 'working days', max: 30 },
	{ key: 'stopDaysBeforeEvent', label: 'Stop chasing', unit: 'days before the event', max: 60 },
	{ key: 'reminderDaysBefore', label: 'Remind', unit: 'days before the event', max: 60 },
	{ key: 'maxRelationship', label: 'Most messages to a customer or past guest', unit: '', max: 20 },
	{ key: 'maxNone', label: 'Most messages to someone new', unit: '', max: 20 }
] as const;

export type ChaseFieldKey = (typeof CHASE_FIELDS)[number]['key'];

/** The rules as the form's five flat fields. */
export function chaseFormValues(rules: ChaseRules): Record<ChaseFieldKey, number> {
	return {
		chaseAfterWorkingDays: rules.chaseAfterWorkingDays,
		stopDaysBeforeEvent: rules.stopDaysBeforeEvent,
		reminderDaysBefore: rules.reminderDaysBefore,
		maxRelationship: rules.maxTouches.relationship,
		maxNone: rules.maxTouches.none
	};
}

/** Whole numbers within each field's range, or the first problem as a message. */
export function parseChaseForm(form: FormData): ChaseRules | string {
	const read = (field: (typeof CHASE_FIELDS)[number]) => {
		const n = Number(String(form.get(field.key) ?? '').trim());
		if (!Number.isInteger(n) || n < 0 || n > field.max)
			return `${field.label}: a whole number from 0 to ${field.max}.`;
		return n;
	};
	const values = {} as Record<ChaseFieldKey, number>;
	for (const field of CHASE_FIELDS) {
		const v = read(field);
		if (typeof v === 'string') return v;
		values[field.key] = v;
	}
	return {
		chaseAfterWorkingDays: values.chaseAfterWorkingDays,
		stopDaysBeforeEvent: values.stopDaysBeforeEvent,
		reminderDaysBefore: values.reminderDaysBefore,
		maxTouches: { relationship: values.maxRelationship, none: values.maxNone }
	};
}
