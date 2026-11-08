# 联机握手

只存连接说明。对战不经过这里。房间有效期为 60 秒，通道打开后房主会删房间。

字符表与 `src/net/proto.ts` 的 `CODE_ALPH` 保持一致。

房间号用于找到房间。新版客户端创建的房间启用席位凭证。手动加入时客机用随机凭证认领席位，随机匹配时使用客机的队列票据。后续应答和 TURN 校验席位凭证，房主读取应答时使用自己的凭证。旧版网页仍可使用旧协议，随机匹配按协议隔离。

Web 信箱无法从转发头确认客户端 IP。所有缺少可信来源 IP 的请求共用 TURN 新签发额度，默认 15 秒一次、每天 20 次。房间已缓存的凭证可继续复用。

## 控制台

1. 上海环境。打开 HTTP 访问，把一条路径指到这个函数。
2. 安全域名加上 `https://www.bilibili.com`、Cloudflare 站点的源、本地预览的源。
3. 若查询 `queue` 提示缺索引，建 `data.status` + `data.build` + `data.at`（升序）的组合索引。字段在文档的 `data` 里，建在外层配不上。
4. 函数地址在 `src/net/endpoint.ts` 的 `MAILBOX_URL`。空字符串会藏起联机按钮。localhost 的跨域头由网关写；其他来源由函数按请求来源回写，两边不要写成同一个值。

免费体验环境大约 3000 资源点/月，只在握手时每秒请求两次。环境按腾讯云的规则续期。

页面里不要写以 `/` 开头的请求地址。

## 本地联调

1. `node cloudbase/functions/mailbox/local.js`（内存数据库，端口 9000）。
2. `VITE_MAILBOX_URL=http://127.0.0.1:9000/mailbox npx vite`。
3. 双浏览器联机回归：`node scripts/online-e2e.mjs`（需要 `npm i playwright` 和 `npx playwright install chromium`）。

部署前用 `npm ci --prefix cloudbase/functions/mailbox --omit=dev --ignore-scripts` 按锁文件安装，再运行 `npm audit --prefix cloudbase/functions/mailbox` 和 `node cloudbase/functions/mailbox/local.js --check`。上传时随代码打包 `node_modules`，因为云端自动安装会忽略这份覆盖规则。
