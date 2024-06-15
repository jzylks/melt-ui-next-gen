import { extract, type Extracted } from "./extract.svelte";
import { keys } from "./object";

export type WithDefault<T, D> = D extends undefined ? T : Exclude<T | D, undefined>;
export type ParsedProps<Props extends Record<string, unknown>, Defaults extends Partial<Props>> = {
	[Key in keyof (Props & Defaults)]: Key extends keyof Props
		? Key extends keyof Defaults
			? WithDefault<Extracted<Props[Key]>, Defaults[Key]>
			: Extracted<Props[Key]>
		: Key extends keyof Defaults
			? Defaults[Key]
			: never;
};

export function parseProps<Props extends Record<string, unknown>, Defaults extends Partial<Props>>(
	props: Props,
	defaults: Defaults,
) {
	const result = {} as ParsedProps<Props, Defaults>;

	keys({ ...props, ...defaults }).forEach((key) => {
		const derived = $derived.by(() => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const prop = extract(props[key as any]);
			if (prop !== undefined) return prop;
			return defaults[key];
		});

		Object.defineProperty(result, key, {
			enumerable: true,
			get: () => derived,
		});
	});

	return result;
}
