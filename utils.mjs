import cookie from "cookie";
import fs from "fs";


function createDirectoryIfNotExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function extractCookie(cookies) {
	var jwtSession = null;
	var jwtToken = null;
	cookies = cookie.parse(cookies);
	if (cookies["stytch_session"]) {
		jwtSession = cookies["stytch_session"];
	}
	if (cookies["stytch_session_jwt"]) {
		jwtToken = cookies["stytch_session_jwt"];
	}
	return { jwtSession, jwtToken };
}

function getSessionCookie(jwtSession, jwtToken) {
	return [
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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export { createDirectoryIfNotExists, sleep, extractCookie, getSessionCookie };
