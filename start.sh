#!/bin/bash

# 安装依赖包
npm install

# 设置是否启用隧道访问
export ENABLE_TUNNEL=false

# 设置隧道类型 (localtunnel 或 ngrok)
export TUNNEL_TYPE=localtunnel

# 设置localtunnel子域名(留空则为随机域名)
export SUBDOMAIN=

# 设置 ngrok AUTH TOKEN
# 这是 ngrok 账户的身份验证令牌。可以在 ngrok 仪表板的 "Auth" 部分找到它。
# 免费账户和付费账户都需要设置此项。
# ngrok网站: https://dashboard.ngrok.com
export NGROK_AUTH_TOKEN=

# 设置 ngrok 自定义域名
# 这允许使用自己的域名而不是 ngrok 的随机子域名。
# 注意：此功能仅适用于 ngrok 付费账户。
# 使用此功能前，请确保已在 ngrok 仪表板中添加并验证了该域名。
# 格式示例：your-custom-domain.com
# 如果使用免费账户或不想使用自定义域名，请将此项留空。
export NGROK_CUSTOM_DOMAIN=

# 设置 https_proxy 代理，可以使用本地的socks5或http(s)代理
# 例如，使用 HTTP 代理：export https_proxy=http://127.0.0.1:7890
# 或者使用 SOCKS5 代理：export https_proxy=socks5://host:port:username:password
export https_proxy=

# 设置 PASSWORD API密码
export PASSWORD=

# 设置 PORT 端口
export PORT=8080

# 设置AI模型(Claude系列模型直接在酒馆中选择即可使用，修改`AI_MODEL`环境变量可以切换Claude以外的模型，支持的模型名字如下 (请参考官网获取最新模型))
export AI_MODEL=

# 自定义会话模式
export USE_CUSTOM_MODE=false

# 运行 Node.js 应用程序
node index.mjs

echo "按 Enter 键退出..."
read
