import { useEventListener } from "runed";

import { styleAttr } from "$lib/utils/attribute";
import { extract } from "$lib/utils/extract";
import { clamp } from "$lib/utils/number";
import { Synced } from "../Synced.svelte";
import { createDataIds, createIds } from "../utils/identifiers";
import { isHtmlElement } from "../utils/is";
import type { MaybeGetter } from "../types";

const dataIds = createDataIds("slider", ["root", "track", "thumb", "range"]);

export type SliderMultiThumbProps = {
    /**
	 * The minimum value of the slider.
	 *
	 * @default 0
	 */
	min?: MaybeGetter<number | undefined>;
	/**
	 * The maximum value of the slider.
	 *
	 * @default 100
	 */
	max?: MaybeGetter<number | undefined>;
    /**
	 * The orientation of the slider.
	 *
	 * @default "horizontal"
	 */
	orientation?: MaybeGetter<"horizontal" | "vertical" | undefined>;
	/**
	 * The step size of the slider.
	 *
	 * @default 1
	 */
	step?: MaybeGetter<number | undefined>;
    /**
	 * The default value.
	 *
	 * When passing a getter, it will be used as source of truth,
	 * meaning that `value` only changes when the getter returns a new value.
	 *
	 * @default undefined
	 */
	value?: MaybeGetter<number[] | undefined>;
	/**
	 * The direction of the slider.
	 *
	 * For vertical sliders, setting `dir` to `rtl`
	 * causes the slider to start from the top.
	 *
	 * @default "ltr"
	 */
	dir?: MaybeGetter<"ltr" | "rtl" | undefined>;
    /**
	 * Called when the `Slider` instance value changes.
	 */
	onValueChange?: (active: number[]) => void;
};

/**
 * TODO: description
 */
