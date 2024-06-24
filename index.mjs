import express from "express";
import { createEvent } from "./utils.mjs";
import YouProvider from "./provider.mjs";
const app = express();
const port = process.env.PORT || 8080;
const validApiKey = process.env.PASSWORD;
const availableModels = [
	"gpt_4o",
	"gpt_4_turbo",
	"gpt_4",
	"claude_3_5_sonnet",
	"claude_3_opus",
	"claude_3_sonnet",
	"claude_3_haiku",
	"claude_2",
	"llama3",
	"gemini_pro",
	"gemini_1_5_pro",
	"databricks_dbrx_instruct",
	"command_r",
	"command_r_plus",
	"zephyr",
];
const modelMappping = {
	"claude-3-5-sonnet-20240620": "claude_3_5_sonnet",
	"claude-3-20240229": "claude_3_opus",
	"claude-3-sonnet-20240229": "claude_3_sonnet",
	"claude-3-haiku-20240307": "claude_3_haiku",
	"claude-2.1": "claude_2",
	"claude-2.0": "claude_2",
};

// import config.js
try {
	var { config } = await import("./config.mjs");
} catch (e) {
	console.error(e);
	console.error("config.js 不存在或者有错误，请检查");
	process.exit(1);
}
var provider = new YouProvider(config);
await provider.init(config);

// handle preflight request
app.options("/v1/messages", (req, res) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "*");
	res.setHeader("Access-Control-Allow-Headers", "*");
	res.setHeader("Access-Control-Max-Age", "86400");
	res.status(200).end();
});
// openai format model request
app.get("/v1/models", apiKeyAuth, (req, res) => {
	res.setHeader("Content-Type", "application/json");
	res.setHeader("Access-Control-Allow-Origin", "*");
	let models = availableModels.map((model, index) => {
		return {
			id: model,
			object: "model",
			created: 1700000000,
			owned_by: "closeai",
			name: model,
		};
	});
	res.json({ object: "list", data: models });
});
app.post("/v1/messages", apiKeyAuth, (req, res) => {
	req.rawBody = "";
	req.setEncoding("utf8");

	req.on("data", function (chunk) {
		req.rawBody += chunk;
	});

	req.on("end", async () => {
		res.setHeader("Content-Type", "text/event-stream;charset=utf-8");
		res.setHeader("Access-Control-Allow-Origin", "*");
		let jsonBody = JSON.parse(req.rawBody);
		if (jsonBody.system) {
			// 把系统消息加入messages的首条
			jsonBody.messages.unshift({ role: "system", content: jsonBody.system });
		}
		console.log("message length:" + jsonBody.messages.length);

		// decide which session to use randomly
		var randomSession = Object.keys(provider.sessions)[Math.floor(Math.random() * Object.keys(provider.sessions).length)];
		console.log("Using session " + randomSession);

		// decide which model to use
		if (process.env.AI_MODEL) {
			var proxyModel = process.env.AI_MODEL;
		} else if (jsonBody.model && modelMappping[jsonBody.model]) {
			var proxyModel = modelMappping[jsonBody.model];
		} else {
			var proxyModel = "claude_3_opus";
		}
		console.log("Using model " + proxyModel);

		// call provider to get completion
		await provider
			.getCompletion(randomSession, jsonBody.messages, jsonBody.stream ? true : false, proxyModel, process.env.USE_CUSTOM_MODE == "true" ? true : false)
			.then(({completion, cancel}) => {
				completion.on("start", (id) => {
					if (jsonBody.stream) {
						// send message start
						res.write(
							createEvent("message_start", {
								type: "message_start",
								message: {
									id: `${id}`,
									type: "message",
									role: "assistant",
									content: [],
									model: proxyModel,
									stop_reason: null,
									stop_sequence: null,
									usage: { input_tokens: 8, output_tokens: 1 },
								},
							})
						);
						res.write(createEvent("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }));
						res.write(createEvent("ping", { type: "ping" }));
					}
				});
		
				completion.on("completion", (id, text) => {
					if (jsonBody.stream) {
						// send message delta
						if (jsonBody.stream) {
							res.write(
								createEvent("content_block_delta", {
									type: "content_block_delta",
									index: 0,
									delta: { type: "text_delta", text: text },
								})
							);
						}
					} else {
						// 只会发一次，发送final response
						res.write(
							JSON.stringify({
								id: id,
								content: [
									{
										text: text,
									},
									{
										id: "string",
										name: "string",
										input: {},
									},
								],
								model: "string",
								stop_reason: "end_turn",
								stop_sequence: "string",
								usage: {
									input_tokens: 0,
									output_tokens: 0,
								},
							})
						);
						res.end();
					}
				});
		
				completion.on("end", () => {
					if (jsonBody.stream) {
						res.write(createEvent("content_block_stop", { type: "content_block_stop", index: 0 }));
						res.write(
							createEvent("message_delta", {
								type: "message_delta",
								delta: { stop_reason: "end_turn", stop_sequence: null },
								usage: { output_tokens: 12 },
							})
						);
						res.write(createEvent("message_stop", { type: "message_stop" }));
						res.end();
					}
				});
		
				res.on("close", () => {
					console.log(" > [Client closed]");
					completion.removeAllListeners();
					cancel();
				});
			})
			.catch((error) => {
				console.error(error);
				if (jsonBody.stream) {
					res.write(
						createEvent("content_block_delta", {
							type: "content_block_delta",
							index: 0,
							delta: { type: "text_delta", text: "出现错误，请检查日志：<pre>" + error + "</pre>"},
						})
					);
					res.end();
				} else {
					res.write(
						JSON.stringify({
							id: id,
							content: [
								{
									text: "出现错误，请检查日志：<pre>" + error + "</pre>"
								},
								{
									id: "string",
									name: "string",
									input: {},
								},
							],
							model: "string",
							stop_reason: "end_turn",
							stop_sequence: "string",
							usage: {
								input_tokens: 0,
								output_tokens: 0,
							},
						})
					);
					res.end();
				}
				return;
			});
	});
});

// handle other
app.use((req, res, next) => {
	res.status(404).send("Not Found");
});

app.listen(port, () => {
	console.log(`YouChat proxy listening on port ${port}`);
	if (!validApiKey) {
		console.log(`Proxy is currently running with no authentication`);
	}
	console.log(`API Format: Anthropic; Custom mode: ${process.env.USE_CUSTOM_MODE == "true" ? "enabled" : "disabled"}`);
});

function apiKeyAuth(req, res, next) {
	const reqApiKey = req.header("x-api-key");

	if (validApiKey && reqApiKey !== validApiKey) {
		// If Environment variable PASSWORD is set AND x-api-key header is not equal to it, return 401
		const clientIpAddress = req.headers["x-forwarded-for"] || req.ip;
		console.log(`Receviced Request from IP ${clientIpAddress} but got invalid password.`);
		return res.status(401).json({ error: "Invalid Password" });
	}

	next();
}
