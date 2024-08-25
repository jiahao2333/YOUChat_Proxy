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
    let jwtSession = null;
    let jwtToken = null;
    let ds = null;
    let dsr = null;

    cookies = cookie.parse(cookies);
    if (cookies["stytch_session"]) jwtSession = cookies["stytch_session"];
    if (cookies["stytch_session_jwt"]) jwtToken = cookies["stytch_session_jwt"];
    if (cookies["DS"]) ds = cookies["DS"];
    if (cookies["DSR"]) dsr = cookies["DSR"];

    return { jwtSession, jwtToken, ds, dsr };
}

function getSessionCookie(jwtSession, jwtToken, ds, dsr) {
    let sessionCookie = [];

    // 处理旧版 cookie
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

    // 处理新版 cookie
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

    // 添加隐身模式 cookie（如果启用）
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
    let paragraphs = [];
	content.split("\n").forEach((line) => {
		paragraphs.push(
			new docx.Paragraph({
				children: [new docx.TextRun(line)],
			})
		);
	});
    let doc = new docx.Document({
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