export class SliderMultiThumb {
    /* Props */
    #props!: SliderMultiThumbProps;
    readonly min = $derived(extract(this.#props.min, 0));
    readonly max = $derived(extract(this.#props.max, 100));
    readonly orientation = $derived(extract(this.#props.orientation, 'horizontal'));
	readonly horizontal = $derived(this.orientation === 'horizontal');
    readonly step = $derived(extract(this.#props.step, 1));
	readonly dir = $derived(extract(this.#props.dir, "ltr"));
	readonly ltr = $derived(this.dir === 'ltr');

    /* State */
    #value!: Synced<number[]>;
	#ids = createIds(dataIds);
	#mouseDown = false;
	#dragging = false;
	#mouseDownAt: null | number = null;
	#isActive = $state(false);
	#activeThumb: { el: HTMLElement; index: number } | null = $state(null);
	#numThumbs = $derived(this.#value.current.length);

    constructor(props: SliderMultiThumbProps = {}) {
        this.#props = props;
        this.#value = new Synced({
            value: props.value,
            onChange: props.onValueChange,
            defaultValue: [0]
        });
    }

	/** The value of the slider. */
	get value() {
		return this.#value.current;
	}

	/** Get whether the slider is being dragged **/
	get isActive() {
		return this.#isActive;
	}

	/** Get the active thumb **/
	get activeThumb() {
		return this.#activeThumb;
	}

	// set value(value: number[]) {
	// 	value.forEach((v, i) => this.updateValueAtIndex({ value: v, index: i}));
	// }

	updateValueAtIndex(v: { value: number, index: number }) {
		// const valueFixedToStep = Math.round(v.value / this.step) * this.step;
		// const newValue = this.#value.current;
		// newValue[v.index] = clamp(this.min, valueFixedToStep, this.max);
		// this.#value.current = newValue;
		// // this.#value.current[v.index] = clamp(this.min, valueFixedToStep, this.max);
		this.#updatePosition(v.value, v.index);
	}

	#getAllThumbs() {
		const root = document.getElementById(this.#ids.root);
		if (!root) return [];

		const thumbs = root.querySelectorAll(`[${dataIds.thumb}]`);
		return Array.from(thumbs).filter(isHtmlElement);
	}

	#getClosestThumb(e: PointerEvent) {
		const thumbs = this.#getAllThumbs();
		if (thumbs.length === 0) return null;

		for (const thumb of thumbs) {
			thumb.blur();
		}

		let minIndex = 0;
		let minDistance = this.#getThumbDistance(e, thumbs[0]!);
		for (let i = 1; i < thumbs.length; i++) {
			const distance = this.#getThumbDistance(e, thumbs[i]!);
			if (distance < minDistance) {
				minDistance = distance;
				minIndex = i;
			}
		}

		return {
			el: thumbs[minIndex]!,
			index: minIndex,
		};
	}

	#getThumbDistance(e: PointerEvent, thumb: HTMLElement) {
		const { left, right, top, bottom } = thumb.getBoundingClientRect();
		if (this.horizontal) {
			return Math.abs(e.clientX - (left + right) / 2);
		}
		return Math.abs(e.clientY - (top + bottom) / 2);
	}

	#updatePosition(value: number, index: number) {
		if (this.value.length === 0) {
			this.value[index] = value;
			return;
		}

		const current = this.value[index];
		if (current === undefined || current === value) return;

		const previous = this.value[index - 1];
		if (previous !== undefined && value < current && value < previous) {
			this.#swap(value, index, previous, index - 1);
			return;
		}

		const next = this.value[index + 1];
		if (next !== undefined && value > current && value > next) {
			this.#swap(value, index, next, index + 1);
			return;
		}

		this.value[index] = snapValueToStep(value, this.min, this.max, this.step);
	}

	#swap(value: number, index: number, otherValue: number, otherIndex: number) {
		this.value[index] = otherValue;
		this.value[otherIndex] = value;

		const thumbs = this.#getAllThumbs();
		const thumb = thumbs[otherIndex];
		if (thumb === undefined) return;

		thumb.focus();
		this.#activeThumb = { el: thumb, index: otherIndex };
	}

	#applyPosition(clientXY: number, activeThumbIndex: number, start: number, end: number) {
		const percent = (clientXY - start) / (end - start);
		const value = percent * (this.max - this.min) + this.min;

		if (value < this.min) {
			this.#updatePosition(this.min, activeThumbIndex);
		} else if (value > this.max) {
			this.#updatePosition(this.max, activeThumbIndex);
		} else {
			const currentStep = Math.floor((value - this.min) / this.step);
			const midpointOfCurrentStep = this.min + currentStep * this.step + this.step / 2;
			const midpointOfNextStep = this.min + (currentStep + 1) * this.step + this.step / 2;
			const newValue
				= value >= midpointOfCurrentStep && value < midpointOfNextStep
					? (currentStep + 1) * this.step + this.min
					: currentStep * this.step + this.min;

			if (newValue <= this.max) {
				this.#updatePosition(newValue, activeThumbIndex);
			}
		}
	}

	#handleDocumentPointerMove(e: PointerEvent, sliderElement: HTMLElement | null = null) {
		if (!this.#isActive) return;

		e.preventDefault();
		e.stopPropagation();

		const sliderEl = sliderElement ?? document.getElementById(this.#ids.root);
		if (this.#activeThumb === null || sliderEl === null) return;

		this.#activeThumb.el.focus();

		const { left, right, top, bottom } = sliderEl.getBoundingClientRect();
		if (this.horizontal) {
			const start = this.ltr ? left : right;
			const end = this.ltr ? right : left;
			this.#applyPosition(e.clientX, this.#activeThumb.index, start, end);
		} else {
			const start = this.ltr ? bottom : top;
			const end = this.ltr ? top : bottom;
			this.#applyPosition(e.clientY, this.#activeThumb.index, start, end);
		}
	}

    /**
	 * The root of the slider.
	 * Any cursor interaction along this element will change the slider's values.
	 **/
    get root() {
		useEventListener(
			() => document,
			"pointermove",
			(e: PointerEvent) => this.#handleDocumentPointerMove(e)
			// this.#handleDocumentPointerMove.bind(this)
			// (e: PointerEvent) => {
			// 	if (this.#activeIndex === null || !this.#mouseDownAt) return;
			// 	this.#commit(e);
			// }
		);

		useEventListener(
			() => document,
			"pointerdown",
			(e: PointerEvent) => {
				if (e.button !== 0) return;

				const sliderEl = document.getElementById(this.#ids.root);
				const closestThumb = this.#getClosestThumb(e);
				if (closestThumb === null || sliderEl === null) return;

				const target = e.target;
				if (!isHtmlElement(target) || !sliderEl.contains(target)) return;

				e.preventDefault();

				this.#activeThumb = closestThumb;
				closestThumb.el.focus();
				this.#isActive = true;

				this.#handleDocumentPointerMove(e, sliderEl);
			}
		);

		useEventListener(
			() => document,
			"pointerup",
			() => {
				this.#mouseDown = false;
				this.#dragging = false;
				this.#isActive = false;
				// this.#activeIndex = null;
				this.#activeThumb = null;
			},
		);

        return {
            "aria-orientation": this.orientation,
			[dataIds.root]: "",
			id: this.#ids.root,
        };
    }

	get thumbs() {
		console.log('re-running');

		return Array(this.#numThumbs)
			.fill(null)
			.map((_, i) => new Thumb({
				slider: this,
				index: i,
				onpointerdown: (e) => {
					// TODO: probably don't need this here since we can use
					// an event listener on the document
					
					// this.#activeIndex = i;
					// // this.#activeThumb = e.target;
					// // e.target.focus();
					// this.#mouseDown = true;
					// this.#mouseDownAt = e.timeStamp;
					// this.#commit(e);
				}
			}));
	}
}

type ThumbProps = {
	slider: SliderMultiThumb;
	index: number;
	onpointerdown: (e: PointerEvent) => void;
}

class Thumb {
	/* Props */
	#props!: ThumbProps;
	#slider = $derived(this.#props.slider);
	#index = $derived(this.#props.index);
	#onpointerdown = $derived(this.#props.onpointerdown);

	constructor(props: ThumbProps) {
		this.#props = props;
	}

	get value() {
		return this.#slider.value[this.#index];
	}

	set value(value: number) {
		this.#slider.updateValueAtIndex({ value, index: this.#index });
		// this.#slider.value[this.#index] = value;
	}

	get #percentage() {
		const v = (this.value - this.#slider.min) / (this.#slider.max - this.#slider.min);
		return this.#slider.horizontal ? v :  1 - v;
	}

	get #dragging() {
		return (this.#slider.isActive && this.#slider.activeThumb?.index === this.#index) || undefined;
	}

	get trigger() {
		const percentage = `${this.#percentage * 100}%`;
		const percentageInverse = `${(1 - this.#percentage) * 100}%`;

		return {
			"aria-valuenow": this.value,
			"aria-valuemin": this.#slider.min,
			"aria-valuemax": this.#slider.max,
			"aria-orientation": this.#slider.orientation,
			role: "slider",
			tabindex: 0,
			"data-dragging": this.#dragging,
			[dataIds.thumb]: "",
			style: styleAttr({
				[`--percentage`]: this.#slider.ltr ? percentage : percentageInverse,
				[`--percentage-inv`]: this.#slider.ltr ? percentageInverse : percentage,
				"touch-action": this.#slider.horizontal ? "pan-y" : "pan-x"
			}),
			onpointerdown: this.#onpointerdown,
			onkeydown: (e: KeyboardEvent) => {
				switch (e.key) {
					case "ArrowDown":
					case "ArrowLeft": {
						if (e.metaKey) this.value = this.#slider.min;
						else this.value -= this.#slider.step;
						break;
					}
					case "ArrowUp":
					case "ArrowRight": {
						if (e.metaKey) this.value = this.#slider.max;
						else this.value += this.#slider.step;
						break;
					}
					case "Home": {
						this.value = this.#slider.min;
						break;
					}
					case "End": {
						this.value = this.#slider.max;
						break;
					}
					default: {
						return;
					}
				}

				e.preventDefault();
			},
		};
	}
}

function snapValueToStep(value: number, min: number, max: number, step: number): number {
	const remainder = (value - (Number.isNaN(min) ? 0 : min)) % step;
	let snappedValue
		= Math.abs(remainder) * 2 >= step
			? value + Math.sign(remainder) * (step - Math.abs(remainder))
			: value - remainder;

	if (!Number.isNaN(min)) {
		if (snappedValue < min) {
			snappedValue = min;
		} else if (!Number.isNaN(max) && snappedValue > max) {
			snappedValue = min + Math.floor((max - min) / step) * step;
		}
	} else if (!Number.isNaN(max) && snappedValue > max) {
		snappedValue = Math.floor(max / step) * step;
	}

	const string = step.toString();
	const index = string.indexOf(".");
	const precision = index >= 0 ? string.length - index : 0;

	if (precision > 0) {
		const pow = 10 ** precision;
		snappedValue = Math.round(snappedValue * pow) / pow;
	}

	return snappedValue;
}
