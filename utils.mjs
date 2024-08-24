import * as docx from "docx";
import cookie from "cookie";
import fs from "fs";
import { execSync } from "child_process";

function getGitRevision() {
	// get git revision and branch
	try {
		const revision = execSync("git rev-parse --short HEAD", { stdio: "pipe" }).toString().trim();
		const branch = execSync("git rev-parse --abbrev-ref HEAD", { stdio: "pipe" }).toString().trim();
		return { revision, branch };
	} catch (e) {
		return { revision: "unknown", branch: "unknown" };
	}
}

function createDirectoryIfNotExists(dirPath) {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
}

function extractCookie(cookies) {
    var jwtSession = null;
    var jwtToken = null;
    var ds = null;
    var dsr = null;
    var youproSubscription = null;
    var youSubscription = null;
    var aiModel = null;

    cookies = cookie.parse(cookies);
    if (cookies["stytch_session"]) jwtSession = cookies["stytch_session"];
    if (cookies["stytch_session_jwt"]) jwtToken = cookies["stytch_session_jwt"];
    if (cookies["DS"]) ds = cookies["DS"];
    if (cookies["DSR"]) dsr = cookies["DSR"];
    if (cookies["youpro_subscription"]) youproSubscription = cookies["youpro_subscription"];
    if (cookies["you_subscription"]) youSubscription = cookies["you_subscription"];
    if (cookies["ai_model"]) aiModel = cookies["ai_model"];

    return { jwtSession, jwtToken, ds, dsr, youproSubscription, youSubscription, aiModel };
}

function getSessionCookie(jwtSession, jwtToken, ds, dsr, youproSubscription, youSubscription, aiModel) {
    var sessionCookie = [];
    if (jwtSession && jwtToken) {
        sessionCookie = [
            {
                name: "stytch_session",
                value: jwtSession,
                domain: "you.com",
                path: "/",
                expires: 1800000000,
                httpOnly: false,
                secure: true,
                sameSite: "Lax",
            },
            {
                name: "ydc_stytch_session",
                value: jwtSession,
                domain: "you.com",
                path: "/",
                expires: 1800000000,
                httpOnly: true,
                secure: true,
                sameSite: "Lax",
            },
            {
                name: "stytch_session_jwt",
                value: jwtToken,
                domain: "you.com",
                path: "/",
                expires: 1800000000,
                httpOnly: false,
                secure: true,
                sameSite: "Lax",
            },
            {
                name: "ydc_stytch_session_jwt",
                value: jwtToken,
                domain: "you.com",
                path: "/",
                expires: 1800000000,
                httpOnly: true,
                secure: true,
                sameSite: "Lax",
            }
        ];
    }
    if (ds) {
        sessionCookie.push({
            name: "DS",
            value: ds,
            domain: "you.com",
            path: "/",
            expires: 1800000000,
            httpOnly: false,
            secure: true,
            sameSite: "Lax",
        });
    }
    if (dsr) {
        sessionCookie.push({
            name: "DSR",
            value: dsr,
            domain: "you.com",
            path: "/",
            expires: 1800000000,
            httpOnly: false,
            secure: true,
            sameSite: "Lax",
        });
    }
    if (youproSubscription) {
        sessionCookie.push({
            name: "youpro_subscription",
            value: youproSubscription,
            domain: "you.com",
            path: "/",
            expires: 1800000000,
            secure: true,
        });
    }
    if (youSubscription) {
        sessionCookie.push({
            name: "you_subscription",
            value: youSubscription,
            domain: "you.com",
            path: "/",
            expires: 1800000000,
            secure: true,
        });
    }
    if (aiModel) {
        sessionCookie.push({
            name: "ai_model",
            value: aiModel,
            domain: "you.com",
            path: "/",
            expires: 1800000000,
            secure: true,
        });
    }
    if(process.env.INCOGNITO_MODE === "true") {
        sessionCookie.push({
            name: "incognito",
            value: "true",
            domain: "you.com",
            path: "/",
            expires: 1800000000,
            secure: true,
        });
    }
    return sessionCookie;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
function createDocx(content) {
	var paragraphs = [];
	content.split("\n").forEach((line) => {
		paragraphs.push(
			new docx.Paragraph({
				children: [new docx.TextRun(line)],
			})
		);
	});
	var doc = new docx.Document({
		sections: [
			{
				properties: {},
				children: paragraphs,
			},
		],
	});
	return docx.Packer.toBuffer(doc).then((buffer) => buffer);
}
// eventStream util
function createEvent(event, data) {
	// if data is object, stringify it
	if (typeof data === "object") {
		data = JSON.stringify(data);
	}
	return `event: ${event}\ndata: ${data}\n\n`;
}

export { createEvent, createDirectoryIfNotExists, sleep, extractCookie, getSessionCookie, createDocx, getGitRevision };
