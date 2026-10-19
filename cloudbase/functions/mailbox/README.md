# 联机握手

只存连接说明。对战不经过这里。记录大约 90 秒后作废，通道打开后页面会删房间。

字符表与 `src/net/proto.ts` 的 `CODE_ALPH` 保持一致。

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
