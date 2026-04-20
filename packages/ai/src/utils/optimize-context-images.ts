import type { Context, ImageContent, Message } from "../types.js";

/** Callback that receives an ImageContent block and returns an optimized version. */
export type ImageOptimizer = (image: ImageContent) => ImageContent | Promise<ImageContent>;

/**
 * Preprocess all `ImageContent` blocks in a context's messages using the
 * provided optimizer (e.g., PNG-to-JPEG conversion, resizing, re-encoding).
 *
 * Returns a new `Context` with optimized images if any were transformed,
 * or the original `Context` reference if nothing changed. The original
 * context is never mutated.
 *
 * Call this **once** before passing the context to `stream()` / `complete()`.
 * New images added to the context later (e.g., tool results from subsequent
 * turns) should be optimized individually before appending.
 *
 * ```typescript
 * import { optimizeContextImages, stream } from "@mariozechner/pi-ai";
 *
 * const optimized = await optimizeContextImages(context, async (img) => {
 *   // your compression logic here
 *   return { type: "image", data: compressedBase64, mimeType: "image/jpeg" };
 * });
 * stream(model, optimized, options);
 * ```
 */
export async function optimizeContextImages(context: Context, optimizer: ImageOptimizer): Promise<Context> {
	let changed = false;
	const optimizedMessages: Message[] = [];

	for (const msg of context.messages) {
		if (msg.role === "user") {
			if (typeof msg.content === "string") {
				optimizedMessages.push(msg);
				continue;
			}
			const optimizedContent = await optimizeContentArray(msg.content, optimizer);
			if (optimizedContent !== msg.content) {
				optimizedMessages.push({ ...msg, content: optimizedContent });
				changed = true;
			} else {
				optimizedMessages.push(msg);
			}
		} else if (msg.role === "toolResult") {
			const optimizedContent = await optimizeContentArray(msg.content, optimizer);
			if (optimizedContent !== msg.content) {
				optimizedMessages.push({ ...msg, content: optimizedContent });
				changed = true;
			} else {
				optimizedMessages.push(msg);
			}
		} else {
			optimizedMessages.push(msg);
		}
	}

	if (!changed) return context;
	return { ...context, messages: optimizedMessages };
}

type ContentItem = { type: "text"; text: string } | ImageContent;

async function optimizeContentArray(content: ContentItem[], optimizer: ImageOptimizer): Promise<ContentItem[]> {
	let changed = false;
	const result: ContentItem[] = [];

	for (const item of content) {
		if (item.type === "image") {
			const optimized = await optimizer(item);
			if (optimized !== item) {
				changed = true;
			}
			result.push(optimized);
		} else {
			result.push(item);
		}
	}

	return changed ? result : content;
}
