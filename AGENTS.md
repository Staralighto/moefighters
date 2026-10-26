# Agent Notes

碰到子系统再读守卫它的文档。细节在文档里，本文件只做触发地图。不要一上来把 `docs/` 读完。

## 热路径（几乎每次相关，直接遵守）

- 改用户看得见的界面（`index.html`、`src/style.css`、`src/ui/**`、`src/render/**`）→ 先读 `docs/AGENT_DEV_CONSTRAINTS.GENERIC.md` §4。用户没说「打开浏览器 / 帮我看效果 / 浏览器里验一下」，不要启动浏览器、不要截图、不要点页面。改完写下入口和怎么复现，交给用户目视。
- 改触屏判定、媒体查询、视口单位（dvh/cqw）、宽屏或横屏适配 → 先读 `docs/device-adaptation.md`。能力判定只住在 `src/ui/device.ts`，改完跑 `npm run check`（里面有源码锁）。
- 颜色只写暗色。会随主题变的颜色进 `src/style.css` 顶部 `:root` 当 token，亮色由 `src/theme/palette.ts` 推导（规则在它的文件头），不要手写亮色规则。强调色当填充用 `var(--p1)`，当文字、描边、选中圈用 `var(--p1-ink)`。画在美术上的容器挂 `data-scheme="dark"`，亮色下保持暗色。`npm run check` 会拦写死的中性色和裸用的强调色。
- 设置弹窗不写说明，只留控件名和选项名。`#settings-dialog` 的可见文字由 `npm run check` 锁死，不要加段落、副文案或提示。
- 改削防（格挡伤害）或新增多段大招 → 先读 `docs/public/moves.md` 的「削防」节。多段招必须写 `guardPlan` 并用 `withGuard` 在交付点落值；抓取和 `noBlock` 保持不可挡。

## 低频子域（命中才读）

| 触碰 | 先读 | 附带测试 |
|---|---|---|
| 新角色、精灵表、图生图提示词 | `docs/new-character-sop.md` | `npm run check` |
| 招式、受击、buff、弹道 | `docs/public/moves.md` | `npm run check` |
| 安全排查、密钥泄露、准备公开仓库 | `docs/SECURITY_AUDIT.md` | 文档内扫描命令 + `npm run check` |
| 构建或上传 Bilibili Toy 包 | `docs/toy-release.md` | 文档内的路径核对 + `npm run check` |
| 联机信令、CloudBase、TURN、房间匹配 | `docs/online-security.md` | `node cloudbase/functions/mailbox/local.js --check` + `npm run check` |
| EdgeOne、加速区域、自定义域名、国内节点或首屏延迟 | `docs/edgeone.md` | 无 |

## 通用

用户没要求就不要 commit、不要 push。战斗或选人逻辑改完跑 `npm run check`。

文档默认不进 git：`docs/` 只有 `docs/public/` 可公开，其余一律留本地。新文档先放本地，明确可公开才移入 `docs/public/`；公开文件不引用本地文档。
