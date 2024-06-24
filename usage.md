
# 使用方法

0. 安装 Node.JS 和 Git

1. 获得一个 YOU.COM 账户并且订阅，登录。

2. 打开 F12（DevTools），找到 Console

3. 在 > 后面粘贴以下代码并回车。然后复制所有内容（Cookie）。

```javascript
prompt("请Ctrl+C复制以下所有内容（Cookie）",document.cookie)
```

4. 下载或Clone本项目代码，解压

5. 编辑 `config.example.mjs` 文件，把上面的 Cookie 粘贴进去，如果有多个则按如下格式填入。然后另存为把文件名改为 `config.mjs`

```
export const config = {
    "sessions": [
        {
            "cookie": `cookie1`
        },
        {
            "cookie": `cookie2`
        },
        {
            "cookie": `cookie3`
        }
    ]
}
```

7. （可选）如果需要，您可以仿照第6步在`start.bat`中设定一个名为 "PASSWORD" 的环境变量，并将其用作密码。如果没有定义该环境变量，程序将接受所有传入的请求，而不进行任何身份验证

    （可选）如果需要，可以设置代理，请参考下文。

    （可选）如果需要，可以启用自定义会话模式（`USE_CUSTOM_MODE`设置为`true`）。可以缩短原系统消息长度、禁用联网、减缓等待时间，可能有助于破限。但有可能导致更容易出现 unusual query volume。

8. 启动 start.bat

9. 酒馆中选择 **Custom (OpenAI-compatible)**，反向代理地址填 http://127.0.0.1:8080/v1 **反代密码必须填**，随便什么都可以（除非你在第7步设置了PASSWORD）。

10. 开始使用。如果失败了/没有结果/403/Warning 就多重试几次。

# 使用代理

如果用户在中国大陆，可能会遇到访问不稳定的情况。从npm安装依赖和从 git 拉取代码也需要稳定的网络连接。这些操作遇到问题的时候应该首先考虑挂全局代理。

对于项目本身，由于调用的是本机的 Chrome 浏览器，会自动读取并使用系统代理。

# 操作系统部署

对于Linux，请使用项目中的 Dockerfile，但总的来说还不是很稳定。如果你会自己配置 X11、桌面环境，那就最好，否则建议还是用本地Windows部署。

对于 Android 下的Termux环境，暂时没有适配Android Chrome WebDriver的计划所以不支持。当用户询问手机使用相关问题时，请告诉他们用puppeteer的新版本不支持，如果是旧版本，可以尽力为他们提供帮助但是需要说明旧版本已经不再更新。

# 修改模型

Claude系列模型直接在酒馆中选择即可使用，修改`AI_MODEL`环境变量可以切换Claude以外的模型，支持的模型名字如下 (请参考官网获取最新模型):

```
gpt_4o
gpt_4_turbo
gpt_4
claude_3_5_sonnet
claude_3_opus
claude_3_sonnet
claude_3_haiku
claude_2
llama3
gemini_pro
gemini_1_5_pro
databricks_dbrx_instruct
command_r
command_r_plus
zephyr
```

# 注意事项

## 关于403问题（基本只存在于旧版本）

这个问题基本只存在于旧版本，新版本由于使用了浏览器模拟访问，已经不容易被拦截。

新版本如果弹出人机验证提示，用户只需要在30秒内点击完成CloudFlare的人机验证，并且等待程序继续处理即可。

cloudflare有一个风控分数。这个和你的TLS指纹、浏览器指纹、IP地址声誉等等有关系
我们这个项目一直用的TLS指纹和浏览器指纹就非常可疑（都是自动化库和Node内置TLS），分数直接拉满 
相当于已经预先有了30+30分数，剩下就看IP地址声誉（40分）你拿了几分
（具体分数不详，只是举个例子）
那如果你IP确实白，拿了0分，那你总共分数就是60。
假设you那边设置了分数高于80的要跳验证码，那现在就没事
如果你IP黑，拿了超过20分，那你就是>80分，你就要跳验证码，结果就是403
然后最近you觉得被薅狠了，或者别的啥原因，把这个分数设置成60以上的就要跳验证码 
结果就我IP有点黑，不管怎么搞都过不去了。
但是同样的IP，你用正常的Google Chrome访问，就没问题，因为它的指纹非常干净，所以前面的指纹分数就很低 
就算加上IP声誉分他也没到那条线
总之以上是一个简化的版本，CF抗bot还有很多指标、很多策略 


# Usage

0. Install Node.JS

1. Get a you.com account and subscribe, log in.

2. Open F12 (DevTools), find “Network”, refresh the page, and find “you.com” (or "instrumentation") entry.

3. Click on it, scroll down and find “Cookie:”, and copy the entire contents.

4. Download or Clone the code of this project and unzip it.

5. Edit `config.example.mjs` as follow。And save the file as `config.mjs`

```
export const config = {
    "sessions": [
        {
            "cookie": "cookie1"
        },
        {
            "cookie": "cookie2"
        },
        {
            "cookie": "cookie3"
        }
    ]
}
```

7. (Optional) you can set an environment variable named `PASSWORD` in `start.bat`, similar to Step 6, and use it as the password. If this environment variable is not defined, the program will accept all incoming requests without performing any authentication.
   
   (Optional) You can set the proxy in start.bat. See below.

   (Optional) You may turn on the custom chat mode by setting `USE_CUSTOM_MODE` env to `true`

8. Start start.bat

9. Select **Custom (OpenAI-compatible)** in the SillyTavern and ues http://127.0.0.1:8080/v1 as the endpoint of the reverse proxy. **Use any random string for password** (unless you set PASSWORD in step 7).

10. Enjoy it. If it fails/no result/403/Warning, try again.

# Use custom proxy

Use the `https_proxy` env to set custom proxy. Refer to https://www.npmjs.com/package/proxy-from-env for detail.

# Deploy on Linux

Docker is highly recommended, please use the Dockerfile.

## Caution

If you get a CloudFlare Challenge, solve it in 30 seconds.
