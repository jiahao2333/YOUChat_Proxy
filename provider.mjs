import {EventEmitter} from "events";
import {connect} from "puppeteer-real-browser";
import {v4 as uuidV4} from "uuid";
import path from "path";
import fs from "fs";
import {fileURLToPath} from "url";
import {createDirectoryIfNotExists, createDocx, extractCookie, getSessionCookie, sleep} from "./utils.mjs";
import {execSync} from 'child_process';
import os from 'os';
import './proxyAgent.mjs';
import {formatMessages} from './formatMessages.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class YouProvider {
    constructor(config) {
        this.config = config;
        this.sessions = {};
        // 可以是 'chrome', 'edge', 或 'auto'
        this.preferredBrowser = 'auto';
        this.isCustomModeEnabled = process.env.USE_CUSTOM_MODE === "true";
        this.isRotationEnabled = process.env.ENABLE_MODE_ROTATION === "true";
        this.currentMode = "default";
        this.switchCounter = 0;
        this.requestsInCurrentMode = 0;
        this.switchThreshold = this.getRandomSwitchThreshold();
        this.lastDefaultThreshold = 0; // 记录上一次default模式的阈值
    }

    getRandomSwitchThreshold() {
        if (this.currentMode === "default") {
            return Math.floor(Math.random() * 6) + 1;
        } else {
            // custom模式回合不小于上一次default
            return Math.floor(Math.random() * (7 - this.lastDefaultThreshold)) + this.lastDefaultThreshold;
        }
    }

    switchMode() {
        if (this.currentMode === "default") {
            this.lastDefaultThreshold = this.switchThreshold;
        }
        this.currentMode = this.currentMode === "custom" ? "default" : "custom";
        this.switchCounter = 0;
        this.requestsInCurrentMode = 0;
        this.switchThreshold = this.getRandomSwitchThreshold();
        console.log(`切换到${this.currentMode}模式，将在${this.switchThreshold}次请求后再次切换`);
    }


    async init(config) {
        console.log(`本项目依赖Chrome或Edge浏览器，请勿关闭弹出的浏览器窗口。如果出现错误请检查是否已安装Chrome或Edge浏览器。`);

        // 检测Chrome和Edge浏览器
        const browserPath = this.detectBrowser();

        this.sessions = {};
        const timeout = 120000; // 120 秒超时

        if (process.env.USE_MANUAL_LOGIN === "true") {
            this.sessions['manual_login'] = {
                configIndex: 0,
                valid: false,
            };
            console.log("当前使用手动登录模式，跳过config.mjs文件中的 cookie 验证");
        } else {
            // 使用配置文件中的 cookie
            for (let index = 0; index < config.sessions.length; index++) {
                const session = config.sessions[index];
                const {jwtSession, jwtToken, ds, dsr} = extractCookie(session.cookie);
                if (jwtSession && jwtToken) {
                    // 旧版cookie处理
                    try {
                        const jwt = JSON.parse(Buffer.from(jwtToken.split(".")[1], "base64").toString());
                        this.sessions[jwt.user.name] = {
                            configIndex: index,
                            jwtSession,
                            jwtToken,
                            valid: false,
                        };
                        console.log(`已添加 #${index} ${jwt.user.name} (旧版cookie)`);
                    } catch (e) {
                        console.error(`解析第${index}个旧版cookie失败: ${e.message}`);
                    }
                } else if (ds) {
                    // 新版cookie处理
                    try {
                        const jwt = JSON.parse(Buffer.from(ds.split(".")[1], "base64").toString());
                        this.sessions[jwt.email] = {
                            configIndex: index,
                            ds,
                            dsr,
                            valid: false,
                        };
                        console.log(`已添加 #${index} ${jwt.email} (新版cookie)`);
                        if (!dsr) {
                            console.warn(`警告: 第${index}个cookie缺少DSR字段。`);
                        }
                    } catch (e) {
                        console.error(`解析第${index}个新版cookie失败: ${e.message}`);
                    }
                } else {
                    console.error(`第${index}个cookie无效，请重新获取。`);
                    console.error(`未检测到有效的DS或stytch_session字段。`);
                }
            }
            console.log(`已添加 ${Object.keys(this.sessions).length} 个 cookie，开始验证有效性`);
        }

        for (const originalUsername of Object.keys(this.sessions)) {
            let currentUsername = originalUsername;
            let session = this.sessions[currentUsername];
            createDirectoryIfNotExists(path.join(__dirname, "browser_profiles", currentUsername));

            try {
                await sleep(1000);
                const response = await connect({
                    headless: "auto",
                    turnstile: true,
                    customConfig: {
                        userDataDir: path.join(__dirname, "browser_profiles", currentUsername),
                        executablePath: browserPath,
                    },
                });

                const {page, browser} = response;
                if (process.env.USE_MANUAL_LOGIN === "true") {
                    console.log(`正在为 session #${session.configIndex} 进行手动登录...`);
                    await page.goto("https://you.com", {timeout: timeout});
                    // 等待页面加载完毕
                    await sleep(5000);
                    console.log(`请在打开的浏览器窗口中手动登录 You.com (session #${session.configIndex})`);
                    const {loginInfo, sessionCookie} = await this.waitForManualLogin(page);
                    if (sessionCookie) {
                        const email = loginInfo || sessionCookie.email;
                        this.sessions[email] = {
                            ...session,
                            ...sessionCookie,
                        };
                        delete this.sessions[currentUsername];
                        currentUsername = email;
                        session = this.sessions[currentUsername];
                        console.log(`成功获取 ${email} 登录的 cookie (${sessionCookie.isNewVersion ? '新版' : '旧版'})`);

                        // 兼容设置隐身模式
                        await page.setCookie(...sessionCookie);
                    } else {
                        console.error(`未能获取到 session #${session.configIndex} 有效登录的 cookie`);
                        await browser.close();
                        continue;
                    }
                } else {
                    await page.setCookie(...getSessionCookie(
                        session.jwtSession,
                        session.jwtToken,
                        session.ds,
                        session.dsr
                    ));
                    await page.goto("https://you.com", {timeout: timeout});
                }

                await sleep(5000); // 等待加载完毕

                // 如果遇到盾了就多等一段时间
                const pageContent = await page.content();
                if (pageContent.indexOf("https://challenges.cloudflare.com") > -1) {
                    console.log(`请在30秒内完成人机验证 (${currentUsername})`);
                    await page.evaluate(() => {
                        alert("请在30秒内完成人机验证");
                    });
                    await sleep(30000);
                }

                // 验证 cookie 有效性
                try {
                    const content = await page.evaluate(() => {
                        return fetch("https://you.com/api/user/getYouProState").then((res) => res.text());
                    });
                    const json = JSON.parse(content);
                    const allowNonPro = process.env.ALLOW_NON_PRO === "true";

                    if (json.subscriptions && json.subscriptions.length > 0) {
                        console.log(`${currentUsername} 有效`);
                        session.valid = true;
                        session.browser = browser;
                        session.page = page;
                        session.isPro = true;

                        // 获取订阅信息
                        const subscriptionInfo = await this.getSubscriptionInfo(page);
                        if (subscriptionInfo) {
                            session.subscriptionInfo = subscriptionInfo;
                        }
                    } else if (allowNonPro) {
                        console.log(`${currentUsername} 有效 (非Pro)`);
                        console.warn(`警告: ${currentUsername} 没有Pro订阅，功能受限。`);
                        session.valid = true;
                        session.browser = browser;
                        session.page = page;
                        session.isPro = false;
                    } else {
                        console.log(`${currentUsername} 无有效订阅`);
                        console.warn(`警告: ${currentUsername} 可能没有有效的订阅。请检查You是否有有效的Pro订阅。`);
                        await this.clearYouCookies(page);
                        await browser.close();
                    }
                } catch (e) {
                    console.log(`${currentUsername} 已失效`);
                    console.warn(`警告: ${currentUsername} 验证失败。请检查cookie是否有效。`);
                    console.error(e);
                    await this.clearYouCookies(page);
                    await browser.close();
                }
            } catch (e) {
                console.error(`初始化浏览器失败 (${currentUsername})`);
                console.error(e);
            }
        }

        console.log("订阅信息汇总：");
        for (const [username, session] of Object.entries(this.sessions)) {
            if (session.valid) {
                console.log(`{${username}:`);
                if (session.subscriptionInfo) {
                    console.log(`  订阅计划: ${session.subscriptionInfo.planName}`);
                    console.log(`  到期日期: ${session.subscriptionInfo.expirationDate}`);
                    console.log(`  剩余天数: ${session.subscriptionInfo.daysRemaining}天`);
                    if (session.subscriptionInfo.cancelAtPeriodEnd) {
                        console.log('  注意: 该订阅已设置为在当前周期结束后取消');
                    }
                } else {
                    console.log('  账户类型: 非Pro（功能受限）');
                }
                console.log('}');
            }
        }
        console.log(`验证完毕，有效cookie数量 ${Object.keys(this.sessions).filter((username) => this.sessions[username].valid).length}`);
    }

    async getSubscriptionInfo(page) {
        try {
            const response = await page.evaluate(async () => {
                const res = await fetch('https://you.com/api/user/getYouProState', {
                    method: 'GET',
                    credentials: 'include'
                });
                return await res.json();
            });
            if (response && response.subscriptions && response.subscriptions.length > 0) {
                const subscription = response.subscriptions[0];
                if (subscription.start_date && subscription.interval) {
                    const startDate = new Date(subscription.start_date);
                    const today = new Date();
                    let expirationDate;

                    // 计算订阅结束日期
                    if (subscription.interval === 'month') {
                        expirationDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate());
                    } else if (subscription.interval === 'year') {
                        expirationDate = new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
                    } else {
                        console.log(`未知的订阅间隔: ${subscription.interval}`);
                        return null;
                    }

                    // 计算从开始日期到今天间隔数
                    const intervalsPassed = Math.floor((today - startDate) / (subscription.interval === 'month' ? 30 : 365) / (24 * 60 * 60 * 1000));

                    // 计算到期日期
                    if (subscription.interval === 'month') {
                        expirationDate.setMonth(expirationDate.getMonth() + intervalsPassed);
                    } else {
                        expirationDate.setFullYear(expirationDate.getFullYear() + intervalsPassed);
                    }

                    // 如果计算出的日期仍在过去，再加一个间隔
                    if (expirationDate <= today) {
                        if (subscription.interval === 'month') {
                            expirationDate.setMonth(expirationDate.getMonth() + 1);
                        } else {
                            expirationDate.setFullYear(expirationDate.getFullYear() + 1);
                        }
                    }

                    const daysRemaining = Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24));

                    return {
                        expirationDate: expirationDate.toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        }),
                        daysRemaining: daysRemaining,
                        planName: subscription.plan_name,
                        cancelAtPeriodEnd: subscription.cancel_at_period_end
                    };
                } else {
                    console.log('订阅信息中缺少 start_date 或 interval 字段');
                    return null;
                }
            } else {
                console.log('API 响应中没有有效的订阅信息');
                return null;
            }
        } catch (error) {
            console.error('获取订阅信息时出错:', error);
            return null;
        }
    }

    async clearYouCookies(page) {
        const client = await page.target().createCDPSession();
        await client.send('Network.clearBrowserCookies');
        await client.send('Network.clearBrowserCache');
        const cookies = await page.cookies('https://you.com');
        for (const cookie of cookies) {
            await page.deleteCookie(cookie);
        }
        console.log('已自动清理 cookie');
    }

    async waitForManualLogin(page) {
        return new Promise((resolve) => {
            const checkLoginStatus = async () => {
                const loginInfo = await page.evaluate(() => {
                    const userProfileElement = document.querySelector('[data-testid="user-profile-button"]');
                    if (userProfileElement) {
                        const emailElement = userProfileElement.querySelector('.sc-9d7dc8d-4');
                        return emailElement ? emailElement.textContent : null;
                    }
                    return null;
                });

                if (loginInfo) {
                    console.log(`检测到自动登录成功: ${loginInfo}`);
                    const cookies = await page.cookies();
                    const sessionCookie = this.extractSessionCookie(cookies);

                    // 设置 隐身模式 cookie
                    if (sessionCookie) {
                        await page.setCookie(...sessionCookie);
                    }

                    resolve({loginInfo, sessionCookie});
                } else {
                    setTimeout(checkLoginStatus, 1000);
                }
            };

            page.on('request', async (request) => {
                if (request.url().includes('https://you.com/api/instrumentation')) {
                    const cookies = await page.cookies();
                    const sessionCookie = this.extractSessionCookie(cookies);

                    // 设置 隐身模式 cookie
                    if (sessionCookie) {
                        await page.setCookie(...sessionCookie);
                    }

                    resolve({loginInfo: null, sessionCookie});
                }
            });

            checkLoginStatus();
        });
    }

    extractSessionCookie(cookies) {
        const ds = cookies.find(c => c.name === 'DS')?.value;
        const dsr = cookies.find(c => c.name === 'DSR')?.value;
        const jwtSession = cookies.find(c => c.name === 'stytch_session')?.value;
        const jwtToken = cookies.find(c => c.name === 'stytch_session_jwt')?.value;

        let sessionCookie = null;

        if (ds || (jwtSession && jwtToken)) {
            sessionCookie = getSessionCookie(jwtSession, jwtToken, ds, dsr);

            if (ds) {
                try {
                    const jwt = JSON.parse(Buffer.from(ds.split(".")[1], "base64").toString());
                    sessionCookie.email = jwt.email;
                    sessionCookie.isNewVersion = true;
                } catch (error) {
                    console.error('解析DS令牌时出错:', error);
                    return null;
                }
            } else if (jwtToken) {
                try {
                    const jwt = JSON.parse(Buffer.from(jwtToken.split(".")[1], "base64").toString());
                    sessionCookie.email = jwt.user?.email || jwt.email || jwt.user?.name;
                    sessionCookie.isNewVersion = false;
                } catch (error) {
                    console.error('JWT令牌解析错误:', error);
                    return null;
                }
            }
        }

        if (!sessionCookie || !sessionCookie.some(c => c.name === 'stytch_session' || c.name === 'DS')) {
            console.error('无法提取有效的会话 cookie');
            return null;
        }

        return sessionCookie;
    }

    detectBrowser() {
        const platform = os.platform();
        let browsers = {
            'chrome': null,
            'edge': null
        };

        if (platform === 'win32') {
            browsers.chrome = this.findWindowsBrowser('Chrome');
            browsers.edge = this.findWindowsBrowser('Edge');
        } else if (platform === 'darwin') {
            browsers.chrome = this.findMacOSBrowser('Google Chrome');
            browsers.edge = this.findMacOSBrowser('Microsoft Edge');
        } else if (platform === 'linux') {
            browsers.chrome = this.findLinuxBrowser('google-chrome');
            browsers.edge = this.findLinuxBrowser('microsoft-edge');
        }

        if (this.preferredBrowser === 'auto' || this.preferredBrowser === undefined) {
            if (browsers.chrome) {
                return browsers.chrome;
            } else if (browsers.edge) {
                return browsers.edge;
            }
        } else if (browsers[this.preferredBrowser]) {
            console.log(`使用${this.preferredBrowser === 'chrome' ? 'Chrome' : 'Edge'}浏览器`);
            return browsers[this.preferredBrowser];
        }

        console.error('未找到Chrome或Edge浏览器，请确保已安装其中之一');
        process.exit(1);
    }

    findWindowsBrowser(browserName) {
        const regKeys = {
            'Chrome': ['chrome.exe', 'Google\\Chrome'],
            'Edge': ['msedge.exe', 'Microsoft\\Edge']
        };
        const [exeName, folderName] = regKeys[browserName];

        const regQuery = (key) => {
            try {
                return execSync(`reg query "${key}" /ve`).toString().trim().split('\r\n').pop().split('    ').pop();
            } catch (error) {
                return null;
            }
        };

        let browserPath = regQuery(`HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`) ||
            regQuery(`HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`);

        if (browserPath && fs.existsSync(browserPath)) {
            return browserPath;
        }

        const commonPaths = [
            `C:\\Program Files\\${browserName}\\Application\\${exeName}`,
            `C:\\Program Files (x86)\\${browserName}\\Application\\${exeName}`,
            `C:\\Program Files (x86)\\Microsoft\\${browserName}\\Application\\${exeName}`,
            `${process.env.LOCALAPPDATA}\\${browserName}\\Application\\${exeName}`,
            `${process.env.USERPROFILE}\\AppData\\Local\\${browserName}\\Application\\${exeName}`,
        ];

        const foundPath = commonPaths.find(path => fs.existsSync(path));
        if (foundPath) {
            return foundPath;
        }

        const userAppDataPath = process.env.LOCALAPPDATA || `${process.env.USERPROFILE}\\AppData\\Local`;
        const appDataPath = path.join(userAppDataPath, folderName, 'Application');

        if (fs.existsSync(appDataPath)) {
            const files = fs.readdirSync(appDataPath);
            const exePath = files.find(file => file.toLowerCase() === exeName.toLowerCase());
            if (exePath) {
                return path.join(appDataPath, exePath);
            }
        }

        return null;
    }

    findMacOSBrowser(browserName) {
        const paths = [
            `/Applications/${browserName}.app/Contents/MacOS/${browserName}`,
            `${os.homedir()}/Applications/${browserName}.app/Contents/MacOS/${browserName}`,
        ];

        for (const path of paths) {
            if (fs.existsSync(path)) {
                return path;
            }
        }

        return null;
    }

    findLinuxBrowser(browserName) {
        try {
            return execSync(`which ${browserName}`).toString().trim();
        } catch (error) {
            return null;
        }
    }

    async getCompletion({username, messages, stream = false, proxyModel, useCustomMode = false}) {
        const session = this.sessions[username];
        if (!session || !session.valid) {
            throw new Error(`用户 ${username} 的会话无效`);
        }

        //刷新页面
        await session.page.goto("https://you.com", {waitUntil: 'domcontentloaded'});

        const {page, browser} = session;
        const emitter = new EventEmitter();
        // 处理模式轮换逻辑
        if (this.isCustomModeEnabled && this.isRotationEnabled) {
            this.switchCounter++;
            this.requestsInCurrentMode++;
            console.log(`当前模式: ${this.currentMode}, 本模式下的请求次数: ${this.requestsInCurrentMode}, 距离下次切换还有 ${this.switchThreshold - this.switchCounter} 次请求`);

            if (this.switchCounter >= this.switchThreshold) {
                this.switchMode();
            }
        }

        // 根据轮换状态决定是否使用自定义模式
        const effectiveUseCustomMode = this.isRotationEnabled ? (this.currentMode === "custom") : useCustomMode;

        // 检查页面是否已经加载完成
        const isLoaded = await page.evaluate(() => {
            return document.readyState === 'complete' || document.readyState === 'interactive';
        });

        if (!isLoaded) {
            console.log('页面尚未加载完成，等待加载...');
            await page.waitForNavigation({waitUntil: 'domcontentloaded', timeout: 10000}).catch(() => {
                console.log('页面加载超时，继续执行');
            });
        }

        // 计算用户消息长度
        let userMessage = [{question: "", answer: ""}];
        let userQuery = "";
        let lastUpdate = true;

        messages.forEach((msg) => {
            if (msg.role === "system" || msg.role === "user") {
                if (lastUpdate) {
                    userMessage[userMessage.length - 1].question += msg.content + "\n";
                } else if (userMessage[userMessage.length - 1].question === "") {
                    userMessage[userMessage.length - 1].question += msg.content + "\n";
                } else {
                    userMessage.push({question: msg.content + "\n", answer: ""});
                }
                lastUpdate = true;
            } else if (msg.role === "assistant") {
                if (!lastUpdate) {
                    userMessage[userMessage.length - 1].answer += msg.content + "\n";
                } else if (userMessage[userMessage.length - 1].answer === "") {
                    userMessage[userMessage.length - 1].answer += msg.content + "\n";
                } else {
                    userMessage.push({question: "", answer: msg.content + "\n"});
                }
                lastUpdate = false;
            }
        });
        userQuery = userMessage[userMessage.length - 1].question;

        // 检查该session是否已经创建对应模型的对应user chat mode
        let userChatModeId = "custom";
        if (effectiveUseCustomMode) {
            if (!this.config.sessions[session.configIndex].user_chat_mode_id) {
                this.config.sessions[session.configIndex].user_chat_mode_id = {};
            }
            if (!this.config.sessions[session.configIndex].user_chat_mode_id[proxyModel]) {
                // 创建新的user chat mode
                let userChatMode = await page.evaluate(
                    async (proxyModel, proxyModelName) => {
                        return fetch("https://you.com/api/custom_assistants/assistants", {
                            method: "POST",
                            body: JSON.stringify({
                                aiModel: proxyModel,
                                hasLiveWebAccess: false,
                                hasPersonalization: false,
                                hideInstructions: true,
                                includeFollowUps: false,
                                instructions: "Please review the attached prompt",
                                instructionsSummary: "",
                                isUserOwned: true,
                                name: proxyModelName,
                                visibility: "private",
                            }),
                            headers: {
                                "Content-Type": "application/json",
                            },
                        }).then((res) => res.json());
                    },
                    proxyModel,
                    uuidV4().substring(0, 4)
                );
                if (userChatMode.chat_mode_id) {
                    this.config.sessions[session.configIndex].user_chat_mode_id[proxyModel] = userChatMode.chat_mode_id;
                    // 写回config
                    fs.writeFileSync("./config.mjs", "export const config = " + JSON.stringify(this.config, null, 4));
                } else {
                    if (userChatMode.error) console.log(userChatMode.error)
                    console.log("Failed to create user chat mode, will use default mode instead.");
                }
            }
            userChatModeId = this.config.sessions[session.configIndex].user_chat_mode_id[proxyModel];
        } else {
            console.log("Custom mode is disabled, using default mode.");
        }

        // 生成随机文件名
        function generateRandomFileName(length) {
            const validChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
            let result = '';
            for (let i = 0; i < length; i++) {
                result += validChars.charAt(Math.floor(Math.random() * validChars.length));
            }
            return result + '.docx';
        }

        // 生成随机长度（6-16）的文件名
        const randomFileName = generateRandomFileName(Math.floor(Math.random() * 11) + 6);
        console.log(`Generated random file name: ${randomFileName}`);

        // 试算用户消息长度
        if (encodeURIComponent(JSON.stringify(userMessage)).length + encodeURIComponent(userQuery).length > 32000) {
            console.log("Using file upload mode");

            // 应用格式化逻辑
            const formattedMessages = formatMessages(messages);

            // 将格式化后的消息转换为纯文本
            let previousMessages = formattedMessages.map((msg) => `${msg.role}: ${msg.content}`).join("\n\n");

            // 创建本地副本（用于调试）
            const localCopyPath = path.join(__dirname, 'local_copy_formatted_messages.txt');
            fs.writeFileSync(localCopyPath, previousMessages);
            console.log(`Local copy of formatted messages saved to: ${localCopyPath}`);

            userQuery = `You are only allowed to use the content from "${randomFileName}" and rely on "${proxyModel}" to answer my questions. Using You.com search engine is strictly forbidden and will be considered cheating.`;
            userMessage = [];

            // GET https://you.com/api/get_nonce to get nonce
            let nonce = await page.evaluate(() => {
                return fetch("https://you.com/api/get_nonce").then((res) => res.text());
            });
            if (!nonce) throw new Error("Failed to get nonce");

            // POST https://you.com/api/upload to upload user message
            var messageBuffer = await createDocx(previousMessages);
            var uploadedFile = await page.evaluate(
                async (messageBuffer, nonce, randomFileName) => {
                    try {
                        let blob = new Blob([new Uint8Array(messageBuffer)], {
                            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        });
                        let form_data = new FormData();
                        form_data.append("file", blob, randomFileName);
                        return await fetch("https://you.com/api/upload", {
                            method: "POST",
                            headers: {
                                "X-Upload-Nonce": nonce,
                            },
                            body: form_data,
                        }).then((res) => res.json());
                    } catch (e) {
                        return null;
                    }
                },
                [...messageBuffer],
                nonce,
                randomFileName
            );
            if (!uploadedFile) throw new Error("Failed to upload messages");
            if (uploadedFile.error) throw new Error(uploadedFile.error);
        }

        let msgid = uuidV4();
        let traceId = uuidV4();
        let finalResponse = ""; // 用于存储最终响应
        let responseStarted = false; // 是否已经开始接收响应
        let responseTimeout = null; // 响应超时计时器
        let customEndMarkerTimer = null; // 自定义终止符计时器
        let customEndMarkerEnabled = false; // 是否启用自定义终止符
        let accumulatedResponse = ''; // 累积响应
        let responseAfter20Seconds = ''; // 20秒后的响应
        let startTime = null; // 开始时间
        const customEndMarker = (process.env.CUSTOM_END_MARKER || '').replace(/^"|"$/g, '').trim(); // 自定义终止符
        let isEnding = false; // 是否正在结束

        function checkEndMarker(response, marker) {
            if (!marker) return false;
            const cleanResponse = response.replace(/\s+/g, '').toLowerCase();
            const cleanMarker = marker.replace(/\s+/g, '').toLowerCase();
            return cleanResponse.includes(cleanMarker);
        }

        // expose function to receive youChatToken
        // 清理逻辑
        const cleanup = async () => {
            clearTimeout(responseTimeout);
            clearTimeout(customEndMarkerTimer);
            await page.evaluate((traceId) => {
                if (window["exit" + traceId]) {
                    window["exit" + traceId]();
                }
            }, traceId);
        };

        page.exposeFunction("callback" + traceId, async (event, data) => {
            if (isEnding) return;

            switch (event) {
                case "youChatToken":
                    data = JSON.parse(data);
                    if (!responseStarted) {
                        responseStarted = true;
                        startTime = Date.now(); // 记录开始时间
                        clearTimeout(responseTimeout);
                        // 自定义终止符延迟触发
                        customEndMarkerTimer = setTimeout(() => {
                            customEndMarkerEnabled = true;
                        }, 20000);
                    }
                    process.stdout.write(data.youChatToken);
                    accumulatedResponse += data.youChatToken;

                    if (Date.now() - startTime >= 20000) {
                        responseAfter20Seconds += data.youChatToken;
                    }

                    if (stream) {
                        emitter.emit("completion", traceId, data.youChatToken);
                    } else {
                        finalResponse += data.youChatToken;
                    }

                    // 只在启用自定义终止符后，且只检查20秒后的响应
                    if (customEndMarkerEnabled && customEndMarker && checkEndMarker(responseAfter20Seconds, customEndMarker)) {
                        isEnding = true;
                        console.log("检测到自定义终止，关闭请求");

                        setTimeout(async () => {
                            await cleanup();
                            emitter.emit(stream ? "end" : "completion", traceId, stream ? undefined : finalResponse);
                        }, 2000);
                    }
                    break;
                case "customEndMarkerEnabled":
                    customEndMarkerEnabled = true;
                    break;
                case "done":
                    if (isEnding) return;
                    console.log("请求结束");
                    isEnding = true;
                    await cleanup();
                    emitter.emit(stream ? "end" : "completion", traceId, stream ? undefined : finalResponse);
                    break;
                case "error":
                    if (isEnding) return; // 如果已经结束，则忽略错误
                    console.error("请求发生错误");
                    isEnding = true;
                    await cleanup();
                    emitter.emit("error", new Error(data));
                    break;
            }
        });

        // proxy response
        const req_param = new URLSearchParams();
        req_param.append("page", "1");
        req_param.append("count", "10");
        req_param.append("safeSearch", "Moderate");
        req_param.append("mkt", "en-US");
        req_param.append("incognito", "true");
        req_param.append("domain", "youchat");
        req_param.append("use_personalization_extraction", "false");
        req_param.append("disable_web_results", "true");
        req_param.append("queryTraceId", traceId);
        req_param.append("chatId", traceId);
        req_param.append("conversationTurnId", msgid);
        req_param.append("pastChatLength", userMessage.length.toString());
        req_param.append("selectedChatMode", userChatModeId);
        req_param.append("traceId", `${traceId}|${msgid}|${new Date().toISOString()}`);
        if (userChatModeId === "custom") req_param.append("selectedAiModel", proxyModel);
        req_param.append("q", userQuery);


        if (uploadedFile)
            req_param.append("userFiles", JSON.stringify([{
                user_filename: randomFileName,
                filename: uploadedFile.filename,
                size: messageBuffer.length
            }]));
        req_param.append("chat", JSON.stringify(userMessage));
        const url = "https://you.com/api/streamingSearch?" + req_param.toString();
        const enableDelayLogic = process.env.ENABLE_DELAY_LOGIC === 'true'; // 是否启用延迟逻辑

        if (enableDelayLogic) {
            await page.goto(`https://you.com/search?q=&fromSearchBar=true&tbm=youchat&chatMode=custom`, {waitUntil: "domcontentloaded"});
        }

        // 检查连接状态和盾拦截
        async function checkConnectionAndCloudflare(page, timeout = 60000) {
            try {
                const response = await Promise.race([
                    page.evaluate(async (url) => {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 50000);
                        try {
                            const res = await fetch(url, {
                                method: 'GET',
                                signal: controller.signal
                            });
                            clearTimeout(timeoutId);
                            // 读取响应的前几个字节，确保连接已经建立
                            const reader = res.body.getReader();
                            const {done} = await reader.read();
                            if (!done) {
                                await reader.cancel();
                            }
                            return {
                                status: res.status,
                                headers: Object.fromEntries(res.headers.entries())
                            };
                        } catch (error) {
                            if (error.name === 'AbortError') {
                                throw new Error('Request timed out');
                            }
                            throw error;
                        }
                    }, url),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Evaluation timed out')), timeout))
                ]);

                if (response.status === 403 && response.headers['cf-chl-bypass']) {
                    return {connected: false, cloudflareDetected: true};
                }
                return {connected: true, cloudflareDetected: false};
            } catch (error) {
                console.error("Connection check error:", error);
                return {connected: false, cloudflareDetected: false, error: error.message};
            }
        }

        // 延迟发送请求并验证连接的函数
        async function delayedRequestWithRetry(maxRetries = 2, totalTimeout = 120000) {
            const startTime = Date.now();
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                if (Date.now() - startTime > totalTimeout) {
                    console.error("总体超时，连接失败");
                    emitter.emit("error", new Error("Total timeout reached"));
                    return false;
                }

                if (enableDelayLogic) {
                    await new Promise(resolve => setTimeout(resolve, 4000)); // 4秒延迟
                    console.log(`尝试发送请求 (尝试 ${attempt}/${maxRetries})`);

                    const {connected, cloudflareDetected, error} = await checkConnectionAndCloudflare(page);

                    if (connected) {
                        console.log("连接成功，准备唤醒浏览器");
                        try {
                            // 唤醒浏览器
                            await page.evaluate(() => {
                                window.scrollTo(0, 100);
                                window.scrollTo(0, 0);
                                document.body?.click();
                            });
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            console.log("开始发送请求");
                            emitter.emit("start", traceId);
                            return true;
                        } catch (wakeupError) {
                            console.error("浏览器唤醒失败:", wakeupError);
                            emitter.emit("start", traceId);
                            return true;
                        }
                    } else if (cloudflareDetected) {
                        console.error("检测到 Cloudflare 拦截");
                        emitter.emit("error", new Error("Cloudflare challenge detected"));
                        return false;
                    } else {
                        console.log(`连接失败，准备重试 (${attempt}/${maxRetries}). 错误: ${error || 'Unknown'}`);
                    }
                } else {
                    console.log("开始发送请求");
                    emitter.emit("start", traceId);
                    return true;
                }
            }
            console.error("达到最大重试次数，连接失败");
            emitter.emit("error", new Error("Failed to establish connection after maximum retries"));
            return false;
        }

        async function setupEventSource(page, url, traceId, customEndMarker) {
            return page.evaluate(
                async (url, traceId, customEndMarker) => {
                    const evtSource = new EventSource(url);
                    const callbackName = "callback" + traceId;
                    let isEnding = false;
                    let customEndMarkerTimer = null;

                    evtSource.onerror = (error) => {
                        if (!isEnding) {
                            window[callbackName]("error", error);
                        }
                    };

                    evtSource.addEventListener("youChatToken", (event) => {
                        if (isEnding) return;

                        const data = JSON.parse(event.data);
                        window[callbackName]("youChatToken", JSON.stringify(data));

                        if (customEndMarker && !customEndMarkerTimer) {
                            customEndMarkerTimer = setTimeout(() => {
                                window[callbackName]("customEndMarkerEnabled", "");
                            }, 20000);
                        }
                    }, false);

                    evtSource.addEventListener("done", () => {
                        if (!isEnding) {
                            window[callbackName]("done", "");
                        }
                    }, false);

                    evtSource.onmessage = (event) => {
                        if (!isEnding) {
                            const data = JSON.parse(event.data);
                            if (data.youChatToken) {
                                window[callbackName]("youChatToken", JSON.stringify(data));
                            }
                        }
                    };
                    // 注册退出函数
                    window["exit" + traceId] = () => {
                        isEnding = true;
                        if (customEndMarkerTimer) {
                            clearTimeout(customEndMarkerTimer);
                        }
                        evtSource.close();
                        fetch("https://you.com/api/chat/deleteChat", {
                            headers: {"content-type": "application/json"},
                            body: JSON.stringify({chatId: traceId}),
                            method: "DELETE",
                        });
                    };
                },
                url,
                traceId,
                customEndMarker
            );
        }

        try {
            const connectionEstablished = await delayedRequestWithRetry();
            if (!connectionEstablished) {
                return {
                    completion: emitter, cancel: () => {
                    }
                };
            }

            if (!enableDelayLogic) {
                await page.goto(`https://you.com/search?q=&fromSearchBar=true&tbm=youchat&chatMode=custom`, {waitUntil: "domcontentloaded"});
            }

            responseTimeout = setTimeout(() => {
                if (!responseStarted) {
                    console.log("50秒内没有收到响应，终止请求");
                    emitter.emit("warning", new Error("No response received within 40 seconds"));
                    emitter.emit("end", traceId);
                }
            }, 50000);

            // 初始执行 setupEventSource
            await setupEventSource(page, url, traceId, customEndMarker);

        } catch (error) {
            console.error("评估过程中出错:", error);
            emitter.emit("error", error);
        }

        const cancel = () => {
            page?.evaluate((traceId) => {
                if (window["exit" + traceId]) {
                    window["exit" + traceId]();
                }
            }, traceId).catch(console.error);
        };

        return {completion: emitter, cancel};
    }
}

export default YouProvider;
