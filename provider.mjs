import { connect } from "puppeteer-real-browser";
import { sleep, extractCookie, getSessionCookie } from "./utils.mjs";

// import config.js
try {
	var { config } = await import("./config.mjs");
} catch (e) {
	console.error(e);
	console.error("config.js 不存在或者有错误，请检查");
	process.exit(1);
}

var sessions = {};

// extract essential jwt session and token from cookie
for (let index = 0; index < config.sessions.length; index++) {
	let session = config.sessions[index];
	var { jwtSession, jwtToken } = extractCookie(session.cookie);
	if (jwtSession && jwtToken) {
		try {
			let jwt = JSON.parse(Buffer.from(jwtToken.split(".")[1], "base64").toString());
			sessions[jwt.user.name] = {
				index,
				jwtSession,
				jwtToken,
				valid: false,
			};
			console.log(`已添加 #${index} ${jwt.user.name}`);
		} catch (e) {
			console.error(`解析第${index}个cookie失败`);
		}
	} else {
		console.error(`第${index}个cookie中缺少jwtSession或jwtToken，请重新获取`);
	}
}
console.log(`已添加 ${Object.keys(sessions).length} 个有效cookie，开始验证有效性`);

for (var username of Object.keys(sessions)) {
	var session = sessions[username];
	await connect({
		turnstile: true,
	}).then(async (response) => {
		const { page, browser, setTarget } = response;
		await page.setCookie(...getSessionCookie(jwtSession, jwtToken));

		page.goto("https://you.com");
		await sleep(5000); // 无所谓加载完毕

		// get page content and try parse JSON
		try {
            let content = await page.evaluate(() => {
                return fetch("https://you.com/api/user/getYouProState").then(res=>res.text());
            });
			let json = JSON.parse(content);
			if (json.subscriptions.length > 0) {
				console.log(`${username} 有效`);
				session.valid = true;
				session.browser = browser;
			} else {
				console.log(`${username} 无有效订阅`);
				await browser.close();
			}
		} catch (e) {
			console.log(`${username} 已失效`);
            if(content) console.log(`返回内容：${content}`);
			await browser.close();
		}
	});
}

console.log(`验证完毕，有效cookie数量 ${Object.keys(sessions).filter((username) => sessions[username].valid).length}`);


