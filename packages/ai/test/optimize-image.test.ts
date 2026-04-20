import { describe, expect, it } from "vitest";
import type { Context, ImageContent } from "../src/types.js";
import { optimizeContextImages } from "../src/utils/optimize-context-images.js";

describe("optimizeContextImages", () => {
	it("transforms images in user messages", async () => {
		const context: Context = {
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: "look at this" },
						{ type: "image", data: "AAAA", mimeType: "image/png" },
					],
					timestamp: Date.now(),
				},
			],
		};

		const result = await optimizeContextImages(context, (_img) => ({
			type: "image",
			data: "BBBB",
			mimeType: "image/jpeg",
		}));

		expect(result).not.toBe(context);
		const userMsg = result.messages[0];
		expect(userMsg.role).toBe("user");
		if (userMsg.role === "user" && Array.isArray(userMsg.content)) {
			const imageBlock = userMsg.content.find((c): c is ImageContent => c.type === "image");
			expect(imageBlock!.data).toBe("BBBB");
			expect(imageBlock!.mimeType).toBe("image/jpeg");
		}
	});

	it("transforms images in toolResult messages", async () => {
		const context: Context = {
			messages: [
				{
					role: "toolResult",
					toolCallId: "tc-1",
					toolName: "screenshot",
					content: [
						{ type: "text", text: "screenshot taken" },
						{ type: "image", data: "ORIGINAL", mimeType: "image/png" },
					],
					isError: false,
					timestamp: Date.now(),
				},
			],
		};

		const result = await optimizeContextImages(context, (_img) => ({
			type: "image",
			data: "COMPRESSED",
			mimeType: "image/jpeg",
		}));

		const toolResult = result.messages[0];
		expect(toolResult.role).toBe("toolResult");
		if (toolResult.role === "toolResult") {
			const imageBlock = toolResult.content.find((c): c is ImageContent => c.type === "image");
			expect(imageBlock!.data).toBe("COMPRESSED");
			expect(imageBlock!.mimeType).toBe("image/jpeg");
		}
	});

	it("returns the same context reference when no images are present", async () => {
		const context: Context = {
			messages: [{ role: "user", content: "just text", timestamp: Date.now() }],
		};

		let called = false;
		const result = await optimizeContextImages(context, (img) => {
			called = true;
			return img;
		});

		expect(called).toBe(false);
		expect(result).toBe(context);
	});

	it("returns the same context reference when optimizer returns identical references", async () => {
		const context: Context = {
			messages: [
				{
					role: "user",
					content: [{ type: "image", data: "X", mimeType: "image/png" }],
					timestamp: Date.now(),
				},
			],
		};

		const result = await optimizeContextImages(context, (img) => img);

		expect(result).toBe(context);
	});

	it("does not mutate the original context", async () => {
		const originalImage: ImageContent = { type: "image", data: "ORIGINAL", mimeType: "image/png" };
		const context: Context = {
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: "look" }, originalImage],
					timestamp: Date.now(),
				},
			],
		};

		await optimizeContextImages(context, () => ({
			type: "image",
			data: "CHANGED",
			mimeType: "image/jpeg",
		}));

		expect(originalImage.data).toBe("ORIGINAL");
		expect(originalImage.mimeType).toBe("image/png");
		const userMsg = context.messages[0];
		if (userMsg.role === "user" && Array.isArray(userMsg.content)) {
			expect(userMsg.content[1]).toBe(originalImage);
		}
	});

	it("supports async optimizer callbacks", async () => {
		const context: Context = {
			messages: [
				{
					role: "user",
					content: [{ type: "image", data: "SYNC", mimeType: "image/png" }],
					timestamp: Date.now(),
				},
			],
		};

		const result = await optimizeContextImages(context, async (_img) => {
			await new Promise((r) => setTimeout(r, 10));
			return { type: "image", data: "ASYNC", mimeType: "image/jpeg" };
		});

		const userMsg = result.messages[0];
		if (userMsg.role === "user" && Array.isArray(userMsg.content)) {
			expect((userMsg.content[0] as ImageContent).data).toBe("ASYNC");
		}
	});

	it("preserves text blocks alongside optimized images", async () => {
		const context: Context = {
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: "first" },
						{ type: "image", data: "IMG1", mimeType: "image/png" },
						{ type: "text", text: "second" },
						{ type: "image", data: "IMG2", mimeType: "image/png" },
					],
					timestamp: Date.now(),
				},
			],
		};

		const result = await optimizeContextImages(context, (img) => ({
			...img,
			data: `${img.data}_OPT`,
			mimeType: "image/jpeg",
		}));

		const userMsg = result.messages[0];
		if (userMsg.role === "user" && Array.isArray(userMsg.content)) {
			expect(userMsg.content).toEqual([
				{ type: "text", text: "first" },
				{ type: "image", data: "IMG1_OPT", mimeType: "image/jpeg" },
				{ type: "text", text: "second" },
				{ type: "image", data: "IMG2_OPT", mimeType: "image/jpeg" },
			]);
		}
	});

	it("preserves systemPrompt and tools", async () => {
		const context: Context = {
			systemPrompt: "Be helpful.",
			messages: [
				{
					role: "user",
					content: [{ type: "image", data: "X", mimeType: "image/png" }],
					timestamp: Date.now(),
				},
			],
			tools: [{ name: "test", description: "test tool", parameters: {} as any }],
		};

		const result = await optimizeContextImages(context, (_img) => ({
			type: "image",
			data: "Y",
			mimeType: "image/jpeg",
		}));

		expect(result.systemPrompt).toBe("Be helpful.");
		expect(result.tools).toBe(context.tools);
	});

	it("skips assistant messages", async () => {
		const context: Context = {
			messages: [
				{
					role: "user",
					content: [{ type: "image", data: "IMG", mimeType: "image/png" }],
					timestamp: Date.now(),
				},
				{
					role: "assistant",
					content: [{ type: "text", text: "I see the image" }],
					api: "faux",
					provider: "faux",
					model: "faux",
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: "stop",
					timestamp: Date.now(),
				},
			],
		};

		let callCount = 0;
		const result = await optimizeContextImages(context, (img) => {
			callCount++;
			return { ...img, data: "OPT" };
		});

		expect(callCount).toBe(1);
		expect(result.messages[1]).toBe(context.messages[1]);
	});
});
