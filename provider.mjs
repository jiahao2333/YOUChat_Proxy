import { connect } from "puppeteer-real-browser";
import path from "path";
import { fileURLToPath } from 'url';
import { createDirectoryIfNotExists, sleep, extractCookie, getSessionCookie } from "./utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initSessions(config) {
console.log(`本项目依赖Chrome浏览器，请勿关闭弹出的浏览器窗口。如果出现错误请检查是否已安装Chrome浏览器。`);
var sessions = {};

// extract essential jwt session and token from cookie
for (let index = 0; index < config.sessions.length; index++) {
	let session = config.sessions[index];
	var { jwtSession, jwtToken } = extractCookie(session.cookie);
	if (jwtSession && jwtToken) {
		try {
			let jwt = JSON.parse(Buffer.from(jwtToken.split(".")[1], "base64").toString());
			sessions[jwt.user.name] = {
				configIndex: index,
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
	createDirectoryIfNotExists(path.join(__dirname, "browser_profiles", username));
	await connect({
		headless: 'auto',
		turnstile: true,
		customConfig: {
            userDataDir: path.join(__dirname, "browser_profiles", username),
        },
	}).then(async (response) => {
		const { page, browser, setTarget } = response;
		await page.setCookie(...getSessionCookie(session.jwtSession, session.jwtToken));

		page.goto("https://you.com", { timeout: 60000 });
		await sleep(5000); // 等待加载完毕
		// 如果遇到盾了就多等一段时间
		var pageContent = await page.content();
		if (pageContent.indexOf("https://challenges.cloudflare.com") > -1) {
			console.log(`请在30秒内完成人机验证`);
			page.evaluate(() => {
				alert("请在30秒内完成人机验证");
			});
			await sleep(30000);
		}

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
				session.page = page;
			} else {
				console.log(`${username} 无有效订阅`);
				await browser.close();
			}
		} catch (e) {
			console.log(`${username} 已失效`);
			await browser.close();
		}
	}).catch((e) => {
		console.error(`初始化浏览器失败`);
		console.error(e);
	});
}

console.log(`验证完毕，有效cookie数量 ${Object.keys(sessions).filter((username) => sessions[username].valid).length}`);

return sessions;

}

export { initSessions };